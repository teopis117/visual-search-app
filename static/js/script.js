document.addEventListener('DOMContentLoaded', () => {
    // Obtener referencias a los elementos del DOM
    const form = document.getElementById('upload-form');
    const fileInput = document.getElementById('file-upload');
    const submitButton = document.getElementById('submit-button');

    // Contenedor general para toda la salida de procesamiento
    const processingOutputArea = document.getElementById('processing-output-area');

    // Elementos para la barra de progreso
    const loadingProgressArea = document.getElementById('loading-progress-area');
    const progressBar = document.getElementById('progress-bar');
    const progressStageText = document.getElementById('progress-stage-text');

    // Elementos para la consola Hollywood (opcional)
    const hollywoodConsoleDiv = document.getElementById('hollywood-console');
    const consoleOutputPre = document.getElementById('console-output');
    
    // Contenedores de resultados y previsualización
    const resultsArea = document.getElementById('results-area'); // Contenedor padre para imagen subida y resultados
    const queryImageDisplay = document.getElementById('query-image-display');
    const queryImagePreview = document.getElementById('query-image-preview');
    const similarProductsDisplay = document.getElementById('similar-products-display');
    const similarProductsDiv = document.getElementById('similar-products');
    
    const errorMessageDiv = document.getElementById('error-message');

    // Instancia del Modal de Bootstrap (si existe en la página)
    let productDetailModal = null;
    const modalElement = document.getElementById('productDetailModal');
    if (modalElement) {
        productDetailModal = new bootstrap.Modal(modalElement);
    }

    let progressIntervalId = null; // ID para el intervalo de la animación de progreso

    // Función para resetear la UI a su estado inicial
    function resetUIState() {
        submitButton.disabled = true;
        fileInput.value = ''; // Limpiar el input de archivo
        
        queryImagePreview.src = "#";
        queryImageDisplay.style.display = 'none';
        
        similarProductsDisplay.style.display = 'none';
        similarProductsDiv.innerHTML = '';
        
        errorMessageDiv.style.display = 'none';
        errorMessageDiv.textContent = '';
        
        loadingProgressArea.style.display = 'none';
        updateProgressBar(0, "Iniciando..."); // Resetear barra
        
        if (hollywoodConsoleDiv) {
            hollywoodConsoleDiv.classList.remove('hollywood-console-visible');
            hollywoodConsoleDiv.classList.add('hollywood-console-hidden');
            if(consoleOutputPre) consoleOutputPre.textContent = '';
        }
        
        processingOutputArea.style.display = 'none'; // Ocultar área general
        
        if (progressIntervalId) clearInterval(progressIntervalId);
    }
    
    resetUIState(); // Llamar al cargar la página

    // Event listener para el input de archivo
    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            submitButton.disabled = false; // Habilitar botón de búsqueda
            const reader = new FileReader();
            reader.onload = function(e) {
                queryImagePreview.src = e.target.result;
                queryImageDisplay.style.display = 'block'; // Mostrar previsualización
                processingOutputArea.style.display = 'block'; // Mostrar área general
                
                // Limpiar resultados anteriores y errores, mantener previsualización
                similarProductsDisplay.style.display = 'none';
                similarProductsDiv.innerHTML = ''; 
                errorMessageDiv.style.display = 'none';
                loadingProgressArea.style.display = 'none'; 
                if (hollywoodConsoleDiv) {
                    hollywoodConsoleDiv.classList.remove('hollywood-console-visible');
                    hollywoodConsoleDiv.classList.add('hollywood-console-hidden');
                }
            }
            reader.readAsDataURL(file);
        } else {
            resetUIState(); // Si se deselecciona un archivo, resetear la UI
        }
    });

    // Event listener para el envío del formulario
    form.addEventListener('submit', async (event) => {
        console.log("Evento submit del formulario detectado.");
        event.preventDefault(); 
        console.log("preventDefault() llamado.");

        // Resetear mensajes de error y resultados previos
        errorMessageDiv.style.display = 'none';
        errorMessageDiv.textContent = '';
        similarProductsDisplay.style.display = 'none';
        similarProductsDiv.innerHTML = ''; 
        
        processingOutputArea.style.display = 'block'; 
        queryImageDisplay.style.display = 'block'; // Asegurar que la imagen subida siga visible

        if (!fileInput.files || fileInput.files.length === 0) {
            console.error("No se seleccionó ningún archivo.");
            showError("Por favor, selecciona un archivo de imagen antes de buscar.");
            return;
        }
        console.log("Archivo seleccionado:", fileInput.files[0].name);

        const formData = new FormData();
        formData.append('file', fileInput.files[0]);

        console.log("Llamando a startLoadingAnimationWithStages()...");
        startLoadingAnimationWithStages(); 
        submitButton.disabled = true; // Deshabilitar botón durante el proceso

        try {
            console.log("Intentando fetch a /upload...");
            const response = await fetch('/upload', {
                method: 'POST',
                body: formData,
            });
            console.log("Respuesta de fetch recibida, status:", response.status);

            if (!response.ok) {
                let errorMsg = `Error del servidor: ${response.status}`;
                try {
                    const errorData = await response.json();
                    errorMsg = errorData.error || errorMsg;
                } catch (e) { console.warn("No se pudo parsear error JSON del backend:", e); }
                throw new Error(errorMsg);
            }

            const data = await response.json();
            if (data.error) {
                throw new Error(data.error);
            }
            
            await completeProgressAnimation("¡Resultados Listos!");
            
            setTimeout(() => { // Pequeña pausa para que el usuario vea el 100%
                loadingProgressArea.style.display = 'none';
                if (hollywoodConsoleDiv) {
                    hollywoodConsoleDiv.classList.remove('hollywood-console-visible');
                    hollywoodConsoleDiv.classList.add('hollywood-console-hidden');
                }
                similarProductsDisplay.style.display = 'block'; 
                displayResults(data.results);
            }, 500);


        } catch (error) {
            if (progressIntervalId) clearInterval(progressIntervalId);
            updateProgressBar(100, `Error`, true); 
            showError(`Error en la búsqueda: ${error.message}`);
            console.error('Error en la subida o procesamiento:', error);
        } finally {
             submitButton.disabled = false; // Rehabilitar botón al finalizar
             // No limpiamos fileInput.value aquí, para que el usuario pueda ver qué archivo subió
             // Se limpiará si el usuario selecciona un nuevo archivo o la página se resetea.
        }
    });

    // Configuración de las etapas de la barra de progreso
    const progressStages = [
        { percent: 10, text: "Conectando con IA...", consoleMsg: "CONNECTING TO AI ANALYSIS CORE (JETSON NANO)..." },
        { percent: 20, text: "Validando imagen...", consoleMsg: "IMAGE FORMAT VALIDATION: [OK]" },
        { percent: 30, text: "Enviando a Jetson Nano...", consoleMsg: "TRANSMITTING IMAGE TO JETSON AI ENGINE..." },
        { percent: 50, text: "Pre-procesando (CUDA)...", consoleMsg: "PRE-PROCESSING & NORMALIZATION (CUDA ACCELERATED)..." },
        { percent: 70, text: "Extrayendo huella visual...", consoleMsg: "DEEP FEATURE VECTOR EXTRACTION (ResNet50 ON GPU)..." },
        { percent: 90, text: "Buscando en catálogo...", consoleMsg: "CATALOG SIMILARITY SEARCH (OPTIMIZED)..." },
    ];
    let currentStageIndex = 0;

    function startLoadingAnimationWithStages() {
        loadingProgressArea.style.display = 'block';
        if (hollywoodConsoleDiv && consoleOutputPre) { // Asegurar que consoleOutputPre exista
            hollywoodConsoleDiv.classList.remove('hollywood-console-hidden');
            hollywoodConsoleDiv.classList.add('hollywood-console-visible');
            consoleOutputPre.textContent = ''; 
        }
        
        currentStageIndex = 0;
        updateProgressBar(0, "Iniciando análisis...");
        logToHollywoodConsole("> BOOTING VISUAL ANALYSIS PIPELINE...");

        if (progressIntervalId) clearInterval(progressIntervalId);

        const totalAnimationTime = 4800; // Duración total deseada para las etapas (ej. 4.8 segundos)
        const intervalTime = totalAnimationTime / progressStages.length;

        progressIntervalId = setInterval(() => {
            if (currentStageIndex < progressStages.length) {
                const stage = progressStages[currentStageIndex];
                updateProgressBar(stage.percent, stage.text);
                logToHollywoodConsole(stage.consoleMsg);
                currentStageIndex++;
            } else {
                clearInterval(progressIntervalId);
                progressIntervalId = null; 
                progressStageText.textContent = "Finalizando y compilando resultados...";
            }
        }, intervalTime); 
    }

    function updateProgressBar(percent, text, isError = false) {
        if (!progressBar || !progressStageText) return; // Guardián por si los elementos no existen

        progressBar.style.width = percent + '%';
        progressBar.setAttribute('aria-valuenow', percent);
        
        let barText = `${percent}%`;
        if (text && percent < 100 && !isError) { // Solo añadir texto de etapa si no es 100% o error
            // barText = `${percent}% - ${text}`; // Opción 1: texto en la barra
            progressBar.textContent = barText; // Opción 2: solo porcentaje en la barra
            progressStageText.textContent = text; // Texto de etapa principal arriba
        } else if (text) {
            progressBar.textContent = text; // Para "Error" o "¡Resultados Listos!"
            progressStageText.textContent = text;
        } else {
            progressBar.textContent = barText;
        }


        progressBar.classList.remove('bg-success', 'bg-danger', 'bg-primary', 'progress-bar-animated', 'text-dark');
        if (isError) {
            progressBar.classList.add('bg-danger');
        } else if (percent >= 100 && !isError) { // Solo bg-success si no es error
            progressBar.classList.add('bg-success');
        } else if (percent > 0) {
            progressBar.classList.add('bg-primary', 'progress-bar-animated');
        } else { 
             progressBar.classList.add('bg-primary');
             progressBar.textContent = '0%'; 
        }
        if (progressBar.classList.contains('bg-warning') || progressBar.classList.contains('bg-info')) {
            progressBar.classList.add('text-dark');
        }
    }
    
    function logToHollywoodConsole(message) {
        if (hollywoodConsoleDiv && hollywoodConsoleDiv.classList.contains('hollywood-console-visible') && consoleOutputPre) {
            const timestamp = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
            consoleOutputPre.textContent += `[${timestamp}] ${message}\n`;
            hollywoodConsoleDiv.scrollTop = hollywoodConsoleDiv.scrollHeight;
        }
    }

    async function completeProgressAnimation(finalMessage) {
        if (progressIntervalId) {
            clearInterval(progressIntervalId);
            progressIntervalId = null;
        }
        
        let currentPercent = parseInt(progressBar.style.width.replace('%','')) || 0;
        if (currentPercent < progressStages[progressStages.length-1]?.percent) {
             // Asegurar que las últimas etapas visuales se muestren si el fetch fue muy rápido
            while(currentStageIndex < progressStages.length) {
                const stage = progressStages[currentStageIndex];
                updateProgressBar(stage.percent, stage.text);
                logToHollywoodConsole(stage.consoleMsg);
                await new Promise(resolve => setTimeout(resolve, 200)); 
                currentStageIndex++;
            }
        }
        
        updateProgressBar(99, "Compilando resultados finales..."); 
        logToHollywoodConsole("COMPILING FINAL RESULTS...");
        await new Promise(resolve => setTimeout(resolve, 300)); 
        
        updateProgressBar(100, finalMessage, false); // false para isError
        logToHollywoodConsole("VISUAL SEARCH COMPLETE. RESULTS DELIVERED.");
    }

    function displayResults(results) {
        similarProductsDiv.innerHTML = ''; 
        if (results && results.length > 0) {
            results.forEach(item => {
                const colDiv = document.createElement('div');
                colDiv.classList.add('col'); 

                const cardHtml = `
                    <div class="card h-100 result-item shadow-sm" style="cursor: pointer;" 
                         data-image-path="/${item.path}" 
                         data-image-name="${item.path.split('/').pop()}" 
                         data-similarity="${item.similarity.toFixed(3)}">
                        <img src="/${item.path}" class="card-img-top" alt="Producto similar ${item.path.split('/').pop()}">
                        <div class="card-body">
                            <p class="card-text small text-muted mb-0">Similitud: <strong class="fs-6">${item.similarity.toFixed(3)}</strong></p>
                        </div>
                    </div>
                `;
                colDiv.innerHTML = cardHtml;
                
                // Event listener para abrir el modal al hacer clic en la tarjeta
                const cardElement = colDiv.firstElementChild; // El elemento .card
                cardElement.addEventListener('click', function() {
                    if (productDetailModal) { 
                        document.getElementById('modal-product-image').src = this.dataset.imagePath;
                        document.getElementById('modal-product-name').textContent = this.dataset.imageName;
                        document.getElementById('modal-product-similarity').textContent = this.dataset.similarity;
                        productDetailModal.show();
                    } else {
                        console.warn("Instancia del modal no encontrada. ¿Está el HTML del modal en index.html?");
                    }
                });
                similarProductsDiv.appendChild(colDiv);
            });
        } else {
            similarProductsDiv.innerHTML = '<div class="col-12"><p class="text-center text-muted mt-3">No se encontraron productos suficientemente similares en el catálogo.</p></div>';
        }
    }

    function showError(message) {
        if (progressIntervalId) clearInterval(progressIntervalId);
        // Mostrar el error en la barra de progreso antes de ocultarla
        updateProgressBar(100, "Error Detectado", true); 
        
        setTimeout(() => { 
            loadingProgressArea.style.display = 'none';
            if (hollywoodConsoleDiv) {
                hollywoodConsoleDiv.classList.remove('hollywood-console-visible');
                hollywoodConsoleDiv.classList.add('hollywood-console-hidden');
            }
        }, 2000); 

        errorMessageDiv.textContent = message;
        errorMessageDiv.style.display = 'block';
        
        // Mantener visible la imagen subida, pero ocultar resultados similares
        queryImageDisplay.style.display = 'block'; 
        similarProductsDisplay.style.display = 'none'; 
    }
});