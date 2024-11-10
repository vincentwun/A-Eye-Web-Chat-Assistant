import { AutoProcessor, AutoTokenizer, Moondream1ForConditionalGeneration, RawImage } from './lib/transformers300.js';

class AIScreenReader {
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
            lastSpeechTime: null,
            isInitialized: false,
            currentMode: 'none',
            geminiSession: null
        };

        this.elements = {
            screenshotButton: document.getElementById('screenshot-button'),
            previewContainer: document.getElementById('preview-container'),
            previewImage: document.getElementById('preview-image'),
            previewText: document.getElementById('preview-text'),
            conversation: document.getElementById('conversation'),
            userInput: document.getElementById('user-input'),
            sendButton: document.getElementById('send-button'),
            voiceButton: document.getElementById('voice-button'),
            rollingScreenshotButton: document.getElementById('rolling-screenshot-button'),
            clearButton: document.getElementById('clear-button'),
            analyzeContentButton: document.getElementById('analyze-content-button'),
            currentMode: document.getElementById('current-mode')
        };

        this.initializeAll();
        this.setupMessageListener();
    }

    setupMessageListener() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            console.log('Message received in sidepanel:', request);

            const messageHandlers = {
                toggleVoiceRecording: () => this.toggleRecording(),
                takeScreenshot: () => this.handleScreenshot()
            };

            if (messageHandlers[request.type]) {
                messageHandlers[request.type]();
                return true;
            }
        });
    }

    async initializeAll() {
        await Promise.all([
            this.initializeModel(),
            this.initializeGemini()
        ]);
        this.setupEventListeners();
        this.initializeSpeechFeatures();
    }

    initializeSpeechFeatures() {
        this.initializeTTS();
        this.initializeSpeechRecognition();
    }

    async initializeGemini() {
        try {
            this.state.geminiSession = await chrome.runtime.sendMessage({
                type: 'initGemini'
            });
        } catch (error) {
            console.error('Failed to initialize Gemini:', error);
        }
    }

    initializeSpeechRecognition() {
        if (!('webkitSpeechRecognition' in window)) return;

        const recognition = new webkitSpeechRecognition();
        Object.assign(recognition, {
            continuous: true,
            interimResults: true,
            lang: 'en-US'
        });

        const SILENCE_THRESHOLD = 800;

        recognition.onstart = () => {
            console.log('Recording started');
            this.state.lastSpeechTime = Date.now();
        };

        recognition.onresult = (event) => {
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
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            this.stopRecording();
        };

        recognition.onend = () => {
            this.handleRecognitionEnd();
        };

        this.state.recognition = recognition;
    }

    handleRecognitionEnd() {
        if (this.state.silenceTimer) {
            clearTimeout(this.state.silenceTimer);
            this.state.silenceTimer = null;
        }
        if (this.state.isRecording && this.elements.userInput.value.trim()) {
            this.handleSendMessage();
        }
        this.stopRecording();
    }

    async requestMicrophonePermission() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            stream.getTracks().forEach(track => track.stop());
            return true;
        } catch (error) {
            console.error('Microphone permission error:', error);
            this.speakText('Please allow microphone access in your browser.');
            this.appendMessage('system', 'Please allow microphone access in your browser.');
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
            if (!hasPermission) return;

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
        Object.assign(this.elements.voiceButton.style, {
            backgroundColor: isRecording ? '#dc3545' : '#007bff'
        });
        this.elements.voiceButton.textContent = isRecording ? 'Stop' : 'Voice';
    }

    initializeTTS() {
        if (!this.state.speechSynthesis) return;

        this.state.speechSynthesis.addEventListener('voiceschanged', () => {
            this.state.voices = this.state.speechSynthesis.getVoices();
            this.state.selectedVoice = this.state.voices.find(voice =>
                voice.lang.includes('en-US')
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
            lang: 'en-UK',
            rate: 1.5,
            pitch: 1.2,
            volume: 1.0
        });

        this.state.isSpeaking = true;
        utterance.onend = () => this.state.isSpeaking = false;
        this.state.speechSynthesis.speak(utterance);
    }

    setupEventListeners() {
        const eventHandlers = {
            'screenshotButton': () => this.handleScreenshot(),
            'rollingScreenshotButton': () => this.handleRollingScreenshot(),
            'sendButton': () => this.handleSendMessage(),
            'voiceButton': () => this.toggleRecording(),
            'clearButton': () => this.handleClear(),
            'analyzeContentButton': () => this.handleContentAnalysis()
        };

        Object.entries(eventHandlers).forEach(([elementName, handler]) => {
            this.elements[elementName].addEventListener('click', handler);
        });

        this.elements.userInput.addEventListener('input', () => this.handleInputChange());
        this.elements.userInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.handleSendMessage();
            }
        });
    }

    showPreview(type, content) {
        this.elements.previewContainer.style.display = 'block';
        this.elements.previewImage.style.display = type === 'image' ? 'block' : 'none';
        this.elements.previewText.style.display = type === 'text' ? 'block' : 'none';

        if (type === 'image') {
            this.elements.previewImage.src = content;
        } else {
            this.elements.previewText.innerHTML = content;
        }
    }

    hidePreview() {
        Object.assign(this.elements.previewContainer.style, {
            display: 'none'
        });
        this.elements.previewImage.style.display = 'none';
        this.elements.previewText.style.display = 'none';
    }

    // Screenshot related
    async handleScreenshot() {
        if (this.state.isProcessing) return;

        try {
            this.elements.screenshotButton.disabled = true;
            this.speakText("Analyzing Screenshot");
            this.appendMessage('system', 'Analyzing Screenshot.');
            this.updateMode('moondream');

            const screenshot = await chrome.tabs.captureVisibleTab();
            this.showPreview('image', screenshot);

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
            this.speakText("Analyzing scrolling screenshot.");
            this.appendMessage('system', 'Analyzing scrolling screenshot.');
            this.updateMode('moondream');

            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) throw new Error('No active tab found');

            const pageInfo = await this.getPageInfo();
            if (!this.validatePageInfo(pageInfo)) {
                throw new Error('Invalid page dimensions');
            }

            await this.captureScreenshots(tab, pageInfo);
            const mergedImage = await this.mergeScreenshots(this.state.rollingScreenshotImages);
            this.showPreview('image', mergedImage);

            await this.handleImageAnalysis(mergedImage);
        } catch (error) {
            this.handleError('Rolling screenshot failed', error);
        } finally {
            this.elements.rollingScreenshotButton.disabled = false;
        }
    }

    validatePageInfo(pageInfo) {
        return pageInfo && pageInfo.scrollHeight && pageInfo.clientHeight;
    }

    updateMode(mode) {
        this.state.currentMode = mode;
        this.elements.currentMode.textContent = mode === 'moondream' ? 'Moondream2' : 'Gemini Nano';
    }

    async getPageInfo() {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                type: 'startRollingScreenshot'
            }, response => {
                if (!response) {
                    reject(new Error('Failed to get page dimensions'));
                    return;
                }
                resolve(response);
            });
        });
    }

    async captureScreenshots(tab, pageInfo) {
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

    // Model related
    async initializeModel() {
        try {
            const modelId = 'Xenova/moondream2';
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
                Moondream1ForConditionalGeneration.from_pretrained(modelId, modelConfig)
            ]);

            this.state.isInitialized = true;
            this.elements.screenshotButton.disabled = false;
        } catch (error) {
            this.handleError('Error initializing model', error);
        }
    }

    async handleImageAnalysis(imageUrl) {
        if (!this.state.isInitialized || this.state.isProcessing) {
            this.handleError('Model not ready', new Error('Please wait for model initialization'));
            return;
        }

        this.state.isProcessing = true;

        try {
            this.state.messages = [];
            const defaultPrompt = 'Describe the picture in about 50 words';

            const response = await this.generateImageResponse(imageUrl, defaultPrompt);
            this.handleResponse(response);
        } catch (error) {
            this.handleError('Error analyzing screenshot', error);
        } finally {
            this.state.isProcessing = false;
        }
    }

    async generateImageResponse(imageUrl, prompt) {
        try {
            const text = `<image>\n\nQuestion: ${prompt}\n\nAnswer:`;
            const textInputs = await this.state.tokenizer(text);

            const image = await RawImage.fromURL(imageUrl);
            const visionInputs = await this.state.processor(image);

            const output = await this.state.model.generate({
                ...textInputs,
                ...visionInputs,
                do_sample: false,
                max_new_tokens: 64,
            });

            const decoded = await this.state.tokenizer.batch_decode(output, {
                skip_special_tokens: true
            });

            return this.cleanResponse(decoded[0]);
        } catch (error) {
            throw new Error(`Failed to generate image response: ${error.message}`);
        }
    }

    cleanResponse(response) {
        return response.split('Answer:').pop()?.trim()
            .replace(/Question:.*Answer:/g, '').trim() || response.trim();
    }

    async handleContentAnalysis() {
        if (this.state.isProcessing) return;

        try {
            this.state.currentMode = 'gemini';
            this.elements.currentMode.textContent = 'Gemini Nano';
            this.state.isProcessing = true;
            this.elements.analyzeContentButton.disabled = true;
            this.speakText("Analyzing webpage content.");
            this.appendMessage('assistant', 'Analyzing webpage content.');

            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const content = await this.extractPageContent(tab);

            this.showPreview('text', `
                <strong>Extracted Content Preview:</strong><br>
                ${this.escapeHTML(content.slice(0, 500))}...
            `);

            const response = await chrome.runtime.sendMessage({
                type: 'analyze',
                text: content
            });

            if (!response || response.error) {
                throw new Error(response?.error || 'Analysis failed');
            }

            this.handleResponse(response.content);

        } catch (error) {
            this.handleError('Content analysis failed', error);
        } finally {
            this.state.isProcessing = false;
            this.elements.analyzeContentButton.disabled = false;
        }
    }

    // Message handling
    async handleSendMessage() {
        const input = this.elements.userInput.value.trim();
        if (!input || this.state.isProcessing) return;

        this.state.isProcessing = true;
        this.disableInterface();

        try {
            this.appendMessage('user', input);

            if (this.state.currentMode === 'moondream') {
                await this.generateMoondreamResponse(input);
            } else if (this.state.currentMode === 'gemini') {
                const response = await chrome.runtime.sendMessage({
                    type: 'chat',
                    text: input
                });
                this.handleResponse(response.content);
            } else {
                throw new Error('Please select a mode first');
            }

            this.elements.userInput.value = '';
        } catch (error) {
            this.handleError('Error sending message', error);
        } finally {
            this.state.isProcessing = false;
            this.enableInterface();
        }
    }

    async generateMoondreamResponse(input) {
        const response = await this.generateImageResponse(this.elements.previewImage.src, input);
        this.handleResponse(response);
    }

    async extractPageContent(tab) {
        try {
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['./lib/readability.js']
            });

            const [{ result }] = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                function: () => {
                    try {
                        const documentClone = document.cloneNode(true);
                        const reader = new Readability(documentClone);
                        const article = reader.parse();
                        return {
                            title: article.title,
                            content: article.textContent,
                            excerpt: article.excerpt,
                            byline: article.byline,
                            success: true
                        };
                    } catch (error) {
                        return {
                            success: false,
                            error: error.message
                        };
                    }
                }
            });

            if (!result.success) {
                throw new Error(`Content extraction failed: ${result.error}`);
            }

            return this.formatExtractedContent(result);
        } catch (error) {
            console.error('Content extraction error:', error);
            throw new Error('Failed to extract page content');
        }
    }

    formatExtractedContent(result) {
        return `
            Title: ${result.title}
            ${result.byline ? `Author: ${result.byline}\n` : ''}
            ${result.excerpt ? `Summary: ${result.excerpt}\n` : ''}
            Content: ${result.content}
        `.trim();
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

    handleResponse(response) {
        this.appendMessage('assistant', response);
        this.state.messages.push({ role: 'assistant', content: response });
        this.speakText(response);
        this.enableInterface();
    }

    handleError(message, error) {
        console.error(message, error);
        this.appendMessage('system', `${message}: ${error.message}`);
        this.resetState();
    }

    resetState() {
        this.state.isProcessing = false;
        this.state.rollingScreenshotImages = [];
        this.enableInterface();
    }

    handleClear() {
        this.elements.conversation.innerHTML = '';
        this.elements.userInput.value = '';
        this.hidePreview();

        Object.assign(this.state, {
            messages: [],
            rollingScreenshotImages: [],
            pastKeyValues: null,
            currentMode: 'none'
        });

        this.elements.currentMode.textContent = 'None';

        if (this.state.speechSynthesis && this.state.isSpeaking) {
            this.state.speechSynthesis.cancel();
            this.state.isSpeaking = false;
        }
    }

    enableInterface() {
        this.elements.userInput.disabled = false;
        this.elements.sendButton.disabled = false;
        this.elements.screenshotButton.disabled = false;
        this.elements.analyzeContentButton.disabled = false;
        this.elements.rollingScreenshotButton.disabled = false;
    }

    disableInterface() {
        this.elements.sendButton.disabled = true;
    }
}

const aiScreenReader = new AIScreenReader();