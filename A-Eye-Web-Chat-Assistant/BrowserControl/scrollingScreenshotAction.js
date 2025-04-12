export class ScrollingScreenshotAction {
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
          console.error("ScrollingScreenshotAction missing dependencies:", dependencies);
          throw new Error("ScrollingScreenshotAction initialized with missing dependencies.");
      }
      console.log("ScrollingScreenshotAction initialized successfully.");
  }

  async execute() {
      console.log("ScrollingScreenshotAction execute called");
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
              const historyToSend = this.getHistoryToSend('scrollingScreenshot');
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
          this.setProcessing(false);
          console.log("ScrollingScreenshotAction execute finished");
      }
  }
}