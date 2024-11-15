import { AutoProcessor, AutoTokenizer, Moondream1ForConditionalGeneration, RawImage } from './lib/transformers300.js';

class AIScreenReader {
    constructor() {
        this.state = {
            tokenizer: null,
            processor: null,
            model: null,
            pastKeyValues: null,
            isInitialized: false,
            isProcessing: false,
            currentModel: 'none',
            messages: [],
            rollingScreenshotImages: [],
            voice: {
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
            },
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
            currentModel: document.getElementById('current-model')
        };

        this.voiceCommands = {
            'take screenshot': () => this.handleScreenshot(),
            'take rolling screenshot': () => this.handleRollingScreenshot(),
            'analyze content': () => this.handleContentAnalysis(),
            'analyze page': () => this.handleContentAnalysis()
        };

        this.initializeAll();
        this.setupMessageListener();
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
            this.state.voice.control.active = true;
            this.speakText('Voice control activated.');
            this.appendMessage('system', 'Voice control activated.');
        };

        recognition.onresult = async (event) => {
            const command = event.results[event.results.length - 1][0].transcript.toLowerCase().trim();
            this.appendMessage('system', `Detected command: "${command}"`);
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
            if (this.state.voice.control.active) {
                console.log('Voice control ended');
                this.state.voice.control.active = false;
            }
        };

        this.state.voice.control.recognition = recognition;
    }

    async toggleVoiceControl() {
        if (this.state.voice.input.active) {
            this.stopVoiceInput();
        }

        if (!this.state.voice.control.recognition) {
            this.initializeVoiceControl();
        }

        if (this.state.voice.control.active) {
            this.stopVoiceControl();
        } else {
            await this.startVoiceControl();
        }
    }

    async startVoiceControl() {
        try {
            const hasPermission = await this.requestMicrophonePermission();
            if (!hasPermission) return;

            await this.state.voice.control.recognition.start();
            this.state.voice.control.active = true;
        } catch (error) {
            console.error('Failed to start voice control:', error);
            this.appendMessage('system', 'Failed to start voice control');
            this.stopVoiceControl();
        }
    }

    stopVoiceControl() {
        if (!this.state.voice.control.recognition) return;

        try {
            this.state.voice.control.recognition.stop();
            this.state.voice.control.active = false;
        } catch (error) {
            console.error('Error stopping voice control:', error);
        }
    }

    async handleVoiceCommand(command) {
        console.log('Processing command:', command);

        const normalizeCommand = (cmd) => {
            return cmd
                .toLowerCase()
                .replace(/analyse/g, 'analyze')
                .replace(/screenshot/g, 'screenshot')
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
            await this.performGoogleSearch(searchQuery);
            return;
        }

        const websiteMatch = normalizedCommand.match(/go to (.*?)(?:\.com|$)/i);
        if (websiteMatch) {
            const website = websiteMatch[1].trim();
            await this.navigateToWebsite(website);
            return;
        }
        const commandMap = {
            'screenshot': {
                variants: ['take screenshot', 'take a screenshot', 'capture screen'],
                handler: async () => {
                    this.speakText('Taking screenshot');
                    await this.handleScreenshot();
                }
            },
            'rolling': {
                variants: ['take rolling screenshot', 'take a rolling screenshot', 'rolling screenshot'],
                handler: async () => {
                    this.speakText('Taking rolling screenshot');
                    await this.handleRollingScreenshot();
                }
            },
            'analyze': {
                variants: ['analyze content', 'analyse content', 'analyze page', 'analyse page',
                    'analyze', 'analyse', 'content analysis'],
                handler: async () => {
                    this.speakText('Analyzing content');
                    await this.handleContentAnalysis();
                }
            }
        };

        for (const [key, { variants, handler }] of Object.entries(commandMap)) {
            if (variants.some(variant => matchCommand(normalizedCommand, variant))) {
                await handler();
                return;
            }
        }

        this.appendMessage('system', `Command not recognized: "${command}"`);
        this.speakText("Command not recognized. Please try again.");
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
            this.state.voice.input.active = true;
            this.updateVoiceInputButtonState(true);
            this.elements.userInput.placeholder = 'Listening...';
            this.state.voice.input.finalTranscript = '';
        };

        recognition.onresult = (event) => {
            let interimTranscript = '';

            if (this.state.voice.input.silenceTimeout) {
                clearTimeout(this.state.voice.input.silenceTimeout);
            }

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    this.state.voice.input.finalTranscript = transcript;
                } else {
                    interimTranscript = transcript;
                }
            }

            this.elements.userInput.value = this.state.voice.input.finalTranscript || interimTranscript;

            this.state.voice.input.silenceTimeout = setTimeout(() => {
                if (this.state.voice.input.finalTranscript.trim()) {
                    this.handleSendMessage();
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

        this.state.voice.input.recognition = recognition;
    }

    async performGoogleSearch(query) {
        try {
            const encodedQuery = encodeURIComponent(query);
            const searchUrl = `https://www.google.com/search?q=${encodedQuery}`;
            await chrome.tabs.create({ url: searchUrl });
            this.speakText(`Searching for ${query}`);
            this.appendMessage('system', `Searching Google for: "${query}"`);
        } catch (error) {
            console.error('Search error:', error);
            this.appendMessage('system', 'Failed to perform search');
        }
    }

    async toggleVoiceInput() {
        if (this.state.voice.control.active) {
            this.stopVoiceControl();
        }

        if (!this.state.voice.input.recognition) {
            this.initializeVoiceInput();
        }

        if (this.state.voice.input.active) {
            this.stopVoiceInput();
        } else {
            await this.startVoiceInput();
        }
    }

    async startVoiceInput() {
        try {
            const hasPermission = await this.requestMicrophonePermission();
            if (!hasPermission) return;

            await this.state.voice.input.recognition.start();
            this.state.voice.input.active = true;
            this.updateVoiceInputButtonState(true);
            this.appendMessage('system', 'Voice input activated');
            this.speakText('Voice input activated');
        } catch (error) {
            console.error('Failed to start voice input:', error);
            this.stopVoiceInput();
        }
    }

    stopVoiceInput() {
        if (!this.state.voice.input.recognition) return;

        try {
            this.state.voice.input.recognition.stop();
            this.state.voice.input.active = false;
            this.updateVoiceInputButtonState(false);
            this.elements.userInput.placeholder = 'Type your message here...';
        } catch (error) {
            console.error('Error stopping voice input:', error);
        }
    }

    navigateToWebsite(website) {
        const url = `https://www.${website.toLowerCase()}.com`;
        chrome.tabs.create({ url });
        this.speakText(`Opening ${website}`);
    }

    initializeSpeechSynthesis() {
        if (!this.state.voice.synthesis.instance) return;

        this.state.voice.synthesis.instance.addEventListener('voiceschanged', () => {
            this.state.voice.synthesis.voices = this.state.voice.synthesis.instance.getVoices();
            this.state.voice.synthesis.selectedVoice = this.state.voice.synthesis.voices.find(
                voice => voice.lang.includes('en-US')
            );
        });
    }

    speakText(text) {
        if (!this.state.voice.synthesis.instance) return;

        if (this.state.voice.synthesis.isSpeaking) {
            this.state.voice.synthesis.instance.cancel();
        }

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.voice = this.state.voice.synthesis.selectedVoice;
        utterance.lang = 'en-US';
        utterance.rate = 1.5;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        this.state.voice.synthesis.isSpeaking = true;
        utterance.onend = () => this.state.voice.synthesis.isSpeaking = false;

        this.state.voice.synthesis.instance.speak(utterance);
    }

    async requestMicrophonePermission() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(track => track.stop());
            return true;
        } catch (error) {
            console.error('Microphone permission error:', error);
            this.appendMessage('system', 'Please allow microphone access');
            return false;
        }
    }

    updateVoiceInputButtonState(isActive) {
        this.elements.voiceButton.style.backgroundColor = isActive ? '#dc3545' : '#007bff';
        this.elements.voiceButton.textContent = isActive ? 'Stop' : 'Voice';
    }

    setupMessageListener() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            console.log('Message received in sidepanel:', request);

            const messageHandlers = {
                toggleVoiceInput: () => this.toggleVoiceInput(),
                toggleVoiceControl: () => this.toggleVoiceControl()
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
        this.initializeVoiceControl();
        this.initializeVoiceInput();
        this.initializeSpeechSynthesis();
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

    setupEventListeners() {
        const eventHandlers = {
            'screenshotButton': () => this.handleScreenshot(),
            'rollingScreenshotButton': () => this.handleRollingScreenshot(),
            'sendButton': () => this.handleSendMessage(),
            'voiceButton': () => this.toggleVoiceInput(),
            'clearButton': () => this.handleClear(),
            'analyzeContentButton': () => this.handleContentAnalysis()
        };

        Object.entries(eventHandlers).forEach(([elementName, handler]) => {
            this.elements[elementName].addEventListener('click', handler.bind(this));
        });

        this.elements.userInput.addEventListener('input', () => this.handleInputChange());
        this.elements.userInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.handleSendMessage();
            }
        });
    }

    async initializeModel() {
        const modelStatus = document.getElementById('model-status');
        const modelId = 'Xenova/moondream2';
        let downloadProgress = { total: 0, received: 0 };

        const originalFetch = window.fetch;
        window.fetch = async (...args) => {
            if (!args[0].includes(modelId)) return originalFetch(...args);

            try {
                const response = await originalFetch(...args);
                const reader = response.body.getReader();
                const contentLength = +response.headers.get('Content-Length') || 0;
                downloadProgress.total += contentLength;

                const stream = new ReadableStream({
                    async start(controller) {
                        try {
                            while (true) {
                                const { done, value } = await reader.read();
                                if (done) break;

                                downloadProgress.received += value.length;
                                if (downloadProgress.total > 0) {
                                    const percentage = Math.floor((downloadProgress.received / downloadProgress.total) * 100);
                                    requestAnimationFrame(() => {
                                        modelStatus.textContent = `Downloading model: ${percentage}%`;
                                    });
                                }
                                controller.enqueue(value);
                            }
                            controller.close();
                        } catch (error) {
                            controller.error(error);
                            throw error;
                        }
                    }
                });

                return new Response(stream, response);
            } catch (error) {
                modelStatus.textContent = `Download failed: ${error.message}`;
                throw error;
            }
        };

        try {
            modelStatus.textContent = 'Model initialization in progress, please wait.';
            this.speakText("Model initialization in progress, please wait.");

            const [tokenizer, processor, model] = await Promise.all([
                AutoTokenizer.from_pretrained(modelId),
                AutoProcessor.from_pretrained(modelId),
                Moondream1ForConditionalGeneration.from_pretrained(modelId, {
                    dtype: {
                        embed_tokens: 'fp16',
                        vision_encoder: 'fp16',
                        decoder_model_merged: 'q4',
                    },
                    device: 'webgpu',
                })
            ]);

            Object.assign(this.state, { tokenizer, processor, model, isInitialized: true });
            this.elements.screenshotButton.disabled = false;
            modelStatus.textContent = 'Model initialization complete.';
            this.speakText("Model initialization complete.");
        } catch (error) {
            modelStatus.textContent = `Initialization failed: ${error.message}`;
            this.handleError('Error initializing model', error);
        } finally {
            window.fetch = originalFetch;
        }
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

    async handleScreenshot() {
        if (this.state.isProcessing) return;

        try {
            this.elements.screenshotButton.disabled = true;
            this.speakText("Analyzing Screenshot");
            this.appendMessage('system', 'Analyzing Screenshot.');
            this.updateModel('moondream');

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
            this.updateModel('moondream');

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
            try {
                const screenshot = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
                this.state.rollingScreenshotImages.push(screenshot);
            } catch (error) {
                if (error.message.includes('MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND')) {
                    console.warn('Rate limit exceeded. Waiting before retrying...');
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    continue;
                } else {
                    throw error;
                }
            }

            currentScroll += clientHeight;
            await this.executeScroll(tab, currentScroll);

            await new Promise(resolve => setTimeout(resolve, 600));
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

    async handleImageAnalysis(imageUrl) {
        if (!this.state.isInitialized || this.state.isProcessing) {
            this.handleError('Model not ready', new Error('Please wait for model initialization'));
            return;
        }

        this.state.isProcessing = true;

        try {
            this.state.messages = [];
            const defaultPrompt = 'Describe the picture in about 100 words';

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
                max_new_tokens: 128,
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

    async handleSendMessage() {
        const input = this.elements.userInput.value.trim();
        if (!input || this.state.isProcessing) return;

        this.elements.userInput.value = '';
        this.state.isProcessing = true;
        this.disableInterface();

        try {
            this.appendMessage('user', input);

            if (this.state.currentModel === 'moondream') {
                await this.generateMoondreamResponse(input);
            } else if (this.state.currentModel === 'gemini') {
                const response = await chrome.runtime.sendMessage({
                    type: 'chat',
                    text: input
                });
                this.handleResponse(response.content);
            } else {
                throw new Error('Please select a model first');
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

    async handleContentAnalysis() {
        if (this.state.isProcessing) return;

        try {
            this.updateModel('gemini');
            this.state.isProcessing = true;
            this.elements.analyzeContentButton.disabled = true;
            this.speakText("Analyzing webpage content.");
            this.appendMessage('assistant', 'Analyzing webpage content.');

            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const content = await this.extractPageContent(tab);

            this.showPreview('text', `${this.escapeHTML(content)}`);

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
        return [
            result.title || 'No Title',
            result.byline || '',
            '',
            result.content || ''
        ].filter(Boolean).join('\n\n');
    }

    updateModel(mode) {
        this.state.currentModel = mode;
        this.elements.currentModel.textContent = mode === 'moondream' ? 'Moondream2' : 'Gemini Nano';
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
        this.state.voice.input.active = false;
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
            currentModel: 'none'
        });

        this.elements.currentModel.textContent = 'None';

        if (this.state.voice.synthesis.instance && this.state.voice.synthesis.isSpeaking) {
            this.state.voice.synthesis.instance.cancel();
            this.state.voice.synthesis.isSpeaking = false;
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