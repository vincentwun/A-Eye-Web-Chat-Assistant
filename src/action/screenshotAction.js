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

  async execute(type = 'visible') {
    console.log(`ScreenshotAction execute called with type: ${type}`);
    this.setProcessing(true);

    try {
      let imageDataUrl, mimeType, promptKey, commandName;

      if (type === 'visible') {
        imageDataUrl = await this.screenshotController.captureVisibleTab();
        const mimeTypeMatch = imageDataUrl ? imageDataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,/) : null;
        mimeType = mimeTypeMatch ? mimeTypeMatch[1] : 'image/png';
        promptKey = 'screenshot_prompt';
        commandName = 'takeScreenshot';
      } else if (type === 'scrolling') {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.id) throw new Error('No active tab found or tab ID missing for scrolling screenshot.');
        imageDataUrl = await this.screenshotController.handleScrollingScreenshot(tab);
        mimeType = 'image/png';
        promptKey = 'scrollingScreenshot_prompt';
        commandName = 'scrollingScreenshot';
      } else {
        throw new Error(`Unknown screenshot type: ${type}`);
      }

      if (imageDataUrl) {
        await this.updateLastImageData(imageDataUrl, mimeType);
        this.uiManager.showThinkingIndicator();
        await this.voiceController.speakText("Analyzing...");

        const result = await chrome.storage.local.get(promptsStorageKey);
        const currentPrompts = result[promptsStorageKey] || { ...defaultPrompts };

        const defaultPromptText = type === 'scrolling' ? defaultPrompts.scrollingScreenshot : defaultPrompts.screenshot;
        const promptText = currentPrompts[promptKey] ?? defaultPromptText;
        console.log(`Using ${type} screenshot prompt:`, promptText);

        const payload = { prompt: promptText };
        const apiConfig = this.getApiConfig();
        const historyToSend = this.getHistoryToSend(commandName);
        const systemPromptForTask = null;

        const responseContent = await this.apiService.sendRequest(
          apiConfig,
          historyToSend,
          payload,
          imageDataUrl,
          systemPromptForTask
        );
        await this.handleResponse(responseContent);

      } else {
        throw new Error(`${type === 'scrolling' ? 'Scrolling screenshot' : 'Screenshot capture'} returned empty data.`);
      }
    } catch (error) {
      const errorMessage = type === 'scrolling' ? 'Scrolling screenshot analysis failed' : 'Screenshot analysis failed';
      this.handleError(errorMessage, error);
    } finally {
      this.setProcessing(false);
      console.log(`ScreenshotAction execute finished for type: ${type}`);
    }
  }
}