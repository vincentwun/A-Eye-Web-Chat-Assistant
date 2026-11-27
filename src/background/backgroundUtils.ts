export async function getCurrentTab(): Promise<chrome.tabs.Tab & { id: number }> {
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    [tab] = await chrome.tabs.query({ active: true });
    if (!tab) throw new Error("Could not find any active tab.");
  }
  if (!tab.id) throw new Error("Active tab has no ID.");
  return tab as chrome.tabs.Tab & { id: number };
}

export async function executeScriptOnTab(tabId: number, func: (...args: any[]) => any, args: any[] = []) {
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

  } catch (error: any) {
    console.error(`Error executing script on tab ${tabId} (function: ${func.name}):`, error);
    throw new Error(`Script execution error for ${func.name || 'anonymous function'}: ${error.message}`);
  }
}

export function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function waitForTabLoad(tabId: number) {
  return new Promise<void>((resolve, reject) => {
    let listenersAttached = false;
    let resolved = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (intervalId) clearInterval(intervalId);
      if (timeoutId) clearTimeout(timeoutId);
      if (listenersAttached) {
        chrome.tabs.onUpdated.removeListener(onUpdated);
        chrome.tabs.onRemoved.removeListener(onRemoved);
      }
    };

    const done = () => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve();
    };

    const fail = (error: Error) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      reject(error);
    };

    const onUpdated = (updatedTabId: number, changeInfo: { status?: string }) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        done();
      }
    };

    const onRemoved = (closedTabId: number) => {
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
      } catch (error: any) {
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

export async function getPageDimensions(tabId: number) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      // Preserve the legacy 'function' injection property.
      // @ts-expect-error Retain the existing alias pending browser verification.
      function: () => ({
        scrollHeight: document.documentElement.scrollHeight,
        clientHeight: document.documentElement.clientHeight,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth
      })
    });
    return results?.[0]?.result ?? null;
  } catch (error: any) {
    console.error('Failed to execute script for page dimensions:', error);
    return null;
  }
}
