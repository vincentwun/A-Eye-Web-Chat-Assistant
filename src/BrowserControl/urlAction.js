export class UrlAction {
  constructor(dependencies) {
    this.handleError = dependencies.handleError;
    this.appendMessage = dependencies.appendMessage;
    this.voiceController = dependencies.voiceController;

    if (!this.handleError || !this.appendMessage || !this.voiceController) {
      console.error("UrlAction missing dependencies:", dependencies);
      throw new Error("UrlAction initialized with missing dependencies.");
    }
    console.log("UrlAction initialized successfully.");
  }

  async execute(url) {
    console.log(`UrlAction execute called with URL: ${url}`);

    if (!url || typeof url !== 'string' || !url.trim()) {
      this.handleError("URL action failed", new Error("Invalid or empty URL provided."));
      return;
    }

    let targetUrl = url.trim();
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      console.log(`Prepending https:// to URL: ${targetUrl}`);
      targetUrl = `https://` + targetUrl;
    }


    try {
      const message = `Opening Website: ${targetUrl}`;
      this.appendMessage('system', message);
      await this.voiceController.speakText(`Opening Website`);

      await chrome.tabs.create({ url: targetUrl, active: true });

      console.log(`Successfully opened new tab for: ${targetUrl}`);

    } catch (error) {
      console.error(`Error executing openUrl command for ${targetUrl}:`, error);
      this.handleError(`Failed to open URL: ${targetUrl}`, error);
    }
  }
}