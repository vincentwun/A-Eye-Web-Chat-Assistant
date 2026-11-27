export class TTSController {
    private instance: SpeechSynthesis;
    private selectedVoice: SpeechSynthesisVoice | null;
    private voices: SpeechSynthesisVoice[];
    isSpeaking: boolean;
    private speakingPromise: Promise<void>;
    private initializationPromise: Promise<void> | null;
    constructor() {
        this.instance = window.speechSynthesis;
        this.selectedVoice = null;
        this.voices = [];
        this.isSpeaking = false;
        this.speakingPromise = Promise.resolve();
        this.initializationPromise = null;
    }

    initialize(settings: { ttsVoiceName?: string | null; ttsLanguage?: string }) {
        this.initializationPromise = this._initializeSpeechSynthesis(settings);
        return this.initializationPromise;
    }

    _initializeSpeechSynthesis(settings: { ttsVoiceName?: string | null; ttsLanguage?: string }): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            if (!this.instance) {
                console.error("TTS API missing.");
                return reject(new Error("TTS API unavailable."));
            }

            const MAX_WAIT_TIME = 5000;
            const POLLING_INTERVAL = 100;
            let pollingId: ReturnType<typeof setInterval>;
            let timeoutId: ReturnType<typeof setTimeout>;

            const cleanup = () => {
                clearInterval(pollingId);
                clearTimeout(timeoutId);
            };

            const findAndSetVoice = () => {
                this.voices = this.instance.getVoices();
                console.log('Available TTS voices:', this.voices.map(v => ({ name: v.name, lang: v.lang })));

                const targetVoiceName = settings.ttsVoiceName;
                const targetLang = settings.ttsLanguage;
                let foundVoice: SpeechSynthesisVoice | undefined;

                if (targetVoiceName) {
                    console.log(`Attempting to find voice by name: "${targetVoiceName}"`);
                    foundVoice = this.voices.find(voice => voice.name === targetVoiceName);
                    if (foundVoice) {
                        console.log(`Found voice: ${foundVoice.name} (${foundVoice.lang})`);
                    } else {
                        console.warn(`Voice name "${targetVoiceName}" not found.`);
                    }
                }

                if (!foundVoice) {
                    console.log(targetVoiceName ? `Falling back to language: ${targetLang}` : `Finding voice by language: ${targetLang}`);
                    foundVoice = this.voices.find(voice => voice.lang === targetLang);

                    if (!foundVoice && targetLang && targetLang.includes('-')) {
                        const baseLang = targetLang.split('-')[0];
                        console.log(`No exact match for ${targetLang}, trying variant: ${baseLang}-`);
                        foundVoice = this.voices.find(voice => voice.lang.startsWith(baseLang + '-'));
                        if (!foundVoice) {
                            console.log(`Trying base language: ${baseLang}`);
                            foundVoice = this.voices.find(voice => voice.lang === baseLang);
                        }
                    }
                }

                if (!foundVoice) {
                    console.warn(`No specific voice found for ${targetLang}. Trying system default.`);
                    foundVoice = this.voices.find(voice => voice.lang === targetLang && voice.default);
                }

                if (!foundVoice) {
                    console.warn(`No suitable voice for ${targetLang}. Falling back to en-US.`);
                    foundVoice = this.voices.find(voice => voice.lang === 'en-US');
                    if (!foundVoice) {
                        foundVoice = this.voices.find(voice => voice.lang === 'en-US' && voice.default);
                    }
                }

                if (!foundVoice) {
                    console.warn(`Fallback en-US not found. Trying overall system default.`);
                    foundVoice = this.voices.find(voice => voice.default);
                }

                if (!foundVoice && this.voices.length > 0) {
                    console.warn(`No default voice. Using first available: ${this.voices[0].name}`);
                    foundVoice = this.voices[0];
                }

                if (foundVoice) {
                    console.log(`Selected TTS voice: ${foundVoice.name} (${foundVoice.lang})`);
                    this.selectedVoice = foundVoice;
                    resolve();
                } else {
                    console.error('No suitable TTS voice.');
                    this.selectedVoice = null;
                    reject(new Error('No suitable TTS voice found.'));
                }
            };

            const attemptToInitialize = () => {
                const voices = this.instance.getVoices();
                if (voices.length > 0) {
                    cleanup();
                    console.log("TTS voices found, proceeding with initialization.");
                    findAndSetVoice();
                }
            };

            timeoutId = setTimeout(() => {
                cleanup();
                console.error(`TTS voice initialization timed out after ${MAX_WAIT_TIME}ms.`);
                reject(new Error("TTS initialization timed out."));
            }, MAX_WAIT_TIME);

            pollingId = setInterval(attemptToInitialize, POLLING_INTERVAL);
            attemptToInitialize();
        });
    }

    speakText(text: string) {
        if (!this.instance) {
            console.error("TTS API missing, cannot speak.");
            return Promise.reject(new Error("TTS API unavailable."));
        }

        this.speakingPromise = this.speakingPromise
            .catch((prevError) => {
                console.warn("Previous speech ended with error/cancel:", prevError?.message);
            })
            .then(() => this.initializationPromise)
            .then(() => {
                if (!this.selectedVoice) {
                    throw new Error("TTS voice unavailable after initialization.");
                }
                const voice = this.selectedVoice;

                return new Promise<void>((resolve, reject) => {
                    const utterance = new SpeechSynthesisUtterance(text);
                    utterance.voice = voice;
                    utterance.lang = voice.lang;
                    utterance.rate = 1.0;
                    utterance.pitch = 1.0;
                    utterance.volume = 1.0;

                    console.log(`Speaking: "${text.substring(0, 50)}..."`);

                    let hasStarted = false;
                    let utteranceTimeout: ReturnType<typeof setTimeout> | null = null;
                    const startTimeoutDuration = 10000;

                    utteranceTimeout = setTimeout(() => {
                        if (!hasStarted) {
                            console.error(`Utterance start timeout (${startTimeoutDuration}ms). Cancelling.`);
                            this.instance?.cancel();
                            this.isSpeaking = false;
                            reject(new Error("Speech start timeout."));
                        }
                    }, startTimeoutDuration);


                    utterance.onstart = () => {
                        if (utteranceTimeout) clearTimeout(utteranceTimeout);
                        console.log("Speech started.");
                        hasStarted = true;
                        this.isSpeaking = true;
                    };

                    utterance.onend = () => {
                        if (utteranceTimeout) clearTimeout(utteranceTimeout);
                        if (hasStarted) {
                            console.log("Speech finished normally.");
                        } else {
                            console.log("Speech 'onend' fired but 'onstart' did not (likely cancelled before starting).");
                        }
                        this.isSpeaking = false;
                        resolve();
                    };

                    utterance.onerror = (event) => {
                        if (utteranceTimeout) clearTimeout(utteranceTimeout);
                        this.isSpeaking = false;

                        if (event.error === 'interrupted' || event.error === 'canceled') {
                            console.log(`Speech interrupted/cancelled (Error: ${event.error}).`);
                            resolve();
                        } else {
                            console.error('TTS error:', event.error);
                            let errorMsg: string = event.error || 'Unknown TTS error';
                            if (event.error === 'synthesis-failed') {
                                errorMsg = "Synthesis failed.";
                            } else if (event.error === 'audio-busy') {
                                errorMsg = "Audio busy.";
                            }
                            reject(new Error(errorMsg));
                        }
                    };

                    if (!this.instance) {
                        if (utteranceTimeout) clearTimeout(utteranceTimeout);
                        this.isSpeaking = false;
                        reject(new Error("TTS instance lost before speak."));
                        return;
                    }

                    this.instance.speak(utterance);
                });
            })
            .catch(error => {
                console.error("speakText promise chain error:", error);
                this.isSpeaking = false;
                return Promise.reject(error);
            });

        return this.speakingPromise;
    }

    stopSpeaking() {
        if (this.instance && (this.instance.speaking || this.instance.pending)) {
            console.log("Stopping speech synthesis...");
            this.instance.cancel();
        }
    }
}
