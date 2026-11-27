export const ollamaModels = {
  Gemma: ['gemma3:4b', 'gemma3:12b', 'gemma3:27b'],
  Qwen: ['qwen3-vl:8b', 'qwen3-vl:32b'],
};
export const lmstudioModels = {
  Google: ['google/gemma-3-4b', 'google/gemma-3-12b', 'google/gemma-3-27b'],
  Qwen: ['qwen/qwen3-vl-8b', 'qwen/qwen3-vl-32b'],
};
export function isCustomModel(groups: Record<string, string[]>, value: string) {
  return !Object.values(groups).some(models => models.includes(value));
}
