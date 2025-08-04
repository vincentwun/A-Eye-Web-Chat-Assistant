import { defaultPrompts, promptsStorageKey } from './prompts.js';
import { settingsStorageKey, defaultApiSettings } from './apiRoute.js';
import { voiceSettingsStorageKey, defaultVoiceSettings, availableLanguages } from './voiceSettings.js';

const notificationBar = document.getElementById('notification-bar');
let notificationTimeout;
let currentVoiceSettings = null;
let currentPrompts = null;

const localModelSelect = document.getElementById('local-model-name-select');

function saveOptions() {
    const elementsToSave = document.querySelectorAll('[data-storage-key]');
    const keysToUpdate = {
        [settingsStorageKey]: {},
        [promptsStorageKey]: {},
        [voiceSettingsStorageKey]: {}
    };

    elementsToSave.forEach(el => {
        const storageKey = el.dataset.storageKey;
        const storageType = el.dataset.storageType;
        let storageAreaKey;
        let value;

        if (storageType === 'settings') storageAreaKey = settingsStorageKey;
        else if (storageType === 'prompts') storageAreaKey = promptsStorageKey;
        else if (storageType === 'voice') storageAreaKey = voiceSettingsStorageKey;
        else return;

        if (el.type === 'radio') {
            if (!el.checked) return;
            value = el.value;
        } else {
            value = el.type === 'checkbox' ? el.checked : el.value;
        }

        keysToUpdate[storageAreaKey][storageKey] = value;
    });

    chrome.storage.local.get(Object.keys(keysToUpdate), (result) => {
        if (chrome.runtime.lastError) {
            return showNotification("Error preparing to save.", true);
        }

        const roleSelect = document.getElementById('role-select');
        const systemPromptTextarea = document.getElementById('system_prompt');
        const activeRoleKey = roleSelect ? roleSelect.value : defaultPrompts.active_system_prompt_key;
        const promptText = systemPromptTextarea ? systemPromptTextarea.value : '';

        const promptsUpdate = keysToUpdate[promptsStorageKey] || {};
        const existingPrompts = result[promptsStorageKey] || defaultPrompts;

        const newSystemPrompts = {
            ...(existingPrompts.system_prompt || defaultPrompts.system_prompt),
            [activeRoleKey]: promptText
        };

        const finalPrompts = {
            ...existingPrompts,
            ...promptsUpdate,
            system_prompt: newSystemPrompts
        };

        const finalData = {
            [settingsStorageKey]: { ...result[settingsStorageKey], ...keysToUpdate[settingsStorageKey] },
            [promptsStorageKey]: finalPrompts,
            [voiceSettingsStorageKey]: { ...result[voiceSettingsStorageKey], ...keysToUpdate[voiceSettingsStorageKey] }
        };

        chrome.storage.local.set(finalData, () => {
            if (chrome.runtime.lastError) {
                showNotification(`Error: ${chrome.runtime.lastError.message}`, true);
            } else {
                showNotification('Settings Saved!');
                currentVoiceSettings = finalData[voiceSettingsStorageKey];
                currentPrompts = finalData[promptsStorageKey];
                updateCloudUrlVisibility();
            }
        });
    });
}

function updateCloudUrlVisibility() {
    const directMethodRadio = document.getElementById('cloud-method-direct');
    const proxyMethodRadio = document.getElementById('cloud-method-proxy');
    const directUrlContainer = document.getElementById('direct-url-container');
    const proxyUrlContainer = document.getElementById('proxy-url-container');

    if (!directMethodRadio || !proxyMethodRadio || !directUrlContainer || !proxyUrlContainer) {
        return;
    }

    if (directMethodRadio.checked) {
        directUrlContainer.classList.remove('hidden');
        proxyUrlContainer.classList.add('hidden');
    } else if (proxyMethodRadio.checked) {
        directUrlContainer.classList.add('hidden');
        proxyUrlContainer.classList.remove('hidden');
    } else {
        directUrlContainer.classList.remove('hidden');
        proxyUrlContainer.classList.add('hidden');
    }
}

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
    if (!ttsVoiceSelect || !currentVoiceSettings) return;
    const synth = window.speechSynthesis;

    const setVoices = () => {
        const voices = synth.getVoices();
        const previousValue = ttsVoiceSelect.value;
        ttsVoiceSelect.innerHTML = '';

        if (voices.length === 0) {
            const defaultOption = document.createElement('option');
            defaultOption.value = "";
            defaultOption.textContent = "No voices available";
            ttsVoiceSelect.appendChild(defaultOption);
            ttsVoiceSelect.disabled = true;
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
            if (voice.default) option.textContent += ' [Default]';
            ttsVoiceSelect.appendChild(option);
        });

        const targetVoiceName = currentVoiceSettings.ttsVoiceName;

        if (targetVoiceName && ttsVoiceSelect.querySelector(`option[value="${CSS.escape(targetVoiceName)}"]`)) {
            ttsVoiceSelect.value = targetVoiceName;
        } else if (previousValue && ttsVoiceSelect.querySelector(`option[value="${CSS.escape(previousValue)}"]`)) {
            ttsVoiceSelect.value = previousValue;
        } else {
            let defaultEnUsVoice = voices.find(voice => voice.lang === 'en-US' && voice.default) || voices.find(voice => voice.lang === 'en-US');
            if (defaultEnUsVoice) {
                ttsVoiceSelect.value = defaultEnUsVoice.name;
                if (!targetVoiceName) {
                    currentVoiceSettings.ttsVoiceName = defaultEnUsVoice.name;
                    const dataToStore = { [voiceSettingsStorageKey]: currentVoiceSettings };
                    chrome.storage.local.set(dataToStore);
                }
            } else {
                ttsVoiceSelect.value = "";
            }
        }
    };

    if (synth.getVoices().length !== 0) {
        setVoices();
    } else if (typeof synth.onvoiceschanged !== 'undefined') {
        synth.onvoiceschanged = setVoices;
    } else {
        setTimeout(populateVoiceList, 500);
    }
}

function loadOptions() {
    populateSttLanguageDropdown();

    const localUrlInput = document.getElementById('local-url-input');
    const localModelSelect = document.getElementById('local-model-name-select');
    const cloudApiUrlInput = document.getElementById('cloud-api-url-input');
    const cloudProxyUrlInput = document.getElementById('cloud-proxy-url-input');
    const cloudApiKeyInput = document.getElementById('cloud-api-key-input');
    const cloudModelNameInput = document.getElementById('cloud-model-name-input');
    const systemPromptTextarea = document.getElementById('system_prompt');
    const roleSelect = document.getElementById('role-select');
    const sttSelect = document.getElementById('stt-language-select');
    const directRadio = document.getElementById('cloud-method-direct');
    const proxyRadio = document.getElementById('cloud-method-proxy');

    chrome.storage.local.get([promptsStorageKey, settingsStorageKey, voiceSettingsStorageKey], (result) => {
        if (chrome.runtime.lastError) {
            return showNotification("Error loading settings: " + chrome.runtime.lastError.message, true);
        }

        const savedApiSettings = result[settingsStorageKey] || { ...defaultApiSettings };
        let savedVoiceSettings = result[voiceSettingsStorageKey];
        currentPrompts = result[promptsStorageKey] || { ...defaultPrompts };

        if (!savedVoiceSettings || typeof savedVoiceSettings.sttLanguage === 'undefined' || typeof savedVoiceSettings.ttsVoiceName === 'undefined') {
            currentVoiceSettings = { sttLanguage: 'en-US', ttsVoiceName: '', ttsLanguage: 'en-US' };
            chrome.storage.local.set({ [voiceSettingsStorageKey]: currentVoiceSettings }, () => {
                if (!chrome.runtime.lastError) {
                    if (sttSelect) sttSelect.value = currentVoiceSettings.sttLanguage;
                    populateVoiceList();
                }
            });
        } else {
            currentVoiceSettings = { ...savedVoiceSettings };
            if (sttSelect) sttSelect.value = currentVoiceSettings.sttLanguage;
            populateVoiceList();
        }

        if (localUrlInput) localUrlInput.value = savedApiSettings.localApiUrl ?? defaultApiSettings.localApiUrl;

        if (localModelSelect) {
            const savedLocalModel = savedApiSettings.ollamaMultimodalModel ?? defaultApiSettings.ollamaMultimodalModel;
            const availableModels = Array.from(localModelSelect.options).map(option => option.value);

            if (availableModels.includes(savedLocalModel)) {
                localModelSelect.value = savedLocalModel;
            } else {
                localModelSelect.value = defaultApiSettings.ollamaMultimodalModel;
                saveOptions();
            }
        }

        if (cloudApiUrlInput) cloudApiUrlInput.value = savedApiSettings.cloudApiUrl ?? defaultApiSettings.cloudApiUrl;
        if (cloudProxyUrlInput) cloudProxyUrlInput.value = savedApiSettings.cloudProxyUrl ?? defaultApiSettings.cloudProxyUrl;
        if (cloudApiKeyInput) cloudApiKeyInput.value = savedApiSettings.cloudApiKey ?? defaultApiSettings.cloudApiKey;
        if (cloudModelNameInput) cloudModelNameInput.value = savedApiSettings.cloudModelName ?? defaultApiSettings.cloudModelName;

        const savedMethod = savedApiSettings.cloudApiMethod ?? defaultApiSettings.cloudApiMethod;
        if (directRadio && proxyRadio) {
            if (savedMethod === 'proxy') {
                proxyRadio.checked = true;
            } else {
                directRadio.checked = true;
            }
        }

        if (roleSelect && systemPromptTextarea) {
            const activeKey = currentPrompts.active_system_prompt_key || 'web_assistant';
            roleSelect.value = activeKey;
            systemPromptTextarea.value = currentPrompts.system_prompt[activeKey] || defaultPrompts.system_prompt[activeKey];
        }

        updateCloudUrlVisibility();
    });
}

function resetToDefaults() {
    chrome.storage.local.get(settingsStorageKey, (result) => {
        if (chrome.runtime.lastError) {
            return showNotification("Error resetting: could not read current settings", true);
        }
        const currentSettings = result[settingsStorageKey] || {};
        const preservedApiKey = currentSettings.cloudApiKey || defaultApiSettings.cloudApiKey;
        const preservedProxyUrl = currentSettings.cloudProxyUrl || defaultApiSettings.cloudProxyUrl;

        const settingsToReset = {
            [settingsStorageKey]: {
                ...defaultApiSettings,
                cloudApiKey: preservedApiKey,
                cloudApiMethod: 'direct',
                cloudProxyUrl: preservedProxyUrl
            },
            [promptsStorageKey]: { ...defaultPrompts }
        };

        chrome.storage.local.set(settingsToReset, () => {
            if (chrome.runtime.lastError) {
                showNotification(`Error resetting settings: ${chrome.runtime.lastError.message}`, true);
            } else {
                loadOptions();
                showNotification('Settings have been reset.');
            }
        });
    });
}

function handleRoleChange() {
    const roleSelect = document.getElementById('role-select');
    const systemPromptTextarea = document.getElementById('system_prompt');
    if (!roleSelect || !systemPromptTextarea || !currentPrompts) return;

    const selectedRole = roleSelect.value;
    systemPromptTextarea.value = currentPrompts.system_prompt[selectedRole] || defaultPrompts.system_prompt[selectedRole];
}

document.addEventListener('DOMContentLoaded', () => {
    loadOptions();

    const elementsToSave = document.querySelectorAll('input[data-storage-key], select[data-storage-key]');

    elementsToSave.forEach(el => {
        const eventType = (el.tagName === 'SELECT' || el.type === 'radio' || el.type === 'checkbox') ? 'change' : 'blur';
        el.addEventListener(eventType, saveOptions);

        if (el.type === 'text' || el.type === 'password') {
            el.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    saveOptions();
                    el.blur();
                }
            });
        }
    });

    const systemPromptTextarea = document.getElementById('system_prompt');
    if (systemPromptTextarea) {
        systemPromptTextarea.addEventListener('blur', saveOptions);
        systemPromptTextarea.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                saveOptions();
                systemPromptTextarea.blur();
            }
        });
    }

    const roleSelect = document.getElementById('role-select');
    if (roleSelect) {
        roleSelect.addEventListener('change', handleRoleChange);
    }

    const saveButton = document.getElementById('save-button');
    if (saveButton) saveButton.addEventListener('click', saveOptions);

    const resetButton = document.getElementById('reset-button');
    if (resetButton) resetButton.addEventListener('click', resetToDefaults);
});

export { promptsStorageKey, defaultPrompts };