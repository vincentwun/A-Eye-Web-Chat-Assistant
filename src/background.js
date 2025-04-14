import { defaultApiSettings, settingsStorageKey } from './option/apiRoute.js';
import { defaultPrompts, promptsStorageKey } from './option/prompts.js';
import { defaultVoiceSettings, voiceSettingsStorageKey } from './option/voiceSettings.js';

async function getPageDimensions(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      function: () => ({
        scrollHeight: document.documentElement.scrollHeight,
        clientHeight: document.documentElement.clientHeight,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth
      })
    });
    if (results && results[0] && results[0].result) {
      return results[0].result;
    } else {
      console.error('Failed to get page dimensions: No result returned from script execution.');
      return null;
    }
  } catch (error) {
    console.error('Failed to execute script for page dimensions:', error);
    return null;
  }
}

async function initializeDefaultSettings() {
  console.log('Checking and initializing default settings...');
  try {
    const keysToGet = [settingsStorageKey, promptsStorageKey, voiceSettingsStorageKey];
    const currentSettings = await chrome.storage.local.get(keysToGet);
    const settingsToSave = {};

    if (currentSettings[settingsStorageKey] === undefined) {
      settingsToSave[settingsStorageKey] = { ...defaultApiSettings };
      console.log('Initializing default API settings.');
    }
    if (currentSettings[promptsStorageKey] === undefined) {
      settingsToSave[promptsStorageKey] = { ...defaultPrompts };
      console.log('Initializing default prompts.');
    }
    if (currentSettings[voiceSettingsStorageKey] === undefined) {
      settingsToSave[voiceSettingsStorageKey] = { ...defaultVoiceSettings };
      console.log('Initializing default voice settings.');
    }

    if (Object.keys(settingsToSave).length > 0) {
      await chrome.storage.local.set(settingsToSave);
      console.log('Default settings saved to chrome.storage.local:', settingsToSave);
    } else {
      console.log('All settings already exist. No initialization needed.');
    }
  } catch (error) {
    console.error('Error initializing default settings:', error);
  }
}

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    console.log('Extension installed. Initializing default settings...');
    await initializeDefaultSettings();
  } else if (details.reason === 'update') {
    console.log('Extension updated to version', chrome.runtime.getManifest().version);
  }
});

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

chrome.commands.onCommand.addListener((command) => {
  console.log('Command received:', command);

  const commandActions = {
    'toggle-api-mode': { type: 'toggleApiMode' },
    'toggle-voice-input': { type: 'toggleVoiceInput' },
    'toggle-repeat': { type: 'toggleRepeat' }
  };

  if (commandActions[command]) {
    chrome.runtime.sendMessage(commandActions[command])
      .catch(error => {
        if (error.message.includes('Receiving end does not exist.')) {
          console.log(`Side panel not open or listening for command: ${command}`);
        } else {
          console.error(`Error sending command message ${command}:`, error);
        }
      });
  } else {
    console.log(`Unhandled command: ${command}`);
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.type) {
    case 'startScrollingScreenshot':
      (async () => {
        try {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tab && tab.id) {
            const dimensions = await getPageDimensions(tab.id);
            sendResponse({ dimensions: dimensions });
          } else {
            console.error('startScrollingScreenshot: No active tab found.');
            sendResponse({ error: 'No active tab found' });
          }
        } catch (error) {
          console.error('Error in startScrollingScreenshot handler:', error);
          sendResponse({ error: error.message || 'Failed to get page dimensions' });
        }
      })();
      return true;

    default:
      console.log(`Background received unhandled message type: ${request.type}`);
      break;
  }
  return false;
});

console.log("Background script loaded and listeners attached.");