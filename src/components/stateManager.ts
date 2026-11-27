import { defaultPrompts, promptsStorageKey } from '../option/prompts.ts';
import { settingsStorageKey, defaultApiSettings } from '../option/apiRoute.ts';

type Message = { role: string; content: string; [key: string]: unknown };
type AppState = typeof defaultApiSettings & Record<string, unknown> & {
    isProcessing: boolean;
    messages: Message[];
    lastCommandTime: number;
    commandCooldown: number;
    settingsLoaded: boolean;
    lastImageData: { dataUrl: string | null; mimeType: string | null };
};
type StateChanges = { settingsChanged?: boolean; promptsChanged?: boolean };

export class StateManager {
    private state: AppState;
    private prompts: typeof defaultPrompts;
    private promptsStorageKey: string;
    private settingsStorageKey: string;
    private onStateUpdate: (changes: StateChanges) => void;

    constructor(onStateUpdateCallback?: (changes: StateChanges) => void) {
        this.state = { ...defaultApiSettings, isProcessing: false, messages: [], lastCommandTime: 0,
            commandCooldown: 1000, settingsLoaded: false, lastImageData: { dataUrl: null, mimeType: null } };

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

            const updatedKeys: StateChanges = {};

            if (changes[this.settingsStorageKey]) {
                const newSettings = (changes[this.settingsStorageKey].newValue || {}) as Record<string, unknown>;
                const updatedState = { ...this.state };
                for (const key in defaultApiSettings) {
                    updatedState[key] = newSettings[key] ?? (defaultApiSettings as Record<string, unknown>)[key];
                }
                this.state = updatedState;
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
            const savedSettings = (result[this.settingsStorageKey] || {}) as Record<string, unknown>;
            const savedPrompts = result[this.promptsStorageKey] || {};

            const loadedState = { ...this.state };
            for (const key in defaultApiSettings) {
                loadedState[key] = savedSettings[key] ?? (defaultApiSettings as Record<string, unknown>)[key];
            }
            this.state = loadedState;

            this.prompts = { ...defaultPrompts, ...savedPrompts };
        } catch (error) {
            console.error('Error loading settings and prompts:', error);
            throw error;
        }
    }

    async _saveActiveModePreference(mode: string) {
        if (!this.state.settingsLoaded) return;
        try {
            const result = await chrome.storage.local.get(this.settingsStorageKey);
            const currentSettings = (result[this.settingsStorageKey] || { ...defaultApiSettings }) as Record<string, unknown>;
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
        const config: Record<string, unknown> = {};
        for (const key in defaultApiSettings) {
            config[key] = this.state[key];
        }
        return config;
    }

    getHistoryToSend(commandToExclude: string | null = null) {
        const baseHistory = this.state.messages.filter(m =>
            (m.role === 'user' || m.role === 'assistant') &&
            (!commandToExclude || m.content !== commandToExclude)
        );
        const MAX_HISTORY_FOR_API = 10;
        return baseHistory.slice(-MAX_HISTORY_FOR_API);
    }

    setProcessing(isProcessing: boolean) {
        if (this.state.isProcessing === isProcessing) return;
        this.state.isProcessing = isProcessing;
    }

    updateLastImageData(dataUrl: string | null, mimeType: string | null) {
        this.state.lastImageData = { dataUrl, mimeType };
    }

    clearLastImageData() {
        this.state.lastImageData = { dataUrl: null, mimeType: null };
    }

    addMessage(message: Message) {
        this.state.messages.push(message);
        const MAX_HISTORY = 20;
        if (this.state.messages.length > MAX_HISTORY) {
            this.state.messages = this.state.messages.slice(this.state.messages.length - MAX_HISTORY);
        }
    }

    clearMessages() {
        this.state.messages = [];
    }

    async setActiveApiMode(newMode: string) {
        if (this.state.activeApiMode === newMode || !this.state.settingsLoaded) return;
        this.state.activeApiMode = newMode;
        await this._saveActiveModePreference(newMode);
    }
}
