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
      console.error('Settings/TTS init error:', error);
      this.state.settings = { ...defaultVoiceSettings };
      this.state.synthesis.selectedVoice = null;
    }
  }

  initializeSpeechSynthesis() {
    return new Promise((resolve, reject) => {
      if (!this.state.synthesis.instance) {
        console.error("TTS API missing.");
        return reject(new Error("TTS API unavailable."));
      }

      let timeoutId = null;
      const TIMEOUT_DURATION = 3000;

      const findAndSetVoice = () => {
        if (timeoutId) clearTimeout(timeoutId);

        this.state.synthesis.voices = this.state.synthesis.instance.getVoices();
        console.log('Available TTS voices:', this.state.synthesis.voices.map(v => ({ name: v.name, lang: v.lang })));

        if (this.state.synthesis.voices.length === 0) {
          console.warn('No TTS voices found immediately.');
          return reject(new Error('No TTS voices found.'));
        }

        const targetVoiceName = this.state.settings.ttsVoiceName;
        const targetLang = this.state.settings.ttsLanguage;
        let foundVoice = null;

        if (targetVoiceName) {
          console.log(`Attempting to find voice by name: "${targetVoiceName}"`);
          foundVoice = this.state.synthesis.voices.find(voice => voice.name === targetVoiceName);
          if (foundVoice) {
            console.log(`Found voice: ${foundVoice.name} (${foundVoice.lang})`);
          } else {
            console.warn(`Voice name "${targetVoiceName}" not found.`);
          }
        }

        if (!foundVoice) {
          console.log(targetVoiceName ? `Falling back to language: ${targetLang}` : `Finding voice by language: ${targetLang}`);
          foundVoice = this.state.synthesis.voices.find(voice => voice.lang === targetLang);

          if (!foundVoice && targetLang && targetLang.includes('-')) {
            const baseLang = targetLang.split('-')[0];
            console.log(`No exact match for ${targetLang}, trying variant: ${baseLang}-`);
            foundVoice = this.state.synthesis.voices.find(voice => voice.lang.startsWith(baseLang + '-'));
            if (!foundVoice) {
              console.log(`Trying base language: ${baseLang}`);
              foundVoice = this.state.synthesis.voices.find(voice => voice.lang === baseLang);
            }
          }
        }

        if (!foundVoice) {
          console.warn(`No specific voice found for ${targetLang}. Trying system default.`);
          foundVoice = this.state.synthesis.voices.find(voice => voice.lang === targetLang && voice.default);
        }

        if (!foundVoice) {
          console.warn(`No suitable voice for ${targetLang}. Falling back to en-US.`);
          foundVoice = this.state.synthesis.voices.find(voice => voice.lang === 'en-US');
          if (!foundVoice) {
            foundVoice = this.state.synthesis.voices.find(voice => voice.lang === 'en-US' && voice.default);
          }
        }

        if (!foundVoice) {
          console.warn(`Fallback en-US not found. Trying overall system default.`);
          foundVoice = this.state.synthesis.voices.find(voice => voice.default);
        }

        if (!foundVoice && this.state.synthesis.voices.length > 0) {
          console.warn(`No default voice. Using first available: ${this.state.synthesis.voices[0].name}`);
          foundVoice = this.state.synthesis.voices[0];
        }

        if (foundVoice) {
          console.log(`Selected TTS voice: ${foundVoice.name} (${foundVoice.lang})`);
          this.state.synthesis.selectedVoice = foundVoice;
          resolve();
        } else {
          console.error('No suitable TTS voice.');
          this.state.synthesis.selectedVoice = null;
          reject(new Error('No suitable TTS voice found.'));
        }
      };

      timeoutId = setTimeout(() => {
        console.warn(`TTS voice init timeout (${TIMEOUT_DURATION}ms). Checking now.`);
        timeoutId = null;
        findAndSetVoice();
      }, TIMEOUT_DURATION);

      const onVoicesChanged = () => {
        console.log("'voiceschanged' event fired.");
        findAndSetVoice();
      };

      const initialVoices = this.state.synthesis.instance.getVoices();
      if (initialVoices.length > 0) {
        console.log("TTS voices available immediately.");
        findAndSetVoice();
      } else {
        console.log("TTS voices not immediately available, waiting for event or timeout...");
        this.state.synthesis.instance.addEventListener('voiceschanged', onVoicesChanged, { once: true });
      }
    });
  }

  async speakText(text) {
    try {
      await this.state.synthesis.initializationPromise;
    } catch (initError) {
      console.error("TTS init failed, cannot speak:", initError);
      return Promise.reject(new Error("TTS not initialized."));
    }

    if (!this.state.synthesis.instance || !this.state.synthesis.selectedVoice) {
      console.error("TTS not ready or voice missing.");
      return Promise.reject(new Error("TTS voice unavailable."));
    }

    this.state.synthesis.speakingPromise = this.state.synthesis.speakingPromise
      .catch((prevError) => {
        console.warn("Previous speech ended:", prevError?.message);
      })
      .then(() => {
        if (!this.state.synthesis.instance || !this.state.synthesis.selectedVoice) {
          console.error("TTS state invalid before speak.");
          throw new Error("TTS state invalid.");
        }

        if (this.state.synthesis.isSpeaking) {
          console.log("Cancelling previous speech.");
          this.state.synthesis.instance.cancel();
        }

        return new Promise((resolve, reject) => {
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.voice = this.state.synthesis.selectedVoice;
          utterance.lang = this.state.synthesis.selectedVoice.lang;
          utterance.rate = 1.0;
          utterance.pitch = 1.0;
          utterance.volume = 1.0;

          console.log(`Speaking: "${text.substring(0, 50)}..."`);

          let hasStarted = false;
          let utteranceTimeout = null;

          const startTimeoutDuration = 20000;
          utteranceTimeout = setTimeout(() => {
            if (!hasStarted) {
              console.error(`Utterance start timeout (${startTimeoutDuration}ms). Cancelling.`);
              this.state.synthesis.instance?.cancel();
              this.state.synthesis.isSpeaking = false;
              reject(new Error("Speech start timeout."));
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
              console.log("Speech interrupted.");
            } else {
              console.error('TTS error:', event.error);
              let errorMsg = event.error || 'Unknown TTS error';
              if (event.error === 'synthesis-failed') {
                errorMsg = "Synthesis failed.";
              } else if (event.error === 'audio-busy') {
                errorMsg = "Audio busy.";
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
            console.error("TTS instance lost.");
            reject(new Error("TTS instance lost."));
            return;
          }

          this.state.synthesis.instance.speak(utterance);
        });
      })
      .catch(error => {
        console.error("speakText chain error:", error);
        this.state.synthesis.isSpeaking = false;
      });

    return this.state.synthesis.speakingPromise;
  }

  stopSpeaking() {
    if (this.state.synthesis.instance && (this.state.synthesis.instance.speaking || this.state.synthesis.instance.pending)) {
      console.log("Stopping speech synthesis...");
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
      console.error("TTS init failed.", error);
    }

    this.initializeVoiceInput();

    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'local' && changes[voiceSettingsStorageKey]) {
        console.log('Voice settings changed, reloading...');
        this.loadSettingsAndInitTTS().then(() => {
          if (this.state.input.recognition) {
            const newSttLang = this.state.settings.sttLanguage;
            if (this.state.input.recognition.lang !== newSttLang) {
              console.log(`Updating STT language to: ${newSttLang}`);
              if (this.state.input.active) {
                this.stopVoiceInput();
              }
              this.initializeVoiceInput();
            }
          } else {
            this.initializeVoiceInput();
          }
        }).catch(err => {
          console.error("Settings reload error:", err);
        });
      }
    });
  }

  initializeVoiceInput() {
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      console.error('STT not supported.');
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
      console.log(`Updating STT language to: ${targetSttLang}`);
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
            console.log("Silence detected.");
            this.stopVoiceInput();
          }
        }, 500);
      };

      recognition.onerror = (event) => {
        console.error('STT error:', event.error);
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

  reportPermissionError(error, context) {
    const prefix = `Mic perm ${context} error`;
    console.error(`${prefix}:`, error);

    let userMessage = 'Microphone error.';
    let speakMessage = 'Microphone error.';

    const errorMessage = error.message || '';

    if (context === 'initial check') {
      if (errorMessage.includes('Permission denied by user')) {
        userMessage = 'Microphone access denied.';
        speakMessage = 'Access denied.';
      } else if (errorMessage.includes('No active tab found')) {
        userMessage = 'Could not find active tab.';
        speakMessage = 'No active tab.';
      } else if (errorMessage.includes('Permissions API missing')) {
        userMessage = 'Cannot check permission status.';
        speakMessage = 'Checking error.';
      } else {
        userMessage = `Error during permission check: ${errorMessage}`;
        speakMessage = 'Check error.';
      }
    } else if (context === 'prompt response') {
      userMessage = 'Microphone access not granted.';
      speakMessage = 'Access not granted.';
    } else if (context === 'prompt request attempt') {
      if (errorMessage.includes("Could not establish connection") || errorMessage.includes("Cannot access contents of url") || errorMessage.includes("Frame with ID")) {
        userMessage = 'Please try turning on Voice Input on a valid website.';
        speakMessage = 'Please try turning on Voice Input on a valid website.';
      } else if (errorMessage.includes("Script inject failed")) {
        userMessage = `Please try turning on Voice Input on a valid website.`;
        speakMessage = 'Please try turning on Voice Input on a valid website.';
      } else if (errorMessage.includes("Could not find active tab")) {
        userMessage = 'Could not find active tab.';
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

      return new Promise(async (resolve) => {
        let listenerInstalled = false;
        const messageListener = (message, sender, sendResponse) => {
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
              files: ['permission/permissionContent.js']
            });
            console.log(`Script injected into tab ${tab.id}.`);
          } catch (injectionError) {
            let consoleMsg = `Script inject failed for tab ${tab.id}.`;
            if (injectionError.message.includes("Could not establish connection") || injectionError.message.includes("Cannot access contents of url") || injectionError.message.includes("Frame with ID")) {
              consoleMsg += " (May be restricted page)";
            }
            console.error(consoleMsg, injectionError);
            throw new Error(`Script inject failed: ${injectionError.message}`);
          }

          console.log(`Sending perm request to tab ${tab.id}...`);
          await chrome.tabs.sendMessage(tab.id, { action: "requestMicPermission" });
          console.log("Perm request sent.");
          this.callbacks.appendMessage?.('system', 'Please allow microphone access.');
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
    await this.state.synthesis.initializationPromise;

    if (!this.state.input.recognition) {
      this.initializeVoiceInput();
      if (!this.state.input.recognition) {
        console.error("Toggle failed: STT init failed.");
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
        console.error("STT engine missing.");
        this.initializeVoiceInput();
        if (!this.state.input.recognition) {
          console.error("STT re-init failed.");
          return;
        }
      }

      if (this.state.input.recognition.lang !== this.state.settings.sttLanguage) {
        console.log(`Updating STT language to ${this.state.settings.sttLanguage}.`);
        this.state.input.recognition.lang = this.state.settings.sttLanguage;
      }

      console.log('Starting STT with lang:', this.state.input.recognition.lang);
      this.state.input.recognition.start();

    } catch (error) {
      if (error.name === 'InvalidStateError') {
        console.warn("STT start failed: InvalidStateError.");
        if (!this.state.input.active) {
          this.callbacks.updateVoiceInputButtonState?.(false);
        }
      } else if (error.name === 'NotAllowedError') {
        console.error("STT start failed: Perm denied.");
        this.reportPermissionError(new Error('Permission denied during start'), 'start attempt');
      }
      else {
        console.error('STT start failed:', error);
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
        console.log("Stopping STT recognition...");
        this.state.input.recognition.stop();
        this.state.input.active = false;
        this.callbacks.updateVoiceInputButtonState?.(false);
        const userInput = document.getElementById('user-input');
        if (userInput) userInput.placeholder = 'Type your message here...';

      } catch (error) {
        if (error.name === 'InvalidStateError') {
          console.warn("STT stop failed: InvalidStateError.");
          this.state.input.active = false;
          this.callbacks.updateVoiceInputButtonState?.(false);
          const userInput = document.getElementById('user-input');
          if (userInput) userInput.placeholder = 'Type your message here...';
        } else {
          console.error('STT stop failed:', error);
        }
      }
    } else {
      console.log("STT stop called but not active.");
      this.callbacks.updateVoiceInputButtonState?.(false);
      const userInput = document.getElementById('user-input');
      if (userInput) userInput.placeholder = 'Type your message here...';
    }
  }

  cleanup() {
    console.log("Cleaning up VoiceController...");
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