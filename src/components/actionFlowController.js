export class ActionFlowController {
  constructor(dependencies) {
    this.apiService = dependencies.apiService;
    this.prompts = dependencies.prompts;
    this.state = dependencies.state;
    this.getApiConfig = dependencies.getApiConfig;
    this.getHistoryToSend = dependencies.getHistoryToSend;
    this.handleResponse = dependencies.handleResponse;
    this.appendMessage = dependencies.appendMessage;
    this.setProcessing = dependencies.setProcessing;
    this.voiceController = dependencies.voiceController;

    if (!this.apiService || !this.prompts || !this.state || !this.getApiConfig ||
      !this.getHistoryToSend || !this.handleResponse || !this.appendMessage ||
      !this.setProcessing || !this.voiceController) {
      console.error("ActionFlowController missing critical dependencies!");
      throw new Error("ActionFlowController failed to initialize due to missing dependencies.");
    }
    console.log("ActionFlowController initialized.");
  }

  async handleGetElementRequest() {
    console.log("ActionFlowController: Handling getElement request.");
    // this.appendMessage('system', 'Getting page elements...');
    // if (this.voiceController) this.voiceController.speakText('Getting page elements.');

    try {
      const response = await chrome.runtime.sendMessage({ type: 'findElements' });

      if (response && response.success && Array.isArray(response.elements)) {
        const elements = response.elements;
        const elementCount = elements.length;
        // this.appendMessage('system', `Found ${elementCount} elements. Sending elements to LLM...`);

        if (elementCount === 0) {
          this.appendMessage('assistant', "I couldn't find any interactable elements on the page.");
          if (this.voiceController) this.voiceController.speakText("No interactable elements found.");
          this.setProcessing(false);
          return;
        }

        const elementsJsonString = JSON.stringify(elements);

        const lastUserMessage = [...this.state.messages].reverse().find(m => m.role === 'user');
        const userContext = lastUserMessage ? lastUserMessage.content : "Perform the requested action.";
        const promptForLLM = `Based on the user request "${userContext}" and the following elements, generate the required JSON command array.\n\nElements:\n${elementsJsonString}`;

        const payload = { prompt: promptForLLM };
        const apiConfig = this.getApiConfig();
        const historyToSend = [];

        const systemPrompt = this.prompts.defaultChat;

        console.log("ActionFlowController: Sending elements prompt with main system prompt to LLM...");
        const llmResponseContent = await this.apiService.sendRequest(
          apiConfig, historyToSend, payload, null, systemPrompt
        );

        await this.handleResponse(llmResponseContent);

      } else {
        throw new Error(response?.error || 'Failed to retrieve elements from background script.');
      }

    } catch (error) {
      console.error("ActionFlowController: Error during getElement flow:", error);
      if (typeof this.handleError === 'function') {
        this.handleError('Failed to get elements or send them to LLM', error);
      } else {
        this.appendMessage('system', `Error: Failed to get elements or process them - ${error.message}`);
      }
      this.setProcessing(false);
    }
  }

  async handleExecuteActionsRequest(actions) {
    console.log("ActionFlowController: Handling executeActions request."); this.appendMessage('system', 'Executing actions...'); if (this.voiceController) this.voiceController.speakText('Executing actions.'); try { const response = await chrome.runtime.sendMessage({ type: 'executeActions', actions: actions }); if (response && response.success) { this.appendMessage('system', 'Actions completed.'); console.log("JSON actions executed successfully by background:", response.results); if (this.voiceController) this.voiceController.speakText("Actions completed."); } else { throw new Error(response?.error || 'Failed to execute JSON actions in background script.'); } } catch (error) { console.error("ActionFlowController: Error during executeActions flow:", error); if (typeof this.handleError === 'function') { this.handleError('Failed to execute JSON actions', error); } else { this.appendMessage('system', `Error: Failed to execute actions - ${error.message}`); } } finally { this.setProcessing(false); }
  }
}