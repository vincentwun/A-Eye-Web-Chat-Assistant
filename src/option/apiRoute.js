export const settingsStorageKey = 'apiSettings';

export const defaultApiSettings = {
  localApiUrl: 'http://localhost:11434',
  ollamaMultimodalModel: 'gemma3:4b',
  cloudApiUrl: 'https://generativelanguage.googleapis.com/v1beta/models/',
  cloudApiKey: '',
  cloudModelName: 'gemini-2.0-flash',
  activeApiMode: 'cloud'
};