import { playStartSound } from './soundEffects.ts';

type RecognitionResult = { isFinal: boolean; [index: number]: { transcript: string } };
type RecognitionEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> };
type Recognition = {
    continuous: boolean; interimResults: boolean; lang: string;
    onstart: (() => void) | null; onresult: ((event: RecognitionEvent) => void) | null;
    onerror: ((event: { error: string }) => void) | null; onend: (() => void) | null;
    start(): void; stop(): void;
};
type SpeechWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
type Callbacks = { updateTranscript?: (text: string) => void; updateVoiceInputButtonState?: (active: boolean) => void; handleSendMessage?: () => void };

export class STTController {
    active: boolean;
    private recognition: Recognition | null;
    private finalTranscript: string;
    private silenceTimeout: ReturnType<typeof setTimeout> | null;
    private callbacks: Callbacks;
    constructor() {
        this.active = false;
        this.recognition = null;
        this.finalTranscript = '';
        this.silenceTimeout = null;
        this.callbacks = {};
    }

    setCallbacks(callbacks: Callbacks) {
        Object.assign(this.callbacks, callbacks);
    }

    initialize(settings: { sttLanguage: string }) {
        const speechWindow = window as SpeechWindow;
        const SpeechRecognitionAPI = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;

        if (!SpeechRecognitionAPI) {
            console.error('STT not supported.');
            return;
        }

        const targetSttLang = settings.sttLanguage;
        if (this.recognition && this.recognition.lang === targetSttLang) {
            return;
        }

        if (this.recognition) {
            if (this.active) {
                this.stop();
            }
        } else {
            console.log(`Initializing STT with language: ${targetSttLang}`);
            this.recognition = new SpeechRecognitionAPI();
            this.recognition.continuous = true;
            this.recognition.interimResults = true;
            this.recognition.lang = targetSttLang;

            this.recognition.onstart = this._onStart.bind(this);
            this.recognition.onresult = this._onResult.bind(this);
            this.recognition.onerror = this._onError.bind(this);
            this.recognition.onend = this._onEnd.bind(this);
        }
        
        if (this.recognition.lang !== targetSttLang) {
            console.log(`Updating STT language to: ${targetSttLang}`);
            this.recognition.lang = targetSttLang;
        }
    }

    _onStart() {
        console.log('Voice input started');
        this.active = true;
        this.callbacks.updateVoiceInputButtonState?.(true);
        playStartSound();
        const userInput = document.getElementById('user-input') as HTMLTextAreaElement | null;
        if (userInput) userInput.placeholder = 'Listening...';
        this.finalTranscript = '';
    }

    _onResult(event: RecognitionEvent) {
        let interimTranscript = '';
        const userInput = document.getElementById('user-input') as HTMLTextAreaElement | null;

        if (this.silenceTimeout) {
            clearTimeout(this.silenceTimeout);
        }

        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                this.finalTranscript = transcript;
            } else {
                interimTranscript = transcript;
            }
        }

        if (this.callbacks.updateTranscript) {
            this.callbacks.updateTranscript(this.finalTranscript || interimTranscript);
        } else if (userInput) {
            userInput.value = this.finalTranscript || interimTranscript;
        }

        this.silenceTimeout = setTimeout(() => {
            if (this.finalTranscript.trim()) {
                this.callbacks.handleSendMessage?.();
                this.stop();
            } else if (!interimTranscript) {
                console.log("Silence detected.");
                this.stop();
            }
        }, 100);
    }

    _onError(event: { error: string }) {
        console.error('STT error:', event.error);
        this.stop();
    }

    _onEnd() {
        console.log('Voice input ended.');
        this.active = false;
        if (this.silenceTimeout) {
            clearTimeout(this.silenceTimeout);
            this.silenceTimeout = null;
        }
        this.callbacks.updateVoiceInputButtonState?.(false);
        const userInput = document.getElementById('user-input') as HTMLTextAreaElement | null;
        if (userInput) {
            userInput.placeholder = 'Type your message here...';
            userInput.focus();
        }
    }

    start() {
        if (this.active || !this.recognition) {
            return;
        }
        try {
            console.log('Starting STT with lang:', this.recognition.lang);
            this.recognition.start();
        } catch (error) {
            if (error instanceof Error && error.name === 'InvalidStateError') {
                console.warn("STT start failed: InvalidStateError (already started).");
            } else {
                console.error('STT start failed:', error);
                this.stop();
            }
        }
    }

    stop() {
        if (!this.active || !this.recognition) {
            return;
        }
        try {
            this.recognition.stop();
        } catch (error) {
            if (error instanceof Error && error.name === 'InvalidStateError') {
                console.warn("STT stop failed: InvalidStateError (already stopped).");
            } else {
                console.error('STT stop failed:', error);
            }
        }
    }

    isVoiceInputActive() {
        return this.active;
    }

    cleanup() {
        this.stop();
        if (this.recognition) {
            this.recognition.onstart = null;
            this.recognition.onresult = null;
            this.recognition.onerror = null;
            this.recognition.onend = null;
            this.recognition = null;
        }
    }
}
