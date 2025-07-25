import { defaultPrompts, promptsStorageKey } from '../option/prompts.js';
export class ScreenshotAction {
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
      console.error("ScreenshotAction missing dependencies:", dependencies);
      throw new Error("ScreenshotAction initialized with missing dependencies.");
    }
    console.log("ScreenshotAction initialized successfully.");
  }

  async execute() {
    console.log("ScreenshotAction execute called");
    this.setProcessing(true);

    try {
      const screenshotDataUrl = await this.screenshotController.captureVisibleTab();

      if (screenshotDataUrl) {
        const mimeTypeMatch = screenshotDataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,/);
        const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : 'image/png';
        await this.updateLastImageData(screenshotDataUrl, mimeType);

        this.uiManager.showThinkingIndicator();
        await this.voiceController.speakText("Analyzing screenshot.");

        const result = await chrome.storage.local.get(promptsStorageKey);
        const currentPrompts = result[promptsStorageKey] || { ...defaultPrompts };
        const screenshotPromptText = currentPrompts.screenshot_prompt ?? defaultPrompts.screenshot;
        console.log("Using screenshot prompt:", screenshotPromptText);

        const payload = { prompt: screenshotPromptText };
        const apiConfig = this.getApiConfig();
        const historyToSend = this.getHistoryToSend('takeScreenshot');
        const systemPromptForTask = null;

        const responseContent = await this.apiService.sendRequest(
          apiConfig,
          historyToSend,
          payload,
          screenshotDataUrl,
          systemPromptForTask
        );
        await this.handleResponse(responseContent);

      } else {
        throw new Error('Screenshot capture returned empty data.');
      }
    } catch (error) {
      this.handleError('Screenshot analysis failed', error);
    } finally {
      this.setProcessing(false);
      console.log("ScreenshotAction execute finished trigger");
    }
  }
}