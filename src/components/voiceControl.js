import { voiceSettingsStorageKey, defaultVoiceSettings } from '../option/voiceSettings.js';

export class VoiceController {
  constructor() {
    this.state = {
      input: {
        active: false,
        recognition: null,
        finalTranscript: '',
        silenceTimeout: null
      },
      synthesis: {
        instance: window.speechSynthesis,
        selectedVoice: null,
        voices: [],
        isSpeaking: false,
        speakingPromise: Promise.resolve(),
        initializationPromise: null
      },
      settings: { ...defaultVoiceSettings }
    };

    this.callbacks = {
      appendMessage: null,
      updateVoiceInputButtonState: null,
      handleSendMessage: null
    };

    this.state.synthesis.initializationPromise = this.loadSettingsAndInitTTS();
  }

  async loadSettingsAndInitTTS() {
    try {
      console.log('Loading voice settings...');
      const result = await chrome.storage.local.get(voiceSettingsStorageKey);
      this.state.settings = {
        ...defaultVoiceSettings,
        ...(result[voiceSettingsStorageKey] || {})
      };
      console.log('Voice settings loaded:', this.state.settings);

      console.log('Initializing speech synthesis...');
      await this.initializeSpeechSynthesis();
      console.log('Speech synthesis initialization finished.');

    } catch (error) {
      console.error('Error during settings load or TTS initialization:', error);
      this.state.settings = { ...defaultVoiceSettings };
      this.state.synthesis.selectedVoice = null;
    }
  }

  initializeSpeechSynthesis() {
    return new Promise((resolve, reject) => {
      if (!this.state.synthesis.instance) {
        console.error("SpeechSynthesis API not available.");
        return reject(new Error("SpeechSynthesis API not available."));
      }

      let timeoutId = null;
      const TIMEOUT_DURATION = 3000;

      const findAndSetVoice = () => {
        if (timeoutId) clearTimeout(timeoutId);

        this.state.synthesis.voices = this.state.synthesis.instance.getVoices();
        console.log('Available TTS voices:', this.state.synthesis.voices.map(v => ({ name: v.name, lang: v.lang })));

        if (this.state.synthesis.voices.length === 0) {
          console.warn('No TTS voices found immediately after event or timeout check.');
          if (!timeoutId) {
            return reject(new Error('No TTS voices found.'));
          }
          return reject(new Error('No TTS voices found.'));
        }

        const targetVoiceName = this.state.settings.ttsVoiceName;
        const targetLang = this.state.settings.ttsLanguage;
        let foundVoice = null;

        if (targetVoiceName) {
          console.log(`Attempting to find TTS voice by name: "${targetVoiceName}"`);
          foundVoice = this.state.synthesis.voices.find(voice => voice.name === targetVoiceName);
          if (foundVoice) {
            console.log(`Found voice by name: ${foundVoice.name} (${foundVoice.lang})`);
          } else {
            console.warn(`Saved voice name "${targetVoiceName}" not found.`);
          }
        }

        if (!foundVoice) {
          console.log(targetVoiceName ? `Falling back to find by language: ${targetLang}` : `Finding voice by language: ${targetLang}`);
          foundVoice = this.state.synthesis.voices.find(voice => voice.lang === targetLang);

          if (!foundVoice && targetLang && targetLang.includes('-')) {
            const baseLang = targetLang.split('-')[0];
            console.log(`No exact match for ${targetLang}, trying base language variants starting with: ${baseLang}-`);
            foundVoice = this.state.synthesis.voices.find(voice => voice.lang.startsWith(baseLang + '-'));
            if (!foundVoice) {
              console.log(`No regional variant found, trying exact base language: ${baseLang}`);
              foundVoice = this.state.synthesis.voices.find(voice => voice.lang === baseLang);
            }
          }
        }

        if (!foundVoice) {
          console.warn(`No specific voice found for language ${targetLang} or its base. Trying system default for this language.`);
          foundVoice = this.state.synthesis.voices.find(voice => voice.lang === targetLang && voice.default);
        }

        if (!foundVoice) {
          console.warn(`No suitable voice found for ${targetLang}. Falling back to en-US.`);
          foundVoice = this.state.synthesis.voices.find(voice => voice.lang === 'en-US');
          if (!foundVoice) {
            foundVoice = this.state.synthesis.voices.find(voice => voice.lang === 'en-US' && voice.default);
          }
        }

        if (!foundVoice) {
          console.warn(`Fallback en-US voice not found. Trying overall system default voice.`);
          foundVoice = this.state.synthesis.voices.find(voice => voice.default);
        }

        if (!foundVoice && this.state.synthesis.voices.length > 0) {
          console.warn(`No default voice found. Using the first available voice: ${this.state.synthesis.voices[0].name}`);
          foundVoice = this.state.synthesis.voices[0];
        }

        if (foundVoice) {
          console.log(`Selected TTS voice: ${foundVoice.name} (${foundVoice.lang})`);
          this.state.synthesis.selectedVoice = foundVoice;
          resolve();
        } else {
          console.error('Could not find ANY suitable TTS voice.');
          this.state.synthesis.selectedVoice = null;
          reject(new Error('No suitable TTS voice found.'));
        }
      };

      timeoutId = setTimeout(() => {
        console.warn(`TTS voice initialization check timed out after ${TIMEOUT_DURATION}ms. Checking available voices now.`);
        timeoutId = null;
        findAndSetVoice();
      }, TIMEOUT_DURATION);

      const onVoicesChanged = () => {
        console.log("System 'voiceschanged' event fired.");
        findAndSetVoice();
      };

      const initialVoices = this.state.synthesis.instance.getVoices();
      if (initialVoices.length > 0) {
        console.log("TTS voices available immediately.");
        findAndSetVoice();
      } else {
        console.log("TTS voices not immediately available, waiting for 'voiceschanged' event or timeout...");
        this.state.synthesis.instance.addEventListener('voiceschanged', onVoicesChanged, { once: true });
      }
    });
  }

  async speakText(text) {
    try {
      await this.state.synthesis.initializationPromise;
    } catch (initError) {
      console.error("Cannot speak text because TTS initialization failed:", initError);
      return Promise.reject(new Error("TTS not initialized, cannot speak."));
    }

    if (!this.state.synthesis.instance || !this.state.synthesis.selectedVoice) {
      console.error("Speech synthesis not ready or no voice selected, even after initialization wait.");
      return Promise.reject(new Error("TTS voice not available. Ensure TTS is enabled in your system/browser."));
    }

    this.state.synthesis.speakingPromise = this.state.synthesis.speakingPromise
      .catch((prevError) => {
        console.warn("Previous speech ended with error or was cancelled:", prevError?.message);
      })
      .then(() => {
        if (!this.state.synthesis.instance || !this.state.synthesis.selectedVoice) {
          console.error("TTS Instance or Voice became invalid before speak call.");
          throw new Error("TTS Instance or Voice became invalid");
        }

        if (this.state.synthesis.isSpeaking) {
          console.log("Cancelling previous speech before starting new one.");
          this.state.synthesis.instance.cancel();
        }

        return new Promise((resolve, reject) => {
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.voice = this.state.synthesis.selectedVoice;
          utterance.lang = this.state.synthesis.selectedVoice.lang;
          utterance.rate = 1.0;
          utterance.pitch = 1.0;
          utterance.volume = 1.0;

          console.log(`Attempting to speak: "${text.substring(0, 50)}..." with voice: ${utterance.voice.name} (${utterance.lang})`);

          let hasStarted = false;
          let utteranceTimeout = null;

          const startTimeoutDuration = 5000;
          utteranceTimeout = setTimeout(() => {
            if (!hasStarted) {
              console.error(`Utterance did not start within ${startTimeoutDuration}ms. Cancelling.`);
              this.state.synthesis.instance?.cancel();
              this.state.synthesis.isSpeaking = false;
              reject(new Error("Speech synthesis timed out starting."));
            }
          }, startTimeoutDuration);


          utterance.onstart = () => {
            if (utteranceTimeout) clearTimeout(utteranceTimeout);
            console.log("Speech started.");
            hasStarted = true;
            this.state.synthesis.isSpeaking = true;
          };

          utterance.onend = () => {
            if (utteranceTimeout) clearTimeout(utteranceTimeout);
            if (hasStarted) {
              console.log("Speech finished.");
            } else {
              console.log("Speech 'onend' fired but 'onstart' did not (likely cancelled).");
            }
            this.state.synthesis.isSpeaking = false;
            resolve();
          };

          utterance.onerror = (event) => {
            if (utteranceTimeout) clearTimeout(utteranceTimeout);
            if (event.error === 'interrupted') {
              console.log("Speech synthesis was interrupted (likely intentional).");
            } else {
              console.error('Speech synthesis error:', event.error);
              let errorMsg = event.error || 'Unknown speech synthesis error';
              if (event.error === 'synthesis-failed') {
                errorMsg = "Synthesis failed. The voice might be unavailable or the text too long.";
              } else if (event.error === 'audio-busy') {
                errorMsg = "Audio output is busy. Please try again.";
              }
              this.state.synthesis.isSpeaking = false;
              reject(new Error(errorMsg));
              return;
            }
            this.state.synthesis.isSpeaking = false;
            resolve();
          };

          if (!this.state.synthesis.instance) {
            if (utteranceTimeout) clearTimeout(utteranceTimeout);
            console.error("Synthesis instance lost just before speak()");
            reject(new Error("Synthesis instance lost"));
            return;
          }

          this.state.synthesis.instance.speak(utterance);
        });
      })
      .catch(error => {
        console.error("Error encountered in speakText promise chain:", error);
        this.state.synthesis.isSpeaking = false;
      });

    return this.state.synthesis.speakingPromise;
  }

  stopSpeaking() {
    if (this.state.synthesis.instance && this.state.synthesis.instance.speaking) {
      console.log("Explicitly stopping speech synthesis...");
      this.state.synthesis.instance.cancel();
      this.state.synthesis.isSpeaking = false;
    } else if (this.state.synthesis.instance && this.state.synthesis.instance.pending) {
      console.log("Explicitly clearing pending speech synthesis queue...");
      this.state.synthesis.instance.cancel();
      this.state.synthesis.isSpeaking = false;
    }
    this.state.synthesis.speakingPromise = Promise.resolve();
  }

  setCallbacks(callbacks) {
    Object.assign(this.callbacks, callbacks);
  }

  async initializeAll() {
    try {
      await this.state.synthesis.initializationPromise;
    } catch (error) {
      console.error("TTS Initialization failed, voice output might not work.", error);
    }

    this.initializeVoiceInput();

    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'local' && changes[voiceSettingsStorageKey]) {
        console.log('Voice settings changed in storage, reloading...');
        this.loadSettingsAndInitTTS().then(() => {
          if (this.state.input.recognition) {
            const newSttLang = this.state.settings.sttLanguage;
            if (this.state.input.recognition.lang !== newSttLang) {
              console.log(`Updating STT language to: ${newSttLang} after settings change.`);
              if (this.state.input.active) {
                this.stopVoiceInput();
              }
              this.initializeVoiceInput();
            }
          } else {
            this.initializeVoiceInput();
          }
        }).catch(err => {
          console.error("Error reloading settings after change:", err);
        });
      }
    });
  }

  initializeVoiceInput() {
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      console.error('Speech recognition not supported in this browser.');
      return;
    }

    const targetSttLang = this.state.settings.sttLanguage;

    if (this.state.input.recognition && this.state.input.recognition.lang === targetSttLang) {
      return;
    }

    if (this.state.input.recognition) {
      if (this.state.input.active) {
        this.stopVoiceInput();
      }
      console.log(`Updating existing STT instance language to: ${targetSttLang}`);
      this.state.input.recognition.lang = targetSttLang;
    } else {
      console.log(`Initializing STT with language: ${targetSttLang}`);
      const recognition = new SpeechRecognitionAPI();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = targetSttLang;

      recognition.onstart = () => {
        console.log('Voice input started');
        this.state.input.active = true;
        this.callbacks.updateVoiceInputButtonState?.(true);
        this.speakText('Voice Input Activated');
        const userInput = document.getElementById('user-input');
        if (userInput) userInput.placeholder = 'Listening...';
        this.state.input.finalTranscript = '';
      };

      recognition.onresult = (event) => {
        let interimTranscript = '';
        const userInput = document.getElementById('user-input');

        if (this.state.input.silenceTimeout) {
          clearTimeout(this.state.input.silenceTimeout);
        }

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            this.state.input.finalTranscript = transcript;
          } else {
            interimTranscript = transcript;
          }
        }

        if (userInput) {
          userInput.value = this.state.input.finalTranscript || interimTranscript;
        }

        this.state.input.silenceTimeout = setTimeout(() => {
          if (this.state.input.finalTranscript.trim()) {
            this.callbacks.handleSendMessage?.();
            this.stopVoiceInput();
          } else if (!interimTranscript) {
            console.log("Silence detected, stopping input.");
            this.stopVoiceInput();
          }
        }, 1200);
      };

      recognition.onerror = (event) => {
        console.error('Voice input error:', event.error);
        this.stopVoiceInput();
      };

      recognition.onend = () => {
        console.log('Voice input ended.');
        if (this.state.input.active) {
          this.stopVoiceInput();
        }
        if (this.state.input.silenceTimeout) {
          clearTimeout(this.state.input.silenceTimeout);
          this.state.input.silenceTimeout = null;
        }
      };

      this.state.input.recognition = recognition;
    }
    if (this.state.input.recognition && this.state.input.recognition.lang !== this.state.settings.sttLanguage) {
      this.state.input.recognition.lang = this.state.settings.sttLanguage;
    }
  }

  async requestMicrophonePermission() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      console.log("Microphone permission granted.");
      return true;
    } catch (error) {
      console.error('Microphone permission error:', error);
      const message = error.name === 'NotAllowedError' ?
        'Microphone access denied. Please enable it in extension settings or site settings.' :
        'Could not access microphone. Please ensure it is connected and allowed.';
      this.callbacks.appendMessage?.('system', message);
      this.speakText(message).catch(e => console.error("Failed to speak permission message:", e));
      return false;
    }
  }

  async toggleVoiceInput() {
    await this.state.synthesis.initializationPromise;

    if (!this.state.input.recognition) {
      this.initializeVoiceInput();
      if (!this.state.input.recognition) {
        console.error("Cannot toggle: Speech recognition failed to initialize.");
        return;
      }
    }

    if (this.state.input.active) {
      this.stopVoiceInput();
    } else {
      this.stopSpeaking();
      await this.startVoiceInput();
    }
  }

  async startVoiceInput() {
    try {
      const hasPermission = await this.requestMicrophonePermission();
      if (!hasPermission) return;

      if (this.state.input.active) {
        console.log("Voice input already active.");
        return;
      }

      if (!this.state.input.recognition) {
        console.error("Recognition engine not available.");
        this.initializeVoiceInput();
        if (!this.state.input.recognition) {
          console.error("Re-initialization of recognition engine failed.");
          return;
        }
      }

      if (this.state.input.recognition.lang !== this.state.settings.sttLanguage) {
        console.log(`Updating STT language to ${this.state.settings.sttLanguage} before starting.`);
        this.state.input.recognition.lang = this.state.settings.sttLanguage;
      }

      console.log('Starting recognition with lang:', this.state.input.recognition.lang);
      this.state.input.recognition.start();

    } catch (error) {
      if (error.name === 'InvalidStateError') {
        console.warn("Attempted to start recognition in an invalid state (already started or stopping?).");
        if (!this.state.input.active) {
          this.callbacks.updateVoiceInputButtonState?.(false);
        }
      } else if (error.name === 'NotAllowedError') {
        console.error("Voice input start failed: Permission denied.");
      }
      else {
        console.error('Failed to start voice input:', error);
        if (this.state.input.active) {
          this.stopVoiceInput();
        }
      }
    }
  }

  stopVoiceInput() {
    if (!this.state.input.recognition) return;

    if (this.state.input.silenceTimeout) {
      clearTimeout(this.state.input.silenceTimeout);
      this.state.input.silenceTimeout = null;
    }

    if (this.state.input.active) {
      try {
        console.log("Attempting to stop voice input recognition...");
        this.state.input.recognition.stop();
        this.state.input.active = false;
        this.callbacks.updateVoiceInputButtonState?.(false);
        const userInput = document.getElementById('user-input');
        if (userInput) userInput.placeholder = 'Type your message here...';

      } catch (error) {
        if (error.name === 'InvalidStateError') {
          console.warn("Attempted to stop recognition that was not active or already stopping.");
          this.state.input.active = false;
          this.callbacks.updateVoiceInputButtonState?.(false);
          const userInput = document.getElementById('user-input');
          if (userInput) userInput.placeholder = 'Type your message here...';
        } else {
          console.error('Error stopping voice input:', error);
        }
      }
    } else {
      console.log("StopVoiceInput called but input was not marked as active.");
      this.callbacks.updateVoiceInputButtonState?.(false);
      const userInput = document.getElementById('user-input');
      if (userInput) userInput.placeholder = 'Type your message here...';
    }
  }

  cleanup() {
    console.log("Cleaning up VoiceController resources...");
    this.stopSpeaking();
    this.stopVoiceInput();
    if (this.state.input.recognition) {
      this.state.input.recognition.onstart = null;
      this.state.input.recognition.onresult = null;
      this.state.input.recognition.onerror = null;
      this.state.input.recognition.onend = null;
    }
  }

  isVoiceInputActive() {
    return this.state.input.active;
  }
}