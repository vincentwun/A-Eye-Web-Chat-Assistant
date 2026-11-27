import { voiceSettingsStorageKey, defaultVoiceSettings } from '../option/languagesSettings.ts';
import { TTSController } from './ttsController.ts';
import { STTController } from './sttController.ts';
import { playSendSound, playThinkingSound } from './soundEffects.ts';

type VoiceSettings = { sttLanguage: string; ttsLanguage: string; ttsVoiceName: string | null };
type VoiceCallbacks = {
    updateTranscript: ((text: string) => void) | null;
    appendMessage: ((role: string, message: string) => void) | null;
    updateVoiceInputButtonState: ((active: boolean) => void) | null;
    handleSendMessage: (() => void) | null;
};

export class VoiceController {
    private settings: VoiceSettings;
    private callbacks: VoiceCallbacks;
    private thinkingSoundInterval: ReturnType<typeof setInterval> | null;
    private tts: TTSController;
    private stt: STTController;
    private initializationPromise: Promise<void>;
    constructor() {
        this.settings = { ...defaultVoiceSettings };
        this.callbacks = {
            updateTranscript: null,
            appendMessage: null,
            updateVoiceInputButtonState: null,
            handleSendMessage: null
        };
        this.thinkingSoundInterval = null;

        this.tts = new TTSController();
        this.stt = new STTController();

        this.initializationPromise = this._loadSettingsAndInit();
    }

    async _loadSettingsAndInit() {
        try {
            console.log('Loading voice settings...');
            const result = await chrome.storage.local.get(voiceSettingsStorageKey);
            this.settings = {
                ...defaultVoiceSettings,
                ...(result[voiceSettingsStorageKey] || {})
            };
            console.log('Voice settings loaded:', this.settings);

            console.log('Initializing speech synthesis...');
            await this.tts.initialize(this.settings);
            console.log('Speech synthesis initialization finished.');

        } catch (error) {
            console.error('Settings/TTS init error:', error);
            this.settings = { ...defaultVoiceSettings };
        }
    }

    setCallbacks(callbacks: Partial<VoiceCallbacks>) {
        Object.assign(this.callbacks, callbacks);
        this.stt.setCallbacks({
            updateTranscript: this.callbacks.updateTranscript ?? undefined,
            updateVoiceInputButtonState: this.callbacks.updateVoiceInputButtonState ?? undefined,
            handleSendMessage: this.callbacks.handleSendMessage ?? undefined
        });
    }

    async initializeAll() {
        try {
            await this.initializationPromise;
        } catch (error) {
            console.error("Core init failed.", error);
        }

        this.stt.initialize(this.settings);

        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'local' && changes[voiceSettingsStorageKey]) {
                console.log('Voice settings changed, reloading...');
                this._loadSettingsAndInit().then(() => {
                    this.stt.initialize(this.settings);
                }).catch(err => {
                    console.error("Settings reload error:", err);
                });
            }
        });
    }

    speakText(text: string) {
        if (!text || typeof text !== 'string' || !text.trim()) return Promise.resolve();
        return this.tts.speakText(text);
    }

    speakResponse(text: string) {
        if (!text || typeof text !== 'string' || !text.trim()) return Promise.resolve();
        const cleanedText = text
            .replace(/```[\s\S]*?```/g, ' ')
            .replace(/`([^`]+)`/g, '$1')
            .replace(/`+/g, '')
            .replace(/-{3,}/g, ' ')
            .replace(/\*/g, ' ')
            .replace(/\^/g, ' ')
            .replace(/\|/g, ' ')
            .replace(/～/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        return this.speakText(cleanedText);
    }

    stopSpeaking() {
        this.tts.stopSpeaking();
    }

    playSendSound() {
        playSendSound();
    }

    startThinkingSoundLoop() {
        this.stopThinkingSoundLoop();
        this.thinkingSoundInterval = setInterval(() => {
            playThinkingSound();
        }, 2000);
    }

    stopThinkingSoundLoop() {
        if (this.thinkingSoundInterval) {
            clearInterval(this.thinkingSoundInterval);
            this.thinkingSoundInterval = null;
        }
    }

    reportPermissionError(error: unknown, context: string) {
        const prefix = `Mic perm ${context} error`;
        console.error(`${prefix}:`, error);

        let userMessage = 'Microphone error.';
        let speakMessage = 'Microphone error.';

        const errorMessage = error instanceof Error ? error.message : '';

        if (context === 'initial check') {
            if (errorMessage.includes('Permission denied by user')) {
                speakMessage = 'Microphone access denied.';
            } else if (errorMessage.includes('No active tab found')) {
                speakMessage = 'Could not find active tab.';
            } else if (errorMessage.includes('Permissions API missing')) {
                speakMessage = 'Cannot check permission status.';
            } else {
                userMessage = `Error during permission check: ${errorMessage}`;
                speakMessage = 'Check error.';
            }
        } else if (context === 'prompt response') {
            speakMessage = 'Microphone access not granted.';
        } else if (context === 'prompt request attempt') {
            if (errorMessage.includes("Could not establish connection") || errorMessage.includes("Cannot access contents of url") || errorMessage.includes("Frame with ID")) {
                speakMessage = 'Please try turning on Voice Input on a valid website.';
            } else if (errorMessage.includes("Script inject failed")) {
                speakMessage = 'Please try turning on Voice Input on a valid website.';
            } else if (errorMessage.includes("Could not find active tab")) {
                speakMessage = 'No active tab.';
            }
            else {
                userMessage = `Error requesting permission: ${errorMessage}`;
                speakMessage = 'Request error.';
            }
        } else {
            userMessage = `Unknown microphone error: ${errorMessage}`;
            speakMessage = 'Error.';
        }

        this.callbacks.appendMessage?.('system', userMessage);
        this.speakText(speakMessage).catch(e => console.error("Speak error after perm fail:", e));
    }


    async requestMicrophonePermission() {
        try {
            if (navigator.permissions && typeof navigator.permissions.query === 'function') {
                const permissionStatus = await navigator.permissions.query({ name: 'microphone' });
                console.log(`Mic perm status: ${permissionStatus.state}`);
                if (permissionStatus.state === 'granted') return true;
                if (permissionStatus.state === 'denied') {
                    this.reportPermissionError(new Error('Permission denied by user'), 'initial check');
                    return false;
                }
                console.log("Mic perm state is 'prompt'. Proceeding to request via iframe.");
            } else {
                console.warn("Permissions API missing or query unavailable. Proceeding to request via iframe (fallback).");
            }

            return new Promise<boolean>(async (resolve) => {
                let listenerInstalled = false;
                const messageListener = (message: { type?: string; status?: string }) => {
                    if (message && message.type === "micPermissionResult") {
                        console.log("Received perm result from iframe:", message.status);
                        if (listenerInstalled) {
                            chrome.runtime.onMessage.removeListener(messageListener);
                        }
                        if (message.status === "granted") {
                            this.speakText('Access granted.').catch(e => console.error("Speak error:", e));
                            resolve(true);
                        } else {
                            this.reportPermissionError(new Error('Permission not granted via prompt'), 'prompt response');
                            resolve(false);
                        }
                    }
                };

                try {
                    chrome.runtime.onMessage.addListener(messageListener);
                    listenerInstalled = true;

                    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                    if (!tab || !tab.id) throw new Error("Could not find active tab.");

                    try {
                        await chrome.scripting.executeScript({
                            target: { tabId: tab.id },
                            files: ['content-scripts/permission.js']
                        });
                        console.log(`Script injected into tab ${tab.id}.`);
                    } catch (injectionError) {
                        let consoleMsg = `Script inject failed for tab ${tab.id}.`;
                        const injectionMessage = injectionError instanceof Error ? injectionError.message : String(injectionError);
                        if (injectionMessage.includes("Could not establish connection") || injectionMessage.includes("Cannot access contents of url") || injectionMessage.includes("Frame with ID")) {
                            consoleMsg += " (May be restricted page)";
                        }
                        console.error(consoleMsg, injectionError);
                        throw new Error(`Script inject failed: ${injectionMessage}`);
                    }

                    console.log(`Sending perm request to tab ${tab.id}...`);
                    await chrome.tabs.sendMessage(tab.id, { action: "requestMicPermission" });
                    console.log("Perm request sent.");
                    this.speakText('Please allow microphone access.').catch(e => console.error("Speak error:", e));

                } catch (error) {
                    this.reportPermissionError(error, 'prompt request attempt');
                    if (listenerInstalled) chrome.runtime.onMessage.removeListener(messageListener);
                    resolve(false);
                }
            });

        } catch (error) {
            this.reportPermissionError(error, 'initial check');
            return false;
        }
    }

    async toggleVoiceInput() {
        await this.initializationPromise;

        if (this.stt.isVoiceInputActive()) {
            this.stt.stop();
        } else {
            this.stopSpeaking();
            const hasPermission = await this.requestMicrophonePermission();
            if (hasPermission) {
                this.stt.start();
            }
        }
    }

    cleanup() {
        console.log("Cleaning up VoiceController...");
        this.stopSpeaking();
        this.stopThinkingSoundLoop();
        this.stt.cleanup();
    }

    isVoiceInputActive() {
        return this.stt.isVoiceInputActive();
    }
}
