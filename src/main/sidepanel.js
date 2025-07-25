import { VoiceController } from '../components/voiceControl.js';
import { ScreenshotController } from '../components/screenShot.js';
import { ApiService } from '../api/apiService.js';
import { UIManager } from '../components/uiManager.js';
import { CommandProcessor } from '../action/commandMap.js';
import { ScreenshotAction } from '../action/screenshotAction.js';
import { ScrollingScreenshotAction } from '../action/scrollingScreenshotAction.js';
import { ContentAnalysisAction } from '../action/contentAnalysisAction.js';
import { GetElementAction } from '../action/getElementAction.js';
import { ActionFlowController } from '../components/actionFlowController.js';
import { StateManager } from '../components/stateManager.js';
import { defaultApiSettings } from '../option/apiRoute.js';

class AIScreenReader {
    constructor() {
        this.stateManager = new StateManager(this.onStateChange.bind(this));

        this.elements = {
            screenshotButton: document.getElementById('screenshot-button'),
            scrollingScreenshotButton: document.getElementById('scrolling-screenshot-button'),
            analyzeContentButton: document.getElementById('analyze-content-button'),
            getElementButton: document.getElementById('get-element-button'),
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
            currentModeIndicator: document.getElementById('current-mode-indicator')
        };

        this.uiManager = new UIManager(this.elements);
        this.apiService = new ApiService();
        this.voiceController = new VoiceController();
        this.screenshotController = new ScreenshotController();

        this.voiceController.setCallbacks({
            appendMessage: this.appendMessage.bind(this),
            updateVoiceInputButtonState: (isActive) => this.uiManager.updateVoiceButtonState(isActive),
            handleSendMessage: this.handleSendMessage.bind(this)
        });
        this.screenshotController.setCallbacks({
            onStart: () => {
                this.voiceController.speakText("Taking scrolling screenshot.");
            }
        });

        const actionDependencies = {
            screenshotController: this.screenshotController,
            uiManager: this.uiManager,
            voiceController: this.voiceController,
            apiService: this.apiService,
            state: this.stateManager.getState(),
            getApiConfig: this.stateManager.getApiConfig.bind(this.stateManager),
            getHistoryToSend: this.stateManager.getHistoryToSend.bind(this.stateManager),
            handleResponse: this.handleResponse.bind(this),
            handleError: this.handleError.bind(this),
            setProcessing: this.setProcessing.bind(this),
            appendMessage: this.appendMessage.bind(this),
            updateLastImageData: this.updateLastImageData.bind(this)
        };

        this.screenshotAction = new ScreenshotAction(actionDependencies);
        this.scrollingScreenshotAction = new ScrollingScreenshotAction(actionDependencies);
        this.contentAnalysisAction = new ContentAnalysisAction(actionDependencies);
        this.getElementAction = new GetElementAction(actionDependencies);

        const commandProcessorActions = {
            _executeScreenshot: this.screenshotAction.execute.bind(this.screenshotAction),
            _executeScrollingScreenshot: this.scrollingScreenshotAction.execute.bind(this.scrollingScreenshotAction),
            _executeContentAnalysis: this.contentAnalysisAction.execute.bind(this.contentAnalysisAction),
            handleError: this.handleError.bind(this)
        };
        this.commandProcessor = new CommandProcessor(commandProcessorActions);

        const flowControllerDependencies = {
            apiService: this.apiService,
            prompts: this.stateManager.getPrompts(),
            state: this.stateManager.getState(),
            getApiConfig: this.stateManager.getApiConfig.bind(this.stateManager),
            getHistoryToSend: this.stateManager.getHistoryToSend.bind(this.stateManager),
            handleResponse: this.handleResponse.bind(this),
            handleError: this.handleError.bind(this),
            setProcessing: this.setProcessing.bind(this),
            appendMessage: this.appendMessage.bind(this),
            voiceController: this.voiceController
        };
        this.actionFlowController = new ActionFlowController(flowControllerDependencies);

        this.setupMessageListener();
        this.initializeAll();
    }

    onStateChange(changes) {
        if (changes.settingsChanged) {
            this.uiManager.updateModeUI(this.stateManager.getState().activeApiMode);
        }
    }

    updateLastImageData(dataUrl, mimeType) {
        this.stateManager.updateLastImageData(dataUrl, mimeType);
        if (this.uiManager && typeof this.uiManager.showPreview === 'function') {
            this.uiManager.showPreview('image', dataUrl);
        } else {
            console.error("UIManager or showPreview method not found!");
        }
    }

    async handleScreenshot() {
        if (!this.stateManager.isSettingsLoaded() || this.stateManager.isProcessing()) return;
        if (this.stateManager.getState().activeApiMode === 'local' && !this.isLocalModeConfigValid()) return;
        if (this.stateManager.getState().activeApiMode === 'cloud' && !this.isCloudModeConfigValid()) return;
        try {
            await this.screenshotAction.execute();
        } catch (error) {
            this.handleError("Screenshot initiation failed", error);
        }
    }

    async handleScrollingScreenshot() {
        if (!this.stateManager.isSettingsLoaded() || this.stateManager.isProcessing()) return;
        if (this.stateManager.getState().activeApiMode === 'local' && !this.isLocalModeConfigValid()) return;
        if (this.stateManager.getState().activeApiMode === 'cloud' && !this.isCloudModeConfigValid()) return;
        try {
            await this.scrollingScreenshotAction.execute();
        } catch (error) {
            this.handleError("Scrolling screenshot initiation failed", error);
        }
    }

    async handleContentAnalysis() {
        if (!this.stateManager.isSettingsLoaded() || this.stateManager.isProcessing()) return;
        if (this.stateManager.getState().activeApiMode === 'local' && !this.isLocalModeConfigValid()) return;
        if (this.stateManager.getState().activeApiMode === 'cloud' && !this.isCloudModeConfigValid()) return;
        try {
            await this.contentAnalysisAction.execute();
        } catch (error) {
            this.handleError("Content analysis initiation failed", error);
        }
    }

    async handleGetElements() {
        if (!this.stateManager.isSettingsLoaded() || this.stateManager.isProcessing()) return;
        if (this.stateManager.getState().activeApiMode === 'local' && !this.isLocalModeConfigValid()) return;
        if (this.stateManager.getState().activeApiMode === 'cloud' && !this.isCloudModeConfigValid()) return;
        try {
            await this.getElementAction.execute();
        } catch (error) {
            this.handleError("Get elements initiation failed", error);
        }
    }

    setupMessageListener() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            const messageHandlers = {
                toggleApiMode: () => this.handleModeChange(this.stateManager.getState().activeApiMode === 'local' ? 'cloud' : 'local'),
                toggleVoiceInput: () => this.voiceController.toggleVoiceInput(),
                toggleRepeat: () => this.handleRepeat(),
                executeScreenshot: () => this.handleScreenshot(),
                executeScrollingScreenshot: () => this.handleScrollingScreenshot(),
                executeAnalyzeContent: () => this.handleContentAnalysis()
            };

            if (messageHandlers[request.type]) {
                if (this.stateManager.isProcessing()) {
                    this.appendMessage('system', 'Processing, please wait...'); sendResponse({ success: false, error: 'Busy processing' }); return true;
                }
                if (!this.stateManager.isSettingsLoaded()) {
                    this.appendMessage('system', 'Initializing, please wait...'); sendResponse({ success: false, error: 'Initializing' }); return true;
                }
                try {
                    messageHandlers[request.type]();
                    sendResponse({ success: true });
                } catch (error) {
                    this.handleError(`Failed to execute ${request.type}`, error); sendResponse({ success: false, error: error.message });
                }
                return true;
            }
            console.warn('Unknown message type received:', request.type);
            sendResponse({ success: false, error: 'Unknown message type' });
            return false;
        });
    }

    async initializeAll() {
        try {
            await this.stateManager.initialize();
            this.uiManager.updateModeUI(this.stateManager.getState().activeApiMode);
            this.setupEventListeners();
            await this.voiceController.initializeAll();
            this.voiceController.speakText('Ready');
            this.uiManager.updateInputState(this.elements.userInput.value);
        } catch (error) {
            this.handleError('Initialization failed', error);
            const currentState = this.stateManager.getState();
            this.uiManager.updateModeUI(currentState.activeApiMode ?? defaultApiSettings.activeApiMode);
        }
    }

    setupEventListeners() {
        const eventHandlers = {
            'screenshotButton': this.handleScreenshot,
            'scrollingScreenshotButton': this.handleScrollingScreenshot,
            'analyzeContentButton': this.handleContentAnalysis,
            'getElementButton': this.handleGetElements,
            'openOptionsButton': this.handleOpenOptions,
            'sendButton': this.handleSendMessage,
            'voiceButton': this.voiceController.toggleVoiceInput.bind(this.voiceController),
            'repeatButton': this.handleRepeat,
            'clearButton': this.handleClear,
            'localModeButton': () => this.handleModeChange('local'),
            'cloudModeButton': () => this.handleModeChange('cloud'),
        };
        Object.entries(eventHandlers).forEach(([elementId, handler]) => {
            const element = this.elements[elementId];
            if (element) {
                element.addEventListener('click', async (event) => {
                    if (this.stateManager.isProcessing() && elementId !== 'clearButton') {
                        this.appendMessage('system', 'Processing, please wait...');
                        return;
                    }
                    if (!this.stateManager.isSettingsLoaded() && elementId !== 'openOptionsButton') {
                        this.appendMessage('system', 'Initializing, please wait...');
                        return;
                    }
                    try {
                        await handler.call(this, event);
                    } catch (error) {
                        console.error(`Error in event listener for ${elementId}:`, error);
                        this.handleError(`Action failed: ${elementId}`, error);
                    }
                });
            }
            else { console.warn(`Element with ID '${elementId}' not found for event listener.`); }
        });
        if (this.elements.userInput) {
            this.elements.userInput.addEventListener('input', () => this.uiManager.updateInputState(this.elements.userInput.value));
            this.elements.userInput.addEventListener('keypress', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.voiceController.stopSpeaking(); this.handleSendMessage(); } });
        } else { console.error("User input element not found!"); }

        window.addEventListener('focus', () => {
            if (this.elements.userInput && !this.stateManager.isProcessing()) {
                this.elements.userInput.focus();
            }
        });
    }

    async handleModeChange(newMode) {
        if (!this.stateManager.isSettingsLoaded() || this.stateManager.isProcessing() || newMode === this.stateManager.getState().activeApiMode) return;
        if (newMode === 'local' && !this.isLocalModeConfigValid()) return;
        if (newMode === 'cloud' && !this.isCloudModeConfigValid()) return;
        await this.stateManager.setActiveApiMode(newMode);
        this.uiManager.updateModeUI(newMode);
        const modeName = newMode === 'local' ? 'Local' : 'Cloud';
        this.appendMessage('system', `Switched to ${modeName} Mode.`);
        this.voiceController.speakText(`Switched to ${modeName} Mode.`);
    }

    isLocalModeConfigValid() {
        const state = this.stateManager.getState();
        let isValid = true;
        if (!state.localApiUrl) {
            const msg = 'Local API URL is missing. Please configure in Options page.';
            this.appendMessage('system', msg);
            this.voiceController.speakText('Local API settings missing.');
            isValid = false;
        }
        if (!state.ollamaMultimodalModel) {
            const msg = 'Local Model Name is missing. Please configure in Options page.';
            if (isValid) this.appendMessage('system', msg);
            if (isValid) this.voiceController.speakText('Local API settings missing.');
            isValid = false;
        }
        return isValid;
    }

    isCloudModeConfigValid() {
        const state = this.stateManager.getState();
        const method = state.cloudApiMethod;
        const isDirect = method === 'direct';
        const isProxy = method === 'proxy';
        let isValid = true;
        let speakMsg = null;

        if (!state.cloudApiKey) {
            const msg = 'Cloud API Key is missing. Please configure in Options page.';
            this.appendMessage('system', msg);
            speakMsg = 'Cloud settings missing: API Key.';
            isValid = false;
        }
        if (!state.cloudModelName) {
            const msg = 'Cloud Model Name is missing. Please configure in Options page.';
            if (isValid) this.appendMessage('system', msg);
            if (isValid) speakMsg = 'Cloud settings missing: Model Name.';
            isValid = false;
        }
        if (isDirect && !state.cloudApiUrl) {
            const msg = 'Cloud API Base URL is missing for Direct Connection. Please configure in Options page.';
            if (isValid) this.appendMessage('system', msg);
            if (isValid) speakMsg = 'Cloud settings missing: Base URL for Direct mode.';
            isValid = false;
        }
        if (isProxy && !state.cloudProxyUrl) {
            const msg = 'Cloud Function URL is missing for Proxy Connection. Please configure in Options page.';
            if (isValid) this.appendMessage('system', msg);
            if (isValid) speakMsg = 'Cloud settings missing: Function URL for Proxy mode.';
            isValid = false;
        }

        if (!isValid && speakMsg) {
            this.voiceController.speakText(speakMsg);
        }
        return isValid;
    }

    getApiConfig() {
        return this.stateManager.getApiConfig();
    }

    getHistoryToSend(commandToExclude = null) {
        return this.stateManager.getHistoryToSend(commandToExclude);
    }

    async handleSendMessage() {
        const userInput = this.elements.userInput.value.trim();
        if (userInput.toLowerCase() === 'clear') {
            this.handleClear();
            return;
        }
        if (!userInput) { return; }
        if (!this.stateManager.isSettingsLoaded()) { this.appendMessage('system', 'Initializing, please wait...'); return; }
        if (this.stateManager.isProcessing()) { this.appendMessage('system', 'Processing, please wait...'); return; }
        const state = this.stateManager.getState();
        if (state.activeApiMode === 'local' && !this.isLocalModeConfigValid()) return;
        if (state.activeApiMode === 'cloud' && !this.isCloudModeConfigValid()) return;

        this.setProcessing(true);
        this.voiceController.playSendSound();
        this.appendMessage('user', userInput);
        this.uiManager.clearUserInput();
        this.uiManager.showThinkingIndicator();

        let imageDataToSend = null;
        let mimeTypeToSend = null;
        let systemPrompt = this.stateManager.getPrompts().system_prompt;

        const isPreviewVisible = this.elements.previewContainer && this.elements.previewContainer.style.display !== 'none';
        const previewHasImage = this.elements.previewImage && this.elements.previewImage.src && this.elements.previewImage.src !== location.href;
        const lastImageData = state.lastImageData;

        if (isPreviewVisible && previewHasImage && lastImageData.dataUrl) {
            imageDataToSend = lastImageData.dataUrl;
            mimeTypeToSend = lastImageData.mimeType;
        } else {
            this.uiManager.hidePreview();
        }

        try {
            const payload = { prompt: userInput };
            const apiConfig = this.getApiConfig();
            const historyToSend = this.getHistoryToSend();

            const responseContent = await this.apiService.sendRequest(
                apiConfig,
                historyToSend,
                payload,
                imageDataToSend,
                systemPrompt
            );
            await this.handleResponse(responseContent);

        } catch (error) {
            this.handleError('Message sending failed', error);
            if (this.stateManager.isProcessing()) {
                this.setProcessing(false);
            }
        }
    }

    appendMessage(role, content, isSilent = false) {
        if (!content || (typeof content === 'string' && !content.trim())) {
            return;
        }

        if (!isSilent) {
            const formattedContent = this.uiManager.escapeHTML(String(content));
            this.uiManager.appendMessage(role, formattedContent);
        }

        if (role !== 'system') {
            this.stateManager.addMessage({ role, content: String(content) });
        }
    }

    async _speakResponse(text) {
        if (!text || typeof text !== 'string' || !text.trim()) {
            return;
        }
        const sentences = text
            .split(/[。？！!?]/)
            .map(s => s.trim())
            .filter(s => s.length > 0);

        try {
            if (sentences.length > 20) {
                for (const sentence of sentences) {
                    this.voiceController.speakText(sentence);
                }
            } else {
                this.voiceController.speakText(text);
            }
        } catch (error) {
            console.error("Error during speech synthesis:", error);
            this.appendMessage('system', `Error speaking: ${error.message}`);
        }
    }

    async handleResponse(responseContent) {
        this.uiManager.hideThinkingIndicator();
        const responseText = (typeof responseContent === 'string') ? responseContent : JSON.stringify(responseContent);
        let commandResult = null;
        try {
            commandResult = this.commandProcessor.processResponse(responseText);
        } catch (processorError) {
            this.handleError('Failed to process command from response', processorError);
            this.setProcessing(false);
            return;
        }

        if (commandResult) {
            if (commandResult.command === 'executeActions') {
                await this.actionFlowController.handleExecuteActionsRequest(commandResult.actions);
            } else if (commandResult.command === 'getElement') {
                await this.actionFlowController.handleGetElementRequest();
            } else if (commandResult === true) {
                this.appendMessage('assistant', '[{"action": "Done"}]', true);
                this.setProcessing(false);
            }
        } else {
            this.appendMessage('assistant', responseText, false);
            await this._speakResponse(responseText);
            this.setProcessing(false);
        }
    }

    handleError(message, error) {
        this.uiManager.hideThinkingIndicator();
        console.error(message, error);
        const userFriendlyMessage = message || "An unexpected error occurred";
        let detail = '';
        if (error instanceof Error) { detail = error.message; }
        else if (typeof error === 'string') { detail = error; }
        else { try { detail = JSON.stringify(error); } catch (e) { detail = 'No specific details available.'; } }
        detail = detail.replace(/API Error \(\d+.*?\):\s*/, '');
        detail = detail.replace(/^Error:\s*/, '');
        const errorMessage = detail ? `${userFriendlyMessage}: ${detail}` : userFriendlyMessage;
        this.appendMessage('system', `Error: ${errorMessage}`);
        this.voiceController.speakText(`Error occurred. ${userFriendlyMessage}.`);
        this.resetStateAfterError();
    }

    resetStateAfterError() {
        this.setProcessing(false);
    }

    handleClear() {
        if (this.stateManager.isProcessing()) { this.appendMessage('system', 'Processing, please wait...'); return; }
        this.voiceController.stopSpeaking();
        this.uiManager.hideThinkingIndicator();
        this.uiManager.clearConversation();
        this.uiManager.clearUserInput();
        this.uiManager.hidePreview();
        this.stateManager.clearMessages();
        this.stateManager.clearLastImageData();
        this.voiceController.speakText('Conversation cleared.');
        this.setProcessing(false);
        if (this.elements.userInput) {
            this.elements.userInput.focus();
        }
    }

    async handleRepeat() {
        this.voiceController.stopSpeaking();

        if (!this.stateManager.isSettingsLoaded()) {
            this.appendMessage('system', 'Initializing, please wait...');
            return;
        }
        if (this.stateManager.isProcessing()) {
            this.appendMessage('system', 'Currently processing, cannot repeat now.');
            return;
        }

        const lastAIMessage = [...this.stateManager.getState().messages].reverse().find(m => m.role === 'assistant');

        if (lastAIMessage && lastAIMessage.content) {
            const fullContent = String(lastAIMessage.content);

            const sentences = fullContent
                .split(/[。？！!?]/)
                .map(s => s.trim())
                .filter(s => s.length > 0);

            let shouldSetProcessing = sentences.length > 20;

            if (shouldSetProcessing) {
                this.setProcessing(true);
            }

            try {
                await this._speakResponse(fullContent);
            } catch (error) {
                console.error("Error during repeat speaking:", error);
                this.appendMessage('system', `Error repeating message: ${error.message}`);
            } finally {
                if (shouldSetProcessing) {
                    this.setProcessing(false);
                }
            }

        } else {
            const msg = 'No previous response to repeat.';
            this.appendMessage('system', msg);
            this.voiceController.speakText(msg);
        }
    }

    handleOpenOptions() {
        if (chrome.runtime.openOptionsPage) {
            chrome.runtime.openOptionsPage();
        } else {
            const optionsUrl = chrome.runtime.getURL('option/options.html');
            try {
                if (chrome.tabs?.create) {
                    chrome.tabs.create({ url: optionsUrl, active: true })
                        .then(() => console.log("Options page tab opened via fallback."))
                        .catch(error => this.handleError("Failed to open options page", error));
                } else { throw new Error("chrome.tabs.create API not available."); }
            } catch (error) { this.handleError("Failed to open options page", error); }
        }
    }

    setProcessing(isProcessing) {
        if (this.stateManager.isProcessing() === isProcessing) return;
        this.stateManager.setProcessing(isProcessing);
        this.uiManager.setProcessingState(isProcessing);

        if (!isProcessing && this.elements.userInput) {
            this.elements.userInput.focus();
        }
    }
}

function initializeApp() {
    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', () => { if (!window.aiScreenReader) { window.aiScreenReader = new AIScreenReader(); } }); }
    else { if (!window.aiScreenReader) { window.aiScreenReader = new AIScreenReader(); } }
}

initializeApp();