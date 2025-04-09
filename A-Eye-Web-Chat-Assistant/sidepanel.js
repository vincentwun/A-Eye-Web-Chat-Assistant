import { VoiceController } from './components/voiceControl.js';
import { ScreenshotController } from './components/screenShot.js';

const DEFAULT_CLOUD_MODEL = 'gemini-2.5-pro-exp-03-25';
const CLOUD_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/';

function stripBase64Prefix(dataUrl) {
    if (!dataUrl || !dataUrl.startsWith('data:image')) {
        console.warn("Invalid or non-image data URL provided:", dataUrl);
        return null;
    }
    const commaIndex = dataUrl.indexOf(',');
    if (commaIndex === -1) {
        console.warn("Could not find comma separator in data URL:", dataUrl);
        return null;
    }
    return dataUrl.substring(commaIndex + 1);
}


class AIScreenReader {
    constructor() {
        this.prompts = {
            screenshot: 'You are a Webpage Screen Reader. Describe this screenshot concisely, focusing on layout, main elements, and visible text. Aim for under 100 words.',
            scrollingScreenshot: 'You are a Webpage Screen Reader. Describe the key sections and overall content visible in this combined scrolling screenshot. Aim for under 150 words.',
            analyzeContent: 'Summarize the following webpage text content clearly and concisely:',
            defaultChat: 'You are a helpful assistant.'
        };

        this.state = {
            activeApiMode: 'cloud',
            localApiUrl: '',
            cloudApiKey: '',
            ollamaMultimodalModel: '',
            cloudModelName: DEFAULT_CLOUD_MODEL,
            isProcessing: false,
            messages: [],
            lastCommandTime: 0,
            commandCooldown: 1000
        };

        this.elements = {
            screenshotButton: document.getElementById('screenshot-button'),
            scrollingScreenshotButton: document.getElementById('scrolling-screenshot-button'),
            analyzeContentButton: document.getElementById('analyze-content-button'),
            openOptionsButton: document.getElementById('options-button'),
            previewContainer: document.getElementById('preview-container'),
            previewImage: document.getElementById('preview-image'),
            previewText: document.getElementById('preview-text'),
            conversation: document.getElementById('conversation'),
            userInput: document.getElementById('user-input'),
            sendButton: document.getElementById('send-button'),
            voiceButton: document.getElementById('voiceInput-button'),
            repeatButton: document.getElementById('repeat-button'),
            clearButton: document.getElementById('clear-button'),
            localModeButton: document.getElementById('local-mode-button'),
            cloudModeButton: document.getElementById('cloud-mode-button'),
            localModeOptions: document.getElementById('local-mode-options'),
            cloudModeOptions: document.getElementById('cloud-mode-options'),
            localUrlInput: document.getElementById('local-url-input'),
            cloudApiKeyInput: document.getElementById('cloud-api-key-input'),
            localModelNameInput: document.getElementById('local-model-name-input'),
        };

        this.voiceController = new VoiceController();
        this.voiceController.setCallbacks({
            appendMessage: (role, content) => this.appendMessage(role, content),
            updateVoiceInputButtonState: (isActive) => {
                if (this.elements.voiceButton) {
                    this.elements.voiceButton.style.backgroundColor = isActive ? '#dc3545' : '#1a73e8';
                    this.elements.voiceButton.textContent = isActive ? 'Stop' : 'Voice';
                }
            },
            handleSendMessage: () => this.handleSendMessage()
        });

        this.screenshotController = new ScreenshotController();
        this.screenshotController.setCallbacks({
            onStart: () => {
                const message = "Taking scrolling screenshot...";
                this.voiceController.speakText(message);
                this.appendMessage('system', message);
            }
        });

        this.commandMap = {
            'screenshot': () => this.handleScreenshot(),
            'scrolling': () => this.handleScrollingScreenshot(),
            'analyze': () => this.handleContentAnalysis()
        };

        this.setupMessageListener();
        this.initializeAll();
    }

    setupMessageListener() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            console.log('Message received in sidepanel:', request);
            const messageHandlers = {
                toggleVoiceInput: () => this.voiceController.toggleVoiceInput(),
                toggleRepeat: () => this.handleRepeat(),
                executeScreenshot: () => this.handleScreenshot(),
                executeScrollingScreenshot: () => this.handleScrollingScreenshot(),
                executeAnalyzeContent: () => this.handleContentAnalysis()
            };

            if (messageHandlers[request.type]) {
                messageHandlers[request.type]();
                sendResponse({ success: true });
                return true;
            }
            sendResponse({ success: false, error: 'Unknown message type' });
            return false;
        });
    }

    async initializeAll() {
        try {
            await this.loadSettings();
            this.updateModeUI();
            this.setupEventListeners();
            this.voiceController.initializeAll();
            this.appendMessage('system', 'A-Eye Assistant Ready.');
            this.voiceController.speakText('A-Eye Assistant Ready.');
        } catch (error) {
            console.error('Initialization failed:', error);
            this.appendMessage('system', `Initialization failed: ${error.message}. Please check console or refresh.`);
        }
    }

    async loadSettings() {
        try {
            const result = await chrome.storage.local.get([
                'activeApiMode', 'localApiUrl', 'cloudApiKey', 'ollamaMultimodalModel', 'cloudModelName'
            ]);

            this.state.activeApiMode = result.activeApiMode || 'cloud';
            this.state.cloudApiKey = result.cloudApiKey || '';
            this.state.cloudModelName = result.cloudModelName || DEFAULT_CLOUD_MODEL;
            this.state.localApiUrl = result.localApiUrl || this.elements.localUrlInput.value.trim();
            this.elements.localUrlInput.value = this.state.localApiUrl;
            this.state.ollamaMultimodalModel = result.ollamaMultimodalModel || this.elements.localModelNameInput.value.trim();
            this.elements.localModelNameInput.value = this.state.ollamaMultimodalModel;
            this.elements.cloudApiKeyInput.value = this.state.cloudApiKey;

        } catch (error) {
            console.error('Error loading settings:', error);
            this.appendMessage('system', 'Error loading settings. Using initial values from inputs.');
            this.state.activeApiMode = this.state.activeApiMode || 'cloud';
            this.state.localApiUrl = this.elements.localUrlInput.value.trim();
            this.state.ollamaMultimodalModel = this.elements.localModelNameInput.value.trim();
            this.state.cloudApiKey = this.elements.cloudApiKeyInput.value.trim();
            this.state.cloudModelName = this.state.cloudModelName || DEFAULT_CLOUD_MODEL;
        }
        this.updateModeUI();
    }

    async saveSettings() {
        try {
            await chrome.storage.local.set({
                activeApiMode: this.state.activeApiMode,
                localApiUrl: this.state.localApiUrl,
                cloudApiKey: this.state.cloudApiKey,
                ollamaMultimodalModel: this.state.ollamaMultimodalModel,
                cloudModelName: this.state.cloudModelName
            });
            console.log('Settings saved:', this.state);
        } catch (error) {
            console.error('Error saving settings:', error);
            this.appendMessage('system', 'Error saving settings.');
        }
    }

    setupEventListeners() {
        const eventHandlers = {
            'screenshotButton': () => this.handleScreenshot(),
            'scrollingScreenshotButton': () => this.handleScrollingScreenshot(),
            'analyzeContentButton': () => this.handleContentAnalysis(),
            'openOptionsButton': () => this.handleOpenOptions(),
            'sendButton': () => this.handleSendMessage(),
            'voiceButton': () => this.voiceController.toggleVoiceInput(),
            'repeatButton': () => this.handleRepeat(),
            'clearButton': () => this.handleClear(),
            'localModeButton': () => this.handleModeChange('local'),
            'cloudModeButton': () => this.handleModeChange('cloud'),
        };

        Object.entries(eventHandlers).forEach(([elementId, handler]) => {
            const element = this.elements[elementId];
            if (element) {
                element.addEventListener('click', handler.bind(this));
            } else {
                console.warn(`Element with ID '${elementId}' not found for event listener.`);
            }
        });

        this.elements.userInput.addEventListener('input', () => this.handleInputChange());
        this.elements.userInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.handleSendMessage();
            }
        });

        this.elements.localUrlInput.addEventListener('change', (e) => {
            this.state.localApiUrl = e.target.value.trim();
            console.log("Local URL changed to:", this.state.localApiUrl);
            this.saveSettings();
        });

        this.elements.localModelNameInput.addEventListener('change', (e) => {
            this.state.ollamaMultimodalModel = e.target.value.trim();
            console.log("Local Model Name changed to:", this.state.ollamaMultimodalModel);
            this.saveSettings();
        });

        this.elements.cloudApiKeyInput.addEventListener('change', (e) => {
            this.state.cloudApiKey = e.target.value.trim();
            this.saveSettings();
        });
    }

    handleModeChange(newMode) {
        if (newMode !== this.state.activeApiMode && !this.state.isProcessing) {
            this.state.activeApiMode = newMode;
            this.updateModeUI();
            this.saveSettings();
            const modeName = newMode === 'local' ? 'Local' : 'Cloud';
            this.appendMessage('system', `Switched to ${modeName} Mode.`);
            this.voiceController.speakText(`Switched to ${modeName} Mode.`);
        } else if (this.state.isProcessing) {
            this.appendMessage('system', `Cannot switch modes while processing.`);
            this.voiceController.speakText(`Cannot switch modes now.`);
        }
    }

    updateModeUI() {
        const isLocal = this.state.activeApiMode === 'local';
        this.elements.localModeOptions.style.display = isLocal ? 'block' : 'none';
        this.elements.cloudModeOptions.style.display = !isLocal ? 'block' : 'none';
        this.elements.localModeButton.classList.toggle('active-mode', isLocal);
        this.elements.cloudModeButton.classList.toggle('active-mode', !isLocal);

        this.elements.localUrlInput.value = this.state.localApiUrl;
        this.elements.localModelNameInput.value = this.state.ollamaMultimodalModel;
        this.elements.cloudApiKeyInput.value = this.state.cloudApiKey;
    }

    showPreview(type, content) {
        this.elements.previewContainer.style.display = 'block';
        const isImage = type === 'image';
        this.elements.previewImage.style.display = isImage ? 'block' : 'none';
        this.elements.previewText.style.display = !isImage ? 'block' : 'none';

        if (isImage) {
            this.elements.previewImage.src = content || '';
        } else {
            this.elements.previewText.innerHTML = content || '';
        }
    }

    hidePreview() {
        this.elements.previewContainer.style.display = 'none';
        this.elements.previewImage.style.display = 'none';
        this.elements.previewText.style.display = 'none';
        this.elements.previewImage.src = '';
    }

    async sendApiRequest(payload, imageDataUrl = null) {
        console.log(`sendApiRequest called. Mode: ${this.state.activeApiMode}, Image provided: ${!!imageDataUrl}`);

        let endpoint = '';
        const headers = { 'Content-Type': 'application/json' };
        let body;
        let rawBase64 = null;
        let mimeType = 'image/png'; // Default MIME type

        // --- Image Processing (Common for both modes) ---
        if (imageDataUrl) {
            rawBase64 = stripBase64Prefix(imageDataUrl);
            if (rawBase64) {
                const mimeTypeMatch = imageDataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,/);
                if (mimeTypeMatch) {
                    mimeType = mimeTypeMatch[1];
                    console.log(`Detected image MIME type: ${mimeType}`);
                } else {
                    console.warn("Could not detect specific image MIME type from data URL, using default:", mimeType);
                }
            } else {
                // stripBase64Prefix already logs a warning if it fails
                this.appendMessage('system', 'Warning: Could not process image data. Sending text only.');
                await this.voiceController.speakText('Warning, could not process image.');
                // Ensure these are null if processing failed
                imageDataUrl = null;
                rawBase64 = null;
            }
        }

        // --- Payload Preparation (Mode Specific) ---
        try {
            if (this.state.activeApiMode === 'local') {
                // --- Ollama /api/chat Payload Construction ---
                if (!this.state.localApiUrl) throw new Error('Local Ollama URL is not configured. Please check input.');
                if (!this.state.ollamaMultimodalModel) throw new Error('Ollama model name is not set. Please check input.');

                // Use the /api/chat endpoint
                endpoint = new URL('/api/chat', this.state.localApiUrl).toString();

                // Build Ollama 'messages' history
                const MAX_HISTORY_MESSAGES = 10; // Limit history length
                const relevantHistory = this.state.messages.slice(-MAX_HISTORY_MESSAGES);
                const ollamaMessages = [];

                for (const message of relevantHistory) {
                    // Map roles ('assistant' is used by Ollama for the model's responses)
                    if ((message.role === 'user' || message.role === 'assistant') && message.content) {
                        const lastRole = ollamaMessages.length > 0 ? ollamaMessages[ollamaMessages.length - 1].role : null;
                        // Basic check to prevent consecutive identical roles by merging or skipping
                        if (lastRole === message.role) {
                            console.warn(`Merging consecutive ${message.role} messages for Ollama history.`);
                            ollamaMessages[ollamaMessages.length - 1].content += "\n" + message.content;
                        } else {
                            // Only add content for past messages. Images are sent with the current user message.
                            ollamaMessages.push({ role: message.role, content: message.content });
                        }
                    }
                }

                // Add the CURRENT user request (prompt and optional image)
                const currentUserMessage = {
                    role: 'user',
                    content: payload.prompt || "" // Ensure content is always a string
                };

                if (rawBase64) {
                    // Add image data to the *current* user message object
                    currentUserMessage.images = [rawBase64];
                    // Optional: Add placeholder text if content is empty but image exists, some models might need it
                    // if (!currentUserMessage.content) {
                    //    currentUserMessage.content = "Describe the image.";
                    // }
                }

                // Only add the current user message if it has text or images
                if (currentUserMessage.content || (currentUserMessage.images && currentUserMessage.images.length > 0)) {
                    // Check for consecutive user roles again before adding
                    const lastRole = ollamaMessages.length > 0 ? ollamaMessages[ollamaMessages.length - 1].role : null;
                    if (lastRole === 'user') {
                        console.warn("Merging current user prompt with previous user message for Ollama.");
                        ollamaMessages[ollamaMessages.length - 1].content += "\n" + currentUserMessage.content;
                        // If previous message didn't have images but current does, add them
                        if (currentUserMessage.images && !ollamaMessages[ollamaMessages.length - 1].images) {
                            ollamaMessages[ollamaMessages.length - 1].images = currentUserMessage.images;
                        }
                    } else {
                        ollamaMessages.push(currentUserMessage);
                    }
                } else {
                    console.warn("sendApiRequest called for Local mode with no current prompt or image. Sending history only (if any).");
                    // Avoid sending an empty request if history is also empty
                    if (ollamaMessages.length === 0) {
                        throw new Error("Cannot send an empty request to Ollama chat.");
                    }
                }

                // Final Ollama Payload for /api/chat
                const ollamaPayload = {
                    model: this.state.ollamaMultimodalModel,
                    messages: ollamaMessages, // Use the constructed message history
                    stream: false // Keep streaming off for standard response handling
                    // Optional: Add generation options here if needed
                    // options: { temperature: 0.7 }
                };
                body = JSON.stringify(ollamaPayload);
                console.log(`Sending to Local Ollama (/api/chat): ${endpoint} (Model: ${ollamaPayload.model}) with ${ollamaMessages.length} history turns.`);
                // console.log("Ollama Payload (Debug):", JSON.stringify(ollamaPayload, null, 2)); // Uncomment for debugging

            } else if (this.state.activeApiMode === 'cloud') {
                // --- Cloud (Gemini) Payload Construction (Existing Logic) ---
                if (!this.state.cloudApiKey) throw new Error('Cloud Gemini API Key not configured.');
                if (!this.state.cloudModelName) throw new Error('Cloud Gemini model name not set.');

                const fullApiUrl = `${CLOUD_API_BASE_URL}${this.state.cloudModelName}:generateContent`;
                // Check if streaming is desired (and supported by model) - currently NOT implemented
                // If implementing streaming: change endpoint to :streamGenerateContent
                // const endpointAction = ":generateContent"; // Or ":streamGenerateContent";
                // const fullApiUrl = `${CLOUD_API_BASE_URL}${this.state.cloudModelName}${endpointAction}`;
                endpoint = `${fullApiUrl}?key=${this.state.cloudApiKey}`;

                // Build Gemini 'contents' history
                const MAX_HISTORY_MESSAGES = 10; // Limit history length
                const relevantHistory = this.state.messages.slice(-MAX_HISTORY_MESSAGES);
                const geminiContents = [];

                for (const message of relevantHistory) {
                    let role = null;
                    let parts = [];

                    if (message.role === 'user' && message.content) {
                        role = 'user';
                        parts.push({ text: message.content });
                        // Note: Images from past messages are not re-sent in this simple history.
                    } else if (message.role === 'assistant' && message.content) {
                        role = 'model'; // Gemini uses 'model'
                        parts.push({ text: message.content });
                    }

                    if (role && parts.length > 0) {
                        // Ensure history starts with user or is empty before adding model
                        if (geminiContents.length === 0 && role !== 'user') {
                            console.warn("Skipping leading assistant message in Gemini history construction:", message.content);
                            continue;
                        }

                        // Basic check to prevent consecutive roles (Gemini API requires alternating user/model roles)
                        const lastRole = geminiContents.length > 0 ? geminiContents[geminiContents.length - 1].role : null;
                        if (lastRole === role) {
                            console.warn(`Consecutive ${role} roles detected for Gemini. Merging parts.`);
                            const lastParts = geminiContents[geminiContents.length - 1].parts;
                            const currentText = parts.find(p => p.text)?.text;
                            if (currentText) {
                                const lastTextPartIndex = lastParts.findLastIndex(p => p.text);
                                if (lastTextPartIndex !== -1) {
                                    lastParts[lastTextPartIndex].text += "\n" + currentText; // Append text
                                } else {
                                    lastParts.push({ text: currentText }); // Add if no previous text part
                                }
                            }
                            // Note: This doesn't handle merging complex parts (like images) - not applicable here as history images aren't sent
                        } else {
                            geminiContents.push({ role, parts });
                        }
                    }
                }

                // Add the CURRENT user request (prompt and optional image)
                const currentUserParts = [];
                if (payload.prompt) {
                    currentUserParts.push({ text: payload.prompt });
                }
                if (rawBase64) {
                    currentUserParts.push({
                        inline_data: {
                            mime_type: mimeType,
                            data: rawBase64
                        }
                    });
                }

                if (currentUserParts.length > 0) {
                    // Ensure the last message in history was 'model' before adding 'user'
                    const lastRole = geminiContents.length > 0 ? geminiContents[geminiContents.length - 1].role : null;
                    if (lastRole === 'user') {
                        console.warn("Merging current user request with previous for Gemini due to consecutive roles.");
                        const lastParts = geminiContents[geminiContents.length - 1].parts;
                        const currentText = currentUserParts.find(p => p.text)?.text;
                        const currentImage = currentUserParts.find(p => p.inline_data);
                        if (currentText) {
                            const lastTextPartIndex = lastParts.findLastIndex(p => p.text);
                            if (lastTextPartIndex !== -1) { lastParts[lastTextPartIndex].text += "\n" + currentText; }
                            else { lastParts.push({ text: currentText }); }
                        }
                        if (currentImage && !lastParts.some(p => p.inline_data)) { // Avoid adding duplicate images
                            lastParts.push(currentImage);
                        }
                    } else {
                        geminiContents.push({ role: 'user', parts: currentUserParts });
                    }
                } else {
                    console.warn("sendApiRequest called for Cloud mode with no current prompt or image.");
                    // Allow sending history only if needed, but Gemini might error if last message is 'user'
                    if (geminiContents.length === 0) {
                        throw new Error("Cannot send empty request to Gemini.");
                    }
                    if (geminiContents.length > 0 && geminiContents[geminiContents.length - 1].role === 'user') {
                        console.warn("Attempting to send Gemini request ending in 'user' role without new content. API might reject this.");
                    }
                }

                // Final Gemini Payload
                const geminiPayload = {
                    contents: geminiContents
                    // Optional: Add safetySettings or generationConfig here
                    // generationConfig: { temperature: 0.7, maxOutputTokens: 800 },
                    // safetySettings: [ { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" } ]
                };
                body = JSON.stringify(geminiPayload);
                console.log(`Sending to Cloud Gemini (${this.state.cloudModelName}) with ${geminiContents.length} history turns.`);
                // console.log("Gemini Payload (Debug):", JSON.stringify(geminiPayload, null, 2)); // Uncomment for debugging

            } else {
                throw new Error('Invalid API mode selected.');
            }

        } catch (error) {
            console.error("Error preparing API request:", error);
            this.appendMessage('system', `Error preparing request: ${error.message}`);
            // Re-throw the error to be caught by the caller (e.g., handleSendMessage)
            // This prevents the fetch from running with invalid data and allows UI state reset
            throw error;
        }

        // --- API Fetch and Response Handling ---
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: headers,
                body: body
            });

            if (!response.ok) {
                let errorBodyText = '';
                try {
                    errorBodyText = await response.text(); // Try to get error details from body
                } catch (e) {
                    console.warn("Could not read error response body:", e);
                }
                console.error(`API Error Response (${response.status} ${response.statusText}):`, errorBodyText);

                let detailedError = `API Error (${response.status} ${response.statusText})`;
                if (errorBodyText) {
                    try {
                        // Attempt to parse JSON error (common format)
                        const errorJson = JSON.parse(errorBodyText);
                        if (errorJson.error && errorJson.error.message) {
                            detailedError += `: ${errorJson.error.message}`;
                            // Log specific Gemini error details if available
                            if (errorJson.error.details) console.error("Gemini Error Details:", errorJson.error.details);
                        } else if (errorJson.error) { // Ollama might just have an 'error' string
                            detailedError += `: ${errorJson.error}`;
                        }
                        else {
                            detailedError += `. Response: ${errorBodyText.substring(0, 200)}`; // Limit length
                        }
                    } catch (e) {
                        // If parsing fails, use the raw text
                        detailedError += `. Response: ${errorBodyText.substring(0, 200)}`;
                    }
                }
                throw new Error(detailedError);
            }

            // --- Successful Response Parsing (Mode Specific) ---
            const data = await response.json();
            console.log("API Response Data:", data);

            let responseText = 'Error: Could not parse response.'; // Default error

            if (this.state.activeApiMode === 'local') {
                // --- Ollama /api/chat Response Parsing ---
                if (data.message && typeof data.message.content === 'string') {
                    responseText = data.message.content;
                } else if (data.error) {
                    // Handle explicit errors returned in Ollama's JSON body
                    responseText = `Ollama API Error: ${data.error}`;
                    console.error("Ollama API returned error object:", data);
                } else if (typeof data.response === 'string') { // Fallback for older Ollama or maybe /api/generate if endpoint was wrong
                    responseText = data.response;
                    console.warn("Received response in 'data.response' field, expected 'data.message.content' for /api/chat.");
                }
                else {
                    // Fallback if the expected structure isn't found
                    responseText = 'Error: Could not parse Ollama chat response content.';
                    console.warn("Unexpected Ollama /api/chat response structure:", data);
                }

            } else if (this.state.activeApiMode === 'cloud') {
                // --- Gemini Response Parsing (Existing Logic, slightly enhanced) ---
                try {
                    // Standard successful response path
                    if (data.candidates && data.candidates[0]?.content?.parts) {
                        responseText = data.candidates[0].content.parts
                            .filter(part => part.text) // Ensure only text parts are joined
                            .map(part => part.text)
                            .join(''); // Join multiple text parts if present
                    }
                    // Handle cases where the request was blocked or finished unexpectedly
                    else if (data.promptFeedback?.blockReason) {
                        responseText = `Request blocked by API: ${data.promptFeedback.blockReason}`;
                        if (data.promptFeedback.safetyRatings) {
                            responseText += ` - Details: ${data.promptFeedback.safetyRatings.map(r => `${r.category}: ${r.probability}`).join(', ')}`;
                        }
                        console.warn("Gemini request blocked:", data.promptFeedback);
                    } else if (data.candidates && data.candidates[0]?.finishReason && data.candidates[0].finishReason !== "STOP") {
                        // Handle other finish reasons like SAFETY, RECITATION, MAX_TOKENS etc.
                        responseText = `Request finished unexpectedly. Reason: ${data.candidates[0].finishReason}`;
                        const safetyRatingsInfo = data.candidates[0].safetyRatings?.map(r => `${r.category}: ${r.probability}`).join(', ');
                        if (safetyRatingsInfo) responseText += ` (Safety Ratings: ${safetyRatingsInfo})`;
                        console.warn(`Gemini request finished with reason: ${data.candidates[0].finishReason}`, data.candidates[0]);
                        // If there's partial content despite the finish reason, try to get it
                        if (data.candidates[0].content?.parts?.some(p => p.text)) {
                            const partialText = data.candidates[0].content.parts.filter(p => p.text).map(p => p.text).join('');
                            responseText += `\nPartial content: ${partialText}`;
                        }
                    }
                    // Handle explicit errors returned in Gemini's JSON body
                    else if (data.error) {
                        responseText = `Gemini API Error: ${data.error.message || 'Unknown error'}`;
                        console.error("Gemini API returned error object:", data.error);
                    }
                    // Fallback for unexpected structure but no clear error
                    else {
                        responseText = 'Error: Received unexpected response structure from Gemini API.';
                        console.warn("Unexpected Gemini response structure:", data);
                    }
                } catch (parseError) {
                    console.error("Error parsing Gemini response content:", parseError, data);
                    responseText = 'Error: Failed to process Gemini response content.';
                }
            }

            return responseText; // Return the extracted text content

        } catch (error) {
            // Catch errors from fetch() itself (network issues) or errors thrown from !response.ok check
            console.error("Error during API fetch or response processing:", error);
            // Re-throw the error so the calling function (e.g., handleSendMessage, handleScreenshot)
            // knows the operation failed and can execute its 'finally' block correctly (e.g., re-enable UI).
            throw error;
        }
    }


    async handleScreenshot() {
        console.log('handleScreenshot triggered');
        if (this.state.isProcessing) {
            this.appendMessage('system', 'Processing already in progress.'); return;
        }
        this.state.isProcessing = true;
        this.disableInterface();
        this.hidePreview();

        try {
            this.appendMessage('system', 'Taking screenshot...');
            await this.voiceController.speakText("Taking screenshot.");
            const screenshotDataUrl = await this.screenshotController.captureVisibleTab();

            if (screenshotDataUrl) {
                this.showPreview('image', screenshotDataUrl);
                this.appendMessage('system', 'Screenshot captured. Sending for analysis...');
                await this.voiceController.speakText("Analyzing screenshot.");

                const payload = { prompt: this.prompts.screenshot };
                const responseContent = await this.sendApiRequest(payload, screenshotDataUrl);
                this.handleResponse(responseContent);

            } else {
                throw new Error('Screenshot capture returned empty data.');
            }
        } catch (error) {
            this.handleError('Screenshot analysis failed', error);
        } finally {
            this.state.isProcessing = false;
            this.enableInterface();
        }
    }

    async handleScrollingScreenshot() {
        console.log('handleScrollingScreenshot triggered');
        if (this.state.isProcessing) {
            this.appendMessage('system', 'Processing already in progress.'); return;
        }
        this.state.isProcessing = true;
        this.disableInterface();
        this.hidePreview();

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) throw new Error('No active tab found for scrolling screenshot.');

            const mergedImageDataUrl = await this.screenshotController.handleScrollingScreenshot(tab);

            if (mergedImageDataUrl) {
                this.showPreview('image', mergedImageDataUrl);
                this.appendMessage('system', 'Scrolling screenshot captured. Sending for analysis...');
                await this.voiceController.speakText("Analyzing scrolling screenshot.");

                const payload = { prompt: this.prompts.scrollingScreenshot };
                const responseContent = await this.sendApiRequest(payload, mergedImageDataUrl);
                this.handleResponse(responseContent);

            } else {
                throw new Error('Scrolling screenshot creation failed or returned no image.');
            }
        } catch (error) {
            this.handleError('Scrolling screenshot analysis failed', error);
        } finally {
            this.state.isProcessing = false;
            this.enableInterface();
        }
    }

    async handleContentAnalysis() {
        console.log('handleContentAnalysis triggered');
        if (this.state.isProcessing) {
            this.appendMessage('system', 'Processing already in progress.'); return;
        }
        this.state.isProcessing = true;
        this.disableInterface();
        this.hidePreview();

        try {
            this.appendMessage('system', 'Extracting page content...');
            await this.voiceController.speakText("Extracting page content.");

            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) throw new Error('No active tab found for content analysis.');

            const extractedText = await this.extractPageContent(tab);

            if (extractedText) {
                this.showPreview('text', `${this.escapeHTML(extractedText.substring(0, 500))}...`);
                this.appendMessage('system', 'Content extracted. Sending for analysis...');
                await this.voiceController.speakText("Analyzing content.");

                const fullPrompt = `${this.prompts.analyzeContent}\n\n${extractedText}`;
                const payload = { prompt: fullPrompt };

                const responseContent = await this.sendApiRequest(payload);
                this.handleResponse(responseContent);

            } else {
                throw new Error('Content extraction failed or returned empty.');
            }

        } catch (error) {
            this.handleError('Content analysis failed', error);
        } finally {
            this.state.isProcessing = false;
            this.enableInterface();
        }
    }

    async handleSendMessage() {
        console.log('handleSendMessage triggered');
        const userInput = this.elements.userInput.value.trim();
        if (!userInput) {
            this.appendMessage('system', 'Please enter a message.');
            return;
        }
        if (this.state.isProcessing) {
            this.appendMessage('system', 'Processing already in progress.'); return;
        }
        this.state.isProcessing = true;
        this.disableInterface();
        this.elements.userInput.value = '';

        try {
            this.appendMessage('user', userInput);
            const payload = { prompt: userInput };

            const responseContent = await this.sendApiRequest(payload);
            this.handleResponse(responseContent);

        } catch (error) {
            this.handleError('Message sending failed', error);
        } finally {
            if (this.state.isProcessing) {
                this.state.isProcessing = false;
                this.enableInterface();
            }
        }
    }

    async extractPageContent(tab) {
        if (!tab || !tab.id) {
            throw new Error("Invalid tab provided for content extraction.");
        }
        try {
            try {
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['./lib/readability.js']
                });
            } catch (injectionError) {
                if (!injectionError.message.includes('already been injected')) {
                    console.warn('Readability injection may have failed:', injectionError);
                }
            }


            const [{ result }] = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                function: () => {
                    if (typeof Readability === 'undefined') {
                        return { success: false, error: 'Readability library not found in page context.' };
                    }
                    try {
                        const documentClone = document.cloneNode(true);
                        const reader = new Readability(documentClone);
                        const article = reader.parse();

                        if (!article || !article.textContent) {
                            return { success: false, error: 'Readability could not parse meaningful content.' };
                        }

                        return {
                            title: article.title,
                            content: article.textContent,
                            byline: article.byline,
                            length: article.length,
                            excerpt: article.excerpt,
                            success: true
                        };
                    } catch (error) {
                        console.error("Error during Readability parsing:", error);
                        return { success: false, error: error.message };
                    }
                }
            });

            if (!result || !result.success) {
                throw new Error(`Content extraction failed: ${result?.error || 'Unknown error in content script.'}`);
            }

            console.log(`Readability extracted: ${result.length} chars, Title: ${result.title}`);
            return this.formatExtractedContent(result);

        } catch (error) {
            console.error('Content extraction script execution error:', error);
            throw new Error(`Failed to execute content extraction script: ${error.message}`);
        }
    }

    formatExtractedContent(result) {
        let formatted = '';
        if (result.title) {
            formatted += `Title: ${result.title}\n\n`;
        }
        if (result.byline) {
            formatted += `By: ${result.byline}\n\n`;
        }
        formatted += result.content || 'No main content found.';
        return formatted.trim();
    }

    handleInputChange() {
        this.elements.sendButton.disabled = !this.elements.userInput.value.trim();
    }

    appendMessage(role, content) {
        if (!this.elements.conversation) return;

        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', `message-${role}`);

        const formattedContent = this.escapeHTML(content).replace(/\n/g, '<br>');

        let rolePrefix = 'AI';
        if (role === 'user') rolePrefix = 'You';
        else if (role === 'system') rolePrefix = 'System';

        messageDiv.innerHTML = `<strong>${rolePrefix}:</strong> ${formattedContent}`;
        this.elements.conversation.appendChild(messageDiv);
        this.elements.conversation.scrollTop = this.elements.conversation.scrollHeight;

        if (role === 'user' || role === 'assistant') {
            this.state.messages.push({ role, content });
        }
    }

    escapeHTML(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    handleResponse(responseContent) {
        console.log('Handling final API response:', responseContent);
        this.appendMessage('assistant', responseContent);

        const normalizedResponse = responseContent.toLowerCase().trim().replace(/[.!]$/, '');
        if (this.handleCommands(normalizedResponse)) {
            console.log('Command detected in AI response and executed.');
            return;
        }

        this.voiceController.speakText(responseContent);
    }

    handleCommands(normalizedResponse) {
        console.log('Checking for commands in response:', normalizedResponse);
        const commandActions = {
            'screenshot': () => this.handleScreenshot(),
            'take screenshot': () => this.handleScreenshot(),
            'scrolling screenshot': () => this.handleScrollingScreenshot(),
            'analyze content': () => this.handleContentAnalysis(),
            'analyze page': () => this.handleContentAnalysis()
        };

        if (commandActions[normalizedResponse]) {
            if (this.canExecuteCommand()) {
                this.appendMessage('system', `Executing command from AI: ${normalizedResponse}`);
                setTimeout(() => {
                    this.state.isProcessing = false;
                    this.enableInterface();
                    commandActions[normalizedResponse]();
                }, 100);
                return true;
            } else {
                this.appendMessage('system', 'Command cooldown active.');
                return false;
            }
        }

        if (normalizedResponse.startsWith('open url ') || normalizedResponse.startsWith('window.open')) {
            const urlMatch = normalizedResponse.match(/(?:open url|window\.open)\s*\(?['"]?(https?:\/\/[^\s'"]+)['"]?\)?/);
            if (urlMatch && urlMatch[1]) {
                if (this.canExecuteCommand()) {
                    try {
                        const url = new URL(urlMatch[1]).toString();
                        this.appendMessage('system', `Opening URL from AI: ${url}`);
                        this.voiceController.speakText(`Opening URL.`);
                        window.open(url, '_blank');
                        setTimeout(() => {
                            this.state.isProcessing = false;
                            this.enableInterface();
                        }, 100);
                        return true;
                    } catch (error) {
                        this.handleError('Invalid URL format from AI', error);
                        return false;
                    }
                } else {
                    this.appendMessage('system', 'Command cooldown active.');
                    return false;
                }
            }
        }

        return false;
    }

    canExecuteCommand() {
        const now = Date.now();
        if (now - this.state.lastCommandTime < this.state.commandCooldown) {
            console.log('Command cooldown active.');
            return false;
        }
        this.state.lastCommandTime = now;
        return true;
    }

    handleError(message, error) {
        console.error(message, error);
        const errorMessage = error?.message ? `${message}: ${error.message}` : message;
        this.appendMessage('system', `Error: ${errorMessage}`);
        this.voiceController.speakText(`Error occurred: ${message}`);
        this.resetStateAfterError();
    }

    resetStateAfterError() {
        console.log("Resetting state and enabling interface after error.");
        this.state.isProcessing = false;
        this.enableInterface();
    }

    handleClear() {
        if (this.state.isProcessing) {
            this.appendMessage('system', 'Cannot clear while processing.'); return;
        }
        this.elements.conversation.innerHTML = '';
        this.elements.userInput.value = '';
        this.hidePreview();
        this.state.messages = [];
        this.voiceController.stopSpeaking();
        this.voiceController.cleanup();
        this.screenshotController.cleanup();
        this.appendMessage('system', 'Conversation cleared.');
        this.voiceController.speakText('Conversation cleared.');
        this.enableInterface();
    }

    handleRepeat() {
        if (this.state.isProcessing) {
            this.appendMessage('system', 'Cannot repeat while processing.'); return;
        }
        const lastAIMessage = this.state.messages.filter(m => m.role === 'assistant').pop();

        if (lastAIMessage && lastAIMessage.content) {
            this.voiceController.speakText(lastAIMessage.content);
        } else {
            const msg = 'No previous AI response to repeat.';
            this.appendMessage('system', msg);
            this.voiceController.speakText(msg);
        }
    }

    handleOpenOptions() {
        if (chrome.runtime.openOptionsPage) {
            chrome.runtime.openOptionsPage();
        } else {
            console.warn('chrome.runtime.openOptionsPage is not available.');
            this.appendMessage('system', 'Options page function not available.');
        }
    }

    enableInterface() {
        console.log("Enabling interface");
        this.elements.userInput.disabled = false;
        this.handleInputChange();
        this.elements.screenshotButton.disabled = false;
        this.elements.scrollingScreenshotButton.disabled = false;
        this.elements.analyzeContentButton.disabled = false;
        this.elements.repeatButton.disabled = false;
        this.elements.clearButton.disabled = false;
        this.elements.voiceButton.disabled = false;
        this.elements.localModeButton.disabled = false;
        this.elements.cloudModeButton.disabled = false;
    }

    disableInterface() {
        console.log("Disabling interface");
        this.elements.userInput.disabled = true;
        this.elements.sendButton.disabled = true;
        this.elements.screenshotButton.disabled = true;
        this.elements.scrollingScreenshotButton.disabled = true;
        this.elements.analyzeContentButton.disabled = true;
        this.elements.repeatButton.disabled = true;
        this.elements.voiceButton.disabled = true;
        this.elements.localModeButton.disabled = true;
        this.elements.cloudModeButton.disabled = true;
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        const aiScreenReader = new AIScreenReader();
    });
} else {
    const aiScreenReader = new AIScreenReader();
}