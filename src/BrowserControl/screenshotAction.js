export class ScreenshotAction {
  constructor(dependencies) {
    this.screenshotController = dependencies.screenshotController;
    this.uiManager = dependencies.uiManager;
    this.voiceController = dependencies.voiceController;
    this.apiService = dependencies.apiService;
    this.prompts = dependencies.prompts;
    this.state = dependencies.state;
    this.getApiConfig = dependencies.getApiConfig;
    this.getHistoryToSend = dependencies.getHistoryToSend;
    this.handleResponse = dependencies.handleResponse;
    this.handleError = dependencies.handleError;
    this.setProcessing = dependencies.setProcessing;
    this.appendMessage = dependencies.appendMessage;

    if (!this.screenshotController || !this.uiManager || !this.voiceController || !this.apiService || !this.prompts || !this.state || !this.getApiConfig || !this.getHistoryToSend || !this.handleResponse || !this.handleError || !this.setProcessing || !this.appendMessage) {
      console.error("ScreenshotAction missing dependencies:", dependencies);
      throw new Error("ScreenshotAction initialized with missing dependencies.");
    }
    console.log("ScreenshotAction initialized successfully.");
  }

  async execute() {
    console.log("ScreenshotAction execute called");
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
        const historyToSend = this.getHistoryToSend('takeScreenshot');
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
      this.setProcessing(false);
      console.log("ScreenshotAction execute finished");
    }
  }
}