import type { AIScreenReader } from '../main/sidepanel.ts';

type Dependencies = ReturnType<AIScreenReader['_setupDependencies']>;

export class ScreenshotAction {
  private screenshotController: Dependencies['screenshotController'];
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
  private updateLastImageData: Dependencies['updateLastImageData'];

  constructor(dependencies: Dependencies) {
    this.screenshotController = dependencies.screenshotController;
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
    this.updateLastImageData = dependencies.updateLastImageData;

    if (!this.screenshotController || !this.uiManager || !this.voiceController || !this.apiService || !this.stateManager || !this.getApiConfig || !this.getHistoryToSend || !this.handleResponse || !this.handleError || !this.setProcessing || !this.appendMessage || !this.updateLastImageData) {
      console.error("ScreenshotAction missing dependencies:", dependencies);
      throw new Error("ScreenshotAction initialized with missing dependencies.");
    }
    console.log("ScreenshotAction initialized successfully.");
  }

  async execute(type: string = 'visible') {
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
        this.voiceController.speakText("Taking scrolling screenshot.");
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.id) throw new Error('No active tab found or tab ID missing for scrolling screenshot.');
        imageDataUrl = await this.screenshotController.handleScrollingScreenshot(tab as chrome.tabs.Tab & { id: number });
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

        const allPrompts = this.stateManager.getPrompts();
        const promptText = allPrompts[promptKey as 'screenshot_prompt' | 'scrollingScreenshot_prompt'];
        console.log(`Using ${type} screenshot prompt:`, promptText);

        const payload = { prompt: promptText };
        const apiConfig = this.getApiConfig();
        const historyToSend = this.getHistoryToSend(commandName);
        const activeSystemPromptKey = allPrompts.active_system_prompt_key || 'web_assistant';
        const systemPromptForTask = (allPrompts.system_prompt as Record<string, string>)[activeSystemPromptKey];

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
      if (this.stateManager.isProcessing()) {
        this.setProcessing(false);
      }
      console.log(`ScreenshotAction execute finished for type: ${type}`);
    }
  }
}