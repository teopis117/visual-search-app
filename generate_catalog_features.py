import os
import pickle
import numpy as np
from feature_extractor import extract_features # Mantenemos la importación
from pathlib import Path
# from PIL import UnidentifiedImageError # Ya está en feature_extractor.py

CATALOG_IMAGE_DIR = Path("catalog_data") # Usar Path para mejor manejo de rutas
FEATURES_DIR = Path("features")
FEATURES_FILE = FEATURES_DIR / "catalog_features.pkl" # Usar Path para construir rutas

def generate_features():
    catalog_features_list = []
    image_paths = []

    print(f"Procesando imágenes del catálogo en: {CATALOG_IMAGE_DIR}")

    FEATURES_DIR.mkdir(parents=True, exist_ok=True) 

    valid_extensions = ('.jpg', '.jpeg', '.png')
    image_files_to_process = [
        f for f in CATALOG_IMAGE_DIR.iterdir() 
        if f.is_file() and f.suffix.lower() in valid_extensions
    ]
    total_images = len(image_files_to_process)

    if total_images == 0:
        print(f"No se encontraron imágenes válidas (con extensiones {valid_extensions}) en '{CATALOG_IMAGE_DIR}'.")
        print("Por favor, añade imágenes de productos antes de continuar.")
        return

    print(f"Se encontraron {total_images} imágenes para procesar.")

    for i, image_file_path_obj in enumerate(image_files_to_process):
        image_path_str = str(image_file_path_obj) 
        
        print(f"  Procesando [{i+1}/{total_images}]: {image_file_path_obj.name}")
        
        features = extract_features(image_path_str) 
            
        if features is not None:
            catalog_features_list.append(features)
            # --- CORRECCIÓN Y MEJORA AQUÍ ---
            # image_file_path_obj ya es algo como 'catalog_data/imagen.jpg'
            # Solo necesitamos convertirlo a string y asegurar barras '/' para URLs/web
            image_paths.append(image_file_path_obj.as_posix()) 
            # '.as_posix()' convierte las barras invertidas de Windows a barras normales
            # ---------------------------------
        else:
            print(f"    ADVERTENCIA: No se pudieron extraer características de {image_file_path_obj.name}")

    if not catalog_features_list:
        print("No se extrajeron características de ninguna imagen. Revisa los logs y tus imágenes.")
        return

    feature_matrix = np.array(catalog_features_list)
    
    data_to_save = {
        'features': feature_matrix,
        'image_paths': image_paths # Ahora contendrá rutas como 'catalog_data/imagen.jpg'
    }

    with open(FEATURES_FILE, 'wb') as f:
        pickle.dump(data_to_save, f)
    
    print(f"\n¡Éxito! Características del catálogo guardadas en: {FEATURES_FILE}")
    print(f"Total de imágenes procesadas con éxito: {len(image_paths)}")
    if 'feature_matrix' in locals() and feature_matrix.size > 0 : # Chequeo más robusto
        print(f"Dimensiones de la matriz de características: {feature_matrix.shape}")
    else:
        print("No se generó la matriz de características.")


if __name__ == '__main__':
    print("----------------------------------------------------")
    print("Generador de Características para el Catálogo Visual")
    print("----------------------------------------------------")
    
    if not CATALOG_IMAGE_DIR.exists() or not any(f for f in CATALOG_IMAGE_DIR.iterdir() if f.is_file() and f.suffix.lower() in ('.jpg', '.jpeg', '.png')):
        print(f"\n¡ADVERTENCIA! El directorio '{CATALOG_IMAGE_DIR}' no existe o no contiene imágenes válidas.")
        print("Por favor, crea el directorio y añade imágenes de productos (.jpg, .jpeg, .png) antes de continuar.")
    else:
        generate_features()