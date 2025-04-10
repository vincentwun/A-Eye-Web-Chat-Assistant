const defaultPrompts = {
  screenshot: 'You are a Webpage Screen Reader. Describe this screenshot concisely, focusing on layout, main elements, and visible text. Aim for under 100 words.',
  scrollingScreenshot: 'You are a Webpage Screen Reader. Describe the key sections and overall content visible in this combined scrolling screenshot. Aim for under 150 words.',
  analyzeContent: 'Summarize the following webpage text content clearly and concisely:',
  defaultChat: 'You are a helpful assistant.'
};

const storageKey = 'userPrompts';

function loadOptions() {
  chrome.storage.local.get([storageKey], (result) => {
      const savedPrompts = result[storageKey] || {};

      document.getElementById('screenshot-prompt').value =
          savedPrompts.screenshot || defaultPrompts.screenshot;
      document.getElementById('scrolling-screenshot-prompt').value =
          savedPrompts.scrollingScreenshot || defaultPrompts.scrollingScreenshot;
      document.getElementById('analyze-content-prompt').value =
          savedPrompts.analyzeContent || defaultPrompts.analyzeContent;
      document.getElementById('default-chat-prompt').value =
          savedPrompts.defaultChat || defaultPrompts.defaultChat;

      console.log("Options loaded:", { ...defaultPrompts, ...savedPrompts });
  });
}

// Function to save options
function saveOptions() {
  const newPrompts = {
      screenshot: document.getElementById('screenshot-prompt').value.trim(),
      scrollingScreenshot: document.getElementById('scrolling-screenshot-prompt').value.trim(),
      analyzeContent: document.getElementById('analyze-content-prompt').value.trim(),
      defaultChat: document.getElementById('default-chat-prompt').value.trim()
  };

  chrome.storage.local.set({ [storageKey]: newPrompts }, () => {
      const status = document.getElementById('status');
      if (chrome.runtime.lastError) {
          status.textContent = `Error saving: ${chrome.runtime.lastError.message}`;
          status.style.color = 'red';
          console.error("Error saving options:", chrome.runtime.lastError);
      } else {
          status.textContent = 'Options saved successfully!';
          status.style.color = 'green';
          console.log("Options saved:", newPrompts);
          setTimeout(() => {
              status.textContent = '';
          }, 2500); // Clear status message after 2.5 seconds
      }
  });
}

document.addEventListener('DOMContentLoaded', loadOptions);
document.getElementById('save-button').addEventListener('click', saveOptions);