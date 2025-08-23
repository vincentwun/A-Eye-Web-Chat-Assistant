export class UIManager {
    constructor(voiceController) {
        this._getElements();
        this.voiceController = voiceController;

        if (!this.elements.conversation || !this.elements.localModeButton || !this.elements.cloudModeButton) {
            console.error("UIManager initialized with missing essential elements (conversation or mode buttons).");
        }
        if (!this.elements.currentModeIndicator) {
            console.warn("UIManager initialized without currentModeIndicator element.");
        }
    }

    _getElements() {
        this.elements = {
            screenshotButton: document.getElementById('screenshot-button'),
            scrollingScreenshotButton: document.getElementById('scrolling-screenshot-button'),
            analyzeContentButton: document.getElementById('analyze-content-button'),
            getElementButton: document.getElementById('get-element-button'),
            openOptionsButton: document.getElementById('options-button'),
            conversation: document.getElementById('conversation'),
            userInput: document.getElementById('user-input'),
            sendButton: document.getElementById('send-button'),
            voiceButton: document.getElementById('voiceInput-button'),
            repeatButton: document.getElementById('repeat-button'),
            clearButton: document.getElementById('clear-button'),
            localModeButton: document.getElementById('local-mode-button'),
            cloudModeButton: document.getElementById('cloud-mode-button'),
            currentModeIndicator: document.getElementById('current-mode-indicator'),
            pastedImagePreviewContainer: document.getElementById('pasted-image-preview-container'),
            pastedImagePreview: document.getElementById('pasted-image-preview'),
            removePastedImageButton: document.getElementById('remove-pasted-image-button')
        };
    }

    bindEventListeners(handlers) {
        const eventMap = {
            'screenshotButton': { event: 'click', handler: handlers.onScreenshot },
            'scrollingScreenshotButton': { event: 'click', handler: handlers.onScrollingScreenshot },
            'analyzeContentButton': { event: 'click', handler: handlers.onAnalyzeContent },
            'getElementButton': { event: 'click', handler: handlers.onGetElements },
            'sendButton': { event: 'click', handler: handlers.onSendMessage },
            'voiceButton': { event: 'click', handler: handlers.onToggleVoice },
            'repeatButton': { event: 'click', handler: handlers.onRepeat },
            'localModeButton': { event: 'click', handler: handlers.onModeChangeLocal },
            'cloudModeButton': { event: 'click', handler: handlers.onModeChangeCloud },
            'clearButton': { event: 'click', handler: handlers.onClear },
            'removePastedImageButton': { event: 'click', handler: handlers.onRemovePastedImage },
            'openOptionsButton': { event: 'click', handler: handlers.onOpenOptions },
            'userInput': [
                { event: 'paste', handler: handlers.onPaste },
                { event: 'input', handler: () => this.updateInputState() },
                { event: 'keypress', handler: handlers.onUserInputKeypress }
            ]
        };

        for (const elementId in eventMap) {
            const element = this.elements[elementId];
            if (element) {
                const events = Array.isArray(eventMap[elementId]) ? eventMap[elementId] : [eventMap[elementId]];
                events.forEach(({ event, handler }) => {
                    element.addEventListener(event, handler);
                });
            } else {
                console.warn(`Element with ID '${elementId}' not found for event listener.`);
            }
        }
    }

    getUserInput() {
        return this.elements.userInput.value.trim();
    }

    isPastedImageVisible() {
        return this.elements.pastedImagePreviewContainer.style.display !== 'none';
    }

    applyUIScale(scale) {
        document.documentElement.style.fontSize = `${scale}%`;
    }

    focusUserInput() {
        this.elements.userInput?.focus();
    }

    appendMessage(role, formattedContent) {
        if (!this.elements.conversation) return;

        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', `message-${role}`);

        messageDiv.innerHTML = formattedContent;
        this.elements.conversation.appendChild(messageDiv);

        this._enhanceCodeBlocks(messageDiv);

        this.elements.conversation.scrollTop = this.elements.conversation.scrollHeight;
    }

    _enhanceCodeBlocks(container) {
        const codeBlocks = container.querySelectorAll('pre > code');
        codeBlocks.forEach(codeBlock => {
            const preElement = codeBlock.parentElement;
            const wrapper = document.createElement('div');
            wrapper.className = 'code-block-container';

            const header = document.createElement('div');
            header.className = 'code-block-header';

            const langName = document.createElement('span');
            langName.className = 'language-name';
            const langClass = Array.from(codeBlock.classList).find(cls => cls.startsWith('language-'));
            langName.textContent = langClass ? langClass.replace('language-', '') : 'code';

            const copyButton = document.createElement('button');
            copyButton.className = 'copy-button';
            copyButton.innerHTML = '<i class="far fa-copy"></i> Copy';
            copyButton.addEventListener('click', () => {
                navigator.clipboard.writeText(codeBlock.textContent).then(() => {
                    copyButton.innerHTML = '<i class="fas fa-check"></i> Copied';
                    setTimeout(() => {
                        copyButton.innerHTML = '<i class="far fa-copy"></i> Copy';
                    }, 2000);
                }).catch(err => {
                    console.error('Failed to copy text: ', err);
                    copyButton.textContent = 'Copy Failed';
                });
            });

            header.appendChild(langName);
            header.appendChild(copyButton);

            preElement.parentNode.insertBefore(wrapper, preElement);
            wrapper.appendChild(header);
            wrapper.appendChild(preElement);

            if (window.hljs) {
                window.hljs.highlightElement(codeBlock);
            }
        });
    }

    async appendUserMessageWithImage({ text, imageUrl }) {
        if (!this.elements.conversation) return;

        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', 'message-user');

        if (text) {
            const textDiv = document.createElement('div');
            textDiv.className = 'message-text';
            textDiv.innerHTML = this.escapeHTML(text);
            messageDiv.appendChild(textDiv);
        }

        if (imageUrl) {
            const imageContainer = document.createElement('div');
            imageContainer.className = 'message-image-container';
            const thumbnailUrl = await this._createThumbnail(imageUrl, 150);
            const img = document.createElement('img');
            img.src = thumbnailUrl;
            imageContainer.appendChild(img);
            messageDiv.appendChild(imageContainer);
        }

        this.elements.conversation.appendChild(messageDiv);
        this.elements.conversation.scrollTop = this.elements.conversation.scrollHeight;
    }


    async appendPreviewMessage(type, content) {
        if (!this.elements.conversation) return;

        const previewContainerDiv = document.createElement('div');
        previewContainerDiv.classList.add('message', 'message-user', 'message-preview');

        if (type === 'image') {
            const thumbnailUrl = await this._createThumbnail(content);
            const img = document.createElement('img');
            img.src = thumbnailUrl;
            previewContainerDiv.appendChild(img);
        } else {
            const pre = document.createElement('pre');
            pre.innerHTML = content;
            previewContainerDiv.appendChild(pre);
        }

        this.elements.conversation.appendChild(previewContainerDiv);
        this.elements.conversation.scrollTop = this.elements.conversation.scrollHeight;
    }

    _createThumbnail(dataUrl, maxHeight = 100) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                let width = img.width;
                let height = img.height;

                if (height > maxHeight) {
                    width = (maxHeight / height) * width;
                    height = maxHeight;
                }

                canvas.width = width;
                canvas.height = height;

                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.9));
            };
            img.onerror = (err) => {
                console.error("Failed to load image for thumbnail creation", err);
                reject(new Error("Failed to load image for thumbnail creation."));
            };
            img.src = dataUrl;
        });
    }

    showThinkingIndicator() {
        if (!this.elements.conversation || document.getElementById('thinking-indicator')) return;

        const indicatorDiv = document.createElement('div');
        indicatorDiv.id = 'thinking-indicator';
        indicatorDiv.classList.add('message', 'message-assistant');

        indicatorDiv.innerHTML = `<div class="dot-flashing"></div>`;

        this.elements.conversation.appendChild(indicatorDiv);
        this.elements.conversation.scrollTop = this.elements.conversation.scrollHeight;

        if (this.voiceController) {
            this.voiceController.startThinkingSoundLoop();
        }
    }

    hideThinkingIndicator() {
        if (this.voiceController) {
            this.voiceController.stopThinkingSoundLoop();
        }
        const indicator = document.getElementById('thinking-indicator');
        if (indicator) {
            indicator.remove();
        }
    }

    updateModeUI(activeMode) {
        const localBtn = this.elements.localModeButton;
        const cloudBtn = this.elements.cloudModeButton;

        if (!localBtn || !cloudBtn) {
            console.warn("Cannot update mode UI, mode buttons not found in elements.");
            return;
        }

        const isLocal = activeMode === 'local';

        localBtn.classList.toggle('active-mode', isLocal);
        cloudBtn.classList.toggle('active-mode', !isLocal);
        this.updateModeIndicator(activeMode);
    }

    updateModeIndicator(activeMode) {
        if (!this.elements.currentModeIndicator) {
            return;
        }
        const modeText = activeMode === 'local' ? 'Local' : 'Cloud';
        this.elements.currentModeIndicator.textContent = `Mode: ${modeText}`;
    }

    updateInputState() {
        if (!this.elements.sendButton) return;
        const inputValue = this.elements.userInput.value;
        const hasImage = this.isPastedImageVisible();
        this.elements.sendButton.disabled = (!inputValue || inputValue.trim().length === 0) && !hasImage;
    }

    setProcessingState(isProcessing) {
        this.elements.userInput.disabled = isProcessing;
        this.elements.sendButton.disabled = isProcessing || !this.getUserInput();

        this.elements.screenshotButton.disabled = isProcessing;
        this.elements.scrollingScreenshotButton.disabled = isProcessing;
        this.elements.analyzeContentButton.disabled = isProcessing;
        this.elements.getElementButton.disabled = isProcessing;
        this.elements.repeatButton.disabled = isProcessing;
        this.elements.voiceButton.disabled = isProcessing;
        this.elements.clearButton.disabled = isProcessing;
        this.elements.removePastedImageButton.disabled = isProcessing;

        this.elements.localModeButton.disabled = isProcessing;
        this.elements.cloudModeButton.disabled = isProcessing;

        if (isProcessing && this.elements.voiceButton.classList.contains('active-recording')) {
            this.updateVoiceButtonState(false);
        }
    }

    updateVoiceButtonState(isActive) {
        if (!this.elements.voiceButton) return;
        this.elements.voiceButton.classList.toggle('active-recording', isActive);
        const icon = this.elements.voiceButton.querySelector('i');
        if (icon) {
            icon.className = isActive ? 'fas fa-stop' : 'fas fa-microphone';
        }
    }

    clearConversation() {
        if (!this.elements.conversation) return;
        this.elements.conversation.innerHTML = '';
        this.hidePastedImagePreview();
    }

    clearUserInput() {
        if (!this.elements.userInput) return;
        this.elements.userInput.value = '';
        this.updateInputState();
    }

    escapeHTML(str) {
        if (!str) return '';
        const p = document.createElement('p');
        p.textContent = str;
        return p.innerHTML.replace(/\n/g, '<br>');
    }

    showPastedImagePreview(dataUrl) {
        if (!this.elements.pastedImagePreviewContainer || !this.elements.pastedImagePreview) return;
        this.elements.pastedImagePreview.src = dataUrl;
        this.elements.pastedImagePreviewContainer.style.display = 'block';
        this.updateInputState();
    }

    hidePastedImagePreview() {
        if (!this.elements.pastedImagePreviewContainer || !this.elements.pastedImagePreview) return;
        this.elements.pastedImagePreview.src = '';
        this.elements.pastedImagePreviewContainer.style.display = 'none';
        this.updateInputState();
    }
}