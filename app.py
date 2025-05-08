from flask import Flask, request, render_template, jsonify, send_from_directory
import os
import pickle
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
from feature_extractor import extract_features # Importamos nuestra función
from pathlib import Path
import uuid

app = Flask(__name__)

# Configuración
BASE_DIR = Path(__file__).resolve().parent
UPLOAD_FOLDER_NAME = 'static/uploads'
CATALOG_DIR_NAME = 'catalog_data' 

UPLOAD_FOLDER = BASE_DIR / UPLOAD_FOLDER_NAME
CATALOG_IMAGE_DIR = BASE_DIR / CATALOG_DIR_NAME

FEATURES_FILE = BASE_DIR / 'features' / 'catalog_features.pkl'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg'}
TOP_N_RESULTS = 8 

app.config['UPLOAD_FOLDER'] = str(UPLOAD_FOLDER)
UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)

# Cargar las características del catálogo
catalog_feature_matrix, catalog_image_paths = None, None 
if FEATURES_FILE.exists():
    try:
        with open(FEATURES_FILE, 'rb') as f:
            data = pickle.load(f)
        catalog_feature_matrix = data['features']
        catalog_image_paths = [Path(p).as_posix() for p in data['image_paths']]
        print(f"INFO (app.py): Características del catálogo cargadas. Matriz: {catalog_feature_matrix.shape}, Rutas: {len(catalog_image_paths)}")
    except Exception as e:
        print(f"ERROR (app.py): No se pudo cargar el archivo de características '{FEATURES_FILE}'. Error: {e}")
        print("                 Por favor, ejecuta 'python3 generate_catalog_features.py' primero.")
else:
    print(f"ADVERTENCIA (app.py): El archivo de características '{FEATURES_FILE}' no existe.")
    print("                        Por favor, ejecuta 'python3 generate_catalog_features.py' primero.")

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/', methods=['GET'])
def index():
    return render_template('index.html', page_title="Búsqueda Visual Inteligente")

@app.route('/catalog', methods=['GET'])
def catalog_explorer():
    all_catalog_images = []
    if CATALOG_IMAGE_DIR.exists():
        valid_extensions = ('.jpg', '.jpeg', '.png')
        # Ordenar para asegurar consistencia en la presentación
        sorted_items = sorted(list(CATALOG_IMAGE_DIR.iterdir())) 
        for item in sorted_items:
            if item.is_file() and item.suffix.lower() in valid_extensions:
                # --- LÍNEA CORREGIDA ---
                all_catalog_images.append((Path(CATALOG_DIR_NAME) / item.name).as_posix()) 
                # -----------------------
    else:
        print(f"ADVERTENCIA (catalog_explorer): El directorio del catálogo '{CATALOG_IMAGE_DIR}' no existe.")
    
    return render_template('catalog_explorer.html', 
                           page_title="Explorador del Catálogo Textil", 
                           images=all_catalog_images)

@app.route(f'/{CATALOG_DIR_NAME}/<path:filename>')
def serve_catalog_image(filename):
    return send_from_directory(CATALOG_IMAGE_DIR, filename)

@app.route('/upload', methods=['POST'])
def upload_image():
    if catalog_feature_matrix is None or not catalog_image_paths:
        return jsonify({'error': 'El catálogo de características no está cargado o está vacío. Ejecuta el script de generación (generate_catalog_features.py) primero.'}), 500
    
    if 'file' not in request.files:
        return jsonify({'error': 'No se encontró el archivo en la solicitud (asegúrate de que el input name sea "file").'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No se seleccionó ningún archivo.'}), 400

    if file and allowed_file(file.filename):
        _filename_base, file_extension = os.path.splitext(file.filename)
        # Usar solo el nombre del archivo para evitar problemas de rutas largas o caracteres inválidos en el nombre de archivo temporal
        temp_filename_base = Path(file.filename).stem 
        unique_filename_stem = f"{temp_filename_base}_{uuid.uuid4().hex[:8]}" # Más corto
        unique_filename = unique_filename_stem + file_extension

        uploaded_image_path_on_disk = UPLOAD_FOLDER / unique_filename
        
        try:
            file.save(str(uploaded_image_path_on_disk))
        except Exception as e:
            print(f"ERROR (upload_image): Al guardar archivo subido '{uploaded_image_path_on_disk}': {str(e)}")
            return jsonify({'error': f'Error interno al guardar el archivo subido.'}), 500

        query_features = extract_features(str(uploaded_image_path_on_disk))
        
        try:
            os.remove(str(uploaded_image_path_on_disk))
        except OSError as e:
            print(f"ADVERTENCIA (upload_image): No se pudo eliminar el archivo temporal '{uploaded_image_path_on_disk}': {e}")

        if query_features is None:
            return jsonify({'error': 'No se pudieron extraer características de la imagen subida. ¿Es una imagen válida y legible?'}), 500
        
        query_features_reshaped = query_features.reshape(1, -1)
        similarities = cosine_similarity(query_features_reshaped, catalog_feature_matrix)
        similar_indices = np.argsort(similarities[0])[::-1]
        
        results = []
        for i in range(min(TOP_N_RESULTS, len(similar_indices))):
            idx = similar_indices[i]
            result_image_path = catalog_image_paths[idx] 
            results.append({
                'path': result_image_path, 
                'similarity': float(similarities[0][idx])
            })
        
        return jsonify({'results': results})

    return jsonify({'error': 'Tipo de archivo no permitido o archivo inválido.'}), 400

if __name__ == '__main__':
    if catalog_feature_matrix is None or not catalog_image_paths:
        print(f"\n!!! ADVERTENCIA CRÍTICA (app.py): El archivo de características '{FEATURES_FILE.name}' no se pudo cargar o el catálogo está vacío. !!!")
        print("Asegúrate de que el archivo existe, es válido y el catálogo tiene imágenes procesadas.")
        print("Ejecuta primero 'python3 generate_catalog_features.py' con imágenes en 'catalog_data/'.\n")
        # Podrías optar por no iniciar el servidor si esto es crítico:
        # import sys
        # sys.exit("Deteniendo la aplicación debido a la falta de datos del catálogo.")
    else:
        print(f"INFO (app.py): Iniciando servidor Flask en http://0.0.0.0:5000")
        print(f"INFO (app.py): Sirviendo imágenes del catálogo desde: {CATALOG_IMAGE_DIR}")
        print(f"INFO (app.py): Las imágenes subidas se guardan temporalmente en: {UPLOAD_FOLDER}")
        
    # Ejecutar siempre el servidor, el frontend manejará el error si el catálogo no está listo.
    # O, si prefieres, puedes detener la app si el catálogo no está.
    app.run(host='0.0.0.0', port=5000, debug=True)