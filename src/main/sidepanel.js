import { VoiceController } from '../components/voiceControl.js';
import { ScreenshotController } from '../components/screenShot.js';
import { ApiService } from '../components/apiService.js';
import { UIManager } from '../components/uiManager.js';
import { CommandProcessor } from '../action/commandMap.js';
import { ScreenshotAction } from '../action/screenshotAction.js';
import { ScrollingScreenshotAction } from '../action/scrollingScreenshotAction.js';
import { ContentAnalysisAction } from '../action/contentAnalysisAction.js';
import { defaultPrompts, promptsStorageKey } from '../option/prompts.js';
import { settingsStorageKey, defaultApiSettings } from '../option/apiRoute.js';
import { ActionFlowController } from '../components/actionFlowController.js';

class AIScreenReader {
    constructor() {
        this.prompts = { ...defaultPrompts };
        this.promptsStorageKey = promptsStorageKey;
        this.settingsStorageKey = settingsStorageKey;

        this.state = {
            activeApiMode: defaultApiSettings.activeApiMode,
            localApiUrl: defaultApiSettings.localApiUrl,
            ollamaMultimodalModel: defaultApiSettings.ollamaMultimodalModel,
            cloudApiUrl: defaultApiSettings.cloudApiUrl,
            cloudApiKey: defaultApiSettings.cloudApiKey,
            cloudModelName: defaultApiSettings.cloudModelName,
            cloudApiMethod: defaultApiSettings.cloudApiMethod,
            cloudProxyUrl: defaultApiSettings.cloudProxyUrl,
            isProcessing: false,
            messages: [],
            lastCommandTime: 0,
            commandCooldown: 1000,
            settingsLoaded: false,
            lastImageData: { dataUrl: null, mimeType: null }
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
                const message = "Taking scrolling screenshot...";
                this.voiceController.speakText(message);
                this.appendMessage('system', message);
            }
        });

        const actionDependencies = {
            screenshotController: this.screenshotController,
            uiManager: this.uiManager,
            voiceController: this.voiceController,
            apiService: this.apiService,
            state: this.state,
            getApiConfig: this.getApiConfig.bind(this),
            getHistoryToSend: this.getHistoryToSend.bind(this),
            handleResponse: this.handleResponse.bind(this),
            handleError: this.handleError.bind(this),
            setProcessing: this.setProcessing.bind(this),
            appendMessage: this.appendMessage.bind(this),
            updateLastImageData: this.updateLastImageData.bind(this)
        };

        this.screenshotAction = new ScreenshotAction(actionDependencies);
        this.scrollingScreenshotAction = new ScrollingScreenshotAction(actionDependencies);
        this.contentAnalysisAction = new ContentAnalysisAction(actionDependencies);

        const commandProcessorActions = {
            _executeScreenshot: this.screenshotAction.execute.bind(this.screenshotAction),
            _executeScrollingScreenshot: this.scrollingScreenshotAction.execute.bind(this.scrollingScreenshotAction),
            _executeContentAnalysis: this.contentAnalysisAction.execute.bind(this.contentAnalysisAction),
            handleError: this.handleError.bind(this)
        };
        this.commandProcessor = new CommandProcessor(commandProcessorActions);

        const flowControllerDependencies = {
            apiService: this.apiService,
            prompts: this.prompts,
            state: this.state,
            getApiConfig: this.getApiConfig.bind(this),
            getHistoryToSend: this.getHistoryToSend.bind(this),
            handleResponse: this.handleResponse.bind(this),
            handleError: this.handleError.bind(this),
            setProcessing: this.setProcessing.bind(this),
            appendMessage: this.appendMessage.bind(this),
            voiceController: this.voiceController
        };
        this.actionFlowController = new ActionFlowController(flowControllerDependencies);

        this.setupMessageListener();
        this.initializeAll();
        this.setupStorageListener();
    }

    updateLastImageData(dataUrl, mimeType) {
        this.state.lastImageData = { dataUrl, mimeType };
        if (this.uiManager && typeof this.uiManager.showPreview === 'function') {
            this.uiManager.showPreview('image', dataUrl);
        } else {
            console.error("UIManager or showPreview method not found!");
        }
    }

    async handleScreenshot() {
        if (!this.state.settingsLoaded || this.state.isProcessing) return;
        if (this.state.activeApiMode === 'local' && !this.isLocalModeConfigValid()) return;
        if (this.state.activeApiMode === 'cloud' && !this.isCloudModeConfigValid()) return;
        try {
            await this.screenshotAction.execute();
        } catch (error) {
            this.handleError("Screenshot initiation failed", error);
        }
    }

    async handleScrollingScreenshot() {
        if (!this.state.settingsLoaded || this.state.isProcessing) return;
        if (this.state.activeApiMode === 'local' && !this.isLocalModeConfigValid()) return;
        if (this.state.activeApiMode === 'cloud' && !this.isCloudModeConfigValid()) return;
        try {
            await this.scrollingScreenshotAction.execute();
        } catch (error) {
            this.handleError("Scrolling screenshot initiation failed", error);
        }
    }

    async handleContentAnalysis() {
        if (!this.state.settingsLoaded || this.state.isProcessing) return;
        if (this.state.activeApiMode === 'local' && !this.isLocalModeConfigValid()) return;
        if (this.state.activeApiMode === 'cloud' && !this.isCloudModeConfigValid()) return;
        try {
            await this.contentAnalysisAction.execute();
        } catch (error) {
            this.handleError("Content analysis initiation failed", error);
        }
    }

    setupMessageListener() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            const messageHandlers = {
                toggleApiMode: () => this.handleModeChange(this.state.activeApiMode === 'local' ? 'cloud' : 'local'),
                toggleVoiceInput: () => this.voiceController.toggleVoiceInput(),
                toggleRepeat: () => this.handleRepeat(),
                executeScreenshot: () => this.handleScreenshot(),
                executeScrollingScreenshot: () => this.handleScrollingScreenshot(),
                executeAnalyzeContent: () => this.handleContentAnalysis()
            };

            if (messageHandlers[request.type]) {
                if (this.state.isProcessing) {
                    this.appendMessage('system', 'Processing, please wait...'); sendResponse({ success: false, error: 'Busy processing' }); return true;
                }
                if (!this.state.settingsLoaded) {
                    this.appendMessage('system', 'Initializing, please wait...'); sendResponse({ success: false, error: 'Initializing' }); return true;
                }
                try {
                    messageHandlers[request.type](); sendResponse({ success: true });
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

    setupStorageListener() {
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== 'local') return;
            let settingsChanged = false;
            let promptsChanged = false;
            const activeModeBeforeChange = this.state.activeApiMode;

            if (changes[this.settingsStorageKey]) {
                const newSettings = changes[this.settingsStorageKey].newValue || {};
                this.state.activeApiMode = newSettings.activeApiMode ?? defaultApiSettings.activeApiMode;
                this.state.localApiUrl = newSettings.localApiUrl || defaultApiSettings.localApiUrl;
                this.state.ollamaMultimodalModel = newSettings.ollamaMultimodalModel || defaultApiSettings.ollamaMultimodalModel;
                this.state.cloudApiUrl = newSettings.cloudApiUrl || defaultApiSettings.cloudApiUrl;
                this.state.cloudApiKey = newSettings.cloudApiKey ?? defaultApiSettings.cloudApiKey;
                this.state.cloudModelName = newSettings.cloudModelName || defaultApiSettings.cloudModelName;
                this.state.cloudApiMethod = newSettings.cloudApiMethod || defaultApiSettings.cloudApiMethod;
                this.state.cloudProxyUrl = newSettings.cloudProxyUrl || defaultApiSettings.cloudProxyUrl;
                settingsChanged = true;
            }
            if (changes[this.promptsStorageKey]) {
                const newPromptsData = changes[this.promptsStorageKey].newValue || {};
                this.prompts = { ...defaultPrompts, ...newPromptsData };
                promptsChanged = true;
            }
            if (settingsChanged) {
                this.uiManager.updateModeUI(this.state.activeApiMode);
            }
        });
    }

    async initializeAll() {
        try {
            await this.loadSettingsAndPrompts();
            this.uiManager.updateModeUI(this.state.activeApiMode);
            this.setupEventListeners();
            this.voiceController.initializeAll();
            this.appendMessage('system', 'A-Eye Assistant Ready.');
            this.voiceController.speakText('A-Eye Assistant Ready.');
            this.uiManager.updateInputState(this.elements.userInput.value);
            this.state.settingsLoaded = true;
        } catch (error) {
            this.handleError('Initialization failed', error);
            this.uiManager.updateModeUI(this.state.activeApiMode);
            this.state.activeApiMode = this.state.activeApiMode ?? defaultApiSettings.activeApiMode;
            this.state.localApiUrl = this.state.localApiUrl ?? defaultApiSettings.localApiUrl;
            this.state.ollamaMultimodalModel = this.state.ollamaMultimodalModel ?? defaultApiSettings.ollamaMultimodalModel;
            this.state.cloudApiUrl = this.state.cloudApiUrl ?? defaultApiSettings.cloudApiUrl;
            this.state.cloudApiKey = this.state.cloudApiKey ?? defaultApiSettings.cloudApiKey;
            this.state.cloudModelName = this.state.cloudModelName ?? defaultApiSettings.cloudModelName;
            this.state.cloudApiMethod = defaultApiSettings.cloudApiMethod;
            this.state.cloudProxyUrl = defaultApiSettings.cloudProxyUrl;
            this.prompts = this.prompts ?? { ...defaultPrompts };
            this.state.settingsLoaded = false;
        }
    }

    async loadSettingsAndPrompts() {
        try {
            const result = await chrome.storage.local.get([this.settingsStorageKey, this.promptsStorageKey]);
            const savedSettings = result[this.settingsStorageKey] || {};
            const savedPrompts = result[this.promptsStorageKey] || {};
            this.state.activeApiMode = savedSettings.activeApiMode ?? defaultApiSettings.activeApiMode;
            this.state.localApiUrl = savedSettings.localApiUrl || defaultApiSettings.localApiUrl;
            this.state.ollamaMultimodalModel = savedSettings.ollamaMultimodalModel || defaultApiSettings.ollamaMultimodalModel;
            this.state.cloudApiUrl = savedSettings.cloudApiUrl || defaultApiSettings.cloudApiUrl;
            this.state.cloudApiKey = savedSettings.cloudApiKey ?? defaultApiSettings.cloudApiKey;
            this.state.cloudModelName = savedSettings.cloudModelName || defaultApiSettings.cloudModelName;
            this.state.cloudApiMethod = savedSettings.cloudApiMethod || defaultApiSettings.cloudApiMethod;
            this.state.cloudProxyUrl = savedSettings.cloudProxyUrl || defaultApiSettings.cloudProxyUrl;
            this.prompts = { ...defaultPrompts, ...savedPrompts };
        } catch (error) {
            this.handleError('Error loading settings/prompts. Using default values.');
            this.state.activeApiMode = defaultApiSettings.activeApiMode;
            this.state.localApiUrl = defaultApiSettings.localApiUrl;
            this.state.ollamaMultimodalModel = defaultApiSettings.ollamaMultimodalModel;
            this.state.cloudApiUrl = defaultApiSettings.cloudApiUrl;
            this.state.cloudApiKey = defaultApiSettings.cloudApiKey;
            this.state.cloudModelName = defaultApiSettings.cloudModelName;
            this.state.cloudApiMethod = defaultApiSettings.cloudApiMethod;
            this.state.cloudProxyUrl = defaultApiSettings.cloudProxyUrl;
            this.prompts = { ...defaultPrompts };
            throw error;
        }
    }

    setupEventListeners() {
        const eventHandlers = {
            'screenshotButton': this.handleScreenshot,
            'scrollingScreenshotButton': this.handleScrollingScreenshot,
            'analyzeContentButton': this.handleContentAnalysis,
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
                element.addEventListener('click', handler.bind(this));
            }
            else { console.warn(`Element with ID '${elementId}' not found for event listener.`); }
        });
        if (this.elements.userInput) {
            this.elements.userInput.addEventListener('input', () => this.uiManager.updateInputState(this.elements.userInput.value));
            this.elements.userInput.addEventListener('keypress', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.voiceController.stopSpeaking(); this.handleSendMessage(); } });
        } else { console.error("User input element not found!"); }
    }

    handleModeChange(newMode) {
        if (!this.state.settingsLoaded || this.state.isProcessing || newMode === this.state.activeApiMode) return;
        if (newMode === 'local' && !this.isLocalModeConfigValid()) return;
        if (newMode === 'cloud' && !this.isCloudModeConfigValid()) return;
        this.state.activeApiMode = newMode;
        this.uiManager.updateModeUI(this.state.activeApiMode);
        this.saveActiveModePreference(newMode);
        const modeName = newMode === 'local' ? 'Local' : 'Cloud';
        this.appendMessage('system', `Switched to ${modeName} Mode.`);
        this.voiceController.speakText(`Switched to ${modeName} Mode.`);
    }

    async saveActiveModePreference(mode) {
        if (!this.state.settingsLoaded) return;
        try {
            const result = await chrome.storage.local.get(this.settingsStorageKey);
            const currentSettings = result[this.settingsStorageKey] || { ...defaultApiSettings };
            currentSettings.activeApiMode = mode;
            await chrome.storage.local.set({ [this.settingsStorageKey]: currentSettings });
        } catch (error) { console.error('Error saving active mode preference:', error); }
    }

    isLocalModeConfigValid() {
        if (!this.state.localApiUrl || !this.state.ollamaMultimodalModel) {
            this.appendMessage('system', 'Local API URL or Model Name is missing. Please configure in Options page.');
            this.voiceController.speakText('Local API settings missing.');
            return false;
        }
        return true;
    }

    isCloudModeConfigValid() {
        const method = this.state.cloudApiMethod;
        const isDirect = method === 'direct';
        const isProxy = method === 'proxy';

        if (!this.state.cloudApiKey) {
            this.appendMessage('system', 'Cloud API Key is missing. Please configure in Options page.');
            this.voiceController.speakText('Cloud settings missing: API Key.');
            return false;
        }
        if (!this.state.cloudModelName) {
            this.appendMessage('system', 'Cloud Model Name is missing. Please configure in Options page.');
            this.voiceController.speakText('Cloud settings missing: Model Name.');
            return false;
        }

        if (isDirect && !this.state.cloudApiUrl) {
            this.appendMessage('system', 'Cloud API Base URL is missing for Direct Connection. Please configure in Options page.');
            this.voiceController.speakText('Cloud settings missing: Base URL for Direct mode.');
            return false;
        }
        if (isProxy && !this.state.cloudProxyUrl) {
            this.appendMessage('system', 'Cloud Function URL is missing for Proxy Connection. Please configure in Options page.');
            this.voiceController.speakText('Cloud settings missing: Function URL for Proxy mode.');
            return false;
        }

        return true;
    }

    getApiConfig() {
        return {
            localApiUrl: this.state.localApiUrl,
            ollamaMultimodalModel: this.state.ollamaMultimodalModel,
            cloudApiUrl: this.state.cloudApiUrl,
            cloudApiKey: this.state.cloudApiKey,
            cloudModelName: this.state.cloudModelName,
            cloudApiMethod: this.state.cloudApiMethod,
            cloudProxyUrl: this.state.cloudProxyUrl,
            activeApiMode: this.state.activeApiMode
        };
    }

    getHistoryToSend(commandToExclude = null) {
        const baseHistory = this.state.messages.filter(m =>
            (m.role === 'user' || m.role === 'assistant') &&
            (!commandToExclude || m.content !== commandToExclude) &&
            (!m.content?.startsWith || !m.content.startsWith('openUrl:')) &&
            !['takeScreenshot', 'scrollingScreenshot', 'analyzeContent', 'getElement'].includes(m.content?.trim())
        );
        const MAX_HISTORY_FOR_API = 10;
        return baseHistory.slice(-MAX_HISTORY_FOR_API);
    }

    async handleSendMessage() {
        const userInput = this.elements.userInput.value.trim();
        if (!userInput) { return; }
        if (!this.state.settingsLoaded) { this.appendMessage('system', 'Initializing, please wait...'); return; }
        if (this.state.isProcessing) { this.appendMessage('system', 'Processing, please wait...'); return; }
        if (this.state.activeApiMode === 'local' && !this.isLocalModeConfigValid()) return;
        if (this.state.activeApiMode === 'cloud' && !this.isCloudModeConfigValid()) return;

        this.setProcessing(true);
        this.appendMessage('user', userInput);
        this.uiManager.clearUserInput();

        let imageDataToSend = null;
        let mimeTypeToSend = null;
        let systemPrompt = this.prompts.system_prompt;

        const isPreviewVisible = this.elements.previewContainer && this.elements.previewContainer.style.display !== 'none';
        const previewHasImage = this.elements.previewImage && this.elements.previewImage.src && this.elements.previewImage.src !== location.href;

        if (isPreviewVisible && previewHasImage && this.state.lastImageData.dataUrl) {
            imageDataToSend = this.state.lastImageData.dataUrl;
            mimeTypeToSend = this.state.lastImageData.mimeType;
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
            this.setProcessing(false);
        } finally {
            if (this.elements.userInput) {
                this.elements.userInput.focus();
            }
        }
    }

    appendMessage(role, content) {
        if (!content || !content.trim()) {
            return;
        }
        const formattedContent = this.uiManager.escapeHTML(content);
        this.uiManager.appendMessage(role, formattedContent);
        const knownCommands = ['takeScreenshot', 'scrollingScreenshot', 'analyzeContent', 'getElement'];
        const isCommand = content.startsWith('openUrl:') || knownCommands.includes(content.trim()) || (content.startsWith('[') && content.endsWith(']'));
        if (role !== 'system' && !isCommand) {
            const lastMessage = this.state.messages.length > 0 ? this.state.messages[this.state.messages.length - 1] : null;
            if (!lastMessage || lastMessage.role !== role || lastMessage.content !== content) {
                this.state.messages.push({ role, content });
            }
        }
        const MAX_HISTORY = 20;
        if (this.state.messages.length > MAX_HISTORY) {
            this.state.messages = this.state.messages.slice(this.state.messages.length - MAX_HISTORY);
        }
    }

    async handleResponse(responseContent) {
        const responseText = (typeof responseContent === 'string') ? responseContent : JSON.stringify(responseContent);
        const commandResult = this.commandProcessor.processResponse(responseText);
        if (commandResult === true) {
            this.setProcessing(false);
        } else if (commandResult && commandResult.command === 'getElement') {
            await this.actionFlowController.handleGetElementRequest();
        } else if (commandResult && commandResult.command === 'executeActions') {
            await this.actionFlowController.handleExecuteActionsRequest(commandResult.actions);
        } else {
            const displayContent = (typeof responseContent === 'string') ? responseContent : 'Received non-text response.';
            this.appendMessage('assistant', displayContent);
            this.voiceController.speakText(displayContent);
            this.setProcessing(false);
        }
    }

    handleError(message, error) {
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
        if (this.state.isProcessing) { this.appendMessage('system', 'Processing, please wait...'); return; }
        this.voiceController.stopSpeaking();
        this.uiManager.clearConversation();
        this.uiManager.clearUserInput();
        this.uiManager.hidePreview();
        this.state.messages = [];
        this.state.lastImageData = { dataUrl: null, mimeType: null };
        this.appendMessage('system', 'Conversation cleared.');
        this.voiceController.speakText('Conversation cleared.');
        this.setProcessing(false);
    }

    handleRepeat() {
        this.voiceController.stopSpeaking();
        if (!this.state.settingsLoaded) { this.appendMessage('system', 'Initializing, please wait...'); return; }
        const lastAIMessage = [...this.state.messages].reverse().find(m => m.role === 'assistant');
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
        if (this.state.isProcessing === isProcessing) return;
        this.state.isProcessing = isProcessing;
        this.uiManager.setProcessingState(isProcessing);
    }
}

function initializeApp() {
    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', () => { if (!window.aiScreenReader) { window.aiScreenReader = new AIScreenReader(); } }); }
    else { if (!window.aiScreenReader) { window.aiScreenReader = new AIScreenReader(); } }
}
initializeApp();