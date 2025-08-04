export const settingsStorageKey = 'apiSettings';

export const defaultApiSettings = {
  activeApiMode: 'cloud',

  localApiUrl: 'http://localhost:11434',
  ollamaMultimodalModel: 'gemma3:4b',

  cloudApiUrl: 'https://generativelanguage.googleapis.com/v1beta/models/',
  cloudApiKey: '',
  cloudModelName: 'gemini-2.5-flash',

  cloudApiMethod: 'direct',
  cloudProxyUrl: '',

  mistralApiKey: '',
  mistralModelName: 'pixtral-large-latest'
};