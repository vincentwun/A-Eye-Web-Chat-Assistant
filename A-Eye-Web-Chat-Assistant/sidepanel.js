import { VoiceController } from './components/voiceControl.js';
import { ScreenshotController } from './components/screenShot.js';
import { ApiService } from './components/apiService.js';
import { ContentExtractor } from './components/contentExtractor.js';
import { UIManager } from './components/uiManager.js';
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
        this.voiceController.setCallbacks({
            appendMessage: (role, content) => this.appendMessage(role, content),
            updateVoiceInputButtonState: (isActive) => {
                this.uiManager.updateVoiceButtonState(isActive);
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
        this.setupStorageListener();
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
                if (!this.state.isProcessing) {
                    if (!this.state.settingsLoaded) {
                        console.warn(`Settings not loaded yet, delaying command: ${request.type}`);
                        this.appendMessage('system', 'Initializing, please wait...');
                        sendResponse({ success: false, error: 'Initializing' });
                        return false;
                    }
                    messageHandlers[request.type]();
                    sendResponse({ success: true });
                } else {
                    console.log(`Sidepanel busy, cannot execute command: ${request.type}`);
                    this.appendMessage('system', 'Processing, please wait...');
                    sendResponse({ success: false, error: 'Busy processing' });
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
            this.state.cloudApiUrl = this.state.cloudApiUrl ?? defaultApiSettings.cloudApiUrl;
            this.state.cloudModelName = this.state.cloudModelName ?? defaultApiSettings.cloudModelName;
            this.state.localApiUrl = this.state.localApiUrl ?? defaultApiSettings.localApiUrl;
            this.state.ollamaMultimodalModel = this.state.ollamaMultimodalModel ?? defaultApiSettings.ollamaMultimodalModel;
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
            'voiceButton': this.voiceController.toggleVoiceInput,
            'repeatButton': this.handleRepeat,
            'clearButton': this.handleClear,
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

        if (this.elements.userInput) {
            this.elements.userInput.addEventListener('input', () => {
                this.uiManager.updateInputState(this.elements.userInput.value);
            });
            this.elements.userInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.handleSendMessage();
                }
            });
        } else {
            console.error("User input element not found!");
        }
    }

    handleModeChange(newMode) {
        if (!this.state.settingsLoaded) {
            this.appendMessage('system', 'Settings still loading, cannot switch mode yet.'); return;
        }
        if (this.state.isProcessing) {
            this.appendMessage('system', 'Cannot switch modes while processing.');
            this.voiceController.speakText('Cannot switch modes now.');
            return;
        }
        if (newMode !== this.state.activeApiMode) {
            if (newMode === 'local' && (!this.state.localApiUrl || !this.state.ollamaMultimodalModel)) {
                this.appendMessage('system', 'Cannot switch to Local mode: URL or Model Name is missing. Please configure in Options.');
                this.voiceController.speakText('Cannot switch to Local mode. Settings missing.');
                return;
            }
            if (newMode === 'cloud' && (!this.state.cloudApiKey || !this.state.cloudApiUrl || !this.state.cloudModelName)) {
                const missing = [];
                if (!this.state.cloudApiKey) missing.push("API Key");
                if (!this.state.cloudApiUrl) missing.push("Base URL");
                if (!this.state.cloudModelName) missing.push("Model Name");
                const message = `Cannot switch to Cloud mode: ${missing.join(', ')} is missing. Please configure in Options.`;
                this.appendMessage('system', message);
                this.voiceController.speakText(`Cannot switch to Cloud mode. Settings missing: ${missing.join(', ')}.`);
                return;
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
        if (!this.state.settingsLoaded) {
            console.warn("Attempted to save mode preference before settings were loaded.");
            return;
        }
        try {
            const result = await chrome.storage.local.get(this.settingsStorageKey);
            const currentSettings = result[this.settingsStorageKey] || { ...defaultApiSettings };
            currentSettings.activeApiMode = mode;
            await chrome.storage.local.set({ [this.settingsStorageKey]: currentSettings });
            console.log('Active mode preference saved:', mode);
        } catch (error) {
            console.error('Error saving active mode preference:', error);
        }
    }

    isLocalModeConfigValid() {
        if (this.state.activeApiMode === 'local') {
            if (!this.state.localApiUrl || !this.state.ollamaMultimodalModel) {
                this.appendMessage('system', 'Local API URL or Model Name is missing. Please configure in Options page.');
                this.voiceController.speakText('Local API settings missing.');
                return false;
            }
        }
        return true;
    }

    isCloudModeConfigValid() {
        if (this.state.activeApiMode === 'cloud') {
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

    async handleScreenshot() {
        if (!this.state.settingsLoaded) { this.appendMessage('system', 'Initializing, please wait...'); return; }
        if (this.state.isProcessing) { this.appendMessage('system', 'Processing already in progress.'); return; }
        if (this.state.activeApiMode === 'local' && !this.isLocalModeConfigValid()) return;
        if (this.state.activeApiMode === 'cloud' && !this.isCloudModeConfigValid()) return;

        this.setProcessing(true);
        this.uiManager.hidePreview();

        try {
            this.appendMessage('system', 'Taking screenshot...');
            await this.voiceController.speakText("Taking screenshot.");
            const screenshotDataUrl = await this.screenshotController.captureVisibleTab();

            if (screenshotDataUrl) {
                this.uiManager.showPreview('image', screenshotDataUrl);
                this.appendMessage('user', '[Screenshot Attached]');
                this.appendMessage('system', 'Screenshot captured. Sending for analysis...');
                await this.voiceController.speakText("Analyzing screenshot.");

                const payload = { prompt: this.prompts.screenshot };
                const apiConfig = this.getApiConfig();
                const historyToSend = this.state.messages.filter(m => m.role === 'user' || m.role === 'assistant');
                const systemPromptForTask = null;

                const responseContent = await this.apiService.sendRequest(
                    apiConfig,
                    historyToSend,
                    payload,
                    screenshotDataUrl,
                    systemPromptForTask
                );
                this.handleResponse(responseContent);

            } else {
                throw new Error('Screenshot capture returned empty data.');
            }
        } catch (error) {
            this.handleError('Screenshot analysis failed', error);
        } finally {
            if (this.state.isProcessing) {
                this.setProcessing(false);
            }
        }
    }

    async handleScrollingScreenshot() {
        if (!this.state.settingsLoaded) { this.appendMessage('system', 'Initializing, please wait...'); return; }
        if (this.state.isProcessing) { this.appendMessage('system', 'Processing already in progress.'); return; }
        if (this.state.activeApiMode === 'local' && !this.isLocalModeConfigValid()) return;
        if (this.state.activeApiMode === 'cloud' && !this.isCloudModeConfigValid()) return;

        this.setProcessing(true);
        this.uiManager.hidePreview();

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab || !tab.id) throw new Error('No active tab found or tab ID missing for scrolling screenshot.');

            const mergedImageDataUrl = await this.screenshotController.handleScrollingScreenshot(tab);

            if (mergedImageDataUrl) {
                this.uiManager.showPreview('image', mergedImageDataUrl);
                this.appendMessage('user', '[Scrolling Screenshot Attached]');
                this.appendMessage('system', 'Scrolling screenshot captured. Sending for analysis...');
                await this.voiceController.speakText("Analyzing scrolling screenshot.");

                const payload = { prompt: this.prompts.scrollingScreenshot };
                const apiConfig = this.getApiConfig();
                const historyToSend = this.state.messages.filter(m => m.role === 'user' || m.role === 'assistant');
                const systemPromptForTask = null;

                const responseContent = await this.apiService.sendRequest(
                    apiConfig,
                    historyToSend,
                    payload,
                    mergedImageDataUrl,
                    systemPromptForTask
                );
                this.handleResponse(responseContent);

            } else {
                throw new Error('Scrolling screenshot creation failed or returned no image.');
            }
        } catch (error) {
            this.handleError('Scrolling screenshot analysis failed', error);
        } finally {
            if (this.state.isProcessing) {
                this.setProcessing(false);
            }
        }
    }

    async handleContentAnalysis() {
        if (!this.state.settingsLoaded) { this.appendMessage('system', 'Initializing, please wait...'); return; }
        if (this.state.isProcessing) { this.appendMessage('system', 'Processing already in progress.'); return; }
        if (this.state.activeApiMode === 'local' && !this.isLocalModeConfigValid()) return;
        if (this.state.activeApiMode === 'cloud' && !this.isCloudModeConfigValid()) return;

        this.setProcessing(true);
        this.uiManager.hidePreview();

        try {
            this.appendMessage('system', 'Extracting page content...');
            await this.voiceController.speakText("Extracting page content.");

            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab || !tab.id) throw new Error('No active tab found or tab ID missing for content analysis.');

            const extractedResult = await ContentExtractor.extractPageContent(tab);
            const extractedText = extractedResult?.content;
            const extractionMethod = extractedResult?.method;

            if (extractedText) {
                if (extractionMethod === 'Fallback') {
                    this.appendMessage('system', 'Used basic text extraction (Readability failed).');
                }
                const previewSnippet = this.uiManager.escapeHTML(extractedText.substring(0, 500));
                this.uiManager.showPreview('text', `${previewSnippet}...`);

                this.appendMessage('user', `[Page Content Attached]\nSnippet: ${extractedText.substring(0, 100)}...`);
                this.appendMessage('system', 'Content extracted. Sending for analysis...');
                await this.voiceController.speakText("Analyzing content.");

                const fullPrompt = `${this.prompts.analyzeContent}\n\n---\n\n${extractedText}`;
                const payload = { prompt: fullPrompt };
                const apiConfig = this.getApiConfig();
                const historyToSend = this.state.messages.filter(m => m.role === 'user' || m.role === 'assistant');
                const systemPromptForTask = null;

                const responseContent = await this.apiService.sendRequest(
                    apiConfig,
                    historyToSend,
                    payload,
                    null,
                    systemPromptForTask
                );
                this.handleResponse(responseContent);

            } else {
                throw new Error('Content extraction failed or returned empty.');
            }

        } catch (error) {
            this.handleError('Content analysis failed', error);
        } finally {
            if (this.state.isProcessing) {
                this.setProcessing(false);
            }
        }
    }

    async handleSendMessage() {
        const userInput = this.elements.userInput.value.trim();
        if (!userInput) {
            console.log('Empty user input, ignoring send.');
            return;
        }
        if (!this.state.settingsLoaded) { this.appendMessage('system', 'Initializing, please wait...'); return; }
        if (this.state.isProcessing) {
            this.appendMessage('system', 'Processing already in progress. Please wait.');
            this.voiceController.speakText('Please wait.');
            return;
        }
        if (this.state.activeApiMode === 'local' && !this.isLocalModeConfigValid()) return;
        if (this.state.activeApiMode === 'cloud' && !this.isCloudModeConfigValid()) return;

        this.setProcessing(true);
        this.appendMessage('user', userInput);
        this.uiManager.clearUserInput();

        try {
            const payload = { prompt: userInput };
            const apiConfig = this.getApiConfig();
            const historyToSend = this.state.messages.filter(m => m.role === 'user' || m.role === 'assistant');
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
            if (this.state.isProcessing) {
                this.setProcessing(false);
            }
        }
    }

    appendMessage(role, content) {
        const formattedContent = this.uiManager.escapeHTML(content);
        this.uiManager.appendMessage(role, formattedContent);

        const lastMessage = this.state.messages.length > 0 ? this.state.messages[this.state.messages.length - 1] : null;

        if ((role === 'user' || role === 'assistant')) {
            if (!lastMessage || !(lastMessage.role === role && lastMessage.content === content)) {
                this.state.messages.push({ role, content });
            }
        } else if (role === 'system') {
            console.log("System message (not added to API history):", content);
        }

        const MAX_HISTORY = 20;
        if (this.state.messages.length > MAX_HISTORY) {
            this.state.messages = this.state.messages.slice(-MAX_HISTORY);
        }
    }

    handleResponse(responseContent) {
        console.log('Handling final API response:', responseContent);
        const responseText = (typeof responseContent === 'string') ? responseContent : 'Received non-text response.';

        this.appendMessage('assistant', responseText);
        const normalizedResponse = responseText.toLowerCase().trim().replace(/[.!?,]$/, '');

        if (this.handleCommands(normalizedResponse)) {
            console.log('Command detected in AI response and executed.');
            return;
        }

        this.voiceController.speakText(responseText);
        this.setProcessing(false);
    }

    handleCommands(normalizedResponse) {
        console.log('Checking for commands in response:', normalizedResponse);
        const commandActions = {
            'take screenshot': this.handleScreenshot,
            'capture screen': this.handleScreenshot,
            'scrolling screenshot': this.handleScrollingScreenshot,
            'full page screenshot': this.handleScrollingScreenshot,
            'analyze content': this.handleContentAnalysis,
            'analyze page': this.handleContentAnalysis,
            'summarize page': this.handleContentAnalysis,
        };

        if (commandActions[normalizedResponse]) {
            if (this.canExecuteCommand()) {
                this.appendMessage('system', `Executing command from AI: ${normalizedResponse}`);
                setTimeout(() => {
                    try {
                        this.setProcessing(false);
                        commandActions[normalizedResponse].call(this);
                        this.state.lastCommandTime = Date.now();
                    } catch (cmdError) {
                        this.handleError(`Command execution (${normalizedResponse}) failed`, cmdError);
                        this.setProcessing(false);
                    }
                }, 50);
                return true;
            } else {
                this.appendMessage('system', 'Command cooldown active. Ignoring AI command.');
                this.setProcessing(false);
                return false;
            }
        }

        const urlMatch = normalizedResponse.match(/(?:open|navigate to|go to)\s+(?:url\s)?(https?:\/\/[^\s'"]+)/);
        if (urlMatch && urlMatch[1]) {
            if (this.canExecuteCommand()) {
                try {
                    const url = new URL(urlMatch[1]).toString();
                    this.appendMessage('system', `Opening URL from AI: ${url}`);
                    this.voiceController.speakText(`Opening URL.`);
                    chrome.tabs.create({ url: url, active: true });
                    this.state.lastCommandTime = Date.now();
                    this.setProcessing(false);
                    return true;
                } catch (error) {
                    this.handleError('Invalid URL format suggested by AI', error);
                    this.setProcessing(false);
                    return false;
                }
            } else {
                this.appendMessage('system', 'Command cooldown active. Ignoring AI command to open URL.');
                this.setProcessing(false);
                return false;
            }
        }

        return false;
    }

    canExecuteCommand() {
        const now = Date.now();
        if (now - this.state.lastCommandTime < this.state.commandCooldown) {
            console.log(`Command cooldown active. ${this.state.commandCooldown - (now - this.state.lastCommandTime)}ms remaining.`);
            return false;
        }
        return true;
    }

    handleError(message, error) {
        console.error(message, error);

        const userFriendlyMessage = message || "An unexpected error occurred";
        let detail = '';

        if (error instanceof Error) {
            detail = error.message;
        } else if (typeof error === 'string') {
            detail = error;
        } else {
            detail = 'No specific details available.';
        }

        detail = detail.replace(/API Error \(\d+.*?\):\s*/, '');
        detail = detail.replace(/^Error:\s*/, '');

        const errorMessage = detail ? `${userFriendlyMessage}: ${detail}` : userFriendlyMessage;

        this.appendMessage('system', `Error: ${errorMessage}`);
        this.voiceController.speakText(`Error occurred. ${userFriendlyMessage}.`);

        this.resetStateAfterError();
    }

    resetStateAfterError() {
        console.log("Resetting processing state after error.");
        if (this.state.isProcessing) {
            this.setProcessing(false);
        }
    }

    handleClear() {
        if (this.state.isProcessing) {
            this.appendMessage('system', 'Cannot clear while processing. Please wait.'); return;
        }
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
        if (!this.state.settingsLoaded) { this.appendMessage('system', 'Initializing, please wait...'); return; }
        if (this.state.isProcessing) {
            this.appendMessage('system', 'Cannot repeat while processing. Please wait.'); return;
        }

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
            chrome.runtime.openOptionsPage(result => {
                if (chrome.runtime.lastError) {
                    console.error("Error opening options page:", chrome.runtime.lastError);
                    this.appendMessage('system', 'Error opening options page.');
                } else {
                    console.log("Options page opened successfully.");
                }
            });
        } else {
            const optionsUrl = chrome.runtime.getURL('option/options.html');
            try {
                chrome.tabs.create({ url: optionsUrl, active: true }, (tab) => {
                    if (chrome.runtime.lastError) {
                        console.error("Failed to open options page via tabs API:", chrome.runtime.lastError);
                        this.handleError("Failed to open options page", chrome.runtime.lastError);
                    } else {
                        console.log("Opened options page in new tab:", tab?.id);
                        this.appendMessage('system', 'Opened options page in a new tab.');
                    }
                });
            } catch (error) {
                console.error("Exception trying to open options tab:", error);
                this.handleError("Failed to open options page", error);
            }
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
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            console.log("DOM loaded, initializing AIScreenReader...");
            window.aiScreenReader = new AIScreenReader();
        });
    } else {
        console.log("DOM already ready, initializing AIScreenReader...");
        window.aiScreenReader = new AIScreenReader();
    }
}

initializeApp();