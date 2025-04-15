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

    this.state.synthesis.initializationPromise = this.loadSettings();
  }

  async loadSettings() {
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

  setCallbacks(callbacks) {
    Object.assign(this.callbacks, callbacks);
  }

  async initializeAll() {
    await this.state.synthesis.initializationPromise;

    this.initializeVoiceInput();

    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'local' && changes[voiceSettingsStorageKey]) {
        console.log('Voice settings changed in storage, reloading...');
        this.loadSettings().then(() => {
          if (this.state.input.recognition) {
            if (this.state.input.recognition.lang !== this.state.settings.sttLanguage) {
              console.log(`Updating STT language to: ${this.state.settings.sttLanguage} after settings change.`);
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
    if (!('webkitSpeechRecognition' in window)) {
      console.error('Speech recognition not supported');
      return;
    }

    if (this.state.input.recognition && this.state.input.recognition.lang === this.state.settings.sttLanguage) {
      return;
    }

    if (this.state.input.recognition) {
      if (this.state.input.active) {
        this.stopVoiceInput();
      }
      console.log(`Updating existing STT instance language to: ${this.state.settings.sttLanguage}`);
      this.state.input.recognition.lang = this.state.settings.sttLanguage;
    } else {
      console.log(`Initializing STT with language: ${this.state.settings.sttLanguage}`);
      const recognition = new webkitSpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = this.state.settings.sttLanguage;

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
      };
      this.state.input.recognition = recognition;
    }
  }

  initializeSpeechSynthesis() {
    return new Promise((resolve, reject) => {
      if (!this.state.synthesis.instance) {
        console.error("SpeechSynthesis API not available.");
        return reject(new Error("SpeechSynthesis API not available."));
      }

      let timeoutId = null;

      const findAndSetVoice = () => {
        if (timeoutId) clearTimeout(timeoutId);

        this.state.synthesis.voices = this.state.synthesis.instance.getVoices();
        console.log('Available TTS voices:', this.state.synthesis.voices.map(v => ({ name: v.name, lang: v.lang })));

        if (this.state.synthesis.voices.length === 0) {
          console.error('No TTS voices found even after trying.');
          return reject(new Error('No TTS voices found.'));
        }

        const targetLang = this.state.settings.ttsLanguage;
        console.log(`Attempting to find TTS voice for language: ${targetLang}`);
        let foundVoice = this.state.synthesis.voices.find(voice => voice.lang === targetLang);

        if (!foundVoice && targetLang && targetLang.includes('-')) {
          const baseLang = targetLang.split('-')[0];
          console.log(`No exact match for ${targetLang}, trying base language: ${baseLang}`);
          foundVoice = this.state.synthesis.voices.find(voice => voice.lang.startsWith(baseLang + '-'));
          if (!foundVoice) {
            foundVoice = this.state.synthesis.voices.find(voice => voice.lang === baseLang);
          }
        }

        if (!foundVoice) {
          console.warn(`No suitable voice found for ${targetLang} or base language. Falling back to en-US.`);
          foundVoice = this.state.synthesis.voices.find(voice => voice.lang === 'en-US');
        }

        if (!foundVoice && this.state.synthesis.voices.length > 0) {
          console.warn(`Fallback to en-US failed. Using the first available voice: ${this.state.synthesis.voices[0].name}`);
          foundVoice = this.state.synthesis.voices[0];
        }

        if (foundVoice) {
          console.log(`Selected TTS voice: ${foundVoice.name} (${foundVoice.lang})`);
          this.state.synthesis.selectedVoice = foundVoice;
          resolve();
        } else {
          console.error('Could not find any suitable TTS voice.');
          this.state.synthesis.selectedVoice = null;
          reject(new Error('No suitable TTS voice found.'));
        }
      };

      const TIMEOUT_DURATION = 3000;
      timeoutId = setTimeout(() => {
        console.error(`TTS voice initialization timed out after ${TIMEOUT_DURATION}ms.`);
        this.state.synthesis.instance?.removeEventListener('voiceschanged', onVoicesChanged);
        reject(new Error('TTS voice initialization timed out.'));
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
        console.log("TTS voices not immediately available, waiting for 'voiceschanged' event...");
        this.state.synthesis.instance.addEventListener('voiceschanged', onVoicesChanged, { once: true });
      }
    });
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

  async speakText(text) {
    try {
      await this.state.synthesis.initializationPromise;
    } catch (initError) {
      console.error("Cannot speak text because TTS initialization failed:", initError);
      return Promise.reject(new Error("TTS not initialized, cannot speak."));
    }


    if (!this.state.synthesis.instance || !this.state.synthesis.selectedVoice) {
      console.error("Speech synthesis not ready or no voice selected, even after initialization wait.");
      return Promise.reject(new Error("TTS voice not available."));
    }

    this.state.synthesis.speakingPromise = this.state.synthesis.speakingPromise
      .catch(() => { })
      .then(() => {
        if (this.state.synthesis.isSpeaking) {
          console.log("Cancelling previous speech before starting new one.");
          this.state.synthesis.instance.cancel();
        }

        if (!this.state.synthesis.instance || !this.state.synthesis.selectedVoice) {
          console.error("TTS Instance or Voice became invalid before speak call.");
          return Promise.reject(new Error("TTS Instance or Voice became invalid"));
        }

        return new Promise((resolve, reject) => {
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.voice = this.state.synthesis.selectedVoice;
          utterance.lang = this.state.synthesis.selectedVoice.lang;
          utterance.rate = 1.0;
          utterance.pitch = 1.0;
          utterance.volume = 1.0;

          console.log(`Attempting to speak: "${text.substring(0, 30)}..." with voice: ${utterance.voice.name} (${utterance.lang})`);

          let hasStarted = false;

          utterance.onstart = () => {
            console.log("Speech started.");
            hasStarted = true;
            this.state.synthesis.isSpeaking = true;
          };

          utterance.onend = () => {
            if (hasStarted) {
              console.log("Speech finished.");
            } else {
              console.log("Speech 'onend' fired but 'onstart' did not (possibly cancelled before start).");
            }
            this.state.synthesis.isSpeaking = false;
            resolve();
          };

          utterance.onerror = (event) => {
            console.error('Speech synthesis error:', event.error);
            this.state.synthesis.isSpeaking = false;
            reject(new Error(event.error || 'Unknown speech synthesis error'));
          };

          if (!this.state.synthesis.instance) {
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
        return Promise.reject(error);
      });

    return this.state.synthesis.speakingPromise;
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

      console.log("Starting voice input recognition...");
      await this.state.input.recognition.start();

    } catch (error) {
      if (error.name === 'InvalidStateError') {
        console.warn("Attempted to start recognition in an invalid state (already started or stopping?).");
        if (!this.state.input.active) {
          this.callbacks.updateVoiceInputButtonState?.(false);
        }
      } else if (error.name === 'NotAllowedError') {
        console.error("Voice input start failed: Permission denied.");
      } else if (error.name === 'NoSpeech') {
        console.warn("Voice input start failed: No speech detected.");
        this.stopVoiceInput();
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

    if (this.state.input.silenceTimeout) {
      clearTimeout(this.state.input.silenceTimeout);
      this.state.input.silenceTimeout = null;
    }
  }

  stopSpeaking() {
    if (this.state.synthesis.instance && this.state.synthesis.isSpeaking) {
      console.log("Explicitly stopping speech synthesis...");
      this.state.synthesis.instance.cancel();
      this.state.synthesis.isSpeaking = false;
    }
    this.state.synthesis.speakingPromise = Promise.resolve();
  }

  cleanup() {
    console.log("Cleaning up VoiceController resources...");
    this.stopSpeaking();
    this.stopVoiceInput();
  }

  isVoiceInputActive() {
    return this.state.input.active;
  }
}