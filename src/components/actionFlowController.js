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
    this.handleError = dependencies.handleError;

    if (
      !this.apiService ||
      !this.prompts ||
      !this.state ||
      !this.getApiConfig ||
      !this.getHistoryToSend ||
      !this.handleResponse ||
      !this.appendMessage ||
      !this.setProcessing ||
      !this.voiceController
    ) {
      console.error("ActionFlowController missing critical dependencies!");
      throw new Error(
        "ActionFlowController failed to initialize due to missing dependencies."
      );
    }
  }

  async handleGetElementRequest() {
    try {
      const response = await chrome.runtime.sendMessage({
        type: "findElements",
      });

      if (response && response.success && Array.isArray(response.elements)) {
        const elements = response.elements;
        const elementCount = elements.length;

        if (elementCount === 0) {
          this.appendMessage(
            "assistant",
            "I couldn't find any interactable elements on the page."
          );
          if (this.voiceController)
            this.voiceController.speakText("No interactable elements found.");
          this.setProcessing(false);
          return;
        }

        const elementsJsonString = JSON.stringify(elements, null, 2);
        const lastUserMessage = [...this.state.messages]
          .reverse()
          .find((m) => m.role === "user");
        const userContext = lastUserMessage
          ? lastUserMessage.content
          : "Perform the requested action.";

        let promptForLLM = this.prompts.jsonGeneration_prompt || "";
        promptForLLM = promptForLLM
          .replace("{userContext}", userContext)
          .replace("{elementsJsonString}", elementsJsonString);

        const payload = { prompt: promptForLLM };
        const apiConfig = this.getApiConfig();
        const historyToSend = this.getHistoryToSend("jsonGeneration");
        const systemPrompt = null;

        const llmResponseContent = await this.apiService.sendRequest(
          apiConfig,
          historyToSend,
          payload,
          null,
          systemPrompt
        );

        await this.handleResponse(llmResponseContent);
      } else {
        throw new Error(
          response?.error ||
            "Failed to retrieve elements from background script."
        );
      }
    } catch (error) {
      this.handleError("Failed to get elements or send them to LLM", error);
      this.setProcessing(false);
    }
  }

  async handleExecuteActionsRequest(actions) {
    if (this.voiceController) this.voiceController.speakText("Executing...");

    try {
      const response = await chrome.runtime.sendMessage({
        type: "executeActions",
        actions: actions,
      });

      if (response && response.success) {
        if (this.voiceController)
          this.voiceController.speakText("Actions completed.");
        this.appendMessage("assistant", "Action completed.", true);
      } else {
        throw new Error(
          response?.error ||
            "Failed to execute JSON actions in background script."
        );
      }
    } catch (error) {
      this.handleError("Failed to execute JSON actions", error);
    } finally {
      this.setProcessing(false);
    }
  }
}
