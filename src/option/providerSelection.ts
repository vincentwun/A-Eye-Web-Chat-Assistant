/** Translate the options page's service choices to the existing storage schema. */
export function cloudSelectionFromSettings(provider: string, method: string): string {
  if (provider === 'mistral') return 'mistral';
  if (provider === 'azure-foundry') return 'azure-foundry';
  return method === 'proxy' ? 'gateway' : 'gemini';
}

export function cloudSettingsFromSelection(selection: string | null): { cloudProvider: string; cloudApiMethod?: string } {
  if (selection === 'mistral') return { cloudProvider: 'mistral' };
  if (selection === 'gateway') return { cloudProvider: 'gemini', cloudApiMethod: 'proxy' };
  if (selection === 'azure-foundry') return { cloudProvider: 'azure-foundry', cloudApiMethod: 'direct' };
  return { cloudProvider: 'gemini', cloudApiMethod: 'direct' };
}
