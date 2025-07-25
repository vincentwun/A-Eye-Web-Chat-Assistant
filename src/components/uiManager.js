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

        messageDiv.innerHTML = formattedContent;
        this.elements.conversation.appendChild(messageDiv);
        this.elements.conversation.scrollTop = this.elements.conversation.scrollHeight;
    }

    appendPreviewMessage(type, content) {
        if (!this.elements.conversation) return;

        const previewContainerDiv = document.createElement('div');
        previewContainerDiv.classList.add('message', 'message-user', 'message-preview');

        if (type === 'image') {
            const img = document.createElement('img');
            img.src = content;
            previewContainerDiv.appendChild(img);
        } else {
            const pre = document.createElement('pre');
            pre.innerHTML = content;
            previewContainerDiv.appendChild(pre);
        }

        this.elements.conversation.appendChild(previewContainerDiv);
        this.elements.conversation.scrollTop = this.elements.conversation.scrollHeight;
    }


    showThinkingIndicator() {
        if (!this.elements.conversation || document.getElementById('thinking-indicator')) return;

        const indicatorDiv = document.createElement('div');
        indicatorDiv.id = 'thinking-indicator';
        indicatorDiv.classList.add('message', 'message-assistant');

        indicatorDiv.innerHTML = `<div class="dot-flashing"></div>`;

        this.elements.conversation.appendChild(indicatorDiv);
        this.elements.conversation.scrollTop = this.elements.conversation.scrollHeight;
    }

    hideThinkingIndicator() {
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