import { defaultPrompts, promptsStorageKey } from '../option/prompts.js';
import { settingsStorageKey, defaultApiSettings } from '../option/apiRoute.js';

export class StateManager {
    constructor(onStateUpdateCallback) {
        this.state = {
            activeApiMode: defaultApiSettings.activeApiMode,
            localApiUrl: defaultApiSettings.localApiUrl,
            ollamaMultimodalModel: defaultApiSettings.ollamaMultimodalModel,
            cloudProvider: defaultApiSettings.cloudProvider,
            cloudApiUrl: defaultApiSettings.cloudApiUrl,
            cloudApiKey: defaultApiSettings.cloudApiKey,
            cloudModelName: defaultApiSettings.cloudModelName,
            cloudApiMethod: defaultApiSettings.cloudApiMethod,
            cloudProxyUrl: defaultApiSettings.cloudProxyUrl,
            mistralApiKey: defaultApiSettings.mistralApiKey,
            mistralModelName: defaultApiSettings.mistralModelName,
            isProcessing: false,
            messages: [],
            lastCommandTime: 0,
            commandCooldown: 1000,
            settingsLoaded: false,
            lastImageData: { dataUrl: null, mimeType: null }
        };
        this.prompts = { ...defaultPrompts };
        this.promptsStorageKey = promptsStorageKey;
        this.settingsStorageKey = settingsStorageKey;
        this.onStateUpdate = onStateUpdateCallback || (() => { });
    }

    async initialize() {
        try {
            await this.loadSettingsAndPrompts();
            this.state.settingsLoaded = true;
            this.setupStorageListener();
        } catch (error) {
            console.error("Failed to initialize state manager:", error);
            this.state.settingsLoaded = false;
            throw error;
        }
    }

    setupStorageListener() {
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== 'local') return;

            let updatedKeys = {};

            if (changes[this.settingsStorageKey]) {
                const newSettings = changes[this.settingsStorageKey].newValue || {};
                this.state = {
                    ...this.state,
                    activeApiMode: newSettings.activeApiMode ?? defaultApiSettings.activeApiMode,
                    localApiUrl: newSettings.localApiUrl ?? defaultApiSettings.localApiUrl,
                    ollamaMultimodalModel: newSettings.ollamaMultimodalModel ?? defaultApiSettings.ollamaMultimodalModel,
                    cloudProvider: newSettings.cloudProvider ?? defaultApiSettings.cloudProvider,
                    cloudApiUrl: newSettings.cloudApiUrl ?? defaultApiSettings.cloudApiUrl,
                    cloudApiKey: newSettings.cloudApiKey ?? defaultApiSettings.cloudApiKey,
                    cloudModelName: newSettings.cloudModelName ?? defaultApiSettings.cloudModelName,
                    cloudApiMethod: newSettings.cloudApiMethod ?? defaultApiSettings.cloudApiMethod,
                    cloudProxyUrl: newSettings.cloudProxyUrl ?? defaultApiSettings.cloudProxyUrl,
                    mistralApiKey: newSettings.mistralApiKey ?? defaultApiSettings.mistralApiKey,
                    mistralModelName: newSettings.mistralModelName ?? defaultApiSettings.mistralModelName,
                };
                updatedKeys.settingsChanged = true;
            }

            if (changes[this.promptsStorageKey]) {
                const newPromptsData = changes[this.promptsStorageKey].newValue || {};
                this.prompts = { ...defaultPrompts, ...newPromptsData };
                updatedKeys.promptsChanged = true;
            }

            if (Object.keys(updatedKeys).length > 0) {
                this.onStateUpdate(updatedKeys);
            }
        });
    }

    async loadSettingsAndPrompts() {
        try {
            const result = await chrome.storage.local.get([this.settingsStorageKey, this.promptsStorageKey]);
            const savedSettings = result[this.settingsStorageKey] || {};
            const savedPrompts = result[this.promptsStorageKey] || {};

            this.state = {
                ...this.state,
                activeApiMode: savedSettings.activeApiMode ?? defaultApiSettings.activeApiMode,
                localApiUrl: savedSettings.localApiUrl ?? defaultApiSettings.localApiUrl,
                ollamaMultimodalModel: savedSettings.ollamaMultimodalModel ?? defaultApiSettings.ollamaMultimodalModel,
                cloudProvider: savedSettings.cloudProvider ?? defaultApiSettings.cloudProvider,
                cloudApiUrl: savedSettings.cloudApiUrl ?? defaultApiSettings.cloudApiUrl,
                cloudApiKey: savedSettings.cloudApiKey ?? defaultApiSettings.cloudApiKey,
                cloudModelName: savedSettings.cloudModelName ?? defaultApiSettings.cloudModelName,
                cloudApiMethod: savedSettings.cloudApiMethod ?? defaultApiSettings.cloudApiMethod,
                cloudProxyUrl: savedSettings.cloudProxyUrl ?? defaultApiSettings.cloudProxyUrl,
                mistralApiKey: savedSettings.mistralApiKey ?? defaultApiSettings.mistralApiKey,
                mistralModelName: savedSettings.mistralModelName ?? defaultApiSettings.mistralModelName,
            };
            this.prompts = { ...defaultPrompts, ...savedPrompts };
        } catch (error) {
            console.error('Error loading settings and prompts:', error);
            throw error;
        }
    }

    async _saveActiveModePreference(mode) {
        if (!this.state.settingsLoaded) return;
        try {
            const result = await chrome.storage.local.get(this.settingsStorageKey);
            const currentSettings = result[this.settingsStorageKey] || { ...defaultApiSettings };
            currentSettings.activeApiMode = mode;
            await chrome.storage.local.set({ [this.settingsStorageKey]: currentSettings });
        } catch (error) {
            console.error('Error saving active mode preference:', error);
        }
    }

    getState() {
        return this.state;
    }

    getPrompts() {
        return this.prompts;
    }

    isSettingsLoaded() {
        return this.state.settingsLoaded;
    }

    isProcessing() {
        return this.state.isProcessing;
    }

    getApiConfig() {
        return {
            activeApiMode: this.state.activeApiMode,
            localApiUrl: this.state.localApiUrl,
            ollamaMultimodalModel: this.state.ollamaMultimodalModel,
            cloudProvider: this.state.cloudProvider,
            cloudApiUrl: this.state.cloudApiUrl,
            cloudApiKey: this.state.cloudApiKey,
            cloudModelName: this.state.cloudModelName,
            cloudApiMethod: this.state.cloudApiMethod,
            cloudProxyUrl: this.state.cloudProxyUrl,
            mistralApiKey: this.state.mistralApiKey,
            mistralModelName: this.state.mistralModelName
        };
    }

    getHistoryToSend(commandToExclude = null) {
        const baseHistory = this.state.messages.filter(m =>
            (m.role === 'user' || m.role === 'assistant') &&
            (!commandToExclude || m.content !== commandToExclude)
        );
        const MAX_HISTORY_FOR_API = 10;
        return baseHistory.slice(-MAX_HISTORY_FOR_API);
    }

    setProcessing(isProcessing) {
        if (this.state.isProcessing === isProcessing) return;
        this.state.isProcessing = isProcessing;
    }

    updateLastImageData(dataUrl, mimeType) {
        this.state.lastImageData = { dataUrl, mimeType };
    }

    clearLastImageData() {
        this.state.lastImageData = { dataUrl: null, mimeType: null };
    }

    addMessage(message) {
        this.state.messages.push(message);
        const MAX_HISTORY = 20;
        if (this.state.messages.length > MAX_HISTORY) {
            this.state.messages = this.state.messages.slice(this.state.messages.length - MAX_HISTORY);
        }
    }

    clearMessages() {
        this.state.messages = [];
    }

    async setActiveApiMode(newMode) {
        if (this.state.activeApiMode === newMode || !this.state.settingsLoaded) return;
        this.state.activeApiMode = newMode;
        await this._saveActiveModePreference(newMode);
    }
}