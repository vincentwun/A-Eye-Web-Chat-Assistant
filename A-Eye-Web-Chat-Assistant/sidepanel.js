import { VoiceController } from './components/voiceControl.js';
import { ScreenshotController } from './components/screenShot.js';
import { ApiService } from './components/ApiService.js';
import { ContentExtractor } from './components/contentExtractor.js';
import { UIManager } from './components/UIManager.js';

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
            cloudModelName: '',
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
        this.uiManager = new UIManager(this.elements);
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
        this.apiService = new ApiService();
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
            this.uiManager.updateModeUI(
                this.state.activeApiMode,
                this.state.localApiUrl,
                this.state.ollamaMultimodalModel,
                this.state.cloudApiKey
            );
            this.setupEventListeners();
            this.voiceController.initializeAll();
            this.appendMessage('system', 'A-Eye Assistant Ready.');
            this.voiceController.speakText('A-Eye Assistant Ready.');
            this.uiManager.updateInputState(this.elements.userInput.value);
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
            this.state.cloudModelName = result.cloudModelName || '';
            this.state.localApiUrl = result.localApiUrl || this.elements.localUrlInput.value.trim();
            this.state.ollamaMultimodalModel = result.ollamaMultimodalModel || this.elements.localModelNameInput.value.trim();
        } catch (error) {
            console.error('Error loading settings:', error);
            this.appendMessage('system', 'Error loading settings. Using default values.');
            this.state.activeApiMode = 'cloud';
            this.state.localApiUrl = '';
            this.state.ollamaMultimodalModel = '';
            this.state.cloudApiKey = '';
            this.state.cloudModelName = '';
        }
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
        this.elements.userInput.addEventListener('input', () => {
            this.uiManager.updateInputState(this.elements.userInput.value);
        });
        this.elements.userInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.handleSendMessage();
            }
        });
        this.elements.localUrlInput.addEventListener('change', (e) => {
            this.state.localApiUrl = e.target.value.trim();
            this.saveSettings();
        });
        this.elements.localModelNameInput.addEventListener('change', (e) => {
            this.state.ollamaMultimodalModel = e.target.value.trim();
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
            this.uiManager.updateModeUI(
                this.state.activeApiMode,
                this.state.localApiUrl,
                this.state.ollamaMultimodalModel,
                this.state.cloudApiKey
            );
            this.saveSettings();
            const modeName = newMode === 'local' ? 'Local' : 'Cloud';
            this.appendMessage('system', `Switched to ${modeName} Mode.`);
            this.voiceController.speakText(`Switched to ${modeName} Mode.`);
        } else if (this.state.isProcessing) {
            this.appendMessage('system', `Cannot switch modes while processing.`);
            this.voiceController.speakText(`Cannot switch modes now.`);
        }
    }
    getApiConfig() {
        return {
            activeApiMode: this.state.activeApiMode,
            localApiUrl: this.state.localApiUrl,
            ollamaMultimodalModel: this.state.ollamaMultimodalModel,
            cloudApiKey: this.state.cloudApiKey,
            cloudModelName: this.state.cloudModelName
        };
    }
    async handleScreenshot() {
        if (this.state.isProcessing) {
            this.appendMessage('system', 'Processing already in progress.'); return;
        }
        this.setProcessing(true);
        this.uiManager.hidePreview();
        try {
            this.appendMessage('system', 'Taking screenshot...');
            await this.voiceController.speakText("Taking screenshot.");
            const screenshotDataUrl = await this.screenshotController.captureVisibleTab();
            if (screenshotDataUrl) {
                this.uiManager.showPreview('image', screenshotDataUrl);
                this.appendMessage('system', 'Screenshot captured. Sending for analysis...');
                await this.voiceController.speakText("Analyzing screenshot.");
                const payload = { prompt: this.prompts.screenshot };
                const apiConfig = this.getApiConfig();
                const responseContent = await this.apiService.sendRequest(
                    apiConfig,
                    this.state.messages,
                    payload,
                    screenshotDataUrl
                );
                this.handleResponse(responseContent);
            } else {
                this.appendMessage('system', 'Warning: Screenshot capture returned empty data.');
                await this.voiceController.speakText('Warning, could not capture screenshot.');
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
        if (this.state.isProcessing) {
            this.appendMessage('system', 'Processing already in progress.'); return;
        }
        this.setProcessing(true);
        this.uiManager.hidePreview();
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) throw new Error('No active tab found for scrolling screenshot.');
            const mergedImageDataUrl = await this.screenshotController.handleScrollingScreenshot(tab);
            if (mergedImageDataUrl) {
                this.uiManager.showPreview('image', mergedImageDataUrl);
                this.appendMessage('system', 'Scrolling screenshot captured. Sending for analysis...');
                await this.voiceController.speakText("Analyzing scrolling screenshot.");
                const payload = { prompt: this.prompts.scrollingScreenshot };
                const apiConfig = this.getApiConfig();
                const responseContent = await this.apiService.sendRequest(
                    apiConfig,
                    this.state.messages,
                    payload,
                    mergedImageDataUrl
                );
                this.handleResponse(responseContent);
            } else {
                this.appendMessage('system', 'Warning: Scrolling screenshot creation failed or returned no image.');
                await this.voiceController.speakText('Warning, could not create scrolling screenshot.');
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
        if (this.state.isProcessing) {
            this.appendMessage('system', 'Processing already in progress.'); return;
        }
        this.setProcessing(true);
        this.uiManager.hidePreview();
        try {
            this.appendMessage('system', 'Extracting page content...');
            await this.voiceController.speakText("Extracting page content.");
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) throw new Error('No active tab found for content analysis.');
            const extractedText = await ContentExtractor.extractPageContent(tab);
            if (extractedText) {
                if (extractedText.startsWith('Fallback Content:')) {
                    this.appendMessage('system', 'Used basic text extraction as fallback.');
                }
                const previewSnippet = this.uiManager.escapeHTML(extractedText.substring(0, 500));
                this.uiManager.showPreview('text', `${previewSnippet}...`);
                this.appendMessage('system', 'Content extracted. Sending for analysis...');
                await this.voiceController.speakText("Analyzing content.");
                const fullPrompt = `${this.prompts.analyzeContent}
${extractedText}`;
                const payload = { prompt: fullPrompt };
                const apiConfig = this.getApiConfig();
                const responseContent = await this.apiService.sendRequest(
                    apiConfig,
                    this.state.messages,
                    payload
                );
                this.handleResponse(responseContent);
            } else {
                this.appendMessage('system', 'Warning: Content extraction failed or returned empty.');
                await this.voiceController.speakText('Warning, could not extract content.');
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
            this.appendMessage('system', 'Please enter a message.');
            return;
        }
        if (this.state.isProcessing) {
            this.appendMessage('system', 'Processing already in progress.'); return;
        }
        this.setProcessing(true);
        this.uiManager.clearUserInput();
        try {
            this.appendMessage('user', userInput);
            const payload = { prompt: userInput };
            const apiConfig = this.getApiConfig();
            const responseContent = await this.apiService.sendRequest(
                apiConfig,
                this.state.messages,
                payload
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
        if ((role === 'user' || role === 'assistant') && content) {
            const lastMessage = this.state.messages[this.state.messages.length - 1];
            if (!lastMessage || !(lastMessage.role === role && lastMessage.content === content)) {
                this.state.messages.push({ role, content });
                const MAX_HISTORY = 20;
                if (this.state.messages.length > MAX_HISTORY) {
                    this.state.messages = this.state.messages.slice(-MAX_HISTORY);
                }
            }
        }
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
        this.setProcessing(false);
    }
    handleCommands(normalizedResponse) {
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
                this.setProcessing(false);
                setTimeout(() => {
                    try {
                        commandActions[normalizedResponse]();
                    } catch (cmdError) {
                        this.handleError(`Command execution (${normalizedResponse}) failed`, cmdError);
                    }
                }, 50);
                return true;
            } else {
                this.appendMessage('system', 'Command cooldown active.');
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
                    this.setProcessing(false);
                    return true;
                } catch (error) {
                    this.handleError('Invalid URL format from AI', error);
                    return false;
                }
            } else {
                this.appendMessage('system', 'Command cooldown active.');
                this.setProcessing(false);
                return false;
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
        const userFriendlyMessage = message || "An unexpected error occurred";
        let detail = error?.message || '';
        detail = detail.replace(/API Error \(\d+.*?\):\s*/, '');
        const errorMessage = detail ? `${userFriendlyMessage}: ${detail}` : userFriendlyMessage;
        this.appendMessage('system', `Error: ${errorMessage}`);
        this.voiceController.speakText(`Error occurred: ${userFriendlyMessage}`);
        this.resetStateAfterError();
    }
    resetStateAfterError() {
        console.log("Resetting state and enabling interface after error.");
        if (this.state.isProcessing) {
            this.setProcessing(false);
        }
    }
    handleClear() {
        if (this.state.isProcessing) {
            this.appendMessage('system', 'Cannot clear while processing.'); return;
        }
        this.uiManager.clearConversation();
        this.uiManager.clearUserInput();
        this.uiManager.hidePreview();
        this.state.messages = [];
        this.voiceController.stopSpeaking();
        this.voiceController.cleanup();
        this.appendMessage('system', 'Conversation cleared.');
        this.voiceController.speakText('Conversation cleared.');
        this.setProcessing(false);
    }
    handleRepeat() {
        if (this.state.isProcessing) {
            this.appendMessage('system', 'Cannot repeat while processing.'); return;
        }
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
            const optionsUrl = chrome.runtime.getURL('options.html');
            chrome.tabs.create({ url: optionsUrl });
            console.warn('chrome.runtime.openOptionsPage is not available. Opening options.html via tabs API.');
        }
    }
    setProcessing(isProcessing) {
        if (this.state.isProcessing === isProcessing) return;
        this.state.isProcessing = isProcessing;
        this.uiManager.setProcessingState(isProcessing);
    }
}
function initializeApp() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            window.aiScreenReader = new AIScreenReader();
        });
    } else {
        window.aiScreenReader = new AIScreenReader();
    }
}
initializeApp();