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

    this.commandMap = {
      'screenshot': {
        variants: ['take screenshot', 'take a screenshot', 'capture screen'],
        handler: null
      },
      'scrolling': {
        variants: ['take scrolling screenshot', 'take a scrolling screenshot', 'scrolling screenshot'],
        handler: null
      },
      'analyze': {
        variants: ['analyze content', 'analyse content', 'analyze page', 'analyse page',
          'analyze', 'analyse', 'content analysis'],
        handler: null
      }
    };

    this.callbacks = {
      appendMessage: null,
      updateVoiceInputButtonState: null,
      handleScreenshot: null,
      handleRollingScreenshot: null,
      handleContentAnalysis: null,
      performGoogleSearch: null,
      navigateToWebsite: null,
      handleSendMessage: null
    };
  }

  setCallbacks(callbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };

    this.commandMap.screenshot.handler = async () => {
      this.speakText('Taking screenshot');
      await this.callbacks.handleScreenshot();
    };
    this.commandMap.rolling.handler = async () => {
      this.speakText('Taking rolling screenshot');
      await this.callbacks.handleRollingScreenshot();
    };
    this.commandMap.analyze.handler = async () => {
      this.speakText('Analyzing content');
      await this.callbacks.handleContentAnalysis();
    };
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
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      console.log('Voice control started');
      this.state.control.active = true;
      this.speakText('Voice control activated.');
      this.callbacks.appendMessage('system', 'Voice control activated.');
    };

    recognition.onresult = async (event) => {
      const command = event.results[event.results.length - 1][0].transcript.toLowerCase().trim();
      this.callbacks.appendMessage('system', `Detected command: "${command}"`);
      console.log('Voice command received:', command);
      await this.handleVoiceCommand(command);

      setTimeout(() => {
        this.stopVoiceControl();
      }, 800);
    };

    recognition.onerror = (event) => {
      console.error('Voice control error:', event.error);
      this.stopVoiceControl();
    };

    recognition.onend = () => {
      if (this.state.control.active) {
        console.log('Voice control ended');
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

  async handleVoiceCommand(command) {
    console.log('Processing command:', command);

    const normalizeCommand = (cmd) => {
      return cmd
        .toLowerCase()
        .replace(/analyse/g, 'analyze')
        .trim();
    };

    const matchCommand = (input, target) => {
      const normalizedInput = normalizeCommand(input);
      return normalizedInput.includes(target) ||
        normalizedInput.replace(/\s+/g, '') === target.replace(/\s+/g, '');
    };

    const normalizedCommand = normalizeCommand(command);

    const searchMatch = normalizedCommand.match(/^search\s+(.+)$/i);
    if (searchMatch) {
      const searchQuery = searchMatch[1].trim();
      await this.callbacks.performGoogleSearch(searchQuery);
      return;
    }

    const websiteMatch = normalizedCommand.match(/go to (.*?)(?:\.com|$)/i);
    if (websiteMatch) {
      const website = websiteMatch[1].trim();
      await this.callbacks.navigateToWebsite(website);
      return;
    }

    for (const [key, { variants, handler }] of Object.entries(this.commandMap)) {
      if (variants.some(variant => matchCommand(normalizedCommand, variant))) {
        await handler();
        return;
      }
    }

    this.callbacks.appendMessage('system', `Command not recognized: "${command}"`);
    this.speakText("Command not recognized. Please try again.");
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
    utterance.voice = this.state.synthesis.selectedVoice;
    utterance.lang = 'en-US';
    utterance.rate = 1.5;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    this.state.synthesis.isSpeaking = true;
    utterance.onend = () => this.state.synthesis.isSpeaking = false;

    this.state.synthesis.instance.speak(utterance);
  }

  async toggleVoiceControl() {
    if (this.state.input.active) {
      this.stopVoiceInput();
    }

    if (!this.state.control.recognition) {
      this.initializeVoiceControl();
    }

    if (this.state.control.active) {
      this.stopVoiceControl();
    } else {
      await this.startVoiceControl();
    }
  }

  async toggleVoiceInput() {
    if (this.state.control.active) {
      this.stopVoiceControl();
    }

    if (!this.state.input.recognition) {
      this.initializeVoiceInput();
    }

    if (this.state.input.active) {
      this.stopVoiceInput();
    } else {
      await this.startVoiceInput();
    }
  }

  async startVoiceControl() {
    try {
      const hasPermission = await this.requestMicrophonePermission();
      if (!hasPermission) return;

      await this.state.control.recognition.start();
      this.state.control.active = true;
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