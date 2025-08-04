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

    _isGeminiConfigValid(state) {
        const method = state.cloudApiMethod;
        const isDirect = method === 'direct';
        const isProxy = method === 'proxy';
        let isValid = true;
        let speakMsg = null;

        if (!state.cloudApiKey) {
            const msg = 'Gemini API Key is missing. Please configure in Options page.';
            this.appendMessage('system', msg);
            speakMsg = 'Gemini settings missing: API Key.';
            isValid = false;
        }
        if (!state.cloudModelName) {
            const msg = 'Gemini Model Name is missing. Please configure in Options page.';
            if (isValid) this.appendMessage('system', msg);
            if (isValid) speakMsg = 'Gemini settings missing: Model Name.';
            isValid = false;
        }
        if (isDirect && !state.cloudApiUrl) {
            const msg = 'Gemini API Base URL is missing for Direct Connection. Please configure in Options page.';
            if (isValid) this.appendMessage('system', msg);
            if (isValid) speakMsg = 'Gemini settings missing: Base URL for Direct mode.';
            isValid = false;
        }
        if (isProxy && !state.cloudProxyUrl) {
            const msg = 'API Gateway URL is missing for Proxy Connection. Please configure in Options page.';
            if (isValid) this.appendMessage('system', msg);
            if (isValid) speakMsg = 'Gemini settings missing: Gateway URL for Proxy mode.';
            isValid = false;
        }

        if (!isValid && speakMsg) {
            this.voiceController.speakText(speakMsg);
        }
        return isValid;
    }

    _isMistralConfigValid(state) {
        let isValid = true;
        let speakMsg = null;

        if (!state.mistralApiKey) {
            const msg = 'Mistral API Key is missing. Please configure in Options page.';
            this.appendMessage('system', msg);
            speakMsg = 'Mistral settings missing: API Key.';
            isValid = false;
        }
        if (!state.mistralModelName) {
            const msg = 'Mistral Model Name is missing. Please configure in Options page.';
            if (isValid) this.appendMessage('system', msg);
            if (isValid) speakMsg = 'Mistral settings missing: Model Name.';
            isValid = false;
        }

        if (!isValid && speakMsg) {
            this.voiceController.speakText(speakMsg);
        }
        return isValid;
    }

    isCloudModeConfigValid() {
        const state = this.stateManager.getState();
        if (state.cloudProvider === 'mistral') {
            return this._isMistralConfigValid(state);
        }
        return this._isGeminiConfigValid(state);
    }
}