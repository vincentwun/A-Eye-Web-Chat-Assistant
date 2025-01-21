const paligemma2Settings = document.getElementById('paligemma2-settings');
const geminiproSettings = document.getElementById('geminipro-settings');

document.addEventListener('DOMContentLoaded', () => {
  restoreOptions();

  document.getElementById('save').addEventListener('click', saveOptions);

  document.querySelectorAll('input[name="model"]').forEach(radio => {
    radio.addEventListener('change', updateSettingsVisibility);
  });
});

function updateSettingsVisibility() {
  const selectedModel = document.querySelector('input[name="model"]:checked').value;

  paligemma2Settings.style.display =
    selectedModel === 'paligemma2' ? 'block' : 'none';

  geminiproSettings.style.display =
    selectedModel === 'geminipro' ? 'block' : 'none';
}

function saveOptions() {
  const selectedModel = document.querySelector('input[name="model"]:checked').value;
  const flaskUrl = document.getElementById('flask-url').value;
  const apiKey = document.getElementById('api-key').value;

  chrome.storage.local.set(
    {
      aiModel: {
        selectedModel,
        flaskUrl,
        apiKey
      }
    },
    () => {
      const status = document.getElementById('status');
      status.textContent = '設定已儲存';
      status.style.color = 'green';

      setTimeout(() => {
        status.textContent = '';
      }, 3000);
    }
  );
}

function restoreOptions() {
  chrome.storage.local.get('aiModel', (result) => {
    if (result.aiModel) {
      const modelInput = document.querySelector(
        `input[name="model"][value="${result.aiModel.selectedModel}"]`
      );
      if (modelInput) {
        modelInput.checked = true;
      }

      if (result.aiModel.flaskUrl) {
        document.getElementById('flask-url').value = result.aiModel.flaskUrl;
      }

      if (result.aiModel.apiKey) {
        document.getElementById('api-key').value = result.aiModel.apiKey;
      }

      updateSettingsVisibility();
    }
  });
}