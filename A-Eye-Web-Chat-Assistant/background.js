const SYSTEM_PROMPT = "Your name is A-Eye-Web-Chat-Assistant, a helpful assistant. You are required to avoid answering with markdown format and special characters such as '*' and '**'. When the user requests specific actions, you should response according to the following instructions: 1.When user asks to visit a website, respond with `window.open('https://www.example.com');`. 2.When user requests to search for something, respond with `window.open('https://www.google.com/search?q=example');`.3.When a user requests a screenshot or a scrolling screenshot, respond with `screenshot` or `scrolling`, respectively. 4.Only respond with `analyze` when the user asks to summarize webpage content.";

const ERROR_MESSAGES = {
  GEMINI_UNAVAILABLE: "Gemini Nano is not available.",
  NO_RESPONSE: "No response from Gemini",
  SESSION_FAILED: "Failed to create Gemini session"
};

let geminiSession = null;

async function getGeminiSession() {
  if (!geminiSession) {
    try {
      const capabilities = await ai.languageModel.capabilities();
      if (capabilities.available === "no") {
        throw new Error(ERROR_MESSAGES.GEMINI_UNAVAILABLE);
      }

      geminiSession = await ai.languageModel.create({
        systemPrompt: SYSTEM_PROMPT
      });

      if (!geminiSession) {
        throw new Error(ERROR_MESSAGES.SESSION_FAILED);
      }
    } catch (error) {
      console.error('Gemini Session Error:', error);
      throw error;
    }
  }
  return geminiSession;
}

async function handleGeminiMessage(type, text) {
  try {
    const session = await getGeminiSession();

    switch (type) {
      case 'chat':
        return { content: await session.prompt(text) };

      case 'analyze':
        const prompt = `Summarize the webpage content within 100 words: "${text}"`;
        return { content: await session.prompt(prompt) };

      default:
        throw new Error('Unknown message type');
    }
  } catch (error) {
    return { error: error.toString() };
  }
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
    return results[0].result;
  } catch (error) {
    console.error('Failed to get page dimensions:', error);
    return null;
  }
}

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

chrome.commands.onCommand.addListener((command) => {
  console.log('Command received:', command);

  const commandActions = {
    '_execute_action': () => console.log("Shortcut pressed!"),
    'toggle-voice-control': () => chrome.runtime.sendMessage({ type: 'toggleVoiceControl' }),
    'toggle-voice-input': () => chrome.runtime.sendMessage({ type: 'toggleVoiceInput' }),
    'toggle-repeat': () => chrome.runtime.sendMessage({ type: 'toggleRepeat' })
  };

  if (commandActions[command]) {
    commandActions[command]();
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const messageHandlers = {
    'initGemini': async () => {
      try {
        await getGeminiSession();
        return { success: true };
      } catch (error) {
        return { success: false, error: error.toString() };
      }
    },
    'analyze': (text) => handleGeminiMessage('analyze', text),
    'chat': (text) => handleGeminiMessage('chat', text),
    'startScrollingScreenshot': async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return null;
      return getPageDimensions(tab.id);
    }
  };

  if (messageHandlers[request.type]) {
    if (request.type === 'analyze' || request.type === 'chat') {
      messageHandlers[request.type](request.text).then(sendResponse);
    } else {
      messageHandlers[request.type]().then(sendResponse);
    }
    return true;
  }
});

async function getAIModelConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get('aiModel', (result) => {
      resolve(result.aiModel || { selectedModel: 'webai' });
    });
  });
}