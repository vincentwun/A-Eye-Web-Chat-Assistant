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
  return new Promise((resolve, reject) => {
    let listenersAttached = false;
    let resolved = false;
    let intervalId = null;
    let timeoutId = null;

    const cleanup = () => {
      if (intervalId) clearInterval(intervalId);
      if (timeoutId) clearTimeout(timeoutId);
      if (listenersAttached) {
        chrome.tabs.onUpdated.removeListener(onUpdated);
        chrome.tabs.onRemoved.removeListener(onRemoved);
      }
    };

    const done = (result) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(result);
    };

    const fail = (error) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      reject(error);
    };

    const onUpdated = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        done();
      }
    };

    const onRemoved = (closedTabId) => {
      if (closedTabId === tabId) {
        fail(new Error(`Tab ${tabId} was closed while waiting for it to load.`));
      }
    };

    const checkReadyState = async () => {
      if (resolved) return;
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: () => document.readyState,
        });
        const readyState = results[0]?.result;
        if (readyState === 'interactive' || readyState === 'complete') {
          done();
        }
      } catch (error) {
        const message = error.message.toLowerCase();
        if (message.includes('no tab with id') || message.includes('the tab was closed')) {
          fail(new Error(`Tab ${tabId} closed during readyState check.`));
        }
      }
    };

    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);
    listenersAttached = true;

    intervalId = setInterval(checkReadyState, 200);

    timeoutId = setTimeout(() => {
      if (!resolved) {
        console.warn(`waitForTabLoad timed out after 15 seconds for tab ${tabId}. Proceeding anyway.`);
        done();
      }
    }, 15000);

    checkReadyState();
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