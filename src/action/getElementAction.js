export class GetElementAction {
  constructor(dependencies) {
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
      console.error("GetElementAction missing dependencies:", dependencies);
      throw new Error("GetElementAction initialized with missing dependencies.");
    }
    console.log("GetElementAction initialized successfully.");
  }

  async execute() {
    console.log("GetElementAction execute called");
    this.setProcessing(true);

    try {
      const response = await chrome.runtime.sendMessage({ type: 'findElements' });

      if (!response || !response.success || !Array.isArray(response.elements)) {
        throw new Error(response?.error || 'Failed to retrieve elements from background script.');
      }

      const elements = response.elements;
      if (elements.length === 0) {
        this.appendMessage('assistant', "I couldn't find any interactable elements on the page.");
        this.voiceController.speakText("No interactable elements found.");
        this.setProcessing(false);
        return;
      }

      const elementsJsonString = JSON.stringify(elements, null, 2);
      const formattedJson = this.uiManager.escapeHTML(elementsJsonString);
      await this.uiManager.appendPreviewMessage('text', formattedJson);

      this.uiManager.showThinkingIndicator();
      await this.voiceController.speakText("Analyzing...");

      const allPrompts = this.stateManager.getPrompts();
      const getElementPromptText = allPrompts.getElement_prompt;
      console.log("Using get element prompt:", getElementPromptText);

      const fullPrompt = `${getElementPromptText}\n\n---\n\n${elementsJsonString}`;
      const payload = { prompt: fullPrompt };
      const apiConfig = this.getApiConfig();
      const historyToSend = this.getHistoryToSend();
      const activeSystemPromptKey = allPrompts.active_system_prompt_key || 'web_assistant';
      const systemPromptForTask = allPrompts.system_prompt[activeSystemPromptKey];

      const responseContent = await this.apiService.sendRequest(
        apiConfig,
        historyToSend,
        payload,
        null,
        systemPromptForTask
      );
      await this.handleResponse(responseContent);

    } catch (error) {
      this.handleError('Element analysis failed', error);
    } finally {
      if (this.stateManager.isProcessing()) {
        this.setProcessing(false);
      }
      console.log("GetElementAction execute finished.");
    }
  }
}