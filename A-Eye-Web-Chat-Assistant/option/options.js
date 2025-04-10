import { defaultPrompts, promptsStorageKey } from '../components/prompts.js';

function loadOptions() {
    chrome.storage.local.get([promptsStorageKey], (result) => {
        const savedPrompts = result[promptsStorageKey] || {};

        document.getElementById('screenshot-prompt').value =
            savedPrompts.screenshot || defaultPrompts.screenshot;
        document.getElementById('scrolling-screenshot-prompt').value =
            savedPrompts.scrollingScreenshot || defaultPrompts.scrollingScreenshot;
        document.getElementById('analyze-content-prompt').value =
            savedPrompts.analyzeContent || defaultPrompts.analyzeContent;
        document.getElementById('default-chat-prompt').value =
            savedPrompts.defaultChat || defaultPrompts.defaultChat;

        console.log("Options loaded:", { ...defaultPrompts, ...savedPrompts });
    });
}

function saveOptions() {
    const newPrompts = {
        screenshot: document.getElementById('screenshot-prompt').value.trim(),
        scrollingScreenshot: document.getElementById('scrolling-screenshot-prompt').value.trim(),
        analyzeContent: document.getElementById('analyze-content-prompt').value.trim(),
        defaultChat: document.getElementById('default-chat-prompt').value.trim()
    };

    chrome.storage.local.set({ [promptsStorageKey]: newPrompts }, () => {
        const status = document.getElementById('status');
        if (chrome.runtime.lastError) {
            status.textContent = `Error saving: ${chrome.runtime.lastError.message}`;
            status.style.color = 'red';
            console.error("Error saving options:", chrome.runtime.lastError);
        } else {
            status.textContent = 'Options saved successfully!';
            status.style.color = 'green';
            console.log("Options saved:", newPrompts);
            setTimeout(() => {
                status.textContent = '';
            }, 2500);
        }
    });
}

document.addEventListener('DOMContentLoaded', loadOptions);
document.getElementById('save-button').addEventListener('click', saveOptions);