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
      }
    };

    this.callbacks = {
      appendMessage: null,
      updateVoiceInputButtonState: null,
      handleSendMessage: null
    };
  }

  setCallbacks(callbacks) {
    Object.assign(this.callbacks, callbacks);
  }

  initializeAll() {
    this.initializeVoiceInput();
    this.initializeSpeechSynthesis();
  }

  initializeVoiceInput() {
    if (!('webkitSpeechRecognition' in window)) {
      console.error('Speech recognition not supported');
      return;
    }

    const recognition = new webkitSpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      console.log('Voice input started');
      this.state.input.active = true;
      this.callbacks.updateVoiceInputButtonState(true);
      document.getElementById('user-input').placeholder = 'Listening...';
      this.state.input.finalTranscript = '';
    };

    recognition.onresult = (event) => {
      let interimTranscript = '';

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

      document.getElementById('user-input').value =
        this.state.input.finalTranscript || interimTranscript;

      this.state.input.silenceTimeout = setTimeout(() => {
        if (this.state.input.finalTranscript.trim()) {
          this.callbacks.handleSendMessage();
          this.stopVoiceInput();
        }
      }, 600);
    };

    recognition.onerror = (event) => {
      console.error('Voice input error:', event.error);
      this.stopVoiceInput();
    };

    recognition.onend = () => {
      console.log('Voice input ended');
      this.stopVoiceInput();
    };

    this.state.input.recognition = recognition;
  }

  initializeSpeechSynthesis() {
    if (!this.state.synthesis.instance) return;

    this.state.synthesis.instance.addEventListener('voiceschanged', () => {
      this.state.synthesis.voices = this.state.synthesis.instance.getVoices();
      this.state.synthesis.selectedVoice = this.state.synthesis.voices.find(
        voice => voice.lang.includes('en-US')
      );
    });
  }

  async requestMicrophonePermission() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      return true;
    } catch (error) {
      console.error('Microphone permission error:', error);
      this.callbacks.appendMessage('system', 'Please allow microphone access.');
      this.callbacks.appendMessage('system', 'Introduction: Right-click extension icon > View web permissions > Find Microphone and set it to Allow');
      this.speakText('Please allow microphone access.');
      return false;
    }
  }

  speakText(text) {
    if (!this.state.synthesis.instance) return;

    if (this.state.synthesis.isSpeaking) {
      this.state.synthesis.instance.cancel();
    }

    this.state.synthesis.speakingPromise = new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.voice = this.state.synthesis.selectedVoice;
      utterance.lang = 'en-US';
      utterance.rate = 1.3;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      this.state.synthesis.isSpeaking = true;

      utterance.onend = () => {
        this.state.synthesis.isSpeaking = false;
        resolve();
      };

      utterance.onerror = () => {
        this.state.synthesis.isSpeaking = false;
        resolve();
      };

      this.state.synthesis.instance.speak(utterance);
    });

    return this.state.synthesis.speakingPromise;
  }

  async toggleVoiceInput() {
    if (!this.state.input.recognition) {
      this.initializeVoiceInput();
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

      await this.state.input.recognition.start();
      this.state.input.active = true;
      this.callbacks.updateVoiceInputButtonState(true);
      this.callbacks.appendMessage('system', 'Voice input activated');
      this.speakText('Voice input activated');
    } catch (error) {
      console.error('Failed to start voice input:', error);
      this.stopVoiceInput();
    }
  }

  stopVoiceInput() {
    if (!this.state.input.recognition) return;

    try {
      this.state.input.recognition.stop();
      this.state.input.active = false;
      this.callbacks.updateVoiceInputButtonState(false);
      document.getElementById('user-input').placeholder = 'Type your message here...';
    } catch (error) {
      console.error('Error stopping voice input:', error);
    }
  }

  stopSpeaking() {
    if (this.state.synthesis.instance && this.state.synthesis.isSpeaking) {
      console.log("Explicitly stopping speech synthesis...");
      this.state.synthesis.instance.cancel();
      this.state.synthesis.isSpeaking = false;
    }
  }

  cleanup() {
    if (this.state.synthesis.instance && this.state.synthesis.isSpeaking) {
      this.state.synthesis.instance.cancel();
      this.state.synthesis.isSpeaking = false;
    }
  }

  isVoiceInputActive() {
    return this.state.input.active; a
  }

}