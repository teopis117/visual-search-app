from flask import Flask, request, render_template, jsonify, send_from_directory
import os
import pickle
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
from feature_extractor import extract_features # Importamos nuestra función
# from PIL import Image # No se usa directamente aquí, pero sí en feature_extractor
from pathlib import Path
import uuid # Para nombres de archivo únicos

app = Flask(__name__)

# Configuración
BASE_DIR = Path(__file__).resolve().parent
UPLOAD_FOLDER_NAME = 'static/uploads' # Nombre de la carpeta de subidas
CATALOG_DIR_NAME = 'catalog_data'    # Nombre de la carpeta del catálogo

UPLOAD_FOLDER = BASE_DIR / UPLOAD_FOLDER_NAME
CATALOG_IMAGE_DIR = BASE_DIR / CATALOG_DIR_NAME # Ruta completa al catálogo

FEATURES_FILE = BASE_DIR / 'features' / 'catalog_features.pkl'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg'}
TOP_N_RESULTS = 5

app.config['UPLOAD_FOLDER'] = str(UPLOAD_FOLDER) # Flask espera strings para rutas de config
UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)


# Cargar las características del catálogo al iniciar la aplicación
def load_catalog_data():
    if FEATURES_FILE.exists():
        with open(FEATURES_FILE, 'rb') as f:
            data = pickle.load(f)
        # Asegurarse que las rutas en image_paths sean relativas a la raíz de la app
        # y usen '/' para URLs web
        processed_image_paths = [Path(p).as_posix() for p in data['image_paths']]
        return data['features'], processed_image_paths
    else:
        print(f"ADVERTENCIA: El archivo de características '{FEATURES_FILE}' no existe.")
        print("Por favor, ejecuta 'python3 generate_catalog_features.py' primero.")
        return None, None

catalog_feature_matrix, catalog_image_paths = load_catalog_data()

if catalog_feature_matrix is not None:
    print(f"Características del catálogo cargadas. Matriz: {catalog_feature_matrix.shape}, Rutas: {len(catalog_image_paths)}")
else:
    print("El catálogo de características NO PUDO SER CARGADO.")


def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/', methods=['GET'])
def index():
    return render_template('index.html')

# --- MEJORA: Ruta para servir imágenes del catálogo ---
# Esto permite que el frontend acceda a las imágenes de catalog_data/
@app.route(f'/{CATALOG_DIR_NAME}/<path:filename>')
def serve_catalog_image(filename):
    return send_from_directory(CATALOG_IMAGE_DIR, filename)
# ------------------------------------------------------

@app.route('/upload', methods=['POST'])
def upload_image():
    if catalog_feature_matrix is None or not catalog_image_paths: # Comprobar también si está vacío
        return jsonify({'error': 'El catálogo de características no está cargado o está vacío. Ejecuta el script de generación.'}), 500

    if 'file' not in request.files:
        return jsonify({'error': 'No se encontró el archivo en la solicitud (asegúrate de que el input name sea "file").'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No se seleccionó ningún archivo.'}), 400

    if file and allowed_file(file.filename):
        _filename_base, file_extension = os.path.splitext(file.filename)
        unique_filename = str(uuid.uuid4()) + file_extension
        # Guardamos la imagen subida en static/uploads para que sea accesible por el frontend temporalmente
        uploaded_image_path_on_disk = UPLOAD_FOLDER / unique_filename
        # La ruta que devolveremos al frontend será relativa a 'static'
        uploaded_image_url_for_frontend = f"{UPLOAD_FOLDER_NAME}/{unique_filename}" # e.g., static/uploads/uuid.jpg
        
        try:
            file.save(str(uploaded_image_path_on_disk))
        except Exception as e:
            print(f"Error al guardar archivo subido: {str(e)}")
            return jsonify({'error': f'Error interno al guardar el archivo: {str(e)}'}), 500

        query_features = extract_features(str(uploaded_image_path_on_disk))
        
        # Limpiar el archivo subido después de extraer características
        # (se puede mover a un bloque finally si se quiere asegurar su eliminación)
        try:
            os.remove(str(uploaded_image_path_on_disk))
        except OSError as e:
            print(f"Advertencia: No se pudo eliminar el archivo temporal {uploaded_image_path_on_disk}: {e}")


        if query_features is None:
            return jsonify({'error': 'No se pudieron extraer características de la imagen subida. ¿Es una imagen válida?'}), 500
        
        query_features_reshaped = query_features.reshape(1, -1)

        similarities = cosine_similarity(query_features_reshaped, catalog_feature_matrix)
        similar_indices = np.argsort(similarities[0])[::-1]
        
        results = []
        for i in range(min(TOP_N_RESULTS, len(similar_indices))):
            idx = similar_indices[i]
            # Las rutas en catalog_image_paths ya deberían ser relativas y usar '/'
            # gracias al preprocesamiento en load_catalog_data
            result_image_path = catalog_image_paths[idx] 
            results.append({
                'path': result_image_path, 
                'similarity': float(similarities[0][idx])
            })
        
        return jsonify({
            # Devolvemos la URL de la imagen que el usuario subió (que estaba en static/uploads)
            # PERO la acabamos de borrar. Así que no podemos devolver esta URL para previsualización
            # a menos que la guardemos o la pasemos como dataURL desde el frontend.
            # El frontend ya previsualiza la imagen antes de subirla, así que no es crítico aquí.
            # 'query_image_url': uploaded_image_url_for_frontend, # Comentado porque el archivo ya se borró
            'results': results
            })

    return jsonify({'error': 'Tipo de archivo no permitido o archivo inválido.'}), 400

if __name__ == '__main__':
    if catalog_feature_matrix is None:
        print(f"\n!!! ERROR CRÍTICO: El archivo de características '{FEATURES_FILE.name}' no se pudo cargar. !!!")
        print("Asegúrate de que existe y es válido. Ejecuta primero 'python3 generate_catalog_features.py'.\n")
    else:
        print(f"Iniciando servidor Flask en http://0.0.0.0:5000")
        print(f"Sirviendo imágenes del catálogo desde: {CATALOG_IMAGE_DIR}")
        print(f"Las imágenes subidas se guardan temporalmente en: {UPLOAD_FOLDER}")
        app.run(host='0.0.0.0', port=5000, debug=False)