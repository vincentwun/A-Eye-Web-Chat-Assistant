export const settingsStorageKey = 'apiSettings';

export const defaultApiSettings = {
  activeApiMode: 'cloud',

  localApiMode: 'ollama',
  localApiUrl: 'http://localhost:8000',
  localMultimodalModel: 'gemma3:4b',

  cloudProvider: 'gemini',
  cloudApiMethod: 'direct',
  cloudModelName: 'gemini-2.5-flash',
  cloudApiKey: '',

  cloudProxyUrl: '',
  gcpApiKey: '',

  mistralModelName: 'mistral-small-latest',
  mistralApiKey: ''
};