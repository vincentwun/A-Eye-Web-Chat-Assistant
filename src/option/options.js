import { defaultPrompts, promptsStorageKey } from './prompts.js';
import { settingsStorageKey, defaultApiSettings } from './apiRoute.js';
import { voiceSettingsStorageKey, defaultVoiceSettings, availableLanguages } from './voiceSettings.js';

const notificationBar = document.getElementById('notification-bar');
let notificationTimeout;
let currentVoiceSettings = null;

const localModelSelect = document.getElementById('local-model-name-select');
const localModelInputOther = document.getElementById('local-model-name-input-other');
const localModelWarning = document.getElementById('local-model-name-warning');
const predefinedLocalModels = ["gemma3:4b", "gemma3:12b", "gemma3:27b"];

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

function showLocalModelWarning(message) {
    if (localModelWarning) {
        localModelWarning.textContent = message;
        localModelWarning.style.display = 'block';
    }
}

function hideLocalModelWarning() {
    if (localModelWarning) {
        localModelWarning.textContent = '';
        localModelWarning.style.display = 'none';
    }
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
    if (!ttsVoiceSelect || !currentVoiceSettings) return;
    const synth = window.speechSynthesis;

    const setVoices = () => {
        const voices = synth.getVoices();
        const previousValue = ttsVoiceSelect.value;
        ttsVoiceSelect.innerHTML = '';

        if (voices.length === 0) {
            const defaultOption = document.createElement('option');
            defaultOption.value = ""; defaultOption.textContent = "No voices available";
            ttsVoiceSelect.appendChild(defaultOption); ttsVoiceSelect.disabled = true;
            console.warn("No TTS voices found yet in populateVoiceList.");
            return;
        }

        ttsVoiceSelect.disabled = false;
        const placeholderOption = document.createElement('option');
        placeholderOption.value = ""; placeholderOption.textContent = "-- Select a Voice --";
        ttsVoiceSelect.appendChild(placeholderOption);

        voices.forEach(voice => {
            const option = document.createElement('option');
            option.value = voice.name; option.textContent = `${voice.name} (${voice.lang})`;
            if (voice.default) option.textContent += ' [Default]';
            ttsVoiceSelect.appendChild(option);
        });

        const targetVoiceName = currentVoiceSettings.ttsVoiceName;

        if (targetVoiceName && ttsVoiceSelect.querySelector(`option[value="${CSS.escape(targetVoiceName)}"]`)) {
            ttsVoiceSelect.value = targetVoiceName;
            console.log(`populateVoiceList: Set selected voice to "${targetVoiceName}"`);
        } else if (previousValue && ttsVoiceSelect.querySelector(`option[value="${CSS.escape(previousValue)}"]`)) {
            ttsVoiceSelect.value = previousValue;
            console.log(`populateVoiceList: Saved voice "${targetVoiceName}" not found, kept previous value "${previousValue}"`);
        } else {
            let defaultEnUsVoice = voices.find(voice => voice.lang === 'en-US' && voice.default) || voices.find(voice => voice.lang === 'en-US');
            if (defaultEnUsVoice) {
                ttsVoiceSelect.value = defaultEnUsVoice.name;
                console.log(`populateVoiceList: No saved/previous value found, defaulting to en-US: ${defaultEnUsVoice.name}`);
                if (!targetVoiceName) {
                    currentVoiceSettings.ttsVoiceName = defaultEnUsVoice.name;
                    const dataToStore = {};
                    dataToStore[voiceSettingsStorageKey] = currentVoiceSettings;
                    chrome.storage.local.set(dataToStore, () => {
                        if (chrome.runtime.lastError) {
                            console.error("Error saving initial default TTS voice:", chrome.runtime.lastError.message);
                        } else {
                            console.log("Initial default TTS voice saved:", defaultEnUsVoice.name);
                        }
                    });
                }
            } else {
                ttsVoiceSelect.value = "";
                console.warn("populateVoiceList: No saved/previous or en-US voice found.");
            }
        }
    };

    if (synth.getVoices().length !== 0) {
        setVoices();
    } else if (typeof synth.onvoiceschanged !== 'undefined') {
        synth.onvoiceschanged = setVoices;
    } else {
        console.warn("Browser does not support onvoiceschanged event. Retrying voice population.");
        setTimeout(populateVoiceList, 500);
    }
}


function updateLocalModelVisibility(selectedValue) {
    if (!localModelSelect || !localModelInputOther) return;
    hideLocalModelWarning();
    if (selectedValue === 'others') {
        localModelInputOther.style.display = 'block';
        if (!localModelInputOther.value || predefinedLocalModels.includes(localModelInputOther.value)) {
            localModelInputOther.value = '';
        }
    } else {
        localModelInputOther.style.display = 'none';
        localModelInputOther.value = '';
    }
}

function loadOptions() {
    hideLocalModelWarning();
    populateSttLanguageDropdown();

    const localUrlInput = document.getElementById('local-url-input');
    const cloudApiUrlInput = document.getElementById('cloud-api-url-input');
    const cloudApiKeyInput = document.getElementById('cloud-api-key-input');
    const cloudModelNameInput = document.getElementById('cloud-model-name-input');
    const systemPromptTextarea = document.getElementById('system_prompt');
    const screenshotPromptTextarea = document.getElementById('screenshot_prompt');
    const scrollingScreenshotPromptTextarea = document.getElementById('scrollingScreenshot_prompt');
    const analyzeContentPromptTextarea = document.getElementById('analyzeContent_prompt');
    const sttSelect = document.getElementById('stt-language-select');

    chrome.storage.local.get([promptsStorageKey, settingsStorageKey, voiceSettingsStorageKey], (result) => {
        if (chrome.runtime.lastError) { console.error("Error loading settings:", chrome.runtime.lastError); return; }

        const savedPrompts = result[promptsStorageKey] || { ...defaultPrompts };
        const savedApiSettings = result[settingsStorageKey] || { ...defaultApiSettings };
        let savedVoiceSettings = result[voiceSettingsStorageKey];

        if (!savedVoiceSettings || typeof savedVoiceSettings.sttLanguage === 'undefined' || typeof savedVoiceSettings.ttsVoiceName === 'undefined') {
            console.log("No valid voice settings found, applying initial 'en-US' defaults.");
            currentVoiceSettings = {
                sttLanguage: 'en-US',
                ttsVoiceName: '',
                ttsLanguage: 'en-US'
            };
            const initialVoiceSettingsToSave = {};
            initialVoiceSettingsToSave[voiceSettingsStorageKey] = currentVoiceSettings;
            chrome.storage.local.set(initialVoiceSettingsToSave, () => {
                if (chrome.runtime.lastError) {
                    console.error("Error saving initial voice settings:", chrome.runtime.lastError.message);
                    showNotification("Error saving initial voice settings", true);
                } else {
                    console.log("Initial voice settings ('en-US') saved successfully.");
                }
            });
        } else {
            console.log("Loading saved voice settings:", savedVoiceSettings);
            currentVoiceSettings = { ...savedVoiceSettings };
        }


        if (localUrlInput) localUrlInput.value = savedApiSettings.localApiUrl ?? defaultApiSettings.localApiUrl;

        const savedLocalModel = savedApiSettings.ollamaMultimodalModel ?? defaultApiSettings.ollamaMultimodalModel;
        if (localModelSelect) {
            if (predefinedLocalModels.includes(savedLocalModel)) {
                localModelSelect.value = savedLocalModel;
                updateLocalModelVisibility(savedLocalModel);
            } else {
                localModelSelect.value = 'others';
                if (localModelInputOther) {
                    localModelInputOther.value = savedLocalModel;
                }
                updateLocalModelVisibility('others');
            }
        }

        if (cloudApiUrlInput) cloudApiUrlInput.value = savedApiSettings.cloudApiUrl ?? defaultApiSettings.cloudApiUrl;
        if (cloudApiKeyInput) cloudApiKeyInput.value = savedApiSettings.cloudApiKey ?? defaultApiSettings.cloudApiKey;
        if (cloudModelNameInput) cloudModelNameInput.value = savedApiSettings.cloudModelName ?? defaultApiSettings.cloudModelName;

        if (sttSelect) sttSelect.value = currentVoiceSettings.sttLanguage;

        if (systemPromptTextarea) systemPromptTextarea.value = savedPrompts.system_prompt ?? defaultPrompts.system_prompt;
        if (screenshotPromptTextarea) screenshotPromptTextarea.value = savedPrompts.screenshot_prompt ?? defaultPrompts.screenshot_prompt;
        if (scrollingScreenshotPromptTextarea) scrollingScreenshotPromptTextarea.value = savedPrompts.scrollingScreenshot_prompt ?? defaultPrompts.scrollingScreenshot_prompt;
        if (analyzeContentPromptTextarea) analyzeContentPromptTextarea.value = savedPrompts.analyzeContent_prompt ?? defaultPrompts.analyzeContent_prompt;

        populateVoiceList();

    });
}


function saveSetting(element) {
    const storageKey = element.dataset.storageKey;
    const storageType = element.dataset.storageType;
    let value;
    let isCustomEmpty = false;

    hideLocalModelWarning();

    if (element.id === 'local-model-name-select') {
        value = element.value;
        if (value === 'others') {
            if (localModelInputOther) {
                value = localModelInputOther.value.trim();
                if (!value) {
                    value = defaultApiSettings.ollamaMultimodalModel;
                    isCustomEmpty = true;
                    console.warn("Custom local model name was empty, saving default.");
                }
            } else {
                console.error("Could not find the 'other' input for local model name.");
                value = defaultApiSettings.ollamaMultimodalModel;
            }
        }
    } else if (element.id === 'local-model-name-input-other') {
        if (localModelSelect && localModelSelect.value === 'others') {
            value = element.value.trim();
            if (!value) {
                value = defaultApiSettings.ollamaMultimodalModel;
                isCustomEmpty = true;
                console.warn("Custom local model name was empty, saving default.");
            }
        } else {
            return;
        }
    } else {
        value = element.type === 'checkbox' ? element.checked : element.value;
    }

    if (!storageKey || !storageType) { console.error("Missing data attributes on element:", element); return; }

    let storageAreaKey; let defaultValues;

    switch (storageType) {
        case 'settings': storageAreaKey = settingsStorageKey; defaultValues = defaultApiSettings; break;
        case 'prompts': storageAreaKey = promptsStorageKey; defaultValues = defaultPrompts; break;
        case 'voice': storageAreaKey = voiceSettingsStorageKey; defaultValues = defaultVoiceSettings; break;
        default: console.error(`Unknown storage type: ${storageType}`); return;
    }

    chrome.storage.local.get(storageAreaKey, (result) => {
        if (chrome.runtime.lastError) { console.error("Error getting storage before save:", chrome.runtime.lastError); showNotification("Error saving: could not read current settings", true); return; }

        let currentData;
        if (storageType === 'voice') {
            currentData = currentVoiceSettings || { ...defaultValues };
        } else {
            currentData = result[storageAreaKey] || { ...defaultValues };
        }

        const updatedData = { ...currentData };
        updatedData[storageKey] = value;
        if (storageType === 'voice') {
            currentVoiceSettings = updatedData;
        }

        const dataToStore = {}; dataToStore[storageAreaKey] = updatedData;

        chrome.storage.local.set(dataToStore, () => {
            if (chrome.runtime.lastError) {
                const errorMessage = `Error saving ${storageKey}: ${chrome.runtime.lastError.message}`;
                console.error(errorMessage, element); showNotification(errorMessage, true);
                hideLocalModelWarning();
            } else {
                console.log(`${storageKey} saved successfully:`, value);
                if (isCustomEmpty && (element.id === 'local-model-name-select' || element.id === 'local-model-name-input-other')) {
                    showLocalModelWarning(`Custom local model name was empty. Will use default setting: ${defaultApiSettings.ollamaMultimodalModel}.`);
                } else {
                    hideLocalModelWarning();
                }
                showNotification('Saved successfully!');
            }
        });
    });
}

function resetToDefaults() {
    hideLocalModelWarning();
    chrome.storage.local.get(settingsStorageKey, (result) => {
        if (chrome.runtime.lastError) { console.error("Error getting settings before reset:", chrome.runtime.lastError); showNotification("Error resetting: could not read current settings", true); return; }
        const currentSettings = result[settingsStorageKey] || {};
        const preservedApiKey = currentSettings.cloudApiKey || defaultApiSettings.cloudApiKey;

        const settingsToReset = {};
        settingsToReset[settingsStorageKey] = { ...defaultApiSettings, cloudApiKey: preservedApiKey };
        settingsToReset[promptsStorageKey] = { ...defaultPrompts };

        chrome.storage.local.set(settingsToReset, () => {
            if (chrome.runtime.lastError) {
                const errorMessage = `Error resetting settings: ${chrome.runtime.lastError.message}`;
                console.error(errorMessage); showNotification(errorMessage, true);
            } else {
                console.log("API and Prompt settings reset to default, preserving Cloud API Key. Voice settings remain unchanged.");
                loadOptions();
                showNotification('API and Prompt settings reset. Voice settings kept.');
            }
        });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    loadOptions();

    if (localModelSelect) {
        localModelSelect.addEventListener('change', (e) => {
            updateLocalModelVisibility(e.target.value);
            if (e.target.value !== 'others') {
                saveSetting(localModelSelect);
            }
        });
    }

    if (localModelInputOther) {
        localModelInputOther.addEventListener('input', hideLocalModelWarning);
        localModelInputOther.addEventListener('blur', () => {
            if (localModelSelect && localModelSelect.value === 'others') {
                saveSetting(localModelInputOther);
            }
        });
        localModelInputOther.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                if (localModelSelect && localModelSelect.value === 'others') {
                    saveSetting(localModelInputOther);
                    localModelInputOther.blur();
                }
            }
        });
    }

    const inputsToSave = document.querySelectorAll('input[data-storage-key]:not(#local-model-name-input-other), textarea[data-storage-key]');
    inputsToSave.forEach(input => {
        input.addEventListener('blur', () => saveSetting(input));
        if (input.type === 'text' || input.type === 'password') {
            input.addEventListener('keypress', (e) => { if (e.key === 'Enter') { saveSetting(input); input.blur(); } });
        }
    });

    const selectsToSave = document.querySelectorAll('select[data-storage-key]:not(#local-model-name-select)');
    selectsToSave.forEach(select => { select.addEventListener('change', () => saveSetting(select)); });

    const resetButton = document.getElementById('reset-button');
    if (resetButton) { resetButton.addEventListener('click', resetToDefaults); }
    else { console.error("Reset button not found!"); }
});

export { promptsStorageKey, defaultPrompts };