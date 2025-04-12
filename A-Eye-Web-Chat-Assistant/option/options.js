import { defaultPrompts, promptsStorageKey } from './prompts.js';
import { settingsStorageKey, defaultApiSettings } from './apiRoute.js';

function loadOptions() {
    const localUrlInput = document.getElementById('local-url-input');
    const localModelInput = document.getElementById('local-model-name-input');
    const cloudApiUrlInput = document.getElementById('cloud-api-url-input');
    const cloudApiKeyInput = document.getElementById('cloud-api-key-input');
    const cloudModelNameInput = document.getElementById('cloud-model-name-input');
    const defaultChatPromptTextarea = document.getElementById('default-chat-prompt');
    const screenshotPromptTextarea = document.getElementById('screenshot-prompt');
    const scrollingScreenshotPromptTextarea = document.getElementById('scrolling-screenshot-prompt');
    const analyzeContentPromptTextarea = document.getElementById('analyze-content-prompt');

    chrome.storage.local.get([promptsStorageKey, settingsStorageKey], (result) => {
        const savedPrompts = result[promptsStorageKey] || {};
        const savedApiSettings = result[settingsStorageKey] || {};

        if (localUrlInput) {
            localUrlInput.value = savedApiSettings.localApiUrl || defaultApiSettings.localApiUrl;
        }
        if (localModelInput) {
            localModelInput.value = savedApiSettings.ollamaMultimodalModel || defaultApiSettings.ollamaMultimodalModel;
        }
        if (cloudApiUrlInput) {
            cloudApiUrlInput.value = savedApiSettings.cloudApiUrl || defaultApiSettings.cloudApiUrl;
        }

        if (cloudApiKeyInput) {
            cloudApiKeyInput.value = savedApiSettings.cloudApiKey ?? defaultApiSettings.cloudApiKey;
        }
        if (cloudModelNameInput) {
            cloudModelNameInput.value = savedApiSettings.cloudModelName || defaultApiSettings.cloudModelName;
        }

        if (defaultChatPromptTextarea) {
            defaultChatPromptTextarea.value = savedPrompts.defaultChat || defaultPrompts.defaultChat;
        }
        if (screenshotPromptTextarea) {
            screenshotPromptTextarea.value = savedPrompts.screenshot || defaultPrompts.screenshot;
        }
        if (scrollingScreenshotPromptTextarea) {
            scrollingScreenshotPromptTextarea.value = savedPrompts.scrollingScreenshot || defaultPrompts.scrollingScreenshot;
        }
        if (analyzeContentPromptTextarea) {
            analyzeContentPromptTextarea.value = savedPrompts.analyzeContent || defaultPrompts.analyzeContent;
        }
    });
}

function saveOptions() {
    const newPrompts = {
        screenshot: document.getElementById('screenshot-prompt')?.value.trim() ?? '',
        scrollingScreenshot: document.getElementById('scrolling-screenshot-prompt')?.value.trim() ?? '',
        analyzeContent: document.getElementById('analyze-content-prompt')?.value.trim() ?? '',
        defaultChat: document.getElementById('default-chat-prompt')?.value.trim() ?? ''
    };

    const newApiSettings = {
        localApiUrl: document.getElementById('local-url-input')?.value.trim() ?? '',
        ollamaMultimodalModel: document.getElementById('local-model-name-input')?.value.trim() ?? '',
        cloudApiUrl: document.getElementById('cloud-api-url-input')?.value.trim() ?? '',
        cloudApiKey: document.getElementById('cloud-api-key-input')?.value.trim() ?? '',
        cloudModelName: document.getElementById('cloud-model-name-input')?.value.trim() ?? ''
    };

    chrome.storage.local.get(settingsStorageKey, (result) => {
        const currentApiSettings = result[settingsStorageKey] || defaultApiSettings;
        const settingsToSave = {
            ...currentApiSettings,
            ...newApiSettings
        };

        chrome.storage.local.set({
            [promptsStorageKey]: newPrompts,
            [settingsStorageKey]: settingsToSave
        }, () => {
            const status = document.getElementById('status');
            if (!status) return;

            if (chrome.runtime.lastError) {
                status.textContent = `Error saving: ${chrome.runtime.lastError.message}`;
                status.style.color = 'red';
                console.error("Error saving options:", chrome.runtime.lastError);
            } else {
                status.textContent = 'Settings saved successfully!';
                status.style.color = 'green';
                console.log("Settings saved:", { prompts: newPrompts, apiSettings: settingsToSave });
                setTimeout(() => {
                    status.textContent = '';
                }, 2500);
            }
        });
    });
}


document.addEventListener('DOMContentLoaded', () => {
    loadOptions();
    const saveButton = document.getElementById('save-button');
    if (saveButton) {
        saveButton.addEventListener('click', saveOptions);
    } else {
        console.error("Save button not found!");
    }
});

export { promptsStorageKey, defaultPrompts };