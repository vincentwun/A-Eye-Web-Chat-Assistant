export class UIManager {
    constructor(elements) {
        this.elements = elements;
        if (!this.elements || !this.elements.conversation || !this.elements.localModeButton || !this.elements.cloudModeButton) {
            console.error("UIManager initialized with missing essential elements (conversation or mode buttons).");
        }
        if (!this.elements.currentModeIndicator) {
            console.warn("UIManager initialized without currentModeIndicator element.");
        }
    }

    appendMessage(role, formattedContent) {
        if (!this.elements.conversation) return;

        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', `message-${role}`);

        let rolePrefix = 'A-Eye';
        if (role === 'user') rolePrefix = 'You';
        else if (role === 'system') rolePrefix = 'System';

        messageDiv.innerHTML = `<strong>${rolePrefix}:</strong> ${formattedContent}`;
        this.elements.conversation.appendChild(messageDiv);
        this.elements.conversation.scrollTop = this.elements.conversation.scrollHeight;
    }

    showPreview(type, content) {
        if (!this.elements.previewContainer || !this.elements.previewImage || !this.elements.previewText) return;
        this.elements.previewContainer.style.display = 'block';
        const isImage = type === 'image';
        this.elements.previewImage.style.display = isImage ? 'block' : 'none';
        this.elements.previewText.style.display = !isImage ? 'block' : 'none';

        if (isImage) {
            this.elements.previewImage.src = content || '';
        } else {
            this.elements.previewText.innerHTML = content || '';
        }
    }

    hidePreview() {
        if (!this.elements.previewContainer || !this.elements.previewImage || !this.elements.previewText) return;
        this.elements.previewContainer.style.display = 'none';
        this.elements.previewImage.style.display = 'none';
        this.elements.previewText.style.display = 'none';
        this.elements.previewImage.src = '';
        this.elements.previewText.innerHTML = '';
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
        this.elements.currentModeIndicator.textContent = `Current Mode: ${modeText}`;
    }

    updateInputState(inputValue) {
        if (!this.elements.sendButton) return;
        this.elements.sendButton.disabled = !inputValue || inputValue.trim().length === 0;
    }

    setProcessingState(isProcessing) {
        console.log(isProcessing ? "Disabling interface (UIManager)" : "Enabling interface (UIManager)");

        this.elements.userInput.disabled = isProcessing;
        this.elements.sendButton.disabled = isProcessing || !this.elements.userInput.value.trim();

        this.elements.screenshotButton.disabled = isProcessing;
        this.elements.scrollingScreenshotButton.disabled = isProcessing;
        this.elements.analyzeContentButton.disabled = isProcessing;
        this.elements.repeatButton.disabled = isProcessing;
        this.elements.voiceButton.disabled = isProcessing;
        this.elements.clearButton.disabled = isProcessing;

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
    }

    clearUserInput() {
        if (!this.elements.userInput) return;
        this.elements.userInput.value = '';
        this.updateInputState('');
    }

    escapeHTML(str) {
        if (!str) return '';
        const p = document.createElement('p');
        p.textContent = str;
        return p.innerHTML.replace(/\n/g, '<br>');
    }
}