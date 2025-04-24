import { defaultApiSettings, settingsStorageKey } from '../option/apiRoute.js';
import { defaultPrompts, promptsStorageKey } from '../option/prompts.js';
import { defaultVoiceSettings, voiceSettingsStorageKey } from '../option/voiceSettings.js';
import { executeJSON } from '../BrowserControl/jsonExecutor.js';
import { findElementsOnPage } from '../BrowserControl/elementFinder.js';

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
    'toggle-repeat': { type: 'toggleRepeat' },
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
  console.log(`Background received message type: ${request.type}`);

  if (request.type === 'executeActions' && Array.isArray(request.actions)) {
    const jsonDependencies = {
      getCurrentTab, executeScriptOnTab, waitForTabLoad, delay,
      clickElement, typeInElement, simulateKeyPress
    };
    executeJSON(request.actions, jsonDependencies)
      .then(results => {
        console.log('JSON Actions completed.', results);
        sendResponse({ success: true, results });
      })
      .catch(error => {
        console.error('JSON Action execution failed:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;

  } else if (request.type === 'findElements') {
    const findDependencies = {
      getCurrentTab, executeScriptOnTab, findAllInteractableElements
    };
    findElementsOnPage(findDependencies)
      .then(result => {
        sendResponse(result);
      })
      .catch(error => {
        console.error("Unexpected error calling findElementsOnPage:", error);
        sendResponse({ success: false, error: error.message });
      });
    return true;

  } else if (request.type === 'startScrollingScreenshot') {
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
  }

  console.log(`Background received unhandled message type: ${request.type}`);
  return false;
});

async function getCurrentTab() {
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    [tab] = await chrome.tabs.query({ active: true });
    if (!tab) throw new Error("Could not find any active tab.");
  }
  if (!tab.id) throw new Error("Active tab has no ID.");
  return tab;
}

async function executeScriptOnTab(tabId, func, args = []) {
  if (!tabId) throw new Error("executeScriptOnTab requires a valid tabId.");
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: func,
      args: args,
      world: 'MAIN'
    });

    if (chrome.runtime.lastError) throw new Error(chrome.runtime.lastError.message);

    if (!results || !Array.isArray(results) || results.length === 0) {
      console.warn(`Script execution on tab ${tabId} (${func.name}) produced no results array.`);
      return null;
    }
    const executionResult = results[0].result;

    if (executionResult && typeof executionResult === 'object' && executionResult.error) {
      throw new Error(executionResult.error);
    }
    return executionResult;

  } catch (error) {
    console.error(`Error executing script on tab ${tabId} (function: ${func.name}):`, error);
    throw new Error(`Script execution error for ${func.name || 'anonymous function'}: ${error.message}`);
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    let resolved = false;
    let timeoutHandle = null;
    const listener = (updatedTabId, changeInfo, tab) => {
      if (!resolved && updatedTabId === tabId && changeInfo.status === 'complete') {
        resolved = true;
        chrome.tabs.onUpdated.removeListener(listener);
        chrome.tabs.onRemoved.removeListener(removedListener);
        clearTimeout(timeoutHandle);
        resolve();
      }
    };
    const removedListener = (closedTabId) => {
      if (!resolved && closedTabId === tabId) {
        resolved = true;
        chrome.tabs.onUpdated.removeListener(listener);
        chrome.tabs.onRemoved.removeListener(removedListener);
        clearTimeout(timeoutHandle);
        console.warn(`Tab ${tabId} was closed while waiting for load.`);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.onRemoved.addListener(removedListener);
    timeoutHandle = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        chrome.tabs.onUpdated.removeListener(listener);
        chrome.tabs.onRemoved.removeListener(removedListener);
        console.warn(`Tab ${tabId} load didn't reach 'complete' status within 15s, proceeding anyway.`);
        resolve();
      }
    }, 15000);
    const originalResolve = resolve;
    resolve = () => {
      chrome.tabs.onRemoved.removeListener(removedListener);
      originalResolve();
    }
  });
}

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
    return results?.[0]?.result ?? null;
  } catch (error) {
    console.error('Failed to execute script for page dimensions:', error);
    return null;
  }
}

function clickElement(selector) {
  try {
    const element = document.querySelector(selector);
    if (!element) throw new Error(`Element not found: ${selector}`);
    if (typeof element.click !== 'function') throw new Error(`Element is not clickable: ${selector}`);
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    if (style.visibility === 'hidden' || style.display === 'none' || rect.width === 0 || rect.height === 0) {
      if (typeof element.focus === 'function') { element.focus(); console.warn(`Click: Element ${selector} not visible, attempting click after focus.`); }
      else throw new Error(`Element is not visible: ${selector}`);
    }
    element.click();
    return { status: 'Clicked', selector };
  } catch (error) { return { error: `Click failed: ${error.message}` }; }
}

function typeInElement(selector, text) {
  try {
    const element = document.querySelector(selector);
    if (!element) throw new Error(`Element not found: ${selector}`);
    if (element.isContentEditable) {
      element.focus(); element.textContent = text;
      element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      element.blur(); return { status: 'Typed (contentEditable)', selector, text };
    }
    if (typeof element.value === 'undefined' || element.disabled || element.readOnly) {
      throw new Error(`Element is not a writable input/textarea: ${selector}`);
    }
    const style = window.getComputedStyle(element); const rect = element.getBoundingClientRect();
    if (style.visibility === 'hidden' || style.display === 'none' || rect.width === 0 || rect.height === 0) {
      if (typeof element.focus === 'function') { element.focus(); console.warn(`Type: Element ${selector} not visible, attempting type after focus.`); }
      else throw new Error(`Element is not visible: ${selector}`);
    }
    element.focus(); element.value = text;
    element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    element.blur();
    return { status: 'Typed', selector, text };
  } catch (error) { return { error: `Type failed: ${error.message}` }; }
}

function simulateKeyPress(selector, keyToPress) {
  try {
    const element = document.querySelector(selector);
    if (!element) throw new Error(`Element not found: ${selector}`);
    if (typeof element.focus === 'function') element.focus();
    else console.warn(`KeyPress: Element ${selector} might not be focusable.`);
    const keyCode = (keyToPress === 'Enter') ? 13 : 0;
    const eventOptions = { key: keyToPress, code: keyToPress === 'Enter' ? 'Enter' : keyToPress, keyCode, which: keyCode, bubbles: true, cancelable: true };
    let canceled = !element.dispatchEvent(new KeyboardEvent('keydown', eventOptions));
    if (!canceled) canceled = !element.dispatchEvent(new KeyboardEvent('keypress', eventOptions));
    element.dispatchEvent(new KeyboardEvent('keyup', eventOptions));
    if (canceled) console.log(`KeyPress: Default action for "${keyToPress}" on ${selector} was prevented.`);
    return { status: 'Key Pressed', selector, key: keyToPress };
  } catch (error) { return { error: `KeyPress (${keyToPress} on ${selector}) failed: ${error.message}` }; }
}

function findAllInteractableElements() {

  function isVisible(element) { /* ... Keep implementation from previous step ... */
    if (!element || !element.tagName) return false; if (!document.body.contains(element)) return false;
    const style = window.getComputedStyle(element); if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) { if (element.children.length === 0 && !['input', 'textarea', 'select', 'button'].includes(element.tagName.toLowerCase())) { if (element.offsetParent === null) return false; } if (element.tagName === 'INPUT' && element.type === 'hidden') return false; }
    let parent = element.parentElement; while (parent && parent !== document.body) { const parentStyle = window.getComputedStyle(parent); if (parentStyle.display === 'none') return false; if (parentStyle.overflow === 'hidden' || parentStyle.overflowX === 'hidden' || parentStyle.overflowY === 'hidden') { const parentRect = parent.getBoundingClientRect(); if (parentRect.width > 0 && parentRect.height > 0) { const elementCenterY = rect.top + rect.height / 2; const elementCenterX = rect.left + rect.width / 2; if (elementCenterY < parentRect.top || elementCenterY > parentRect.bottom || elementCenterX < parentRect.left || elementCenterX > parentRect.right) { /* return false; */ } } } parent = parent.parentElement; } return true;
  }

  function generateSelector(element) { /* ... Keep implementation from previous step ... */
    if (!element || !element.tagName) return null; try { const testAttrs = ['data-testid', 'data-cy', 'data-test-id']; for (const attr of testAttrs) { const value = element.getAttribute(attr); if (value) { const testSelector = `${element.tagName.toLowerCase()}[${attr}="${CSS.escape(value)}"]`; if (document.querySelectorAll(testSelector).length === 1) return testSelector; } } if (element.id) { const idSelector = `#${CSS.escape(element.id)}`; try { if (document.querySelectorAll(idSelector).length === 1) return idSelector; } catch (idError) { console.warn(`ID selector failed for #${element.id}: ${idError.message}`); } } const nameAttr = element.getAttribute('name'); if (nameAttr) { const nameSelector = `${element.tagName.toLowerCase()}[name="${CSS.escape(nameAttr)}"]`; if (document.querySelectorAll(nameSelector).length === 1) return nameSelector; } const classes = Array.from(element.classList).filter(c => c.trim() !== '').map(c => `.${CSS.escape(c)}`).join(''); if (classes) { const classSelector = element.tagName.toLowerCase() + classes; try { if (document.querySelectorAll(classSelector).length === 1) return classSelector; } catch (classError) { console.warn(`Class selector failed for ${classSelector}: ${classError.message}`); } } if (nameAttr && classes) { const tagNameClassSelector = `${element.tagName.toLowerCase()}[name="${CSS.escape(nameAttr)}"]${classes}`; if (document.querySelectorAll(tagNameClassSelector).length === 1) return tagNameClassSelector; } return classes ? element.tagName.toLowerCase() + classes : element.tagName.toLowerCase(); } catch (e) { console.warn("Error generating selector for element:", element, e); return element.tagName.toLowerCase(); }
  }

  const selectors = ['a[href]', 'button:not([disabled])', 'input:not([type="hidden"]):not([disabled])', 'textarea:not([disabled])', 'select:not([disabled])', '[role="button"]:not([aria-disabled="true"])', '[role="link"]:not([aria-disabled="true"])', '[role="menuitem"]:not([aria-disabled="true"])', '[role="checkbox"]:not([aria-disabled="true"])', '[role="radio"]:not([aria-disabled="true"])', '[role="tab"]:not([aria-disabled="true"])', '[role="option"]:not([aria-disabled="true"])', '[role="combobox"]:not([aria-disabled="true"])', '[role="textbox"]:not([aria-disabled="true"])', '[role="searchbox"]:not([aria-disabled="true"])', '[role="listbox"]:not([aria-disabled="true"])', '[role="switch"]:not([aria-disabled="true"])', '[role="slider"]:not([aria-disabled="true"])', '[role="spinbutton"]:not([aria-disabled="true"])', '[role="treeitem"]:not([aria-disabled="true"])', '[onclick]:not(body):not(html):not(div)', '[contenteditable="true"]:not([aria-disabled="true"])', 'details summary'];
  const interactableElements = []; const uniqueElements = new Set();
  document.querySelectorAll(selectors.join(', ')).forEach(element => {
    if (uniqueElements.has(element)) return; const isDisabled = element.disabled || element.getAttribute('aria-disabled') === 'true'; if (isDisabled) return; if (!isVisible(element)) return; uniqueElements.add(element);
    const tagName = element.tagName.toLowerCase(); const selector = generateSelector(element); let textContent = '';
    textContent = element.getAttribute('aria-label') || element.title || ''; if (!textContent) { if (tagName === 'input') textContent = element.value || element.placeholder || ''; else if (tagName === 'textarea') textContent = element.value || element.placeholder || ''; else if (tagName === 'select') textContent = element.options[element.selectedIndex]?.text || ''; else if (tagName === 'img') textContent = element.alt || ''; } if (!textContent) { textContent = (element.innerText || element.textContent || '').trim(); } textContent = textContent.replace(/\s+/g, ' ').trim().substring(0, 100);
    const elementInfo = { tagName, selector, text: textContent }; if (tagName === 'input' && element.type) elementInfo.type = element.type; const role = element.getAttribute('role'); if (role) elementInfo.role = role; if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') { if (typeof element.value !== 'undefined') elementInfo.value = element.value; } const name = element.getAttribute('name'); if ((tagName === 'input' || tagName === 'textarea' || tagName === 'select') && name) { elementInfo.name = name; }
    if (elementInfo.tagName && elementInfo.selector && typeof elementInfo.text === 'string') { interactableElements.push(elementInfo); }
  });
  return interactableElements;
}

console.log("A-Eye Background script loaded and listeners attached.");