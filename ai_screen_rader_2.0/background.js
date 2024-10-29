chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'requestScreenshot') {
    chrome.tabs.captureVisibleTab(null, { format: 'png' })
      .then(dataUrl => {
        sendResponse({ success: true, dataUrl: dataUrl });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
});