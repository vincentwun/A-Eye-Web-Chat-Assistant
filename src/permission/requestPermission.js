async function requestMicrophoneAccess() {
  console.log("Attempting to get user media from iframe...");
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    console.log("Microphone access granted via iframe.");
    stream.getTracks().forEach(track => track.stop());
    console.log("Media stream tracks stopped.");
    chrome.runtime.sendMessage({ type: "micPermissionResult", status: "granted" });
    removeIframe();
  } catch (error) {
    console.error("Error requesting microphone permission via iframe:", error);
    chrome.runtime.sendMessage({ type: "micPermissionResult", status: "denied", error: error.name });
    removeIframe();
  }
}

function removeIframe() {
  try {
    const iframe = window.frameElement;
    if (iframe) {
      iframe.remove();
      console.log("Permission iframe removed itself.");
    } else {
      console.warn("Could not find iframe element to remove.");
    }
  } catch (error) {
    console.error("Error removing iframe:", error);
  }
}

requestMicrophoneAccess();