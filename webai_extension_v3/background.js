chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "takeScreenshot") {
    chrome.tabs.captureVisibleTab(null, {format: "png"}, (dataUrl) => {
      sendResponse({imageDataUrl: dataUrl});
    });
    return true;
  }
});