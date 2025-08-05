export const settingsStorageKey = 'apiSettings';

export const defaultApiSettings = {
  activeApiMode: 'cloud',

  localApiUrl: 'http://localhost:11434',
  ollamaMultimodalModel: 'gemma3:4b',

  cloudProvider: 'gemini',
  cloudApiMethod: 'direct',
  cloudModelName: 'gemini-2.5-flash',
  cloudApiKey: '',

  cloudProxyUrl: '',
  gcpApiKey: '',

  mistralApiKey: '',
  mistralModelName: 'mistral-small-latest'
};