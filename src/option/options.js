import { defaultPrompts, promptsStorageKey } from './prompts.js';
import { settingsStorageKey, defaultApiSettings } from './apiRoute.js';
import { voiceSettingsStorageKey, defaultVoiceSettings, availableLanguages } from './voiceSettings.js';

const notificationBar = document.getElementById('notification-bar');
let notificationTimeout;
let currentVoiceSettings = null;
let currentPrompts = null;

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
                updateCloudProviderVisibility();
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

function updateCloudProviderVisibility() {
    const geminiRadio = document.getElementById('provider-gemini');
    const mistralRadio = document.getElementById('provider-mistral');
    const geminiContainer = document.getElementById('gemini-settings-container');
    const mistralContainer = document.getElementById('mistral-settings-container');

    if (!geminiRadio || !mistralRadio || !geminiContainer || !mistralContainer) {
        return;
    }

    if (geminiRadio.checked) {
        geminiContainer.classList.remove('hidden');
        mistralContainer.classList.add('hidden');
    } else if (mistralRadio.checked) {
        geminiContainer.classList.add('hidden');
        mistralContainer.classList.remove('hidden');
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

    const elements = {
        localUrlInput: document.getElementById('local-url-input'),
        localModelSelect: document.getElementById('local-model-name-select'),
        cloudApiUrlInput: document.getElementById('cloud-api-url-input'),
        cloudProxyUrlInput: document.getElementById('cloud-proxy-url-input'),
        cloudApiKeyInput: document.getElementById('cloud-api-key-input'),
        cloudModelNameInput: document.getElementById('cloud-model-name-input'),
        mistralApiKeyInput: document.getElementById('mistral-api-key-input'),
        mistralModelSelect: document.getElementById('mistral-model-name-select'),
        systemPromptTextarea: document.getElementById('system_prompt'),
        roleSelect: document.getElementById('role-select'),
        sttSelect: document.getElementById('stt-language-select'),
        directRadio: document.getElementById('cloud-method-direct'),
        proxyRadio: document.getElementById('cloud-method-proxy'),
        geminiProviderRadio: document.getElementById('provider-gemini'),
        mistralProviderRadio: document.getElementById('provider-mistral')
    };

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
                    if (elements.sttSelect) elements.sttSelect.value = currentVoiceSettings.sttLanguage;
                    populateVoiceList();
                }
            });
        } else {
            currentVoiceSettings = { ...savedVoiceSettings };
            if (elements.sttSelect) elements.sttSelect.value = currentVoiceSettings.sttLanguage;
            populateVoiceList();
        }

        if (elements.localUrlInput) elements.localUrlInput.value = savedApiSettings.localApiUrl ?? defaultApiSettings.localApiUrl;

        if (elements.localModelSelect) {
            const savedLocalModel = savedApiSettings.ollamaMultimodalModel ?? defaultApiSettings.ollamaMultimodalModel;
            const availableModels = Array.from(elements.localModelSelect.options).map(option => option.value);
            elements.localModelSelect.value = availableModels.includes(savedLocalModel) ? savedLocalModel : defaultApiSettings.ollamaMultimodalModel;
        }

        const savedCloudProvider = savedApiSettings.cloudProvider ?? defaultApiSettings.cloudProvider;
        if (elements.geminiProviderRadio && elements.mistralProviderRadio) {
            if (savedCloudProvider === 'mistral') {
                elements.mistralProviderRadio.checked = true;
            } else {
                elements.geminiProviderRadio.checked = true;
            }
        }
        
        if (elements.cloudApiUrlInput) elements.cloudApiUrlInput.value = savedApiSettings.cloudApiUrl ?? defaultApiSettings.cloudApiUrl;
        if (elements.cloudProxyUrlInput) elements.cloudProxyUrlInput.value = savedApiSettings.cloudProxyUrl ?? defaultApiSettings.cloudProxyUrl;
        if (elements.cloudApiKeyInput) elements.cloudApiKeyInput.value = savedApiSettings.cloudApiKey ?? defaultApiSettings.cloudApiKey;
        if (elements.cloudModelNameInput) elements.cloudModelNameInput.value = savedApiSettings.cloudModelName ?? defaultApiSettings.cloudModelName;
        
        if (elements.mistralApiKeyInput) elements.mistralApiKeyInput.value = savedApiSettings.mistralApiKey ?? defaultApiSettings.mistralApiKey;
        if (elements.mistralModelSelect) elements.mistralModelSelect.value = savedApiSettings.mistralModelName ?? defaultApiSettings.mistralModelName;

        const savedMethod = savedApiSettings.cloudApiMethod ?? defaultApiSettings.cloudApiMethod;
        if (elements.directRadio && elements.proxyRadio) {
            if (savedMethod === 'proxy') {
                elements.proxyRadio.checked = true;
            } else {
                elements.directRadio.checked = true;
            }
        }

        if (elements.roleSelect && elements.systemPromptTextarea) {
            const activeKey = currentPrompts.active_system_prompt_key || 'web_assistant';
            elements.roleSelect.value = activeKey;
            elements.systemPromptTextarea.value = currentPrompts.system_prompt[activeKey] || defaultPrompts.system_prompt[activeKey];
        }

        updateCloudUrlVisibility();
        updateCloudProviderVisibility();
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
        const preservedMistralApiKey = currentSettings.mistralApiKey || defaultApiSettings.mistralApiKey;

        const settingsToReset = {
            [settingsStorageKey]: {
                ...defaultApiSettings,
                cloudApiKey: preservedApiKey,
                cloudProxyUrl: preservedProxyUrl,
                mistralApiKey: preservedMistralApiKey,
                cloudProvider: 'gemini',
                cloudApiMethod: 'direct'
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

    const providerRadios = document.querySelectorAll('input[name="cloudProvider"]');
    providerRadios.forEach(radio => {
        radio.addEventListener('change', updateCloudProviderVisibility);
    });

    const geminiMethodRadios = document.querySelectorAll('input[name="cloudApiMethod"]');
    geminiMethodRadios.forEach(radio => {
        radio.addEventListener('change', updateCloudUrlVisibility);
    });

    const systemPromptTextarea = document.getElementById('system_prompt');
    if (systemPromptTextarea) {
        systemPromptTextarea.addEventListener('blur', saveOptions);
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