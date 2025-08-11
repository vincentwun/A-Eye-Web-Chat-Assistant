import { defaultPrompts, promptsStorageKey } from './prompts.js';
import { settingsStorageKey, defaultApiSettings } from './apiRoute.js';
import { voiceSettingsStorageKey, defaultVoiceSettings, availableLanguages } from './voiceSettings.js';

const $ = (id) => document.getElementById(id);
const q = (sel) => document.querySelector(sel);
const qa = (sel) => document.querySelectorAll(sel);

const notificationBar = $('notification-bar');
let notificationTimeout;
let currentVoiceSettings = null;
let currentPrompts = null;

function showNotification(message, isError = false) {
    if (!notificationBar) return;
    clearTimeout(notificationTimeout);
    notificationBar.textContent = message;
    notificationBar.classList.remove('error', 'show');
    if (isError) notificationBar.classList.add('error');
    notificationBar.classList.add('show');
    notificationTimeout = setTimeout(() => notificationBar.classList.remove('show'), 2500);
}

function getSelectedRadioValue(name) {
    const el = q(`input[name="${name}"]:checked`);
    return el ? el.value : null;
}

function toggleHidden(el, hidden = true) {
    if (!el) return;
    el.classList.toggle('hidden', hidden);
}

function getCloudContainers() {
    return {
        proxyUrl: $('proxy-url-container'),
        gcpApiKey: $('gcp-api-key-container'),
        geminiApiKey: $('gemini-api-key-container'),
        geminiModel: $('gemini-model-container'),
        mistralApiKey: $('mistral-api-key-container'),
        mistralModel: $('mistral-model-container')
    };
}

function getLocalContainers() {
    return {
        ollama: $('ollama-model-container'),
        lmstudio: $('lmstudio-model-container'),
        vllmUrl: $('vllm-url-container'),
        vllmModel: $('vllm-model-container')
    };
}

function updateLocalConfigVisibility() {
    const selectedMode = getSelectedRadioValue('localApiModeSelection');
    const containers = getLocalContainers();
    Object.values(containers).forEach(c => c?.classList.add('hidden'));
    if (selectedMode === 'ollama') {
        toggleHidden(containers.ollama, false);
    } else if (selectedMode === 'lmstudio') {
        toggleHidden(containers.lmstudio, false);
    } else if (selectedMode === 'vllm') {
        toggleHidden(containers.vllmUrl, false);
        toggleHidden(containers.vllmModel, false);
    } else if (selectedMode === 'gemini-nano') {
    }
}

function updateCloudConfigVisibility() {
    const selectedService = getSelectedRadioValue('cloudSelection');
    const containers = getCloudContainers();
    Object.values(containers).forEach(c => c?.classList.add('hidden'));

    if (selectedService === 'gemini') {
        toggleHidden(containers.geminiApiKey, false);
        toggleHidden(containers.geminiModel, false);
    } else if (selectedService === 'gateway') {
        toggleHidden(containers.proxyUrl, false);
        toggleHidden(containers.gcpApiKey, false);
        toggleHidden(containers.geminiModel, false);
    } else if (selectedService === 'mistral') {
        toggleHidden(containers.mistralApiKey, false);
        toggleHidden(containers.mistralModel, false);
    }
}

function populateSttLanguageDropdown() {
    const sttSelect = $('stt-language-select');
    if (!sttSelect) return;
    sttSelect.innerHTML = '';
    for (const [code, name] of Object.entries(availableLanguages)) {
        const opt = document.createElement('option');
        opt.value = code;
        opt.textContent = name;
        sttSelect.appendChild(opt);
    }
}

function populateVoiceList() {
    const ttsVoiceSelect = $('tts-voice-select');
    if (!ttsVoiceSelect || !currentVoiceSettings) return;
    const synth = window.speechSynthesis;

    const setVoices = () => {
        const voices = synth.getVoices();
        const previousValue = ttsVoiceSelect.value;
        ttsVoiceSelect.innerHTML = '';

        if (voices.length === 0) {
            const defaultOption = document.createElement('option');
            defaultOption.value = '';
            defaultOption.textContent = 'No voices available';
            ttsVoiceSelect.appendChild(defaultOption);
            ttsVoiceSelect.disabled = true;
            return;
        }

        ttsVoiceSelect.disabled = false;
        const placeholderOption = document.createElement('option');
        placeholderOption.value = '';
        placeholderOption.textContent = '-- Select a Voice --';
        ttsVoiceSelect.appendChild(placeholderOption);

        voices.forEach(voice => {
            const option = document.createElement('option');
            option.value = voice.name;
            option.textContent = `${voice.name} (${voice.lang})${voice.default ? ' [Default]' : ''}`;
            ttsVoiceSelect.appendChild(option);
        });

        const targetVoiceName = currentVoiceSettings.ttsVoiceName;
        const hasTarget = targetVoiceName && ttsVoiceSelect.querySelector(`option[value="${CSS.escape(targetVoiceName)}"]`);
        const hasPrev = previousValue && ttsVoiceSelect.querySelector(`option[value="${CSS.escape(previousValue)}"]`);

        if (hasTarget) {
            ttsVoiceSelect.value = targetVoiceName;
        } else if (hasPrev) {
            ttsVoiceSelect.value = previousValue;
        } else {
            const defaultEnUsVoice = voices.find(v => v.lang === 'en-US' && v.default) || voices.find(v => v.lang === 'en-US');
            if (defaultEnUsVoice) {
                ttsVoiceSelect.value = defaultEnUsVoice.name;
                if (!targetVoiceName) {
                    currentVoiceSettings.ttsVoiceName = defaultEnUsVoice.name;
                    chrome.storage.local.set({ [voiceSettingsStorageKey]: currentVoiceSettings });
                }
            } else {
                ttsVoiceSelect.value = '';
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

function handleCustomModelSelection(selectElement, customContainer, customInput, savedModelValue) {
    const isCustom = ![...selectElement.options].some(opt => opt.value === savedModelValue && opt.value !== 'custom');
    if (isCustom) {
        selectElement.value = 'custom';
        customInput.value = savedModelValue;
        customContainer.classList.remove('hidden');
    } else {
        selectElement.value = savedModelValue;
        customContainer.classList.add('hidden');
    }
}

function mergePrompts(existingPrompts, promptsUpdate, activeRoleKey, promptText) {
    const newSystemPrompts = {
        ...(existingPrompts.system_prompt || defaultPrompts.system_prompt),
        [activeRoleKey]: promptText
    };
    return {
        ...existingPrompts,
        ...promptsUpdate,
        system_prompt: newSystemPrompts
    };
}

function readDataAttributesToUpdates(keysToUpdate) {
    const elementsToSave = qa('[data-storage-key]');
    elementsToSave.forEach(el => {
        const storageKey = el.dataset.storageKey;
        const storageType = el.dataset.storageType;
        let storageAreaKey;
        if (storageType === 'settings') storageAreaKey = settingsStorageKey;
        else if (storageType === 'prompts') storageAreaKey = promptsStorageKey;
        else if (storageType === 'voice') storageAreaKey = voiceSettingsStorageKey;
        else return;

        const value = el.type === 'checkbox' ? el.checked : el.value;
        keysToUpdate[storageAreaKey][storageKey] = value;
    });
}

function saveOptions() {
    const keysToUpdate = {
        [settingsStorageKey]: {},
        [promptsStorageKey]: {},
        [voiceSettingsStorageKey]: {}
    };

    const settingsUpdate = keysToUpdate[settingsStorageKey];
    const selectedLocalService = getSelectedRadioValue('localApiModeSelection');
    if (selectedLocalService) settingsUpdate.localApiMode = selectedLocalService;

    const selectedCloudService = getSelectedRadioValue('cloudSelection');
    if (selectedCloudService === 'mistral') {
        settingsUpdate.cloudProvider = 'mistral';
    } else if (selectedCloudService === 'gateway') {
        settingsUpdate.cloudProvider = 'gemini';
        settingsUpdate.cloudApiMethod = 'proxy';
    } else {
        settingsUpdate.cloudProvider = 'gemini';
        settingsUpdate.cloudApiMethod = 'direct';
    }

    readDataAttributesToUpdates(keysToUpdate);

    const ollamaModelSelect = $('ollama-model-name-select');
    if (ollamaModelSelect && ollamaModelSelect.value === 'custom') {
        const customInput = $('custom-ollama-model-input');
        keysToUpdate[settingsStorageKey].localMultimodalModel = customInput.value;
    }

    const lmstudioModelSelect = $('lmstudio-model-name-select');
    if (lmstudioModelSelect && lmstudioModelSelect.value === 'custom') {
        const customInput = $('custom-lmstudio-model-input');
        keysToUpdate[settingsStorageKey].lmstudioModelName = customInput.value;
    }

    chrome.storage.local.get(Object.keys(keysToUpdate), (result) => {
        if (chrome.runtime.lastError) return showNotification('Error preparing to save.', true);

        const roleSelect = $('role-select');
        const systemPromptTextarea = $('system_prompt');
        const activeRoleKey = roleSelect ? roleSelect.value : defaultPrompts.active_system_prompt_key;
        const promptText = systemPromptTextarea ? systemPromptTextarea.value : '';

        const promptsUpdate = keysToUpdate[promptsStorageKey] || {};
        const existingPrompts = result[promptsStorageKey] || defaultPrompts;
        const finalPrompts = mergePrompts(existingPrompts, promptsUpdate, activeRoleKey, promptText);

        const finalData = {
            [settingsStorageKey]: { ...(result[settingsStorageKey] || {}), ...keysToUpdate[settingsStorageKey] },
            [promptsStorageKey]: finalPrompts,
            [voiceSettingsStorageKey]: { ...(result[voiceSettingsStorageKey] || {}), ...keysToUpdate[voiceSettingsStorageKey] }
        };

        chrome.storage.local.set(finalData, () => {
            if (chrome.runtime.lastError) {
                showNotification(`Error: ${chrome.runtime.lastError.message}`, true);
            } else {
                showNotification('Saved successfully.');
                currentVoiceSettings = finalData[voiceSettingsStorageKey];
                currentPrompts = finalData[promptsStorageKey];
                updateCloudConfigVisibility();
                updateLocalConfigVisibility();
            }
        });
    });
}

function loadOptions() {
    populateSttLanguageDropdown();

    const elements = {
        vllmUrlInput: $('vllm-url-input'),
        ollamaModelSelect: $('ollama-model-name-select'),
        customOllamaModelContainer: $('custom-ollama-model-container'),
        customOllamaModelInput: $('custom-ollama-model-input'),
        lmstudioModelSelect: $('lmstudio-model-name-select'),
        customLmstudioModelContainer: $('custom-lmstudio-model-container'),
        customLmstudioModelInput: $('custom-lmstudio-model-input'),
        vllmModelInput: $('vllm-model-name-input'),

        cloudProxyUrlInput: $('cloud-proxy-url-input'),
        cloudApiKeyInput: $('cloud-api-key-input'),
        gcpApiKeyInput: $('gcp-api-key-input'),
        cloudModelNameInput: $('cloud-model-name-input'),
        mistralApiKeyInput: $('mistral-api-key-input'),
        mistralModelSelect: $('mistral-model-name-select'),
        systemPromptTextarea: $('system_prompt'),
        roleSelect: $('role-select'),
        sttSelect: $('stt-language-select')
    };

    chrome.storage.local.get([promptsStorageKey, settingsStorageKey, voiceSettingsStorageKey], (result) => {
        if (chrome.runtime.lastError) return showNotification('Error loading settings: ' + chrome.runtime.lastError.message, true);

        const savedApiSettings = result[settingsStorageKey] || { ...defaultApiSettings };
        const savedVoiceSettings = result[voiceSettingsStorageKey];
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

        const savedLocalMode = savedApiSettings.localApiMode ?? defaultApiSettings.localApiMode;
        const localRadio = q(`input[name="localApiModeSelection"][value="${savedLocalMode}"]`);
        if (localRadio) localRadio.checked = true;

        if (elements.vllmUrlInput) elements.vllmUrlInput.value = savedApiSettings.localApiUrl ?? defaultApiSettings.localApiUrl;

        handleCustomModelSelection(
            elements.ollamaModelSelect,
            elements.customOllamaModelContainer,
            elements.customOllamaModelInput,
            savedApiSettings.localMultimodalModel ?? defaultApiSettings.localMultimodalModel
        );

        handleCustomModelSelection(
            elements.lmstudioModelSelect,
            elements.customLmstudioModelContainer,
            elements.customLmstudioModelInput,
            savedApiSettings.lmstudioModelName ?? defaultApiSettings.lmstudioModelName
        );

        if (elements.vllmModelInput) elements.vllmModelInput.value = savedApiSettings.vllmModelName ?? defaultApiSettings.vllmModelName;

        const savedCloudProvider = savedApiSettings.cloudProvider ?? defaultApiSettings.cloudProvider;
        const savedCloudMethod = savedApiSettings.cloudApiMethod ?? defaultApiSettings.cloudApiMethod;
        let cloudRadio;
        if (savedCloudProvider === 'mistral') {
            cloudRadio = $('cloud-select-mistral');
        } else if (savedCloudMethod === 'proxy') {
            cloudRadio = $('cloud-select-gateway');
        } else {
            cloudRadio = $('cloud-select-gemini');
        }
        if (cloudRadio) cloudRadio.checked = true;

        if (elements.cloudProxyUrlInput) elements.cloudProxyUrlInput.value = savedApiSettings.cloudProxyUrl ?? defaultApiSettings.cloudProxyUrl;
        if (elements.cloudApiKeyInput) elements.cloudApiKeyInput.value = savedApiSettings.cloudApiKey ?? defaultApiSettings.cloudApiKey;
        if (elements.gcpApiKeyInput) elements.gcpApiKeyInput.value = savedApiSettings.gcpApiKey ?? defaultApiSettings.gcpApiKey;
        if (elements.cloudModelNameInput) elements.cloudModelNameInput.value = savedApiSettings.cloudModelName ?? defaultApiSettings.cloudModelName;

        if (elements.mistralApiKeyInput) elements.mistralApiKeyInput.value = savedApiSettings.mistralApiKey ?? defaultApiSettings.mistralApiKey;
        if (elements.mistralModelSelect) elements.mistralModelSelect.value = savedApiSettings.mistralModelName ?? defaultApiSettings.mistralModelName;

        if (elements.roleSelect && elements.systemPromptTextarea) {
            const activeKey = currentPrompts.active_system_prompt_key || 'web_assistant';
            elements.roleSelect.value = activeKey;
            elements.systemPromptTextarea.value = currentPrompts.system_prompt[activeKey] || defaultPrompts.system_prompt[activeKey];
        }

        updateCloudConfigVisibility();
        updateLocalConfigVisibility();
    });
}

function resetToDefaults() {
    chrome.storage.local.set({ [promptsStorageKey]: { ...defaultPrompts } }, () => {
        if (chrome.runtime.lastError) {
            showNotification(`Error resetting prompts: ${chrome.runtime.lastError.message}`, true);
        } else {
            loadOptions();
            showNotification('Prompts have been reset.');
        }
    });
}

function handleRoleChange() {
    const roleSelect = $('role-select');
    const systemPromptTextarea = $('system_prompt');
    if (!roleSelect || !systemPromptTextarea || !currentPrompts) return;
    const selectedRole = roleSelect.value;
    systemPromptTextarea.value = currentPrompts.system_prompt[selectedRole] || defaultPrompts.system_prompt[selectedRole];
}

document.addEventListener('DOMContentLoaded', () => {
    loadOptions();

    const elementsToSave = qa('input[data-storage-key], select[data-storage-key]');
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

    const ollamaModelSelect = $('ollama-model-name-select');
    const customOllamaContainer = $('custom-ollama-model-container');
    if (ollamaModelSelect && customOllamaContainer) {
        ollamaModelSelect.addEventListener('change', () => {
            customOllamaContainer.classList.toggle('hidden', ollamaModelSelect.value !== 'custom');
        });
    }

    const lmstudioModelSelect = $('lmstudio-model-name-select');
    const customLmstudioContainer = $('custom-lmstudio-model-container');
    if (lmstudioModelSelect && customLmstudioContainer) {
        lmstudioModelSelect.addEventListener('change', () => {
            customLmstudioContainer.classList.toggle('hidden', lmstudioModelSelect.value !== 'custom');
        });
    }

    const customOllamaInput = $('custom-ollama-model-input');
    if (customOllamaInput) customOllamaInput.addEventListener('blur', saveOptions);
    const customLmstudioInput = $('custom-lmstudio-model-input');
    if (customLmstudioInput) customLmstudioInput.addEventListener('blur', saveOptions);

    const localApiModeRadios = qa('input[name="localApiModeSelection"]');
    localApiModeRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            updateLocalConfigVisibility();
            saveOptions();
        });
    });

    const cloudSelectionRadios = qa('input[name="cloudSelection"]');
    cloudSelectionRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            updateCloudConfigVisibility();
            saveOptions();
        });
    });

    const systemPromptTextarea = $('system_prompt');
    if (systemPromptTextarea) systemPromptTextarea.addEventListener('blur', saveOptions);

    const roleSelect = $('role-select');
    if (roleSelect) roleSelect.addEventListener('change', handleRoleChange);

    const saveButton = $('save-button');
    if (saveButton) saveButton.addEventListener('click', saveOptions);

    const resetButton = $('reset-button');
    if (resetButton) resetButton.addEventListener('click', resetToDefaults);
});

export {
    promptsStorageKey,
    defaultPrompts
};