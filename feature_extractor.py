import torch
import torchvision.models as models
import torchvision.transforms as transforms
from PIL import Image, UnidentifiedImageError # <--- ¡IMPORTACIÓN AÑADIDA AQUÍ!
from pathlib import Path
from torchvision.models import ResNet50_Weights # Para la API moderna de pesos

# Cargar el modelo ResNet50 pre-entrenado usando la API de 'weights'
weights = ResNet50_Weights.IMAGENET1K_V1 
model = models.resnet50(weights=weights)

# Modificamos el modelo para que actúe como un extractor de características
model = torch.nn.Sequential(*(list(model.children())[:-1]))
model.eval() # Poner el modelo en modo de evaluación

# Verificar si hay GPU disponible
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model.to(device)
# Este print se mostrará cuando el módulo se cargue por primera vez
print(f"INFO (feature_extractor): Usando dispositivo: {device} para el modelo.")

# Definir las transformaciones de preprocesamiento de la imagen
preprocess = transforms.Compose([
    transforms.Resize(256),
    transforms.CenterCrop(224),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
])

def extract_features(image_path_str): # Renombrado a image_path_str para claridad
    """
    Extrae un vector de características de una imagen usando ResNet50.
    Args:
        image_path_str (str): Ruta a la imagen como string.
    Returns:
        numpy.ndarray or None: Vector de características, o None si hay error.
    """
    try:
        # Convertir a Path para manejo robusto, luego a string si es necesario para alguna función
        # Image.open puede tomar objetos Path directamente en versiones recientes de Pillow.
        img_path_obj = Path(image_path_str) 
        img = Image.open(img_path_obj).convert('RGB')
        img_t = preprocess(img)
        batch_t = torch.unsqueeze(img_t, 0).to(device)

        with torch.no_grad():
            features = model(batch_t)
        
        feature_vector = features.view(features.size(0), -1).squeeze().cpu().numpy()
        return feature_vector
    except FileNotFoundError:
        print(f"ERROR (extract_features): Archivo de imagen no encontrado en '{image_path_str}'")
        return None
    except UnidentifiedImageError: 
        print(f"ERROR (extract_features): No se puede identificar el archivo de imagen (formato incorrecto o corrupto?) en '{image_path_str}'")
        return None
    except Exception as e:
        print(f"ERROR GENERAL (extract_features) al procesar la imagen '{image_path_str}': {type(e).__name__} - {e}")
        return None

if __name__ == '__main__':
    # Esta sección es solo para pruebas directas del script.
    # ¡RECUERDA PONER IMÁGENES REALES EN catalog_data/ PARA EL FUNCIONAMIENTO CORRECTO!
    print("\n--- Prueba de feature_extractor.py ---")
    
    # Crear directorio de catálogo si no existe para la prueba
    Path("catalog_data").mkdir(parents=True, exist_ok=True)
    test_image_path_str = "catalog_data/producto_ejemplo_test.jpg" # Usar un nombre distinto para la prueba
    
    # Intentar crear una imagen dummy para la prueba si no existe
    if not Path(test_image_path_str).exists():
        print(f"ADVERTENCIA: '{test_image_path_str}' no existe. Creando un placeholder temporal para prueba.")
        print("             ¡DEBES REEMPLAZARLO CON UNA IMAGEN REAL EN catalog_data/ para el proyecto!")
        try:
            dummy_img = Image.new('RGB', (100, 100), color = 'skyblue')
            dummy_img.save(test_image_path_str)
            print(f"Imagen dummy creada en '{test_image_path_str}'.")
        except Exception as e:
            print(f"No se pudo crear la imagen dummy: {e}")

    if Path(test_image_path_str).exists():
        print(f"Extrayendo características de imagen de ejemplo: '{test_image_path_str}'")
        features = extract_features(test_image_path_str)
        if features is not None:
            print("Vector de características de prueba extraído (primeros 5 valores):")
            print(features[:5])
            print(f"Dimensiones del vector de prueba: {features.shape}")
        else:
            print("No se pudieron extraer características de la imagen de prueba.")
    else:
        print(f"Archivo de imagen de ejemplo '{test_image_path_str}' no encontrado y no se pudo crear para la prueba.")
    print("--- Fin de prueba de feature_extractor.py ---\n")