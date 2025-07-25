import { ContentExtractor } from '../components/contentExtractor.js';
import { defaultPrompts, promptsStorageKey } from '../option/prompts.js';

export class ContentAnalysisAction {
    constructor(dependencies) {
        this.uiManager = dependencies.uiManager;
        this.voiceController = dependencies.voiceController;
        this.apiService = dependencies.apiService;
        this.state = dependencies.state;
        this.getApiConfig = dependencies.getApiConfig;
        this.getHistoryToSend = dependencies.getHistoryToSend;
        this.handleResponse = dependencies.handleResponse;
        this.handleError = dependencies.handleError;
        this.setProcessing = dependencies.setProcessing;
        this.appendMessage = dependencies.appendMessage;

        if (!this.uiManager || !this.voiceController || !this.apiService || !this.state || !this.getApiConfig || !this.getHistoryToSend || !this.handleResponse || !this.handleError || !this.setProcessing || !this.appendMessage) {
            console.error("ContentAnalysisAction missing dependencies:", dependencies);
            throw new Error("ContentAnalysisAction initialized with missing dependencies.");
        }
        console.log("ContentAnalysisAction initialized successfully.");
    }

    async execute() {
        console.log("ContentAnalysisAction execute called");
        this.setProcessing(true);
        this.uiManager.hidePreview();

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
                const previewSnippet = this.uiManager.escapeHTML(extractedText.substring(0, 500));
                this.uiManager.showPreview('text', `${previewSnippet}...`);

                this.appendMessage('user', `[Page Content Attached]`);
                this.appendMessage('system', 'Analyzing...');
                await this.voiceController.speakText("Analyzing content.");

                const result = await chrome.storage.local.get(promptsStorageKey);
                const currentPrompts = result[promptsStorageKey] || { ...defaultPrompts };
                const analyzeContentPromptText = currentPrompts.analyzeContent_prompt ?? defaultPrompts.analyzeContent;
                console.log("Using content analysis prompt:", analyzeContentPromptText);

                const fullPrompt = `${analyzeContentPromptText}\n\n---\n\n${extractedText}`;
                const payload = { prompt: fullPrompt };
                const apiConfig = this.getApiConfig();
                const historyToSend = this.getHistoryToSend('analyzeContent');
                const systemPromptForTask = null;

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
            this.setProcessing(false);
            console.log("ContentAnalysisAction execute finished trigger");
        }
    }
}