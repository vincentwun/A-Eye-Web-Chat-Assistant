import { VoiceController } from '../components/voiceControl.js';
import { ScreenshotController } from '../components/screenShot.js';
import { ApiService } from '../api/apiService.js';
import { UIManager } from '../components/uiManager.js';
import { CommandProcessor } from '../action/commandMap.js';
import { ScreenshotAction } from '../action/screenshotAction.js';
import { ContentAnalysisAction } from '../action/contentAnalysisAction.js';
import { GetElementAction } from '../action/getElementAction.js';
import { ActionFlowController } from '../components/actionFlowController.js';
import { StateManager } from '../components/stateManager.js';
import { defaultApiSettings } from '../option/apiRoute.js';
import { ConfigValidator } from '../components/configValidator.js';

class AIScreenReader {
    constructor() {
        this._getElements();
        this._initializeComponents();
        this._setupDependencies();
        this._setupActions();
        this._setupMessageListener();
        this.initializeAll();
    }

    _getElements() {
        this.elements = {
            screenshotButton: document.getElementById('screenshot-button'),
            scrollingScreenshotButton: document.getElementById('scrolling-screenshot-button'),
            analyzeContentButton: document.getElementById('analyze-content-button'),
            getElementButton: document.getElementById('get-element-button'),
            openOptionsButton: document.getElementById('options-button'),
            conversation: document.getElementById('conversation'),
            userInput: document.getElementById('user-input'),
            sendButton: document.getElementById('send-button'),
            voiceButton: document.getElementById('voiceInput-button'),
            repeatButton: document.getElementById('repeat-button'),
            clearButton: document.getElementById('clear-button'),
            localModeButton: document.getElementById('local-mode-button'),
            cloudModeButton: document.getElementById('cloud-mode-button'),
            currentModeIndicator: document.getElementById('current-mode-indicator'),
            pastedImagePreviewContainer: document.getElementById('pasted-image-preview-container'),
            pastedImagePreview: document.getElementById('pasted-image-preview'),
            removePastedImageButton: document.getElementById('remove-pasted-image-button')
        };
    }

    _initializeComponents() {
        this.stateManager = new StateManager(this.onStateChange.bind(this));
        this.uiManager = new UIManager(this.elements);
        this.apiService = new ApiService();
        this.voiceController = new VoiceController();
        this.screenshotController = new ScreenshotController();
        this.configValidator = new ConfigValidator({
            stateManager: this.stateManager,
            appendMessage: this.appendMessage.bind(this),
            voiceController: this.voiceController
        });
    }

    _setupDependencies() {
        this.voiceController.setCallbacks({
            appendMessage: this.appendMessage.bind(this),
            updateVoiceInputButtonState: (isActive) => this.uiManager.updateVoiceButtonState(isActive),
            handleSendMessage: this.handleSendMessage.bind(this)
        });

        this.screenshotController.setCallbacks({
            onStart: () => this.voiceController.speakText("Taking scrolling screenshot.")
        });

        this.actionDependencies = {
            apiService: this.apiService,
            uiManager: this.uiManager,
            voiceController: this.voiceController,
            screenshotController: this.screenshotController,
            state: this.stateManager.getState(),
            stateManager: this.stateManager,
            getApiConfig: this.stateManager.getApiConfig.bind(this.stateManager),
            getHistoryToSend: this.stateManager.getHistoryToSend.bind(this.stateManager),
            prompts: this.stateManager.getPrompts(),
            handleResponse: this.handleResponse.bind(this),
            handleError: this.handleError.bind(this),
            setProcessing: this.setProcessing.bind(this),
            appendMessage: this.appendMessage.bind(this),
            updateLastImageData: this.updateLastImageData.bind(this)
        };
    }

    _setupActions() {
        this.screenshotAction = new ScreenshotAction(this.actionDependencies);
        this.contentAnalysisAction = new ContentAnalysisAction(this.actionDependencies);
        this.getElementAction = new GetElementAction(this.actionDependencies);
        this.actionFlowController = new ActionFlowController(this.actionDependencies);

        const commandProcessorActions = {
            _executeScreenshot: () => this.screenshotAction.execute('visible'),
            _executeScrollingScreenshot: () => this.screenshotAction.execute('scrolling'),
            _executeContentAnalysis: this.contentAnalysisAction.execute.bind(this.contentAnalysisAction),
            handleError: this.handleError.bind(this)
        };
        this.commandProcessor = new CommandProcessor(commandProcessorActions);
    }

    async initializeAll() {
        try {
            await this.stateManager.initialize();
            this.uiManager.updateModeUI(this.stateManager.getState().activeApiMode);
            this._setupEventListeners();
            await this.voiceController.initializeAll();
            this.voiceController.speakText('A-Eye Ready');
            this.uiManager.updateInputState(this.elements.userInput.value);
        } catch (error) {
            this.handleError('Initialization failed', error);
            const currentState = this.stateManager.getState();
            this.uiManager.updateModeUI(currentState.activeApiMode ?? defaultApiSettings.activeApiMode);
        }
    }

    _canPerformAction({ checkConfig = true } = {}) {
        if (!this.stateManager.isSettingsLoaded()) {
            this.appendMessage('system', 'Initializing, please wait...');
            return false;
        }
        if (this.stateManager.isProcessing()) {
            this.appendMessage('system', 'Processing, please wait...');
            return false;
        }
        if (checkConfig) {
            const state = this.stateManager.getState();
            if (state.activeApiMode === 'local' && !this.configValidator.isLocalModeConfigValid()) return false;
            if (state.activeApiMode === 'cloud' && !this.configValidator.isCloudModeConfigValid()) return false;
        }
        return true;
    }

    _withActionGuards(handler, { ignoreProcessing = false, checkConfig = true } = {}) {
        return async (event) => {
            if (!this.stateManager.isSettingsLoaded()) {
                this.appendMessage('system', 'Initializing, please wait...');
                return;
            }
            if (!ignoreProcessing && this.stateManager.isProcessing()) {
                this.appendMessage('system', 'Processing, please wait...');
                return;
            }
            if (checkConfig) {
                const state = this.stateManager.getState();
                if (state.activeApiMode === 'local' && !this.configValidator.isLocalModeConfigValid()) return;
                if (state.activeApiMode === 'cloud' && !this.configValidator.isCloudModeConfigValid()) return;
            }
            try {
                await handler.call(this, event);
            } catch (error) {
                console.error(`Error in guarded action for ${handler.name}:`, error);
                this.handleError('Action failed', error);
            }
        };
    }

    _setupEventListeners() {
        const eventHandlers = {
            'screenshotButton': this._withActionGuards(this.handleScreenshot),
            'scrollingScreenshotButton': this._withActionGuards(this.handleScrollingScreenshot),
            'analyzeContentButton': this._withActionGuards(this.handleContentAnalysis),
            'getElementButton': this._withActionGuards(this.handleGetElements),
            'sendButton': this._withActionGuards(this.handleSendMessage),
            'voiceButton': this._withActionGuards(this.voiceController.toggleVoiceInput.bind(this.voiceController)),
            'repeatButton': this._withActionGuards(this.handleRepeat, { checkConfig: false }),
            'localModeButton': this._withActionGuards(() => this.handleModeChange('local'), { checkConfig: false }),
            'cloudModeButton': this._withActionGuards(() => this.handleModeChange('cloud'), { checkConfig: false }),
            'clearButton': this._withActionGuards(this.handleClear, { ignoreProcessing: true, checkConfig: false }),
            'removePastedImageButton': (event) => this.handleRemovePastedImage(event),
            'openOptionsButton': () => this.handleOpenOptions()
        };

        for (const [elementId, handler] of Object.entries(eventHandlers)) {
            const element = this.elements[elementId];
            if (element) {
                element.addEventListener('click', handler);
            } else {
                console.warn(`Element with ID '${elementId}' not found for event listener.`);
            }
        }

        if (this.elements.userInput) {
            this.elements.userInput.addEventListener('paste', this.handlePaste.bind(this));
            this.elements.userInput.addEventListener('input', () => this.uiManager.updateInputState(this.elements.userInput.value));
            this.elements.userInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.voiceController.stopSpeaking();
                    this.handleSendMessage();
                }
            });
        } else {
            console.error("User input element not found!");
        }
    }

    _setupMessageListener() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            const messageHandlers = {
                toggleApiMode: () => this.handleModeChange(this.stateManager.getState().activeApiMode === 'local' ? 'cloud' : 'local'),
                toggleVoiceInput: () => this.voiceController.toggleVoiceInput(),
                toggleRepeat: () => this.handleRepeat(),
                executeScreenshot: () => this.handleScreenshot(),
                executeScrollingScreenshot: () => this.handleScrollingScreenshot(),
                executeAnalyzeContent: () => this.handleContentAnalysis()
            };

            const handler = messageHandlers[request.type];
            if (handler) {
                const needsConfigCheck = request.type !== 'toggleApiMode' && request.type !== 'toggleRepeat';
                if (!this._canPerformAction({ checkConfig: needsConfigCheck })) {
                    sendResponse({ success: false, error: 'Cannot perform action right now' });
                    return true;
                }
                try {
                    handler();
                    sendResponse({ success: true });
                } catch (error) {
                    this.handleError(`Failed to execute ${request.type}`, error);
                    sendResponse({ success: false, error: error.message });
                }
                return true;
            }
            return false;
        });
    }


    onStateChange(changes) {
        if (changes.settingsChanged) {
            this.uiManager.updateModeUI(this.stateManager.getState().activeApiMode);
        }
    }

    async updateLastImageData(dataUrl, mimeType) {
        this.stateManager.updateLastImageData(dataUrl, mimeType);
        if (this.uiManager && typeof this.uiManager.appendPreviewMessage === 'function') {
            await this.uiManager.appendPreviewMessage('image', dataUrl);
        } else {
            console.error("UIManager or appendPreviewMessage method not found!");
        }
    }

    async handleScreenshot() {
        this.voiceController.stopSpeaking();
        await this.screenshotAction.execute('visible');
    }

    async handleScrollingScreenshot() {
        this.voiceController.stopSpeaking();
        await this.screenshotAction.execute('scrolling');
    }

    async handleContentAnalysis() {
        this.voiceController.stopSpeaking();
        await this.contentAnalysisAction.execute();
    }

    async handleGetElements() {
        this.voiceController.stopSpeaking();
        await this.getElementAction.execute();
    }

    handlePaste(event) {
        if (this.stateManager.isProcessing()) return;
        const imageFile = Array.from(event.clipboardData.files).find(file => file.type.startsWith('image/'));
        if (imageFile) {
            event.preventDefault();
            const reader = new FileReader();
            reader.onload = e => {
                this.stateManager.updateLastImageData(e.target.result, imageFile.type);
                this.uiManager.showPastedImagePreview(e.target.result);
            };
            reader.onerror = error => this.handleError("Failed to read pasted image", error);
            reader.readAsDataURL(imageFile);
        }
    }

    handleRemovePastedImage() {
        this.stateManager.clearLastImageData();
        this.uiManager.hidePastedImagePreview();
    }

    async handleModeChange(newMode) {
        this.voiceController.stopSpeaking();
        if (newMode === this.stateManager.getState().activeApiMode) return;
        await this.stateManager.setActiveApiMode(newMode);
        this.uiManager.updateModeUI(newMode);
        const modeName = newMode === 'local' ? 'Local' : 'Cloud';
        this.voiceController.speakText(`Switched to ${modeName} Mode.`);
        this.elements.userInput?.focus();
    }

    async handleSendMessage() {
        this.voiceController.stopSpeaking();
        const userInput = this.elements.userInput.value.trim();
        const state = this.stateManager.getState();
        const hasImageContext = !!state.lastImageData.dataUrl;
        const isPastedImageActive = this.elements.pastedImagePreviewContainer.style.display !== 'none';

        if (userInput.toLowerCase() === 'clear') {
            this.handleClear();
            return;
        }
        if (!userInput && !hasImageContext) return;

        this.setProcessing(true);
        this.voiceController.playSendSound();

        await this.uiManager.appendUserMessageWithImage({
            text: userInput,
            imageUrl: isPastedImageActive ? state.lastImageData.dataUrl : null
        });

        if (userInput) {
            this.stateManager.addMessage({ role: 'user', content: userInput });
        }

        this.uiManager.clearUserInput();
        this.uiManager.hidePastedImagePreview();
        this.uiManager.showThinkingIndicator();

        try {
            const responseContent = await this.apiService.sendRequest(
                this.stateManager.getApiConfig(),
                this.stateManager.getHistoryToSend(),
                { prompt: userInput || "Analyze the image." },
                hasImageContext ? state.lastImageData.dataUrl : null,
                this.stateManager.getPrompts().system_prompt[this.stateManager.getPrompts().active_system_prompt_key || 'web_assistant']
            );

            if (isPastedImageActive) {
                this.stateManager.clearLastImageData();
            }

            await this.handleResponse(responseContent);
        } catch (error) {
            this.handleError('Message sending failed', error);
            if (this.stateManager.isProcessing()) {
                this.setProcessing(false);
                this.stateManager.clearLastImageData();
            }
        }
    }

    appendMessage(role, content, isSilent = false) {
        if (!content || (typeof content === 'string' && !content.trim())) return;
        if (!isSilent) {
            const htmlContent = (role === 'assistant') ?
                DOMPurify.sanitize(marked.parse(content)) :
                this.uiManager.escapeHTML(String(content));
            this.uiManager.appendMessage(role, htmlContent);
        }
        if (role !== 'system') {
            this.stateManager.addMessage({ role, content: String(content) });
        }
    }

    async _speakResponse(text) {
        if (!text || typeof text !== 'string' || !text.trim()) return;
        const cleanedText = text.replace(/```[\s\S]*?```/g, ' ').replace(/-{3,}/g, ' ').replace(/\*/g, ' ').replace(/\^/g, ' ').replace(/\|/g, ' ').replace(/～/g, ' ');
        try {
            this.voiceController.speakText(cleanedText);
        } catch (error) {
            console.error("Error during speech synthesis:", error);
            this.appendMessage('system', `Error speaking: ${error.message}`);
        }
    }

    async handleResponse(responseContent) {
        this.uiManager.hideThinkingIndicator();
        const responseText = (typeof responseContent === 'string') ? responseContent : JSON.stringify(responseContent);
        try {
            const commandResult = this.commandProcessor.processResponse(responseText);
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
                this._speakResponse(responseText);
                this.setProcessing(false);
            }
        } catch (processorError) {
            this.handleError('Failed to process command from response', processorError);
            this.setProcessing(false);
        }
    }

    handleError(message, error) {
        this.uiManager.hideThinkingIndicator();
        console.error(message, error);
        let detail = (error instanceof Error) ? error.message : (typeof error === 'string' ? error : JSON.stringify(error));
        detail = detail.replace(/API Error (\d+\.?):\s/, '').replace(/^Error:\s*/, '');
        const userFriendlyMessage = message || "An unexpected error occurred";
        const errorMessage = detail ? `${userFriendlyMessage}: ${detail}` : userFriendlyMessage;
        this.appendMessage('system', `Error: ${errorMessage}`);
        this.voiceController.speakText(`Error occurred. ${userFriendlyMessage}.`);
        this.resetStateAfterError();
    }

    resetStateAfterError() {
        this.setProcessing(false);
    }

    handleClear() {
        this.voiceController.stopSpeaking();
        this.voiceController.speakText('Conversation cleared.');
        this.uiManager.hideThinkingIndicator();
        this.uiManager.clearConversation();
        this.uiManager.clearUserInput();
        this.stateManager.clearMessages();
        this.handleRemovePastedImage();
        this.setProcessing(false);
        this.elements.userInput?.focus();
    }

    async handleRepeat() {
        this.voiceController.stopSpeaking();
        const lastAIMessage = [...this.stateManager.getState().messages].reverse().find(m => m.role === 'assistant');
        if (lastAIMessage?.content) {
            await this._speakResponse(String(lastAIMessage.content));
        } else {
            this.voiceController.speakText('No previous response to repeat.');
        }
        this.elements.userInput?.focus();
    }

    handleOpenOptions() {
        if (chrome.runtime.openOptionsPage) {
            chrome.runtime.openOptionsPage();
        } else {
            chrome.tabs.create({ url: chrome.runtime.getURL('option/options.html') });
        }
    }

    setProcessing(isProcessing) {
        if (this.stateManager.isProcessing() === isProcessing) return;
        this.stateManager.setProcessing(isProcessing);
        this.uiManager.setProcessingState(isProcessing);
        if (!isProcessing) {
            this.elements.userInput?.focus();
        }
    }
}

function initializeApp() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { if (!window.aiScreenReader) window.aiScreenReader = new AIScreenReader(); });
    } else {
        if (!window.aiScreenReader) window.aiScreenReader = new AIScreenReader();
    }
}

initializeApp();