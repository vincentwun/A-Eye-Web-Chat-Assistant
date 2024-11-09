import { AutoProcessor, AutoTokenizer, Moondream1ForConditionalGeneration, RawImage } from './transformers300.js';

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
            imagePreview: document.getElementById('image-preview'),
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

        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            console.log('Message received in sidepanel:', request);

            if (request.type === "toggleVoiceRecording") {
                this.toggleRecording();
                return true;
            }
            if (request.type === "takeScreenshot") {
                this.handleScreenshot();
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
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

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
            if (this.state.silenceTimer) {
                clearTimeout(this.state.silenceTimer);
                this.state.silenceTimer = null;
            }
            if (this.state.isRecording && this.elements.userInput.value.trim()) {
                this.handleSendMessage();
            }
            this.stopRecording();
        };

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
            lang: 'en-US',
            rate: 2.0,
            pitch: 1.2,
            volume: 1.0
        });

        this.state.isSpeaking = true;
        utterance.onend = () => this.state.isSpeaking = false;
        this.state.speechSynthesis.speak(utterance);
    }

    setupEventListeners() {
        this.elements.screenshotButton.addEventListener('click', () => this.handleScreenshot());
        this.elements.rollingScreenshotButton.addEventListener('click', () => this.handleRollingScreenshot());
        this.elements.sendButton.addEventListener('click', () => this.handleSendMessage());
        this.elements.userInput.addEventListener('input', () => this.handleInputChange());
        this.elements.userInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.handleSendMessage();
            }
        });
        this.elements.voiceButton.addEventListener('click', () => this.toggleRecording());
        this.elements.clearButton.addEventListener('click', () => this.handleClear());
        this.elements.analyzeContentButton.addEventListener('click', () => this.handleContentAnalysis());
    }

    async handleScreenshot() {
        if (this.state.isProcessing) return;

        if (!this.state.isInitialized) {
            this.speakText("Please wait for model initialization to complete");
            this.handleError('Model not initialized', new Error('Please wait for model initialization to complete'));
            return;
        }

        try {
            this.elements.screenshotButton.disabled = true;
            this.speakText("Analyzing");
            this.state.currentMode = 'moondream';
            this.elements.currentMode.textContent = 'Moondream2';

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
            this.speakText("Start scrolling screenshot");
            this.state.currentMode = 'moondream';
            this.elements.currentMode.textContent = 'Moondream2';
    
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) throw new Error('No active tab found');
    
            const pageInfo = await this.getPageInfo();
            console.log('Page dimensions:', pageInfo);
    
            if (!pageInfo) {
                throw new Error('Failed to get page dimensions');
            }
    
            if (!pageInfo.scrollHeight || !pageInfo.clientHeight) {
                throw new Error('Invalid page dimensions');
            }
    
            if (pageInfo.scrollHeight <= pageInfo.clientHeight) {
                const screenshot = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
                this.state.rollingScreenshotImages.push(screenshot);
            } else {
                await this.captureScrollingScreenshots(tab, pageInfo);
            }
    
            if (this.state.rollingScreenshotImages.length === 0) {
                throw new Error('No screenshots captured');
            }
    
            const mergedImage = await this.mergeScreenshots(this.state.rollingScreenshotImages);
            this.elements.imagePreview.src = mergedImage;
            this.elements.imagePreview.style.display = 'block';
    
            await this.handleImageAnalysis(mergedImage);
        } catch (error) {
            console.error('Rolling screenshot error:', error);
            this.handleError('Rolling screenshot failed', error);
        } finally {
            this.elements.rollingScreenshotButton.disabled = false;
        }
    }

    async handleContentAnalysis() {
        if (this.state.isProcessing) return;

        try {
            this.state.currentMode = 'gemini';
            this.elements.currentMode.textContent = 'Gemini Nano';
            this.state.isProcessing = true;
            this.elements.analyzeContentButton.disabled = true;
            this.speakText("Analyzing web content");
            this.appendMessage('assistant', 'Analyzing web content...');

            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const content = await this.extractPageContent(tab);

            if (!content) {
                throw new Error('No content found to analyze');
            }

            const response = await new Promise((resolve) => {
                chrome.runtime.sendMessage({
                    type: 'analyze',
                    text: content
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        resolve({ error: chrome.runtime.lastError.message });
                    } else {
                        resolve(response);
                    }
                });
            });

            if (response.error) {
                throw new Error(response.error);
            }

            if (!response.content) {
                throw new Error('No analysis result received');
            }

            this.appendMessage('assistant', response.content);
            this.speakText(response.content);
        } catch (error) {
            this.handleError('Content analysis failed', error);
        } finally {
            this.state.isProcessing = false;
            this.elements.analyzeContentButton.disabled = false;
        }
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
        if (!this.state.isInitialized) {
            this.handleError('Model not initialized', new Error('Please wait for model initialization to complete'));
            return;
        }
        if (this.state.isProcessing) return;
        this.state.isProcessing = true;

        try {
            this.state.messages = [];

            const defaultPrompt = 'Describe the picture in about 50 words';
            this.appendMessage('AI', 'Analyzing...');

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

            const cleanedResponse = decoded[0].split('Answer:').pop()?.trim() || decoded[0].trim();
            return cleanedResponse.replace(/Question:.*Answer:/g, '').trim();
        } catch (error) {
            throw new Error(`Failed to generate image response: ${error.message}`);
        }
    }

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
                throw new Error('Please select a mode by either taking a screenshot or analyzing content first');
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
        const response = await this.generateImageResponse(this.elements.imagePreview.src, input);
        this.handleResponse(response);
    }

    async extractPageContent(tab) {
        const injectionResults = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: () => {
                const content = {
                    paragraphs: []
                };

                document.querySelectorAll('p:not(footer p):not(ul p)').forEach(paragraph => {
                    const text = paragraph.textContent.trim();
                    if (text && text.length > 20) {
                        content.paragraphs.push({ text });
                    }
                });

                return content;
            }
        });

        return injectionResults[0].result.paragraphs
            .map(p => p.text)
            .join('\n\n');
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

        this.state.isProcessing = false;
        this.state.rollingScreenshotImages = [];

        this.elements.rollingScreenshotButton.disabled = false;
        this.elements.screenshotButton.disabled = false;
        this.elements.analyzeContentButton.disabled = false;
    }

    handleClear() {
        this.elements.conversation.innerHTML = '';
        this.elements.userInput.value = '';
        this.elements.imagePreview.style.display = 'none';
        this.elements.imagePreview.src = '';
        this.state.messages = [];
        this.state.rollingScreenshotImages = [];
        this.state.pastKeyValues = null;
        this.state.currentMode = 'none';
        this.elements.currentMode.textContent = 'None';

        if (this.state.speechSynthesis && this.state.isSpeaking) {
            this.state.speechSynthesis.cancel();
            this.state.isSpeaking = false;
        }
    }

    enableInterface() {
        this.elements.userInput.disabled = false;
        this.elements.sendButton.disabled = false;
    }

    disableInterface() {
        this.elements.sendButton.disabled = true;
    }
}

const aiScreenReader = new AIScreenReader();