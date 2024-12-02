const SYSTEM_PROMPT = `Your name is A-Eye Web Chat Assistant, all your responses should avoid markdown format and be in plain text only.`;

const ERROR_MESSAGES = {
  GEMINI_UNAVAILABLE: "Gemini Nano is not available.",
  NO_RESPONSE: "No response from Gemini",
  SESSION_FAILED: "Failed to create Gemini session"
};

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

let currentGeminiSession = null;

chrome.commands.onCommand.addListener((command) => {
  console.log('Command received:', command);
  if (command === "_execute_action") {
    console.log("Shortcut pressed!");
  }
  if (command === 'toggle-voice-control') {
    chrome.runtime.sendMessage({
      type: 'toggleVoiceControl'
    });
  }
  if (command === 'toggle-voice-input') {
    chrome.runtime.sendMessage({
      type: 'toggleVoiceInput'
    });
  }
  if (command === 'toggle-repeat') {
    chrome.runtime.sendMessage({
      type: 'toggleRepeat'
    });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const handlers = {
    'initGemini': () => initializeGemini(sendResponse),
    'analyze': () => initializeAndAnalyze(request.text, sendResponse),
    'chat': () => handleChat(request.text, sendResponse),
    'startScrollingScreenshot': async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          function: () => ({
            scrollHeight: document.documentElement.scrollHeight,
            clientHeight: document.documentElement.clientHeight,
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth
          })
        });

        sendResponse(results[0].result);
      } catch (error) {
        console.error('Failed to get page dimensions:', error);
        sendResponse(null);
      }
      return true;
    }
  };

  if (handlers[request.type]) {
    handlers[request.type]();
    return true;
  }
});

async function createGeminiSession() {
  try {
    const capabilities = await ai.languageModel.capabilities();
    if (capabilities.available === "no") {
      throw new Error(ERROR_MESSAGES.GEMINI_UNAVAILABLE);
    }

    const session = await ai.languageModel.create({
      systemPrompt: SYSTEM_PROMPT
    });

    if (!session) {
      throw new Error(ERROR_MESSAGES.SESSION_FAILED);
    }

    return { success: true, session };
  } catch (error) {
    console.error('Gemini Session Creation Error:', error);
    return { success: false, error: error.message };
  }
}

async function ensureGeminiSession() {
  if (!currentGeminiSession) {
    const { success, session, error } = await createGeminiSession();
    if (!success) {
      return false;
    }
    currentGeminiSession = session;
  }
  return true;
}

function handleGeminiResponse(result, sendResponse) {
  if (!result) {
    sendResponse({ error: ERROR_MESSAGES.NO_RESPONSE });
    return;
  }
  sendResponse({ content: result });
}

async function initializeGemini(sendResponse) {
  try {
    const { success, error } = await createGeminiSession();
    sendResponse({ success, error });
  } catch (error) {
    console.error('Initialize Error:', error);
    sendResponse({ error: error.toString() });
  }
}

async function initializeAndAnalyze(text, sendResponse) {
  try {
    if (!await ensureGeminiSession()) {
      sendResponse({ error: ERROR_MESSAGES.GEMINI_UNAVAILABLE });
      return;
    }

    const prompt = `Summarize the core message of this webpage in about 100 words: "${text}"`;

    const result = await currentGeminiSession.prompt(prompt);
    handleGeminiResponse(result, sendResponse);
  } catch (error) {
    console.error('Analysis Error:', error);
    sendResponse({ error: error.toString() });
  }
}

async function handleChat(text, sendResponse) {
  try {
    if (!await ensureGeminiSession()) {
      sendResponse({ error: ERROR_MESSAGES.GEMINI_UNAVAILABLE });
      return;
    }

    const result = await currentGeminiSession.prompt(text);
    handleGeminiResponse(result, sendResponse);
  } catch (error) {
    console.error('Chat Error:', error);
    sendResponse({ error: error.toString() });
  }
}