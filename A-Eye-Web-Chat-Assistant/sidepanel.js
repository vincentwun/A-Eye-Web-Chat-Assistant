import { AutoProcessor, AutoTokenizer, Moondream1ForConditionalGeneration, RawImage } from './lib/transformers300.js';
import { VoiceController } from './components/voiceControl.js';
import { ScreenshotController } from './components/screenShot.js';

class AIScreenReader {
    constructor() {
        this.prompts = {
            screenshot: 'Provide a concise description of the overall structure of this webpage screenshot, including its headings, main sections, and navigation elements, within 100 words.',
            scrollingScreenshot: 'Provide a concise description of the overall structure of this webpage screenshot, including its headings, main sections, and navigation elements, within 150 words.'
        };

        this.state = {
            tokenizer: null,
            processor: null,
            model: null,
            pastKeyValues: null,
            isInitialized: false,
            isProcessing: false,
            currentModel: 'none',
            messages: [],
            geminiSession: null
        };

        this.elements = {
            screenshotButton: document.getElementById('screenshot-button'),
            scrollingScreenshotButton: document.getElementById('scrolling-screenshot-button'),
            analyzeContentButton: document.getElementById('analyze-content-button'),
            currentModel: document.getElementById('current-model'),
            previewContainer: document.getElementById('preview-container'),
            previewImage: document.getElementById('preview-image'),
            previewText: document.getElementById('preview-text'),
            conversation: document.getElementById('conversation'),
            userInput: document.getElementById('user-input'),
            sendButton: document.getElementById('send-button'),
            voiceButton: document.getElementById('voice-button'),
            repeatButton: document.getElementById('repeat-button'),
            clearButton: document.getElementById('clear-button')
        };

        this.voiceController = new VoiceController();
        this.voiceController.setCallbacks({
            appendMessage: (role, content) => this.appendMessage(role, content),
            updateVoiceInputButtonState: (isActive) => {
                this.elements.voiceButton.style.backgroundColor = isActive ? '#dc3545' : '#1a73e8';
                this.elements.voiceButton.textContent = isActive ? 'Stop' : 'Voice';
            },
            handleScreenshot: () => this.handleScreenshot(),
            handleScrollingScreenshot: () => this.handleScrollingScreenshot(),
            handleContentAnalysis: () => this.handleContentAnalysis(),
            performGoogleSearch: async (query) => {
                try {
                    const encodedQuery = encodeURIComponent(query);
                    const searchUrl = `https://www.google.com/search?q=${encodedQuery}`;
                    await chrome.tabs.create({ url: searchUrl });
                    this.voiceController.speakText(`Searching for ${query}`);
                    this.appendMessage('system', `Searching Google for: "${query}"`);
                } catch (error) {
                    console.error('Search error:', error);
                    this.appendMessage('system', 'Failed to perform search');
                }
            },
            navigateToWebsite: (website) => {
                const url = `https://www.${website.toLowerCase()}.com`;
                chrome.tabs.create({ url });
                this.voiceController.speakText(`Opening ${website}`);
            },
            handleSendMessage: () => this.handleSendMessage()
        });

        this.screenshotController = new ScreenshotController();

        this.initializeAll();
        this.setupMessageListener();
    }

    setupMessageListener() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            console.log('Message received in sidepanel:', request);

            const messageHandlers = {
                toggleVoiceInput: () => this.voiceController.toggleVoiceInput(),
                toggleVoiceControl: () => this.voiceController.toggleVoiceControl(),
                toggleRepeat: () => this.handleRepeat()
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
        this.voiceController.initializeAll();
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
            'scrollingScreenshotButton': () => this.handleScrollingScreenshot(),
            'analyzeContentButton': () => this.handleContentAnalysis(),
            'sendButton': () => this.handleSendMessage(),
            'voiceButton': () => this.voiceController.toggleVoiceInput(),
            'repeatButton': () => this.handleRepeat(),
            'clearButton': () => this.handleClear()
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
            this.voiceController.speakText("A-Eye Web Chat Assistant is open. Model initialization in progress, please wait.");

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
            await this.voiceController.speakText("Model initialization complete.");
            const instructions =
`Hi, I’m the A-Eye Web Chat Assistant, nice to meet you! 
To experience my voice control feature, simply press [Alternate + Shift + 1] and then say the following commands to activate the functions.

For browsing, you can search on Google by saying, "Search Gemini" or "Search Google Cloud." I’ll handle the search for you.

To visit a website, just say, "Go to Gmail.com" or "Go to YouTube.com." I currently only support .com websites, but I’ll add more soon.

For AI-powered features, say: 
"Take a screenshot" to capture and describe the current window.
"Take a scrolling screenshot" to capture and describe the entire website.
"Analyze content" for a summary of the page.

After using any of these AI features, press [Alternate + Shift + 2] to interact with me for more insights.

You can press [Alternate + Shift + 3] to repeat my last response.`;

            this.appendMessage('assistant', instructions);
            this.voiceController.speakText(instructions);

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
            this.updateModel('moondream');

            const screenshot = await this.screenshotController.captureVisibleTab();
            this.voiceController.speakText("Analyzing screenshot. Please wait.");
            this.appendMessage('system', 'Analyzing screenshot. Please wait.');
            this.showPreview('image', screenshot);

            await this.handleImageAnalysis(screenshot, this.prompts.screenshot);
        } catch (error) {
            this.handleError('Error taking screenshot', error);
        } finally {
            this.elements.screenshotButton.disabled = false;
        }
    }

    async handleScrollingScreenshot() {
        if (this.state.isProcessing) return;

        try {
            this.elements.scrollingScreenshotButton.disabled = true;
            this.updateModel('moondream');

            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) throw new Error('No active tab found');

            const mergedImage = await this.screenshotController.handleScrollingScreenshot(tab);
            this.voiceController.speakText("Analyzing scrolling screenshot. Please wait.");
            this.appendMessage('system', 'Analyzing scrolling screenshot. Please wait.');
            this.showPreview('image', mergedImage);

            await this.handleImageAnalysis(mergedImage, this.prompts.scrollingScreenshot);
        } catch (error) {
            this.handleError('Scrolling screenshot failed', error);
        } finally {
            this.elements.scrollingScreenshotButton.disabled = false;
        }
    }

    async handleImageAnalysis(imageUrl, prompt = this.prompts.screenshot) {
        if (!this.state.isInitialized || this.state.isProcessing) {
            this.handleError('Model not ready', new Error('Please wait for model initialization'));
            return;
        }

        this.state.isProcessing = true;

        try {
            this.state.messages = [];
            const response = await this.generateImageResponse(imageUrl, prompt);
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
                this.voiceController.speakText('Before interacting with the AI, please select a function first, such as Screenshot, Scrolling Screenshot, or Analyze Content.');
                throw new Error('Before interacting with the AI, please select a function first, such as Screenshot, Scrolling Screenshot, or Analyze Content.');

            }

            this.elements.userInput.value = '';
        } catch (error) {
            this.handleError('Error', error);
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

            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const content = await this.extractPageContent(tab);

            this.voiceController.speakText("Analyzing webpage content. Please wait.");
            this.appendMessage('assistant', 'Analyzing webpage content. Please wait.');
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
        const formattedContent = content.replace(/\n/g, '<br>');
        messageDiv.innerHTML = `<strong>${role === 'user' ? 'You' : role === 'system' ? 'System' : 'AI'}:</strong> ${formattedContent}`;
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
        this.voiceController.speakText(response);
        this.enableInterface();
    }

    handleError(message, error) {
        console.error(message, error);
        this.appendMessage('system', error.message);
        this.resetState();
    }

    resetState() {
        this.state.isProcessing = false;
        this.enableInterface();
    }

    handleClear() {
        this.elements.conversation.innerHTML = '';
        this.elements.userInput.value = '';
        this.hidePreview();

        Object.assign(this.state, {
            messages: [],
            pastKeyValues: null,
            currentModel: 'none'
        });

        this.elements.currentModel.textContent = 'None';
        this.voiceController.cleanup();
        this.screenshotController.cleanup();
    }


    handleRepeat() {
        const lastAIMessage = [...this.elements.conversation.getElementsByClassName('assistant')]
            .pop();

        if (lastAIMessage) {
            const messageText = lastAIMessage.textContent.replace(/^AI:\s*/, '');
            this.voiceController.speakText(messageText);
        } else {
            this.appendMessage('system', 'No AI response to repeat.');
            this.voiceController.speakText('No AI response to repeat.');
        }
    }
    enableInterface() {
        this.elements.userInput.disabled = false;
        this.elements.sendButton.disabled = false;
        this.elements.screenshotButton.disabled = false;
        this.elements.analyzeContentButton.disabled = false;
        this.elements.scrollingScreenshotButton.disabled = false;
        this.elements.repeatButton.disabled = false;
    }

    disableInterface() {
        this.elements.sendButton.disabled = true;
        this.elements.repeatButton.disabled = true;
    }
}

const aiScreenReader = new AIScreenReader();