chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

chrome.action.onClicked.addListener(({ windowId }) => {
  chrome.sidePanel.open({ windowId });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'startRollingScreenshot') {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab) {
        sendResponse({ error: 'Active tab not found' });
        return;
      }

      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: () => ({
          scrollHeight: Math.max(
            document.documentElement.scrollHeight,
            document.body.scrollHeight,
            document.documentElement.offsetHeight,
            document.body.offsetHeight
          ),
          clientHeight: window.innerHeight
        })
      })
        .then(([result]) => sendResponse(result?.result || {
          scrollHeight: 0,
          clientHeight: 0,
          error: 'Unable to get page size'
        }))
        .catch(error => sendResponse({
          scrollHeight: 0,
          clientHeight: 0,
          error: error.message
        }));
    });
    return true;
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-voice") {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      chrome.runtime.sendMessage({
        type: "toggleVoiceRecording"
      });
    });
  }
});