chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "requestMicPermission") {
    console.log(
      "Received requestMicPermission message in permissionContent.js."
    );

    const existingIframe = document.getElementById("mic-permission-iframe");
    if (existingIframe) {
      console.log("Removing potentially stale permission iframe.");
      existingIframe.remove();
    }

    try {
      const iframe = document.createElement("iframe");
      iframe.id = "mic-permission-iframe";
      iframe.allow = "microphone";
      iframe.src = chrome.runtime.getURL("permission/permission.html");
      iframe.style.display = "none";
      document.body.appendChild(iframe);
      console.log("New permission iframe injected by permissionContent.js.");
      sendResponse({ status: "iframe injected" });
    } catch (error) {
      console.error("Error injecting permission iframe:", error);
      sendResponse({ status: "injection failed", error: error.message });
    }

    return true;
  }
});

console.log("permissionContent.js loaded.");
