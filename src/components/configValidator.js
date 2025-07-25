export class ConfigValidator {
  constructor(dependencies) {
    this.stateManager = dependencies.stateManager;
    this.appendMessage = dependencies.appendMessage;
    this.voiceController = dependencies.voiceController;
  }

  isLocalModeConfigValid() {
    const state = this.stateManager.getState();
    let isValid = true;
    if (!state.localApiUrl) {
      const msg = 'Local API URL is missing. Please configure in Options page.';
      this.appendMessage('system', msg);
      this.voiceController.speakText('Local API settings missing.');
      isValid = false;
    }
    if (!state.ollamaMultimodalModel) {
      const msg = 'Local Model Name is missing. Please configure in Options page.';
      if (isValid) this.appendMessage('system', msg);
      if (isValid) this.voiceController.speakText('Local API settings missing.');
      isValid = false;
    }
    return isValid;
  }

  isCloudModeConfigValid() {
    const state = this.stateManager.getState();
    const method = state.cloudApiMethod;
    const isDirect = method === 'direct';
    const isProxy = method === 'proxy';
    let isValid = true;
    let speakMsg = null;

    if (!state.cloudApiKey) {
      const msg = 'Cloud API Key is missing. Please configure in Options page.';
      this.appendMessage('system', msg);
      speakMsg = 'Cloud settings missing: API Key.';
      isValid = false;
    }
    if (!state.cloudModelName) {
      const msg = 'Cloud Model Name is missing. Please configure in Options page.';
      if (isValid) this.appendMessage('system', msg);
      if (isValid) speakMsg = 'Cloud settings missing: Model Name.';
      isValid = false;
    }
    if (isDirect && !state.cloudApiUrl) {
      const msg = 'Cloud API Base URL is missing for Direct Connection. Please configure in Options page.';
      if (isValid) this.appendMessage('system', msg);
      if (isValid) speakMsg = 'Cloud settings missing: Base URL for Direct mode.';
      isValid = false;
    }
    if (isProxy && !state.cloudProxyUrl) {
      const msg = 'Cloud Function URL is missing for Proxy Connection. Please configure in Options page.';
      if (isValid) this.appendMessage('system', msg);
      if (isValid) speakMsg = 'Cloud settings missing: Function URL for Proxy mode.';
      isValid = false;
    }

    if (!isValid && speakMsg) {
      this.voiceController.speakText(speakMsg);
    }
    return isValid;
  }
}