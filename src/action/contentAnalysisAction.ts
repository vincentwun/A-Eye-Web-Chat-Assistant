import { ContentExtractor } from './contentExtractor.ts';
import type { AIScreenReader } from '../main/sidepanel.ts';

type Dependencies = ReturnType<AIScreenReader['_setupDependencies']>;

export class ContentAnalysisAction {
    private uiManager: Dependencies['uiManager'];
    private voiceController: Dependencies['voiceController'];
    private apiService: Dependencies['apiService'];
    private stateManager: Dependencies['stateManager'];
    private getApiConfig: Dependencies['getApiConfig'];
    private getHistoryToSend: Dependencies['getHistoryToSend'];
    private handleResponse: Dependencies['handleResponse'];
    private handleError: Dependencies['handleError'];
    private setProcessing: Dependencies['setProcessing'];
    private appendMessage: Dependencies['appendMessage'];

    constructor(dependencies: Dependencies) {
        this.uiManager = dependencies.uiManager;
        this.voiceController = dependencies.voiceController;
        this.apiService = dependencies.apiService;
        this.stateManager = dependencies.stateManager;
        this.getApiConfig = dependencies.getApiConfig;
        this.getHistoryToSend = dependencies.getHistoryToSend;
        this.handleResponse = dependencies.handleResponse;
        this.handleError = dependencies.handleError;
        this.setProcessing = dependencies.setProcessing;
        this.appendMessage = dependencies.appendMessage;

        if (!this.uiManager || !this.voiceController || !this.apiService || !this.stateManager || !this.getApiConfig || !this.getHistoryToSend || !this.handleResponse || !this.handleError || !this.setProcessing || !this.appendMessage) {
            console.error("ContentAnalysisAction missing dependencies:", dependencies);
            throw new Error("ContentAnalysisAction initialized with missing dependencies.");
        }
        console.log("ContentAnalysisAction initialized successfully.");
    }

    async execute() {
        console.log("ContentAnalysisAction execute called");
        this.setProcessing(true);

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab || !tab.id) throw new Error('No active tab found or tab ID missing for content analysis.');

            const extractedResult = await ContentExtractor.extractPageContent(tab);

            if (extractedResult && extractedResult.content) {
                const extractedText = extractedResult.content;
                const extractionMethod = extractedResult.method;

                if (extractionMethod === 'Fallback') {
                    this.appendMessage('system', 'Used basic text extraction (Readability failed or not applicable).');
                }
                const formattedText = this.uiManager.escapeHTML(extractedText);
                await this.uiManager.appendPreviewMessage('text', formattedText);

                this.uiManager.showThinkingIndicator();
                await this.voiceController.speakText("Analyzing...");

                const allPrompts = this.stateManager.getPrompts();
                const analyzeContentPromptText = allPrompts.analyzeContent_prompt || '';
                const activeSystemPromptKey = allPrompts.active_system_prompt_key || 'web_assistant';
                const systemPromptForTask = (allPrompts.system_prompt as Record<string, string>)[activeSystemPromptKey];

                console.log("Using content analysis prompt:", analyzeContentPromptText);

                const fullPrompt = `${analyzeContentPromptText}\n\n---\n\n${extractedText}`;
                const payload = { prompt: fullPrompt };
                const apiConfig = this.getApiConfig();
                const historyToSend = this.getHistoryToSend('analyzeContent');

                const responseContent = await this.apiService.sendRequest(
                    apiConfig,
                    historyToSend,
                    payload,
                    null,
                    systemPromptForTask
                );
                await this.handleResponse(responseContent);

            } else {
                console.error("Content extraction returned unexpected result:", extractedResult);
                throw new Error('Content extraction failed to return valid content.');
            }

        } catch (error) {
            this.handleError('Content analysis failed', error);
        } finally {
            if (this.stateManager.isProcessing()) {
                this.setProcessing(false);
            }
            console.log("ContentAnalysisAction execute finished trigger");
        }
    }
}