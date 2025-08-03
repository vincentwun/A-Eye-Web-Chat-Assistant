import { defaultPrompts, promptsStorageKey } from '../option/prompts.js';

export class ScrollingScreenshotAction {
    constructor(dependencies) {
        this.screenshotController = dependencies.screenshotController;
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
        this.updateLastImageData = dependencies.updateLastImageData;

        if (!this.screenshotController || !this.uiManager || !this.voiceController || !this.apiService || !this.state || !this.getApiConfig || !this.getHistoryToSend || !this.handleResponse || !this.handleError || !this.setProcessing || !this.appendMessage || !this.updateLastImageData) {
            console.error("ScrollingScreenshotAction missing dependencies:", dependencies);
            throw new Error("ScrollingScreenshotAction initialized with missing dependencies.");
        }
        console.log("ScrollingScreenshotAction initialized successfully.");
    }

    async execute() {
        console.log("ScrollingScreenshotAction execute called");
        this.setProcessing(true);

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab || !tab.id) throw new Error('No active tab found or tab ID missing for scrolling screenshot.');

            const mergedImageDataUrl = await this.screenshotController.handleScrollingScreenshot(tab);

            if (mergedImageDataUrl) {
                const mimeType = 'image/png';
                await this.updateLastImageData(mergedImageDataUrl, mimeType);

                this.uiManager.showThinkingIndicator();
                await this.voiceController.speakText("Analyzing...");

                const result = await chrome.storage.local.get(promptsStorageKey);
                const currentPrompts = result[promptsStorageKey] || { ...defaultPrompts };
                const scrollingPromptText = currentPrompts.scrollingScreenshot_prompt ?? defaultPrompts.scrollingScreenshot;
                console.log("Using scrolling screenshot prompt:", scrollingPromptText);

                const payload = { prompt: scrollingPromptText };
                const apiConfig = this.getApiConfig();
                const historyToSend = this.getHistoryToSend('scrollingScreenshot');
                const systemPromptForTask = null;

                const responseContent = await this.apiService.sendRequest(
                    apiConfig,
                    historyToSend,
                    payload,
                    mergedImageDataUrl,
                    systemPromptForTask
                );
                await this.handleResponse(responseContent);

            } else {
                throw new Error('Scrolling screenshot creation failed or returned no image.');
            }
        } catch (error) {
            this.handleError('Scrolling screenshot analysis failed', error);
        } finally {
            this.setProcessing(false);
            console.log("ScrollingScreenshotAction execute finished trigger");
        }
    }
}