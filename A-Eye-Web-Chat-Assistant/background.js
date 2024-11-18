let currentGeminiSession = null;
let voiceControlSession = null;

const SYSTEM_PROMPT = `You are a clear and concise web content summarizer. Your task is to present the core message in simple, plain text format suitable for text-to-speech.`;

const VOICE_CONTROL_PROMPT = `You are a helpful assistant. When I ask you questions, you must follow the instructions below to provide the correct response. Example:
Question: 'go to youtube / go youtube'.
Your Response: window.open('https://www.youtube.com');
Question: 'search for gcp / find gcp'.
Your Response: window.open('https://www.google.com/search?q=GCP');
Question: 'take a screenshot'.
Your Response: 'screenshot'
Question: 'take a rolling screenshot'.
Your Response: 'rollingScreenshot'
Question: 'summarization content / analyze content'.
Your Response: 'analyze content'
Always ensure your response strictly follows these instructions. Always ensure your response strictly follows these instructions. If the question begins with "search," always use Google Search for the query.`;

const ERROR_MESSAGES = {
  GEMINI_UNAVAILABLE: "Gemini Nano is not available.",
  NO_RESPONSE: "No response from Gemini",
  SESSION_FAILED: "Failed to create Gemini session"
};

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

chrome.commands.onCommand.addListener((command) => {
  console.log('Command received:', command);

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

  if (command === "_execute_action") {
    console.log("Shortcut pressed!");
  }
});

async function createGeminiSession(systemPrompt) {
  try {
    const capabilities = await ai.languageModel.capabilities();
    if (capabilities.available === "no") {
      throw new Error(ERROR_MESSAGES.GEMINI_UNAVAILABLE);
    }

    const session = await ai.languageModel.create({
      systemPrompt: systemPrompt
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

async function ensureSession(sessionType) {
  let session, systemPrompt;

  if (sessionType === 'voice') {
    if (!voiceControlSession) {
      systemPrompt = VOICE_CONTROL_PROMPT;
      const result = await createGeminiSession(systemPrompt);
      if (!result.success) return false;
      voiceControlSession = result.session;
    }
    return voiceControlSession;
  } else {
    if (!currentGeminiSession) {
      systemPrompt = SYSTEM_PROMPT;
      const result = await createGeminiSession(systemPrompt);
      if (!result.success) return false;
      currentGeminiSession = result.session;
    }
    return currentGeminiSession;
  }
}

async function processVoiceCommand(text) {
  try {
    const session = await ensureSession('voice');
    if (!session) {
      return { error: ERROR_MESSAGES.GEMINI_UNAVAILABLE };
    }

    const result = await session.prompt(text);
    if (!result) {
      return { error: ERROR_MESSAGES.NO_RESPONSE };
    }

    return { response: result };
  } catch (error) {
    console.error('Voice Command Processing Error:', error);
    return { error: error.toString() };
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const handlers = {
    'initGemini': () => initializeGemini(sendResponse),
    'analyze': () => initializeAndAnalyze(request.text, sendResponse),
    'chat': () => handleChat(request.text, sendResponse),
    'processVoiceCommand': () => {
      processVoiceCommand(request.text).then(sendResponse);
      return true;
    },
    'startRollingScreenshot': async () => {
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

async function initializeGemini(sendResponse) {
  try {
    const { success, error } = await createGeminiSession(SYSTEM_PROMPT);
    sendResponse({ success, error });
  } catch (error) {
    console.error('Initialize Error:', error);
    sendResponse({ error: error.toString() });
  }
}

async function initializeAndAnalyze(text, sendResponse) {
  try {
    const session = await ensureSession('content');
    if (!session) {
      sendResponse({ error: ERROR_MESSAGES.GEMINI_UNAVAILABLE });
      return;
    }

    const prompt = `Summarize this web page about 100 words. Web Page Content:
    "${text}"`;

    const result = await session.prompt(prompt);
    if (!result) {
      sendResponse({ error: ERROR_MESSAGES.NO_RESPONSE });
      return;
    }
    sendResponse({ content: result });
  } catch (error) {
    console.error('Analysis Error:', error);
    sendResponse({ error: error.toString() });
  }
}

async function handleChat(text, sendResponse) {
  try {
    const session = await ensureSession('content');
    if (!session) {
      sendResponse({ error: ERROR_MESSAGES.GEMINI_UNAVAILABLE });
      return;
    }

    const result = await session.prompt(text);
    if (!result) {
      sendResponse({ error: ERROR_MESSAGES.NO_RESPONSE });
      return;
    }
    sendResponse({ content: result });
  } catch (error) {
    console.error('Chat Error:', error);
    sendResponse({ error: error.toString() });
  }
}

chrome.runtime.onConnect.addListener((port) => {
  port.onDisconnect.addListener(() => {
    chrome.tts.speak('A-Eye Web Chat Assistant Closed.', {
      lang: 'en-US',
      rate: 1.5,
      pitch: 1.0,
      volume: 1.0
    });
  });
});