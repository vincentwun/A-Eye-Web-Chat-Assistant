import { pipeline, env, AutoProcessor, AutoTokenizer, LlavaForConditionalGeneration, RawImage } from './transformers300.js';

class ImageAnalyzer {
    constructor() {
        this.state = {
            tokenizer: null,
            processor: null,
            model: null,
            pastKeyValues: null,
            messages: [],
            isProcessing: false,
            isSpeaking: false,
            isRecording: false,
            recognition: null,
            rollingScreenshotImages: [],
            speechSynthesis: window.speechSynthesis,
            selectedVoice: null,
            voices: [],
            silenceTimer: null,
            lastSpeechTime: null
        };

        this.elements = {
            screenshotButton: document.getElementById('screenshot-button'),
            imagePreview: document.getElementById('image-preview'),
            conversation: document.getElementById('conversation'),
            userInput: document.getElementById('user-input'),
            sendButton: document.getElementById('send-button'),
            voiceButton: document.getElementById('voice-button'),
            rollingScreenshotButton: document.getElementById('rolling-screenshot-button'),
            resetButton: document.getElementById('reset-button')
        };

        this.initializeAll();

        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.type === "toggleVoiceRecording") {
                this.toggleRecording();
            }
        });
    }

    async initializeAll() {
        this.setupEventListeners();
        this.elements.userInput.disabled = false;
        await this.initializeModel();
        this.initializeTTS();
        this.initializeSpeechRecognition();
    }

    initializeSpeechRecognition() {
        if (!('webkitSpeechRecognition' in window)) return;

        const recognition = new webkitSpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'zh-HK';

        const SILENCE_THRESHOLD = 900;

        const handlers = {
            onstart: () => {
                console.log('Recording started');
                this.state.lastSpeechTime = Date.now();
            },
            onresult: (event) => {
                let transcript = Array.from(event.results)
                    .map(result => result[0].transcript)
                    .join('');

                this.state.lastSpeechTime = Date.now();
                if (this.state.silenceTimer) clearTimeout(this.state.silenceTimer);

                this.elements.userInput.value = transcript;
                this.handleInputChange();

                this.state.silenceTimer = setTimeout(() => {
                    if (Date.now() - this.state.lastSpeechTime >= SILENCE_THRESHOLD) {
                        if (this.elements.userInput.value.trim()) {
                            this.handleSendMessage();
                        }
                        this.stopRecording();
                    }
                }, SILENCE_THRESHOLD);
            },
            onerror: (event) => {
                console.error('Speech recognition error:', event.error);
                this.stopRecording();
            },
            onend: () => {
                if (this.state.silenceTimer) {
                    clearTimeout(this.state.silenceTimer);
                    this.state.silenceTimer = null;
                }
                if (this.state.isRecording && this.elements.userInput.value.trim()) {
                    this.handleSendMessage();
                }
                this.stopRecording();
            }
        };

        Object.entries(handlers).forEach(([event, handler]) => {
            recognition[event] = handler;
        });

        this.state.recognition = recognition;
    }

    async requestMicrophonePermission() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            stream.getTracks().forEach(track => track.stop());
            return true;
        } catch (error) {
            console.error('Microphone permission error:', error);
            this.appendMessage('system', 'Please allow microphone access in your browser');
            return false;
        }
    }

    async toggleRecording() {
        if (this.state.isRecording) {
            this.stopRecording();
        } else {
            await this.startRecording();
        }
    }

    async startRecording() {
        if (!this.state.recognition) return;

        try {
            const hasPermission = await this.requestMicrophonePermission();
            if (!hasPermission) {
                this.appendMessage('system', 'Please allow microphone access to enable voice features');
                return;
            }

            this.state.isRecording = true;
            this.updateVoiceButtonState(true);
            this.state.recognition.start();
        } catch (error) {
            this.handleError('Failed to start recording', error);
            this.stopRecording();
        }
    }

    stopRecording() {
        if (!this.state.recognition) return;

        this.state.isRecording = false;
        this.updateVoiceButtonState(false);

        if (this.state.silenceTimer) {
            clearTimeout(this.state.silenceTimer);
            this.state.silenceTimer = null;
        }

        this.state.recognition.stop();
    }

    updateVoiceButtonState(isRecording) {
        this.elements.voiceButton.style.backgroundColor = isRecording ? '#dc3545' : '#007bff';
        this.elements.voiceButton.textContent = isRecording ? 'Stop' : 'Voice';
    }

    initializeTTS() {
        if (!this.state.speechSynthesis) return;

        this.state.speechSynthesis.addEventListener('voiceschanged', () => {
            this.state.voices = this.state.speechSynthesis.getVoices();
            this.state.selectedVoice = this.state.voices.find(voice =>
                voice.lang.includes('zh-HK')
            );
        });
    }

    speakText(text) {
        if (!this.state.speechSynthesis) return;

        if (this.state.isSpeaking) {
            this.state.speechSynthesis.cancel();
        }

        const utterance = new SpeechSynthesisUtterance(text);
        Object.assign(utterance, {
            voice: this.state.selectedVoice,
            lang: 'zh-HK',
            rate: 10.0,
            pitch: 1.2,
            volume: 1.0
        });

        this.state.isSpeaking = true;
        utterance.onend = () => this.state.isSpeaking = false;
        this.state.speechSynthesis.speak(utterance);
    }

    setupEventListeners() {
        const eventMap = {
            'screenshotButton': ['click', () => this.handleScreenshot()],
            'rollingScreenshotButton': ['click', () => this.handleRollingScreenshot()],
            'sendButton': ['click', () => this.handleSendMessage()],
            'userInput': [
                ['input', () => this.handleInputChange()],
                ['keypress', (e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        this.handleSendMessage();
                    }
                }]
            ],
            'voiceButton': ['click', () => this.toggleRecording()],
            'resetButton': ['click', () => this.handleReset()]
        };

        Object.entries(eventMap).forEach(([elementName, events]) => {
            const element = this.elements[elementName];
            if (!element) return;

            if (Array.isArray(events[0])) {
                events.forEach(([event, handler]) => {
                    element.addEventListener(event, handler);
                });
            } else {
                element.addEventListener(events[0], events[1]);
            }
        });
    }

    async handleScreenshot() {
        if (this.state.isProcessing) return;

        try {
            this.elements.screenshotButton.disabled = true;
            this.speakText("Analyzing");

            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const screenshot = await chrome.tabs.captureVisibleTab();

            this.elements.imagePreview.src = screenshot;
            this.elements.imagePreview.style.display = 'block';

            await this.handleImageAnalysis(screenshot);
        } catch (error) {
            this.handleError('Error taking screenshot', error);
        } finally {
            this.elements.screenshotButton.disabled = false;
        }
    }

    async handleRollingScreenshot() {
        if (this.state.isProcessing) return;

        try {
            this.elements.rollingScreenshotButton.disabled = true;
            this.state.rollingScreenshotImages = [];
            this.speakText("Analyzing");

            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) throw new Error('No active tab found');

            const pageInfo = await this.getPageInfo();
            if (!pageInfo || !pageInfo.scrollHeight || !pageInfo.clientHeight) {
                throw new Error('Invalid page dimensions');
            }

            await this.captureScrollingScreenshots(tab, pageInfo);
            const mergedImage = await this.mergeScreenshots(this.state.rollingScreenshotImages);

            this.elements.imagePreview.src = mergedImage;
            this.elements.imagePreview.style.display = 'block';

            await this.handleImageAnalysis(mergedImage);
        } catch (error) {
            this.handleError('Rolling screenshot failed', error);
        } finally {
            this.elements.rollingScreenshotButton.disabled = false;
        }
    }

    async getPageInfo() {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({
                type: 'startRollingScreenshot'
            }, response => resolve(response));
        });
    }

    async captureScrollingScreenshots(tab, pageInfo) {
        const { scrollHeight, clientHeight } = pageInfo;
        let currentScroll = 0;

        await this.executeScroll(tab, 0);

        while (currentScroll < scrollHeight) {
            const screenshot = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
            this.state.rollingScreenshotImages.push(screenshot);

            currentScroll += clientHeight;
            await this.executeScroll(tab, currentScroll);
            await new Promise(resolve => setTimeout(resolve, 150));
        }

        await this.executeScroll(tab, 0);
    }

    async executeScroll(tab, scrollPosition) {
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: (scroll) => window.scrollTo({ top: scroll, behavior: 'instant' }),
            args: [scrollPosition]
        });
    }

    async mergeScreenshots(screenshots) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        const firstImage = await this.loadImage(screenshots[0]);
        canvas.width = firstImage.width;
        canvas.height = firstImage.height * screenshots.length;

        for (let i = 0; i < screenshots.length; i++) {
            const image = await this.loadImage(screenshots[i]);
            ctx.drawImage(image, 0, i * firstImage.height);
        }

        return canvas.toDataURL('image/png');
    }

    loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = src;
        });
    }

    async initializeModel() {
        try {
            const modelId = 'onnx-community/nanoLLaVA-1.5';
            const modelConfig = {
                dtype: {
                    embed_tokens: 'fp16',
                    vision_encoder: 'fp16',
                    decoder_model_merged: 'q4',
                },
                device: 'webgpu',
            };

            [
                this.state.tokenizer,
                this.state.processor,
                this.state.model
            ] = await Promise.all([
                AutoTokenizer.from_pretrained(modelId),
                AutoProcessor.from_pretrained(modelId),
                LlavaForConditionalGeneration.from_pretrained(modelId, modelConfig)
            ]);

            this.elements.screenshotButton.disabled = false;
        } catch (error) {
            this.handleError('Error initializing model', error);
        }
    }

    async handleImageAnalysis(imageUrl) {
        if (this.state.isProcessing) return;
        this.state.isProcessing = true;

        try {
            this.state.messages = [
                { role: 'system', content: 'Answer the question.' },
                { role: 'user', content: `<image>\n描述圖片` }
            ];
            this.appendMessage('AI', 'Analyzing...');

            const response = await this.generateImageResponse(imageUrl);
            this.handleResponse(response);
        } catch (error) {
            this.handleError('Error analyzing screenshot', error);
        } finally {
            this.state.isProcessing = false;
        }
    }

    async generateImageResponse(imageUrl) {
        const text = this.state.tokenizer.apply_chat_template(this.state.messages, {
            tokenize: false,
            add_generation_prompt: true
        });
        const textInputs = this.state.tokenizer(text);
        const image = await RawImage.fromURL(imageUrl);
        const visionInputs = await this.state.processor(image);

        const output = await this.state.model.generate({
            ...textInputs,
            ...visionInputs,
            do_sample: false,
            max_new_tokens: 64,
            repetition_penalty: 1.1,
            return_dict_in_generate: true,
        });

        this.state.pastKeyValues = output.past_key_values;
        return this.state.tokenizer.decode(
            output.sequences.slice(0, [textInputs.input_ids.dims[1], null]),
            { skip_special_tokens: true }
        );
    }

    handleResponse(response) {
        this.appendMessage('assistant', response);
        this.state.messages.push({ role: 'assistant', content: response });
        this.speakText(response);
        this.enableInterface();
    }

    async handleSendMessage() {
        const input = this.elements.userInput.value.trim();
        if (!input || this.state.isProcessing) return;

        this.state.isProcessing = true;
        this.disableInterface();

        try {
            this.appendMessage('user', input);
            this.state.messages.push({ role: 'user', content: input });
            this.elements.userInput.value = '';
            await this.generateResponse();
        } catch (error) {
            this.handleError('Error sending message', error);
        } finally {
            this.state.isProcessing = false;
            this.enableInterface();
        }
    }

    async generateResponse() {
        try {
            const text = this.state.tokenizer.apply_chat_template(this.state.messages, {
                tokenize: false,
                add_generation_prompt: true
            });
            const textInputs = this.state.tokenizer(text);

            const output = await this.state.model.generate({
                ...textInputs,
                past_key_values: this.state.pastKeyValues,
                do_sample: false,
                max_new_tokens: 256,
                return_dict_in_generate: true,
            });

            this.state.pastKeyValues = output.past_key_values;
            const response = this.state.tokenizer.decode(
                output.sequences.slice(0, [textInputs.input_ids.dims[1], null]),
                { skip_special_tokens: true }
            );

            this.handleResponse(response);
        } catch (error) {
            this.handleError('Error generating response', error);
        }
    }

    handleInputChange() {
        this.elements.sendButton.disabled = !this.elements.userInput.value.trim();
    }

    appendMessage(role, content) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', role);
        messageDiv.innerHTML = `<strong>${role === 'user' ? 'You' : 'AI'}:</strong> ${this.escapeHTML(content)}`;
        this.elements.conversation.appendChild(messageDiv);
        this.elements.conversation.scrollTop = this.elements.conversation.scrollHeight;
    }

    escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    handleError(message, error) {
        console.error(message, error);
        this.appendMessage('system', `${message}: ${error.message}`);

        this.state.isProcessing = false;
        this.state.rollingScreenshotImages = [];

        this.elements.rollingScreenshotButton.disabled = false;
        this.elements.screenshotButton.disabled = false;
    }

    handleReset() {
        this.elements.conversation.innerHTML = '';
        this.elements.userInput.value = '';
        this.elements.imagePreview.style.display = 'none';
        this.state.messages = [];
        this.state.rollingScreenshotImages = [];
    }

    enableInterface() {
        this.elements.userInput.disabled = false;
        this.elements.sendButton.disabled = false;
    }

    disableInterface() {
        this.elements.sendButton.disabled = true;
    }
}

const imageAnalyzer = new ImageAnalyzer();