import { defaultPrompts, promptsStorageKey } from './prompts.js';
import { settingsStorageKey, defaultApiSettings } from './apiRoute.js';
import { voiceSettingsStorageKey, defaultVoiceSettings, availableLanguages } from './voiceSettings.js';

const notificationBar = document.getElementById('notification-bar');
let notificationTimeout;
let currentVoiceSettings = { ...defaultVoiceSettings };

function showNotification(message, isError = false) {
    if (!notificationBar) return;
    clearTimeout(notificationTimeout);
    notificationBar.textContent = message;
    notificationBar.classList.remove('error', 'show');
    if (isError) {
        notificationBar.classList.add('error');
    }
    notificationBar.classList.add('show');
    notificationTimeout = setTimeout(() => {
        notificationBar.classList.remove('show');
    }, 2500);
}

function populateSttLanguageDropdown() {
    const sttSelect = document.getElementById('stt-language-select');

    if (!sttSelect) return;

    sttSelect.innerHTML = '';

    for (const [code, name] of Object.entries(availableLanguages)) {
        const sttOption = document.createElement('option');
        sttOption.value = code;
        sttOption.textContent = name;
        sttSelect.appendChild(sttOption);
    }
}

function populateVoiceList() {
    const ttsVoiceSelect = document.getElementById('tts-voice-select');
    if (!ttsVoiceSelect) return;

    const currentSelectedValue = currentVoiceSettings.ttsVoiceName;
    const synth = window.speechSynthesis;
    const voices = synth.getVoices();

    ttsVoiceSelect.innerHTML = '';

    if (voices.length === 0) {
        const defaultOption = document.createElement('option');
        defaultOption.value = "";
        defaultOption.textContent = "No voices available";
        ttsVoiceSelect.appendChild(defaultOption);
        ttsVoiceSelect.disabled = true;
        console.warn("No TTS voices found yet.");
        if (typeof synth.onvoiceschanged === 'undefined') {
            console.warn("Browser does not support onvoiceschanged event.");
        }
        return;
    }

    ttsVoiceSelect.disabled = false;

    const placeholderOption = document.createElement('option');
    placeholderOption.value = "";
    placeholderOption.textContent = "-- Select a Voice --";
    ttsVoiceSelect.appendChild(placeholderOption);


    voices.forEach(voice => {
        const option = document.createElement('option');
        option.value = voice.name;
        option.textContent = `${voice.name} (${voice.lang})`;
        if (voice.default) {
            option.textContent += ' [Default]';
        }
        ttsVoiceSelect.appendChild(option);
    });

    if (currentSelectedValue && ttsVoiceSelect.querySelector(`option[value="${CSS.escape(currentSelectedValue)}"]`)) {
        ttsVoiceSelect.value = currentSelectedValue;
    } else {
        let defaultEnUsVoice = voices.find(voice => voice.lang === 'en-US' && voice.default);
        if (!defaultEnUsVoice) {
            defaultEnUsVoice = voices.find(voice => voice.lang === 'en-US');
        }

        if (defaultEnUsVoice) {
            ttsVoiceSelect.value = defaultEnUsVoice.name;
            console.log(`No valid ttsVoiceName found, defaulting UI selection to en-US voice: ${defaultEnUsVoice.name}`);
        } else {
            ttsVoiceSelect.value = "";
            console.warn("No en-US voice found to set as default UI selection.");
        }
    }
}

function loadOptions() {
    populateSttLanguageDropdown();
    populateVoiceList();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = populateVoiceList;
    }

    const localUrlInput = document.getElementById('local-url-input');
    const localModelInput = document.getElementById('local-model-name-input');
    const cloudApiUrlInput = document.getElementById('cloud-api-url-input');
    const cloudApiKeyInput = document.getElementById('cloud-api-key-input');
    const cloudModelNameInput = document.getElementById('cloud-model-name-input');
    const defaultChatPromptTextarea = document.getElementById('default-chat-prompt');
    const screenshotPromptTextarea = document.getElementById('screenshot-prompt');
    const scrollingScreenshotPromptTextarea = document.getElementById('scrolling-screenshot-prompt');
    const analyzeContentPromptTextarea = document.getElementById('analyze-content-prompt');
    const sttSelect = document.getElementById('stt-language-select');
    const ttsVoiceSelect = document.getElementById('tts-voice-select');

    chrome.storage.local.get([promptsStorageKey, settingsStorageKey, voiceSettingsStorageKey], (result) => {
        const savedPrompts = result[promptsStorageKey] || { ...defaultPrompts };
        const savedApiSettings = result[settingsStorageKey] || { ...defaultApiSettings };
        const savedVoiceSettings = result[voiceSettingsStorageKey] || { ...defaultVoiceSettings };

        currentVoiceSettings = { ...savedVoiceSettings };

        if (localUrlInput) localUrlInput.value = savedApiSettings.localApiUrl ?? defaultApiSettings.localApiUrl;
        if (localModelInput) localModelInput.value = savedApiSettings.ollamaMultimodalModel ?? defaultApiSettings.ollamaMultimodalModel;
        if (cloudApiUrlInput) cloudApiUrlInput.value = savedApiSettings.cloudApiUrl ?? defaultApiSettings.cloudApiUrl;
        if (cloudApiKeyInput) cloudApiKeyInput.value = savedApiSettings.cloudApiKey ?? defaultApiSettings.cloudApiKey;
        if (cloudModelNameInput) cloudModelNameInput.value = savedApiSettings.cloudModelName ?? defaultApiSettings.cloudModelName;

        if (sttSelect) sttSelect.value = savedVoiceSettings.sttLanguage ?? defaultVoiceSettings.sttLanguage;

        if (defaultChatPromptTextarea) defaultChatPromptTextarea.value = savedPrompts.defaultChat ?? defaultPrompts.defaultChat;
        if (screenshotPromptTextarea) screenshotPromptTextarea.value = savedPrompts.screenshot ?? defaultPrompts.screenshot;
        if (scrollingScreenshotPromptTextarea) scrollingScreenshotPromptTextarea.value = savedPrompts.scrollingScreenshot ?? defaultPrompts.scrollingScreenshot;
        if (analyzeContentPromptTextarea) analyzeContentPromptTextarea.value = savedPrompts.analyzeContent ?? defaultPrompts.analyzeContent;

        populateVoiceList();
    });
}

function saveSetting(element) {
    const storageKey = element.dataset.storageKey;
    const storageType = element.dataset.storageType;
    const value = element.type === 'checkbox' ? element.checked : element.value;

    if (!storageKey || !storageType) {
        console.error("Missing data attributes on element:", element);
        return;
    }

    let storageAreaKey;
    let defaultValues;

    switch (storageType) {
        case 'settings':
            storageAreaKey = settingsStorageKey;
            defaultValues = defaultApiSettings;
            break;
        case 'prompts':
            storageAreaKey = promptsStorageKey;
            defaultValues = defaultPrompts;
            break;
        case 'voice':
            storageAreaKey = voiceSettingsStorageKey;
            defaultValues = defaultVoiceSettings;
            break;
        default:
            console.error(`Unknown storage type: ${storageType}`);
            return;
    }


    chrome.storage.local.get(storageAreaKey, (result) => {
        const currentData = result[storageAreaKey] || { ...defaultValues };
        if (storageType === 'voice') {
            currentVoiceSettings[storageKey] = value;
        }
        const updatedData = { ...currentData };
        updatedData[storageKey] = value;

        const dataToStore = {};
        dataToStore[storageAreaKey] = updatedData;

        chrome.storage.local.set(dataToStore, () => {
            if (chrome.runtime.lastError) {
                const errorMessage = `Error saving ${storageKey}: ${chrome.runtime.lastError.message}`;
                console.error(errorMessage, element);
                showNotification(errorMessage, true);
            } else {
                console.log(`${storageKey} saved successfully:`, value);
                showNotification('Saved successfully!');
            }
        });
    });
}

function resetToDefaults() {
    chrome.storage.local.get(settingsStorageKey, (result) => {
        const currentSettings = result[settingsStorageKey] || {};
        const preservedApiKey = currentSettings.cloudApiKey || defaultApiSettings.cloudApiKey;

        const settingsToReset = {};

        settingsToReset[settingsStorageKey] = {
            ...defaultApiSettings,
            cloudApiKey: preservedApiKey
        };
        settingsToReset[promptsStorageKey] = { ...defaultPrompts };
        settingsToReset[voiceSettingsStorageKey] = { ...defaultVoiceSettings };

        chrome.storage.local.set(settingsToReset, () => {
            if (chrome.runtime.lastError) {
                const errorMessage = `Error resetting settings: ${chrome.runtime.lastError.message}`;
                console.error(errorMessage);
                showNotification(errorMessage, true);
            } else {
                console.log("Settings reset to default, preserving Cloud API Key.");
                loadOptions();
                showNotification('Settings reset to defaults successfully!');
            }
        });
    });
}


document.addEventListener('DOMContentLoaded', () => {
    loadOptions();

    const inputsToSave = document.querySelectorAll('input[data-storage-key], textarea[data-storage-key]');
    inputsToSave.forEach(input => {
        input.addEventListener('blur', () => saveSetting(input));
        if (input.type === 'text' || input.type === 'password') {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    saveSetting(input);
                    input.blur();
                }
            });
        }
    });

    const selectsToSave = document.querySelectorAll('select[data-storage-key]');
    selectsToSave.forEach(select => {
        select.addEventListener('change', () => saveSetting(select));
    });

    const resetButton = document.getElementById('reset-button');
    if (resetButton) {
        resetButton.addEventListener('click', resetToDefaults);
    } else {
        console.error("Reset button not found!");
    }
});

export { promptsStorageKey, defaultPrompts };