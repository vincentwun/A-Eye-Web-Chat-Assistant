import { VoiceController } from '../voice/voiceControl.ts';
import { ScreenshotController } from '../action/screenShot.ts';
import { ApiService } from '../api/apiService.ts';
import type { PanelViewModel } from '../../entrypoints/sidepanel/panel-view-model';
import { CommandProcessor } from '../components/commandMap.ts';
import { ScreenshotAction } from '../action/screenshotAction.ts';
import { ContentAnalysisAction } from '../action/contentAnalysisAction.ts';
import { GetElementAction } from '../action/getElementAction.ts';
import { ActionFlowController } from '../components/actionFlowController.ts';
import { StateManager } from '../components/stateManager.ts';
import { defaultApiSettings, settingsStorageKey } from '../option/apiRoute.ts';
import { availableResponseLanguages } from '../option/languagesSettings.ts';
import { ConfigValidator } from '../components/configValidator.ts';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

export class AIScreenReader {
    private createUIManager: (voice: VoiceController) => PanelViewModel;
    stateManager!: StateManager;
    apiService!: ApiService;
    voiceController!: VoiceController;
    uiManager!: PanelViewModel;
    screenshotController!: ScreenshotController;
    configValidator!: ConfigValidator;
    actionDependencies!: ReturnType<AIScreenReader['_setupDependencies']>;
    screenshotAction!: ScreenshotAction;
    contentAnalysisAction!: ContentAnalysisAction;
    getElementAction!: GetElementAction;
    actionFlowController!: ActionFlowController;
    commandProcessor!: CommandProcessor;
    constructor(createUIManager: (voice: VoiceController) => PanelViewModel) {
        this.createUIManager = createUIManager;
        this._initializeComponents();
        this.actionDependencies = this._setupDependencies();
        this._setupActions();
        this._setupMessageListener();
        this.initializeAll();
    }

    _initializeComponents() {
        this.stateManager = new StateManager(this.onStateChange.bind(this));
        this.apiService = new ApiService();
        this.voiceController = new VoiceController();
        this.uiManager = this.createUIManager(this.voiceController);
        this.screenshotController = new ScreenshotController();
        this.configValidator = new ConfigValidator({
            stateManager: this.stateManager,
            appendMessage: this.appendMessage.bind(this),
            voiceController: this.voiceController
        });
    }

    _getProcessedSystemPrompt(systemPromptTemplate: string) {
        const prompts = this.stateManager.getPrompts();
        const responseLangCode = prompts.responseLanguage || 'en-US';
        const languageName = (availableResponseLanguages as Record<string, string>)[responseLangCode] || 'English (US)';
        return systemPromptTemplate.replace(/{languageName}/g, languageName);
    }

    _setupDependencies() {
        this.voiceController.setCallbacks({
            updateTranscript: text => this.uiManager.setInput(text),
            appendMessage: this.appendMessage.bind(this),
            updateVoiceInputButtonState: (isActive) => this.uiManager.updateVoiceButtonState(isActive),
            handleSendMessage: this.handleSendMessage.bind(this)
        });

        const originalApiService = this.apiService;
        const proxiedApiService = {
            sendRequest: (config: Parameters<ApiService['sendRequest']>[0], history: Parameters<ApiService['sendRequest']>[1], prompt: { prompt: string }, image: string | null, systemPrompt: string | null) => {
                const specificInstruction = prompt.prompt || '';
                const combinedSystemPromptTemplate = `${systemPrompt}\n\nIMMEDIATE TASK:\n${specificInstruction}`;
                const finalSystemPrompt = this._getProcessedSystemPrompt(combinedSystemPromptTemplate);
                const genericPrompt = { prompt: "Analyze the provided information and follow the system prompt's immediate task." };
                return originalApiService.sendRequest(config, history, genericPrompt, image, finalSystemPrompt);
            }
        };

        return {
            apiService: proxiedApiService,
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
            await this._applyInitialSettings();
            await this.stateManager.initialize();
            this.uiManager.updateModeUI(this.stateManager.getState().activeApiMode);
            this._setupEventListeners();
            await this.voiceController.initializeAll();
            this.voiceController.speakText('A-Eye Ready');
            this.uiManager.updateInputState();
        } catch (error) {
            this.handleError('Initialization failed', error);
            const currentState = this.stateManager.getState();
            this.uiManager.updateModeUI(currentState.activeApiMode ?? defaultApiSettings.activeApiMode);
        }
    }

    async _applyInitialSettings() {
        const result = await chrome.storage.local.get(settingsStorageKey);
        const settings = (result[settingsStorageKey] || {}) as { uiScale?: number };
        const uiScale = settings.uiScale ?? 100;
        this.uiManager.applyUIScale(uiScale);
    }

    _canPerformAction({ checkConfig = true, ignoreProcessing = false }: { checkConfig?: boolean; ignoreProcessing?: boolean } = {}) {
        if (!this.stateManager.isSettingsLoaded()) {
            this.appendMessage('system', 'Initializing, please wait...');
            return false;
        }
        if (!ignoreProcessing && this.stateManager.isProcessing()) {
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

    _withActionGuards(handler: () => unknown, { ignoreProcessing = false, checkConfig = true }: { ignoreProcessing?: boolean; checkConfig?: boolean } = {}) {
        return async () => {
            if (!this._canPerformAction({ checkConfig, ignoreProcessing })) return;
            try {
                await handler.call(this);
            } catch (error) {
                console.error(`Error in guarded action for ${handler.name}:`, error);
                this.handleError('Action failed', error);
            }
        };
    }

    _setupEventListeners() {
        const handlers = {
            onScreenshot: this._withActionGuards(this.handleScreenshot),
            onScrollingScreenshot: this._withActionGuards(this.handleScrollingScreenshot),
            onAnalyzeContent: this._withActionGuards(this.handleContentAnalysis),
            onGetElements: this._withActionGuards(this.handleGetElements),
            onSendMessage: this._withActionGuards(this.handleSendMessage),
            onToggleVoice: this._withActionGuards(this.voiceController.toggleVoiceInput.bind(this.voiceController), { checkConfig: false }),
            onRepeat: this._withActionGuards(this.handleRepeat, { checkConfig: false }),
            onModeChangeLocal: this._withActionGuards(() => this.handleModeChange('local'), { checkConfig: false }),
            onModeChangeCloud: this._withActionGuards(() => this.handleModeChange('cloud'), { checkConfig: false }),
            onClear: this._withActionGuards(this.handleClear, { ignoreProcessing: true, checkConfig: false }),
            onRemovePastedImage: () => this.handleRemovePastedImage(),
            onOpenOptions: () => this.handleOpenOptions(),
            onPaste: this.handlePaste.bind(this),
            onUserInputKeypress: (e: KeyboardEvent) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.voiceController.stopSpeaking();
                    this.handleSendMessage();
                }
            }
        };
        this.uiManager.bindEventListeners(handlers);
    }

    _setupMessageListener() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            const messageHandlers: Record<string, () => unknown> = {
                toggleApiMode: () => this.handleModeChange(this.stateManager.getState().activeApiMode === 'local' ? 'cloud' : 'local'),
                toggleVoiceInput: () => this.voiceController.toggleVoiceInput(),
                toggleRepeat: () => this.handleRepeat(),
                executeScreenshot: () => this.handleScreenshot(),
                executeScrollingScreenshot: () => this.handleScrollingScreenshot(),
                executeAnalyzeContent: () => this.handleContentAnalysis()
            };

            const handler = messageHandlers[request.type];
            if (handler) {
                const needsConfigCheck = request.type !== 'toggleApiMode' && request.type !== 'toggleRepeat' && request.type !== 'toggleVoiceInput';
                if (!this._canPerformAction({ checkConfig: needsConfigCheck })) {
                    sendResponse({ success: false, error: 'Cannot perform action right now' });
                    return true;
                }
                try {
                    handler();
                    sendResponse({ success: true });
                } catch (error) {
                    this.handleError(`Failed to execute ${request.type}`, error);
                    sendResponse({ success: false, error: error instanceof Error ? error.message : String(error) });
                }
                return true;
            }
            return false;
        });

        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'local' && changes[settingsStorageKey]) {
                const newSettings = changes[settingsStorageKey].newValue as { uiScale?: number } | undefined;
                const oldSettings = (changes[settingsStorageKey].oldValue || {}) as { uiScale?: number };
                if (newSettings && newSettings.uiScale !== oldSettings.uiScale) {
                    this.uiManager.applyUIScale(newSettings.uiScale ?? 100);
                }
            }
        });
    }


    onStateChange(changes: { settingsChanged?: boolean }) {
        if (changes.settingsChanged) {
            this.uiManager.updateModeUI(this.stateManager.getState().activeApiMode);
        }
    }

    async updateLastImageData(dataUrl: string, mimeType: string) {
        this.stateManager.updateLastImageData(dataUrl, mimeType);
        if (this.uiManager && typeof this.uiManager.appendPreviewMessage === 'function') {
            await this.uiManager.appendPreviewMessage('image', dataUrl);
        } else {
            console.error("UIManager or appendPreviewMessage method not found!");
        }
    }

    async handleScreenshot() {
        this.voiceController.stopSpeaking();
        this.voiceController.playSendSound();
        await this.screenshotAction.execute('visible');
    }

    async handleScrollingScreenshot() {
        this.voiceController.stopSpeaking();
        this.voiceController.playSendSound();
        await this.screenshotAction.execute('scrolling');
    }

    async handleContentAnalysis() {
        this.voiceController.stopSpeaking();
        this.voiceController.playSendSound();
        await this.contentAnalysisAction.execute();
    }

    async handleGetElements() {
        this.voiceController.stopSpeaking();
        this.voiceController.playSendSound();
        await this.getElementAction.execute();
    }

    handlePaste(event: ClipboardEvent) {
        if (this.stateManager.isProcessing()) return;
        const imageFile = Array.from(event.clipboardData?.files || []).find(file => file.type.startsWith('image/'));
        if (imageFile) {
            event.preventDefault();
            const reader = new FileReader();
            reader.onload = () => {
                if (typeof reader.result !== 'string') return;
                this.stateManager.updateLastImageData(reader.result, imageFile.type);
                this.uiManager.showPastedImagePreview(reader.result);
            };
            reader.onerror = error => this.handleError("Failed to read pasted image", error);
            reader.readAsDataURL(imageFile);
        }
    }

    handleRemovePastedImage() {
        this.stateManager.clearLastImageData();
        this.uiManager.hidePastedImagePreview();
    }

    async handleModeChange(newMode: string) {
        this.voiceController.stopSpeaking();
        if (newMode === this.stateManager.getState().activeApiMode) return;
        await this.stateManager.setActiveApiMode(newMode);
        this.uiManager.updateModeUI(newMode);
        const modeName = newMode === 'local' ? 'Local' : 'Cloud';
        this.voiceController.speakText(`Switched to ${modeName} Mode.`);
        this.uiManager.focusUserInput();
    }

    async handleSendMessage() {
        this.voiceController.stopSpeaking();
        const userInput = this.uiManager.getUserInput();
        const state = this.stateManager.getState();
        const hasImageContext = !!state.lastImageData.dataUrl;
        const isPastedImageActive = this.uiManager.isPastedImageVisible();

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
        this.voiceController.startThinkingSoundLoop();

        try {
            const prompts = this.stateManager.getPrompts();
            const activePromptKey = prompts.active_system_prompt_key || 'web_assistant';
            const systemPromptTemplate = (prompts.system_prompt as Record<string, string>)[activePromptKey];
            const systemPrompt = this._getProcessedSystemPrompt(systemPromptTemplate);

            const responseContent = await this.apiService.sendRequest(
                this.stateManager.getApiConfig(),
                this.stateManager.getHistoryToSend(),
                { prompt: userInput || "Analyze the image." },
                hasImageContext ? state.lastImageData.dataUrl : null,
                systemPrompt
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

    appendMessage(role: string, content: string, isSilent = false) {
        if (!content || (typeof content === 'string' && !content.trim())) return;
        if (!isSilent) {
            const htmlContent = (role === 'assistant') ?
                DOMPurify.sanitize(marked.parse(content, { async: false })) :
                this.uiManager.escapeHTML(String(content));
            this.uiManager.appendMessage(role, htmlContent);
        }
        if (role !== 'system') {
            this.stateManager.addMessage({ role, content: String(content) });
        }
    }

    async handleResponse(responseContent: unknown) {
        this.uiManager.hideThinkingIndicator();
        this.voiceController.stopThinkingSoundLoop();
        const responseText = (typeof responseContent === 'string') ? responseContent : JSON.stringify(responseContent);
        try {
            const commandResult = this.commandProcessor.processResponse(responseText);
            if (commandResult) {
                if (commandResult === true) {
                    this.appendMessage('assistant', '[{"action": "Done"}]', true);
                    this.setProcessing(false);
                } else if (commandResult.command === 'executeActions') {
                    await this.actionFlowController.handleExecuteActionsRequest(commandResult.actions!);
                } else if (commandResult.command === 'getElement') {
                    await this.actionFlowController.handleGetElementRequest();
                }
            } else {
                this.appendMessage('assistant', responseText, false);
                this.setProcessing(false);
                try {
                    this.voiceController.speakResponse(responseText);
                } catch (error) {
                    console.error("Error during speech synthesis:", error);
                    this.appendMessage('system', `Error speaking: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
        } catch (processorError) {
            this.handleError('Failed to process command from response', processorError);
            this.setProcessing(false);
        }
    }

    handleError(message: string, error: unknown) {
        this.uiManager.hideThinkingIndicator();
        this.voiceController.stopThinkingSoundLoop();
        console.error(message, error);
        let detail = (error instanceof Error) ? error.message : (typeof error === 'string' ? error : JSON.stringify(error) || '');
        detail = detail.replace(/API Error (\d+\.?):\s/, '').replace(/^Error:\s*/, '');
        const userFriendlyMessage = message || "An unexpected error occurred";
        const errorMessage = detail ? `${userFriendlyMessage}: ${detail}` : userFriendlyMessage;
        this.appendMessage('system', `Error: ${errorMessage}`);
        this.voiceController.speakText(`Error. ${errorMessage}`);
        this.resetStateAfterError();
    }

    resetStateAfterError() {
        this.setProcessing(false);
    }

    handleClear() {
        this.voiceController.stopSpeaking();
        this.voiceController.speakText('Conversation cleared.');
        this.uiManager.hideThinkingIndicator();
        this.voiceController.stopThinkingSoundLoop();
        this.uiManager.clearConversation();
        this.uiManager.clearUserInput();
        this.stateManager.clearMessages();
        this.handleRemovePastedImage();
        this.setProcessing(false);
        this.uiManager.focusUserInput();
    }

    async handleRepeat() {
        this.voiceController.stopSpeaking();
        const lastAIMessage = [...this.stateManager.getState().messages].reverse().find(m => m.role === 'assistant');
        if (lastAIMessage?.content) {
            await this.voiceController.speakResponse(String(lastAIMessage.content));
        } else {
            this.voiceController.speakText('No previous response to repeat.');
        }
        this.uiManager.focusUserInput();
    }

    handleOpenOptions() {
        if (chrome.runtime.openOptionsPage) {
            chrome.runtime.openOptionsPage();
        } else {
            chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
        }
    }

    setProcessing(isProcessing: boolean) {
        if (this.stateManager.isProcessing() === isProcessing) return;
        this.stateManager.setProcessing(isProcessing);
        this.uiManager.setProcessingState(isProcessing);
        if (!isProcessing) {
            this.uiManager.focusUserInput();
        }
    }
}

export function initializeApp(createUIManager: (voice: VoiceController) => PanelViewModel) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { if (!(window as Window & { aiScreenReader?: AIScreenReader }).aiScreenReader) (window as Window & { aiScreenReader?: AIScreenReader }).aiScreenReader = new AIScreenReader(createUIManager); });
    } else {
        if (!(window as Window & { aiScreenReader?: AIScreenReader }).aiScreenReader) (window as Window & { aiScreenReader?: AIScreenReader }).aiScreenReader = new AIScreenReader(createUIManager);
    }
}

