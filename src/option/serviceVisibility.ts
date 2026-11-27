export function cloudVisibility(service: string) {
  return {
    gateway: service === 'gateway',
    geminiKey: service === 'gemini',
    geminiModel: service === 'gemini' || service === 'gateway',
    mistral: service === 'mistral',
    azure: service === 'azure-foundry',
  };
}

export function localVisibility(service: string) {
  return {
    ollama: service === 'ollama',
    lmstudio: service === 'lmstudio',
    vllm: service === 'vllm',
  };
}
