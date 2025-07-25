import { defaultPrompts, promptsStorageKey } from '../option/prompts.js';

export class GetElementAction {
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

      const elementsJsonString = JSON.stringify(elements);
      const previewSnippet = this.uiManager.escapeHTML(elementsJsonString.substring(0, 500));
      this.uiManager.appendPreviewMessage('text', `${previewSnippet}...`);

      this.appendMessage('user', `[Page Elements Attached]`);
      this.appendMessage('system', 'Analyzing...');
      await this.voiceController.speakText("Analyzing elements.");

      const result = await chrome.storage.local.get(promptsStorageKey);
      const currentPrompts = result[promptsStorageKey] || { ...defaultPrompts };
      const getElementPromptText = currentPrompts.getElement_prompt ?? defaultPrompts.getElement_prompt;
      console.log("Using get element prompt:", getElementPromptText);

      const fullPrompt = `${getElementPromptText}\n\n---\n\n${elementsJsonString}`;
      const payload = { prompt: fullPrompt };
      const apiConfig = this.getApiConfig();
      const historyToSend = this.getHistoryToSend();
      const systemPromptForTask = null;

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
      this.setProcessing(false);
      console.log("GetElementAction execute finished.");
    }
  }
}