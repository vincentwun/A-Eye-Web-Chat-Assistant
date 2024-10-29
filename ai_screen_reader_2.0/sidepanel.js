import { pipeline, env, AutoProcessor, AutoTokenizer, LlavaForConditionalGeneration, RawImage } from './transformers300.js';

class ImageAnalyzer {
    constructor() {
        this.tokenizer = null;
        this.processor = null;
        this.model = null;
        this.pastKeyValues = null;
        this.messages = [];
        this.isProcessing = false;
        this.isSpeaking = false;

        this.initializeElements();
        this.setupEventListeners();
        this.initializeModel();
        this.initializeTTS();
    }

    initializeTTS() {
        if ('speechSynthesis' in window) {
            this.speechSynthesis = window.speechSynthesis;
            this.voices = [];
            speechSynthesis.addEventListener('voiceschanged', () => {
                this.voices = this.speechSynthesis.getVoices();
                this.cantonoseVoice = this.voices.find(voice =>
                    voice.lang.includes('zh-HK') || voice.lang.includes('yue')
                );
            });
        }
    }

    speakText(text) {
        if (!this.speechSynthesis) return;

        if (this.isSpeaking) {
            this.speechSynthesis.cancel();
        }

        const utterance = new SpeechSynthesisUtterance(text);

        utterance.voice = this.cantonoseVoice;
        utterance.lang = 'zh-HK';
        utterance.rate = 2.0;      // 語速
        utterance.pitch = 2.0;     // 音調
        utterance.volume = 1.0;    // 音量

        this.isSpeaking = true;
        utterance.onend = () => {
            this.isSpeaking = false;
        };

        this.speechSynthesis.speak(utterance);
    }

    initializeElements() {
        this.elements = {
            screenshotButton: document.getElementById('screenshot-button'),
            imagePreview: document.getElementById('image-preview'),
            conversation: document.getElementById('conversation'),
            userInput: document.getElementById('user-input'),
            sendButton: document.getElementById('send-button')
        };
    }

    setupEventListeners() {
        this.elements.screenshotButton.addEventListener('click', this.handleScreenshot.bind(this));
        this.elements.sendButton.addEventListener('click', this.handleSendMessage.bind(this));
        this.elements.userInput.addEventListener('input', this.handleInputChange.bind(this));
        this.elements.userInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.handleSendMessage();
            }
        });
    }

    async handleScreenshot() {
        if (this.isProcessing) return;

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

    async initializeModel() {
        try {
            const modelId = 'onnx-community/nanoLLaVA-1.5';
            this.tokenizer = await AutoTokenizer.from_pretrained(modelId);
            this.processor = await AutoProcessor.from_pretrained(modelId);
            this.model = await LlavaForConditionalGeneration.from_pretrained(modelId, {
                dtype: {
                    embed_tokens: 'fp16',
                    vision_encoder: 'fp16',
                    decoder_model_merged: 'q4',
                },
                device: 'webgpu',
            });
            this.elements.screenshotButton.disabled = false;
        } catch (error) {
            this.handleError('Error initializing model', error);
        }
    }

    async handleImageAnalysis(imageUrl) {
        if (this.isProcessing) return;
        this.isProcessing = true;

        try {
            this.messages = [
                { role: 'system', content: 'Answer the question.' },
                { role: 'user', content: `<image>\n用自然流暢的文字描述圖片內容` }
            ];
            this.appendMessage('AI', 'Analyzing screenshot...');

            const text = this.tokenizer.apply_chat_template(this.messages, { tokenize: false, add_generation_prompt: true });
            const textInputs = this.tokenizer(text);
            const image = await RawImage.fromURL(imageUrl);
            const visionInputs = await this.processor(image);

            const output = await this.model.generate({
                ...textInputs,
                ...visionInputs,
                do_sample: false,
                max_new_tokens: 64,
                repetition_penalty: 1.0,
                return_dict_in_generate: true,
            });

            this.pastKeyValues = output.past_key_values;
            const answer = this.tokenizer.decode(
                output.sequences.slice(0, [textInputs.input_ids.dims[1], null]),
                { skip_special_tokens: true },
            );
            this.appendMessage('assistant', answer);
            this.messages.push({ role: 'assistant', content: answer });
            this.speakText(answer);
            this.enableInterface();
        } catch (error) {
            this.handleError('Error analyzing screenshot', error);
        } finally {
            this.isProcessing = false;
        }
    }

    async handleSendMessage() {
        const input = this.elements.userInput.value.trim();
        if (input === '' || this.isProcessing) return;

        this.isProcessing = true;
        this.disableInterface();

        try {
            this.appendMessage('user', input);
            this.messages.push({ role: 'user', content: input });
            this.elements.userInput.value = '';
            await this.generateResponse();
        } catch (error) {
            this.handleError('Error sending message', error);
        } finally {
            this.isProcessing = false;
            this.enableInterface();
        }
    }

    async generateResponse() {
        try {
            const newText = this.tokenizer.apply_chat_template(this.messages, { tokenize: false, add_generation_prompt: true });
            const newTextInputs = this.tokenizer(newText);

            const output = await this.model.generate({
                ...newTextInputs,
                past_key_values: this.pastKeyValues,
                do_sample: false,
                max_new_tokens: 256,
                return_dict_in_generate: true,
            });

            this.pastKeyValues = output.past_key_values;
            const newAnswer = this.tokenizer.decode(
                output.sequences.slice(0, [newTextInputs.input_ids.dims[1], null]),
                { skip_special_tokens: true },
            );
            this.appendMessage('assistant', newAnswer);
            this.messages.push({ role: 'assistant', content: newAnswer });
            this.speakText(newAnswer);
        } catch (error) {
            this.handleError('Error generating response', error);
        }
    }

    handleInputChange() {
        this.elements.sendButton.disabled = this.elements.userInput.value.trim() === '';
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
    }

    enableInterface() {
        this.elements.userInput.disabled = false;
        this.elements.sendButton.disabled = true;
    }

    disableInterface() {
        this.elements.sendButton.disabled = true;
    }
}

const imageAnalyzer = new ImageAnalyzer();