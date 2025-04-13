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
        speakingPromise: Promise.resolve()
      },
      settings: { ...defaultVoiceSettings }
    };

    this.callbacks = {
      appendMessage: null,
      updateVoiceInputButtonState: null,
      handleSendMessage: null
    };
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.local.get(voiceSettingsStorageKey);
      this.state.settings = {
        ...defaultVoiceSettings,
        ...(result[voiceSettingsStorageKey] || {})
      };
      console.log('Voice settings loaded:', this.state.settings);
      this.initializeSpeechSynthesis();
    } catch (error) {
      console.error('Error loading voice settings:', error);
      this.state.settings = { ...defaultVoiceSettings };
    }
  }

  setCallbacks(callbacks) {
    Object.assign(this.callbacks, callbacks);
  }

  async initializeAll() {
    await this.loadSettings();
    this.initializeVoiceInput();

    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'local' && changes[voiceSettingsStorageKey]) {
        console.log('Voice settings changed in storage, reloading...');
        this.loadSettings();
        if (this.state.input.recognition && this.state.input.active) {
          this.stopVoiceInput();
        }
        this.initializeVoiceInput();
      }
    });
  }


  initializeVoiceInput() {
    if (this.state.input.recognition) {
      if (this.state.input.recognition.lang !== this.state.settings.sttLanguage) {
        console.log(`Updating STT language to: ${this.state.settings.sttLanguage}`);
        this.state.input.recognition.lang = this.state.settings.sttLanguage;
      }
      return;
    }

    if (!('webkitSpeechRecognition' in window)) {
      console.error('Speech recognition not supported');
      return;
    }

    console.log(`Initializing STT with language: ${this.state.settings.sttLanguage}`);
    const recognition = new webkitSpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = this.state.settings.sttLanguage;

    recognition.onstart = () => {
      console.log('Voice input started');
      this.state.input.active = true;
      this.callbacks.updateVoiceInputButtonState?.(true);
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
        } else {
          console.log("Silence detected with only interim results, stopping input.");
          this.stopVoiceInput();
        }
      }, 800);
    };

    recognition.onerror = (event) => {
      console.error('Voice input error:', event.error);
      this.stopVoiceInput();
    };

    recognition.onend = () => {
      console.log('Voice input ended');
      if (this.state.input.active) {
        this.stopVoiceInput();
      }
    };

    this.state.input.recognition = recognition;
  }

  initializeSpeechSynthesis() {
    if (!this.state.synthesis.instance) return;

    const updateVoices = () => {
      this.state.synthesis.voices = this.state.synthesis.instance.getVoices();
      console.log('Available TTS voices:', this.state.synthesis.voices.map(v => ({ name: v.name, lang: v.lang })));

      const targetLang = this.state.settings.ttsLanguage;
      console.log(`Attempting to find TTS voice for language: ${targetLang}`);

      let foundVoice = this.state.synthesis.voices.find(voice => voice.lang === targetLang);

      if (!foundVoice && targetLang.includes('-')) {
        const baseLang = targetLang.split('-')[0];
        console.log(`No exact match for ${targetLang}, trying base language: ${baseLang}`);
        foundVoice = this.state.synthesis.voices.find(voice => voice.lang.startsWith(baseLang + '-'));
        if (!foundVoice) {
          foundVoice = this.state.synthesis.voices.find(voice => voice.lang === baseLang);
        }
      }

      if (!foundVoice) {
        console.warn(`No suitable voice found for ${targetLang}. Falling back to en-US.`);
        foundVoice = this.state.synthesis.voices.find(voice => voice.lang === 'en-US');
      }

      if (!foundVoice && this.state.synthesis.voices.length > 0) {
        console.warn(`Fallback to en-US failed. Using the first available voice: ${this.state.synthesis.voices[0].name}`);
        foundVoice = this.state.synthesis.voices[0];
      }


      if (foundVoice) {
        console.log(`Selected TTS voice: ${foundVoice.name} (${foundVoice.lang})`);
        this.state.synthesis.selectedVoice = foundVoice;
      } else {
        console.error('No TTS voices available or selected.');
        this.state.synthesis.selectedVoice = null;
      }
    };

    this.state.synthesis.voices = this.state.synthesis.instance.getVoices();
    if (this.state.synthesis.voices.length > 0) {
      updateVoices();
    } else {
      this.state.synthesis.instance.addEventListener('voiceschanged', updateVoices, { once: true });
    }
  }


  async requestMicrophonePermission() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      return true;
    } catch (error) {
      console.error('Microphone permission error:', error);
      this.callbacks.appendMessage?.('system', 'Please allow microphone access.');
      this.callbacks.appendMessage?.('system', 'How to: Right-click extension icon > Options > Check Permissions.'); // Simplified instruction
      this.speakText('Please allow microphone access.');
      return false;
    }
  }

  speakText(text) {
    if (!this.state.synthesis.instance || !this.state.synthesis.selectedVoice) {
      console.error("Speech synthesis not ready or no voice selected.");
      this.initializeSpeechSynthesis();
      if (!this.state.synthesis.selectedVoice) {
        return Promise.reject("TTS voice not available.");
      }
    }


    if (this.state.synthesis.isSpeaking) {
      this.state.synthesis.instance.cancel();
    }

    this.state.synthesis.speakingPromise = this.state.synthesis.speakingPromise.then(() => {
      return new Promise((resolve, reject) => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.voice = this.state.synthesis.selectedVoice;
        utterance.lang = this.state.synthesis.selectedVoice.lang;
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        console.log(`Speaking with voice: ${utterance.voice.name} (${utterance.lang})`);
        this.state.synthesis.isSpeaking = true;

        utterance.onend = () => {
          console.log("Speech finished.");
          this.state.synthesis.isSpeaking = false;
          resolve();
        };

        utterance.onerror = (event) => {
          console.error('Speech synthesis error:', event.error);
          this.state.synthesis.isSpeaking = false;
          reject(event.error);
        };

        utterance.onstart = () => {
          console.log("Speech started.");
        };

        this.state.synthesis.instance.speak(utterance);
      });
    }).catch(error => {
      console.error("Error in speaking promise chain:", error);
      this.state.synthesis.isSpeaking = false;
    });

    return this.state.synthesis.speakingPromise;
  }


  async toggleVoiceInput() {
    if (!this.state.input.recognition) {
      this.initializeVoiceInput();
      if (!this.state.input.recognition) {
        console.error("Cannot toggle: Speech recognition not initialized.");
        return;
      }
    }

    if (this.state.input.active) {
      this.stopVoiceInput();
    } else {
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
        return;
      }

      await this.state.input.recognition.start();

    } catch (error) {
      if (error.name === 'InvalidStateError') {
        console.warn("Attempted to start recognition that was already active or ending.");
      } else {
        console.error('Failed to start voice input:', error);
      }
      if (this.state.input.active) {
        this.stopVoiceInput();
      }
    }
  }

  stopVoiceInput() {
    if (!this.state.input.recognition) return;

    try {
      if (this.state.input.active) {
        this.state.input.recognition.stop();
      }
      this.state.input.active = false;
      this.callbacks.updateVoiceInputButtonState?.(false);
      const userInput = document.getElementById('user-input');
      if (userInput) userInput.placeholder = 'Type your message here...';
      if (this.state.input.silenceTimeout) {
        clearTimeout(this.state.input.silenceTimeout);
      }
    } catch (error) {
      if (error.name === 'InvalidStateError') {
        console.warn("Attempted to stop recognition that was not active.");
        this.state.input.active = false;
        this.callbacks.updateVoiceInputButtonState?.(false);
        const userInput = document.getElementById('user-input');
        if (userInput) userInput.placeholder = 'Type your message here...';
      } else {
        console.error('Error stopping voice input:', error);
      }
    }
  }

  stopSpeaking() {
    if (this.state.synthesis.instance && this.state.synthesis.isSpeaking) {
      console.log("Explicitly stopping speech synthesis...");
      this.state.synthesis.instance.cancel();
    }
    this.state.synthesis.speakingPromise = Promise.resolve();
    this.state.synthesis.isSpeaking = false;
  }

  cleanup() {
    this.stopSpeaking();
    this.stopVoiceInput();
  }

  isVoiceInputActive() {
    return this.state.input.active;
  }

}