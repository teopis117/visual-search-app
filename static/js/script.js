document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('upload-form');
    const fileInput = document.getElementById('file-upload');
    
    const processingOutputArea = document.getElementById('processing-output-area'); // Nuevo contenedor general
    const loadingProgressArea = document.getElementById('loading-progress-area');
    const progressBar = document.getElementById('progress-bar');
    const progressStageText = document.getElementById('progress-stage-text');
    
    const resultsArea = document.getElementById('results-area');
    const queryImageDisplay = document.getElementById('query-image-display');
    const queryImagePreview = document.getElementById('query-image-preview');
    const similarProductsDisplay = document.getElementById('similar-products-display');
    const similarProductsDiv = document.getElementById('similar-products');
    
    const errorMessageDiv = document.getElementById('error-message');
    const submitButton = document.getElementById('submit-button');

    const hollywoodConsoleDiv = document.getElementById('hollywood-console');
    const consoleOutputPre = document.getElementById('console-output');
    let progressIntervalId = null;

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
        processingOutputArea.style.display = 'none'; // Ocultar área general de salida
        if (hollywoodConsoleDiv) {
            hollywoodConsoleDiv.classList.remove('hollywood-console-visible');
            hollywoodConsoleDiv.classList.add('hollywood-console-hidden');
        }
        if (progressIntervalId) clearInterval(progressIntervalId);
        updateProgressBar(0, "Iniciando..."); // Resetear barra
    }
    
    resetUIState(); // Estado inicial

    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            submitButton.disabled = false;
            const reader = new FileReader();
            reader.onload = function(e) {
                queryImagePreview.src = e.target.result;
                queryImageDisplay.style.display = 'block'; // Mostrar imagen subida
                processingOutputArea.style.display = 'block'; // Mostrar área de salida
                
                // Limpiar solo resultados y errores, no la imagen subida
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
            resetUIState(); // Si se deselecciona, resetear
        }
    });

    form.addEventListener('submit', async (event) => {
        console.log("Form submit event triggered.");
        event.preventDefault();
        console.log("preventDefault() llamado.");

        errorMessageDiv.style.display = 'none';
        errorMessageDiv.textContent = '';
        similarProductsDisplay.style.display = 'none';
        similarProductsDiv.innerHTML = ''; 
        
        processingOutputArea.style.display = 'block'; // Asegurar que el área general esté visible
        queryImageDisplay.style.display = 'block'; // Asegurar que la imagen subida se mantenga visible


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
        submitButton.disabled = true;

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
                } catch (e) { console.warn("No se pudo parsear error JSON del backend"); }
                throw new Error(errorMsg);
            }

            const data = await response.json();
            if (data.error) {
                throw new Error(data.error);
            }
            
            await completeProgressAnimation("¡Resultados Listos!");
            
            setTimeout(() => {
                loadingProgressArea.style.display = 'none';
                if (hollywoodConsoleDiv) {
                    hollywoodConsoleDiv.classList.remove('hollywood-console-visible');
                    hollywoodConsoleDiv.classList.add('hollywood-console-hidden');
                }
                similarProductsDisplay.style.display = 'block'; // Mostrar contenedor de resultados
                displayResults(data.results);
            }, 500);


        } catch (error) {
            if (progressIntervalId) clearInterval(progressIntervalId);
            updateProgressBar(100, `Error en el proceso`, true); 
            showError(`Error: ${error.message}`);
            console.error('Error en la subida o procesamiento:', error);
        } finally {
             submitButton.disabled = false;
             // No limpiar fileInput.value aquí, el usuario podría querer reintentar con el mismo archivo
             // Se limpiará al seleccionar un nuevo archivo o al resetear la UI.
        }
    });

    const progressStages = [
        { percent: 10, text: "Estableciendo conexión segura...", consoleMsg: "CONNECTING TO AI ANALYSIS CORE (JETSON NANO)..." },
        { percent: 20, text: "Validando formato de imagen...", consoleMsg: "IMAGE FORMAT VALIDATION: [OK]" },
        { percent: 30, text: "Enviando imagen al motor de IA...", consoleMsg: "TRANSMITTING IMAGE TO JETSON AI ENGINE..." },
        { percent: 50, text: "Pre-procesamiento (CUDA accelerated)...", consoleMsg: "PRE-PROCESSING & NORMALIZATION (CUDA)..." },
        { percent: 70, text: "Extrayendo huella visual profunda (ResNet50)...", consoleMsg: "DEEP FEATURE VECTOR EXTRACTION (ResNet50 ON GPU)..." },
        { percent: 90, text: "Búsqueda en catálogo textil optimizada...", consoleMsg: "CATALOG SIMILARITY SEARCH (Optimized Vector DB)..." },
    ];
    let currentStageIndex = 0;

    function startLoadingAnimationWithStages() {
        loadingProgressArea.style.display = 'block';
        if (hollywoodConsoleDiv) {
            hollywoodConsoleDiv.classList.remove('hollywood-console-hidden');
            hollywoodConsoleDiv.classList.add('hollywood-console-visible');
            consoleOutputPre.textContent = ''; 
        }
        
        currentStageIndex = 0;
        updateProgressBar(0, "Iniciando análisis...");
        logToHollywoodConsole("> BOOTING VISUAL ANALYSIS PIPELINE...");

        if (progressIntervalId) clearInterval(progressIntervalId);

        // Duración total deseada para la animación de carga (ej. 4 segundos antes de "Finalizando")
        const totalAnimationTime = 4000; 
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
                // La barra se pondrá al 100% cuando la respuesta del fetch llegue
            }
        }, intervalTime); 
    }

    function updateProgressBar(percent, text, isError = false) {
        progressBar.style.width = percent + '%';
        progressBar.setAttribute('aria-valuenow', percent);
        progressBar.textContent = text ? `${percent}% - ${text}` : `${percent}%`; // Mostrar texto en la barra
        if (text) progressStageText.textContent = text; // Actualizar texto de etapa principal

        progressBar.classList.remove('bg-success', 'bg-danger', 'bg-primary', 'progress-bar-animated', 'text-dark');
        if (isError) {
            progressBar.classList.add('bg-danger');
        } else if (percent >= 100) {
            progressBar.classList.add('bg-success');
        } else if (percent > 0) {
            progressBar.classList.add('bg-primary', 'progress-bar-animated');
        } else { // 0%
             progressBar.classList.add('bg-primary');
             progressBar.textContent = '0%'; // Asegurar que el texto sea visible en 0%
        }
        // Si el fondo de la barra es claro (ej. amarillo para advertencia), texto oscuro
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
        
        let currentPercent = parseInt(progressBar.style.width.replace('%','')) || progressStages[progressStages.length-1]?.percent || 90;
        
        // Asegurar que las últimas etapas visuales se muestren si el fetch fue muy rápido
        while(currentStageIndex < progressStages.length) {
            const stage = progressStages[currentStageIndex];
            updateProgressBar(stage.percent, stage.text);
            logToHollywoodConsole(stage.consoleMsg);
            await new Promise(resolve => setTimeout(resolve, 200)); // Pequeña pausa para ver el mensaje
            currentStageIndex++;
        }
        
        updateProgressBar(99, "Compilando resultados finales..."); // Casi listo
        logToHollywoodConsole("COMPILING FINAL RESULTS...");
        await new Promise(resolve => setTimeout(resolve, 300)); 
        
        updateProgressBar(100, finalMessage);
        logToHollywoodConsole("VISUAL SEARCH COMPLETE. RESULTS DELIVERED.");
    }

    function displayResults(results) {
        similarProductsDiv.innerHTML = ''; 
        if (results && results.length > 0) {
            results.forEach(item => {
                const colDiv = document.createElement('div');
                colDiv.classList.add('col'); 

                colDiv.innerHTML = `
                    <div class="card h-100 result-item shadow-sm">
                        <img src="/${item.path}" class="card-img-top" alt="Producto similar ${item.path.split('/').pop()}">
                        <div class="card-body">
                            <p class="card-text small text-muted mb-0">Similitud: <strong class="fs-6">${item.similarity.toFixed(3)}</strong></p>
                        </div>
                    </div>
                `;
                similarProductsDiv.appendChild(colDiv);
            });
        } else {
            similarProductsDiv.innerHTML = '<div class="col-12"><p class="text-center text-muted mt-3">No se encontraron productos suficientemente similares en el catálogo.</p></div>';
        }
    }

    function showError(message) {
        if (progressIntervalId) clearInterval(progressIntervalId);
        // Muestra el error en la barra de progreso antes de ocultarla si es necesario
        updateProgressBar(100, "Error", true); 
        
        setTimeout(() => { // Ocultar el área de progreso después de un momento para mostrar el error allí también
            loadingProgressArea.style.display = 'none';
            if (hollywoodConsoleDiv) {
                hollywoodConsoleDiv.classList.remove('hollywood-console-visible');
                hollywoodConsoleDiv.classList.add('hollywood-console-hidden');
            }
        }, 2000); // Esperar 2 segundos


        errorMessageDiv.textContent = message;
        errorMessageDiv.style.display = 'block';
        resultsArea.style.display = 'block'; // Mantener visible el área de la imagen subida
        queryImageDisplay.style.display = 'block'; // Asegurar que la imagen subida siga visible
        similarProductsDisplay.style.display = 'none'; // Ocultar el contenedor de resultados similares
    }
});