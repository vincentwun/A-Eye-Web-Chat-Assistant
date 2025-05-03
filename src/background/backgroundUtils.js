export async function getCurrentTab() {
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    [tab] = await chrome.tabs.query({ active: true });
    if (!tab) throw new Error("Could not find any active tab.");
  }
  if (!tab.id) throw new Error("Active tab has no ID.");
  return tab;
}

export async function executeScriptOnTab(tabId, func, args = []) {
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

export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function waitForTabLoad(tabId) {
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

export async function getPageDimensions(tabId) {
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