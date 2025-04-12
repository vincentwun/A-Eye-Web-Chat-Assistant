import { VoiceController } from './components/voiceControl.js';
import { ScreenshotController } from './components/screenShot.js';
import { ApiService } from './components/apiService.js';
import { UIManager } from './components/uiManager.js';
import { CommandProcessor } from './BrowserControl/commandMap.js';
import { ScreenshotAction } from './BrowserControl/screenshotAction.js';
import { ScrollingScreenshotAction } from './BrowserControl/scrollingScreenshotAction.js';
import { ContentAnalysisAction } from './BrowserControl/contentAnalysisAction.js';
import { UrlAction } from './BrowserControl/urlAction.js';

import { defaultPrompts, promptsStorageKey } from './option/prompts.js';
import { settingsStorageKey, defaultApiSettings } from './option/apiRoute.js';

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
            isProcessing: false,
            messages: [],
            lastCommandTime: 0,
            commandCooldown: 1000,
            settingsLoaded: false
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
            prompts: this.prompts,
            state: this.state,
            getApiConfig: this.getApiConfig.bind(this),
            getHistoryToSend: this.getHistoryToSend.bind(this),
            handleResponse: this.handleResponse.bind(this),
            handleError: this.handleError.bind(this),
            setProcessing: this.setProcessing.bind(this),
            appendMessage: this.appendMessage.bind(this)
        };

        this.screenshotAction = new ScreenshotAction(actionDependencies);
        this.scrollingScreenshotAction = new ScrollingScreenshotAction(actionDependencies);
        this.contentAnalysisAction = new ContentAnalysisAction(actionDependencies);
        this.urlAction = new UrlAction(actionDependencies);

        const commandActions = {
            _executeScreenshot: this.screenshotAction.execute.bind(this.screenshotAction),
            _executeScrollingScreenshot: this.scrollingScreenshotAction.execute.bind(this.scrollingScreenshotAction),
            _executeContentAnalysis: this.contentAnalysisAction.execute.bind(this.contentAnalysisAction),
            _executeOpenUrl: this.urlAction.execute.bind(this.urlAction),
            handleError: this.handleError.bind(this)
        };
        this.commandProcessor = new CommandProcessor(commandActions);

        this.setupMessageListener();
        this.initializeAll();
        this.setupStorageListener();
    }

    async handleScreenshot() {
        console.log("handleScreenshot called (public)");
        if (!this.state.settingsLoaded) { /*...*/ this.appendMessage('system', 'Initializing, please wait...'); return; }
        if (this.state.isProcessing) { /*...*/ this.appendMessage('system', 'Processing, please wait...'); return; }
        if (this.state.activeApiMode === 'local' && !this.isLocalModeConfigValid()) return;
        if (this.state.activeApiMode === 'cloud' && !this.isCloudModeConfigValid()) return;
        try {
            await this.screenshotAction.execute();
        } catch (error) {
            this.handleError("Screenshot initiation failed", error);
        }
    }

    async handleScrollingScreenshot() {
        console.log("handleScrollingScreenshot called (public)");
        if (!this.state.settingsLoaded) { /*...*/ this.appendMessage('system', 'Initializing, please wait...'); return; }
        if (this.state.isProcessing) { /*...*/ this.appendMessage('system', 'Processing, please wait...'); return; }
        if (this.state.activeApiMode === 'local' && !this.isLocalModeConfigValid()) return;
        if (this.state.activeApiMode === 'cloud' && !this.isCloudModeConfigValid()) return;
        try {
            await this.scrollingScreenshotAction.execute();
        } catch (error) {
            this.handleError("Scrolling screenshot initiation failed", error);
        }
    }

    async handleContentAnalysis() {
        console.log("handleContentAnalysis called (public)");
        if (!this.state.settingsLoaded) { /*...*/ this.appendMessage('system', 'Initializing, please wait...'); return; }
        if (this.state.isProcessing) { /*...*/ this.appendMessage('system', 'Processing, please wait...'); return; }
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
            console.log('Message received in sidepanel:', request);
            const messageHandlers = {
                toggleApiMode: () => {
                    const nextMode = this.state.activeApiMode === 'local' ? 'cloud' : 'local';
                    this.handleModeChange(nextMode);
                },
                toggleVoiceInput: () => this.voiceController.toggleVoiceInput(),
                toggleRepeat: () => this.handleRepeat(),
                executeScreenshot: () => this.handleScreenshot(),
                executeScrollingScreenshot: () => this.handleScrollingScreenshot(),
                executeAnalyzeContent: () => this.handleContentAnalysis()
            };

            if (messageHandlers[request.type]) {
                if (this.state.isProcessing) {
                    console.log(`Sidepanel busy, cannot execute command: ${request.type}`);
                    this.appendMessage('system', 'Processing, please wait...');
                    sendResponse({ success: false, error: 'Busy processing' });
                    return true;
                }
                if (!this.state.settingsLoaded) {
                    console.warn(`Settings not loaded yet, delaying command: ${request.type}`);
                    this.appendMessage('system', 'Initializing, please wait...');
                    sendResponse({ success: false, error: 'Initializing' });
                    return true;
                }
                try {
                    messageHandlers[request.type]();
                    sendResponse({ success: true });
                } catch (error) {
                    console.error(`Error executing command ${request.type} from message listener:`, error);
                    this.handleError(`Failed to execute ${request.type}`, error);
                    sendResponse({ success: false, error: error.message });
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

            if (changes[this.settingsStorageKey]) {
                const newSettings = changes[this.settingsStorageKey].newValue || {};
                this.state.activeApiMode = newSettings.activeApiMode ?? defaultApiSettings.activeApiMode;
                this.state.localApiUrl = newSettings.localApiUrl || defaultApiSettings.localApiUrl;
                this.state.ollamaMultimodalModel = newSettings.ollamaMultimodalModel || defaultApiSettings.ollamaMultimodalModel;
                this.state.cloudApiUrl = newSettings.cloudApiUrl || defaultApiSettings.cloudApiUrl;
                this.state.cloudApiKey = newSettings.cloudApiKey ?? defaultApiSettings.cloudApiKey;
                this.state.cloudModelName = newSettings.cloudModelName || defaultApiSettings.cloudModelName;
                settingsChanged = true;
                console.log('API settings updated via storage listener:', this.state);
            }
            if (changes[this.promptsStorageKey]) {
                const newPromptsData = changes[this.promptsStorageKey].newValue || {};
                this.prompts = { ...defaultPrompts, ...newPromptsData };
                promptsChanged = true;
                console.log('Prompts updated via storage listener:', this.prompts);
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
            console.log("Initialization complete. Settings loaded:", this.state);
        } catch (error) {
            console.error('Initialization failed:', error);
            this.handleError('Initialization failed', error);
            this.state.activeApiMode = this.state.activeApiMode ?? defaultApiSettings.activeApiMode;
            this.state.localApiUrl = this.state.localApiUrl ?? defaultApiSettings.localApiUrl;
            this.state.ollamaMultimodalModel = this.state.ollamaMultimodalModel ?? defaultApiSettings.ollamaMultimodalModel;
            this.state.cloudApiUrl = this.state.cloudApiUrl ?? defaultApiSettings.cloudApiUrl;
            this.state.cloudApiKey = this.state.cloudApiKey ?? defaultApiSettings.cloudApiKey;
            this.state.cloudModelName = this.state.cloudModelName ?? defaultApiSettings.cloudModelName;
            this.prompts = this.prompts ?? { ...defaultPrompts };
            this.state.settingsLoaded = false;
        }
    }

    async loadSettingsAndPrompts() {
        console.log("Attempting to load settings and prompts...");
        try {
            const result = await chrome.storage.local.get([this.settingsStorageKey, this.promptsStorageKey]);
            const savedSettings = result[this.settingsStorageKey] || {};
            const savedPrompts = result[this.promptsStorageKey] || {};
            console.log("Retrieved from storage:", result);
            this.state.activeApiMode = savedSettings.activeApiMode ?? defaultApiSettings.activeApiMode;
            this.state.localApiUrl = savedSettings.localApiUrl || defaultApiSettings.localApiUrl;
            this.state.ollamaMultimodalModel = savedSettings.ollamaMultimodalModel || defaultApiSettings.ollamaMultimodalModel;
            this.state.cloudApiUrl = savedSettings.cloudApiUrl || defaultApiSettings.cloudApiUrl;
            this.state.cloudApiKey = savedSettings.cloudApiKey ?? defaultApiSettings.cloudApiKey;
            this.state.cloudModelName = savedSettings.cloudModelName || defaultApiSettings.cloudModelName;
            this.prompts = { ...defaultPrompts, ...savedPrompts };
            console.log("Successfully loaded and merged settings:", this.state);
            console.log("Successfully loaded and merged prompts:", this.prompts);
        } catch (error) {
            console.error('Error loading settings/prompts from chrome.storage.local:', error);
            this.appendMessage('system', 'Error loading settings/prompts. Using default values.');
            this.state.activeApiMode = defaultApiSettings.activeApiMode;
            this.state.localApiUrl = defaultApiSettings.localApiUrl;
            this.state.ollamaMultimodalModel = defaultApiSettings.ollamaMultimodalModel;
            this.state.cloudApiUrl = defaultApiSettings.cloudApiUrl;
            this.state.cloudApiKey = defaultApiSettings.cloudApiKey;
            this.state.cloudModelName = defaultApiSettings.cloudModelName;
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
            this.elements.userInput.addEventListener('keypress', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.handleSendMessage(); } });
        } else { console.error("User input element not found!"); }
    }

    handleModeChange(newMode) {
        if (!this.state.settingsLoaded) { /*...*/ this.appendMessage('system', 'Initializing, please wait...'); return; }
        if (this.state.isProcessing) { /*...*/ this.appendMessage('system', 'Processing, please wait...'); return; }

        if (newMode !== this.state.activeApiMode) {
            if (newMode === 'local') {
                if (!this.isLocalModeConfigValid()) return;
            } else if (newMode === 'cloud') {
                if (!this.isCloudModeConfigValid()) return;
            }
            this.state.activeApiMode = newMode;
            this.uiManager.updateModeUI(this.state.activeApiMode);
            this.saveActiveModePreference(newMode);
            const modeName = newMode === 'local' ? 'Local' : 'Cloud';
            this.appendMessage('system', `Switched to ${modeName} Mode.`);
            this.voiceController.speakText(`Switched to ${modeName} Mode.`);
        }
    }

    async saveActiveModePreference(mode) {
        if (!this.state.settingsLoaded) { /*...*/ return; }
        try {
            const result = await chrome.storage.local.get(this.settingsStorageKey);
            const currentSettings = result[this.settingsStorageKey] || { ...defaultApiSettings };
            currentSettings.activeApiMode = mode;
            await chrome.storage.local.set({ [this.settingsStorageKey]: currentSettings });
            console.log('Active mode preference saved:', mode);
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
        if (!this.state.cloudApiKey || !this.state.cloudApiUrl || !this.state.cloudModelName) {
            const missing = [];
            if (!this.state.cloudApiKey) missing.push("API Key");
            if (!this.state.cloudApiUrl) missing.push("Base URL");
            if (!this.state.cloudModelName) missing.push("Model Name");
            const message = `Cloud ${missing.join(', ')} is missing. Please configure in Options page.`;
            this.appendMessage('system', message);
            this.voiceController.speakText(`Cloud settings missing: ${missing.join(', ')}.`);
            return false;
        }
        return true;
    }

    getApiConfig() {
        return {
            activeApiMode: this.state.activeApiMode,
            localApiUrl: this.state.localApiUrl,
            ollamaMultimodalModel: this.state.ollamaMultimodalModel,
            cloudApiUrl: this.state.cloudApiUrl,
            cloudApiKey: this.state.cloudApiKey,
            cloudModelName: this.state.cloudModelName
        };
    }

    getHistoryToSend(commandToExclude = null) {
        return this.state.messages.filter(m =>
            (m.role === 'user' || m.role === 'assistant') &&
            (!commandToExclude || m.content !== commandToExclude) &&
            (!m.content.startsWith || !m.content.startsWith('openUrl:')) &&
            !['takeScreenshot', 'scrollingScreenshot', 'analyzeContent'].includes(m.content.trim())
        );
    }

    async handleSendMessage() {
        const userInput = this.elements.userInput.value.trim();
        if (!userInput) { return; }
        if (!this.state.settingsLoaded) { /*...*/ this.appendMessage('system', 'Initializing, please wait...'); return; }
        if (this.state.isProcessing) { /*...*/ this.appendMessage('system', 'Processing, please wait...'); return; }
        if (this.state.activeApiMode === 'local' && !this.isLocalModeConfigValid()) return;
        if (this.state.activeApiMode === 'cloud' && !this.isCloudModeConfigValid()) return;

        this.setProcessing(true);
        this.appendMessage('user', userInput);
        this.uiManager.clearUserInput();
        this.uiManager.hidePreview();

        try {
            const payload = { prompt: userInput };
            const apiConfig = this.getApiConfig();
            const historyToSend = this.getHistoryToSend();
            const systemPrompt = this.prompts.defaultChat;
            const responseContent = await this.apiService.sendRequest(
                apiConfig,
                historyToSend,
                payload,
                null,
                systemPrompt
            );
            this.handleResponse(responseContent);
        } catch (error) {
            this.handleError('Message sending failed', error);
        } finally {
            this.setProcessing(false);
            console.log("handleSendMessage finished");
        }
    }

    appendMessage(role, content) {
        if (!content || !content.trim()) {
            console.log("Skipping empty message append for role:", role);
            return;
        }

        const formattedContent = this.uiManager.escapeHTML(content);
        this.uiManager.appendMessage(role, formattedContent);

        const knownCommands = ['takeScreenshot', 'scrollingScreenshot', 'analyzeContent'];
        const isCommand = content.startsWith('openUrl:') || knownCommands.includes(content.trim());

        if (role !== 'system' && !isCommand) {
            const lastMessage = this.state.messages.length > 0 ? this.state.messages[this.state.messages.length - 1] : null;
            if (!lastMessage || lastMessage.role !== role || lastMessage.content !== content) {
                this.state.messages.push({ role, content });
            } else {
                console.log("Skipping duplicate message history append:", role, content.substring(0, 50) + "...");
            }
        } else {
            console.log("Message not added to API history:", { role, content: content.substring(0, 50) + "..." });
        }

        const MAX_HISTORY = 20;
        if (this.state.messages.length > MAX_HISTORY) {
            this.state.messages = this.state.messages.slice(this.state.messages.length - MAX_HISTORY);
        }
    }

    handleResponse(responseContent) {
        console.log('Handling final API response:', responseContent);
        const responseText = (typeof responseContent === 'string') ? responseContent : JSON.stringify(responseContent);

        const commandHandled = this.commandProcessor.processResponse(responseText);

        if (!commandHandled) {
            const displayContent = (typeof responseContent === 'string') ? responseContent : 'Received non-text response.';
            this.appendMessage('assistant', displayContent);
            this.voiceController.speakText(displayContent);
        } else {
            console.log("Command processor initiated an action. Action handler provides feedback.");
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
        console.log("Resetting processing state after error.");
        this.setProcessing(false);
    }

    handleClear() {
        if (this.state.isProcessing) { /*...*/ this.appendMessage('system', 'Processing, please wait...'); return; }
        console.log("Clearing conversation and state.");
        this.voiceController.stopSpeaking();
        this.uiManager.clearConversation();
        this.uiManager.clearUserInput();
        this.uiManager.hidePreview();
        this.state.messages = [];
        this.appendMessage('system', 'Conversation cleared.');
        this.voiceController.speakText('Conversation cleared.');
        this.setProcessing(false);
    }

    handleRepeat() {
        if (this.state.isProcessing) { /*...*/ this.appendMessage('system', 'Processing, please wait...'); return; }
        if (!this.state.settingsLoaded) { /*...*/ this.appendMessage('system', 'Initializing, please wait...'); return; }
        const lastAIMessage = [...this.state.messages].reverse().find(m => m.role === 'assistant');
        if (lastAIMessage && lastAIMessage.content) {
            console.log("Repeating last AI message:", lastAIMessage.content);
            this.voiceController.speakText(lastAIMessage.content);
        } else {
            const msg = 'No previous AI response to repeat.';
            console.log(msg);
            this.appendMessage('system', msg);
            this.voiceController.speakText(msg);
        }
    }

    handleOpenOptions() {
        console.log("Opening options page...");
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
        console.log(`Processing state set to: ${isProcessing}`);
    }
}

function initializeApp() {
    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', () => { if (!window.aiScreenReader) { window.aiScreenReader = new AIScreenReader(); } }); }
    else { if (!window.aiScreenReader) { window.aiScreenReader = new AIScreenReader(); } }
}
initializeApp();