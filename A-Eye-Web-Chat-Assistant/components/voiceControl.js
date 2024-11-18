export class VoiceController {
  constructor() {
    this.state = {
      input: {
        active: false,
        recognition: null,
        finalTranscript: '',
        silenceTimeout: null
      },
      control: {
        active: false,
        recognition: null
      },
      synthesis: {
        instance: window.speechSynthesis,
        selectedVoice: null,
        voices: [],
        isSpeaking: false
      }
    };

    this.recognitionConfig = {
      input: {
        continuous: true,
        interimResults: true,
        lang: 'en-US'
      },
      control: {
        continuous: false,
        interimResults: false,
        lang: 'en-US'
      }
    };

    this.callbacks = {
      appendMessage: null,
      updateVoiceInputButtonState: null,
      handleScreenshot: null,
      handleRollingScreenshot: null,
      handleContentAnalysis: null,
      updateCurrentModel: null
    };
  }

  setCallbacks(callbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  initializeAll() {
    this.initializeVoiceControl();
    this.initializeVoiceInput();
    this.initializeSpeechSynthesis();
  }

  initializeVoiceControl() {
    if (!('webkitSpeechRecognition' in window)) {
      console.error('Speech recognition not supported');
      return;
    }

    const recognition = new webkitSpeechRecognition();
    Object.assign(recognition, this.recognitionConfig.control);

    recognition.onstart = () => {
      this.state.control.active = true;
      this.speakText('Voice control activated.');
      this.callbacks.appendMessage('system', 'Voice control activated.');
      this.callbacks.updateCurrentModel('Gemini Nano');
    };

    recognition.onresult = async (event) => {
      const command = event.results[event.results.length - 1][0].transcript.toLowerCase().trim();
      this.callbacks.appendMessage('system', `Detected command: "${command}"`);
      await this.handleVoiceCommand(command);
      setTimeout(() => this.stopVoiceControl(), 800);
    };

    recognition.onerror = (event) => {
      console.error('Voice control error:', event.error);
      this.stopVoiceControl();
    };

    recognition.onend = () => {
      if (this.state.control.active) {
        this.state.control.active = false;
      }
    };

    this.state.control.recognition = recognition;
  }

  initializeVoiceInput() {
    if (!('webkitSpeechRecognition' in window)) {
      console.error('Speech recognition not supported');
      return;
    }

    const recognition = new webkitSpeechRecognition();
    Object.assign(recognition, this.recognitionConfig.input);

    recognition.onstart = () => {
      this.state.input.active = true;
      this.callbacks.updateVoiceInputButtonState(true);
      document.getElementById('user-input').placeholder = 'Listening...';
      this.state.input.finalTranscript = '';
    };

    recognition.onresult = (event) => {
      let interimTranscript = '';
      if (this.state.input.silenceTimeout) clearTimeout(this.state.input.silenceTimeout);

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          this.state.input.finalTranscript = transcript;
        } else {
          interimTranscript = transcript;
        }
      }

      document.getElementById('user-input').value = this.state.input.finalTranscript || interimTranscript;

      this.state.input.silenceTimeout = setTimeout(() => {
        if (this.state.input.finalTranscript.trim()) {
          this.handleVoiceCommand(this.state.input.finalTranscript.trim());
          this.stopVoiceInput();
        }
      }, 600);
    };

    recognition.onerror = (event) => {
      console.error('Voice input error:', event.error);
      this.stopVoiceInput();
    };

    recognition.onend = () => this.stopVoiceInput();

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

  async handleVoiceCommand(command) {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'processVoiceCommand',
        text: command
      });

      if (response.error) {
        this.handleCommandError(response.error);
        return;
      }

      const result = response.response.trim();

      if (result.startsWith('window.open')) {
        this.handleUrlCommand(result);
      } else {
        await this.handleSystemCommand(result);
      }
    } catch (error) {
      this.handleCommandError(error.message);
    }
  }

  handleUrlCommand(result) {
    const urlMatch = result.match(/window\.open\('(.+?)'\)/);
    if (urlMatch?.[1]) {
      const url = urlMatch[1];
      chrome.tabs.create({ url });
      this.speakText('Opening website');
      this.callbacks.appendMessage('system', `Opening: ${url}`);
    }
  }

  async handleSystemCommand(command) {
    switch (command) {
      case 'screenshot':
        this.speakText('Taking screenshot');
        await this.callbacks.handleScreenshot();
        break;
      case 'rollingScreenshot':
        this.speakText('Taking rolling screenshot');
        await this.callbacks.handleRollingScreenshot();
        break;
      case 'analyze content':
        this.speakText('Analyzing content');
        await this.callbacks.handleContentAnalysis();
        break;
      default:
        this.callbacks.appendMessage('system', `Command not recognized: ${command}`);
        this.speakText("Command not recognized. Please try again.");
    }
  }

  handleCommandError(error) {
    this.callbacks.appendMessage('system', `Error: ${error}`);
    this.speakText("Sorry, there was an error processing your command.");
  }

  async requestMicrophonePermission() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      return true;
    } catch (error) {
      console.error('Microphone permission error:', error);
      this.callbacks.appendMessage('system', 'Please allow microphone access.');
      this.speakText('Please allow microphone access.');
      return false;
    }
  }

  speakText(text) {
    if (!this.state.synthesis.instance) return;

    if (this.state.synthesis.isSpeaking) {
      this.state.synthesis.instance.cancel();
    }

    const utterance = new SpeechSynthesisUtterance(text);
    Object.assign(utterance, {
      voice: this.state.synthesis.selectedVoice,
      lang: 'en-US',
      rate: 1.5,
      pitch: 1.0,
      volume: 1.0
    });

    this.state.synthesis.isSpeaking = true;
    utterance.onend = () => this.state.synthesis.isSpeaking = false;
    this.state.synthesis.instance.speak(utterance);
  }

  async toggleVoiceControl() {
    if (this.state.input.active) this.stopVoiceInput();
    if (!this.state.control.recognition) this.initializeVoiceControl();

    this.state.control.active ? this.stopVoiceControl() : await this.startVoiceControl();
  }

  async toggleVoiceInput() {
    if (this.state.control.active) this.stopVoiceControl();
    if (!this.state.input.recognition) this.initializeVoiceInput();

    this.state.input.active ? this.stopVoiceInput() : await this.startVoiceInput();
  }

  async startVoiceControl() {
    try {
      const hasPermission = await this.requestMicrophonePermission();
      if (!hasPermission) return;

      await this.state.control.recognition.start();
      this.state.control.active = true;
      this.callbacks.updateCurrentModel('Gemini Nano');
    } catch (error) {
      console.error('Failed to start voice control:', error);
      this.callbacks.appendMessage('system', 'Failed to start voice control');
      this.stopVoiceControl();
    }
  }

  stopVoiceControl() {
    if (!this.state.control.recognition) return;

    try {
      this.state.control.recognition.stop();
      this.state.control.active = false;
    } catch (error) {
      console.error('Error stopping voice control:', error);
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

  cleanup() {
    if (this.state.synthesis.instance && this.state.synthesis.isSpeaking) {
      this.state.synthesis.instance.cancel();
      this.state.synthesis.isSpeaking = false;
    }
  }

  isVoiceInputActive() {
    return this.state.input.active;
  }

  isVoiceControlActive() {
    return this.state.control.active;
  }
}