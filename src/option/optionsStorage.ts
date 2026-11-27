import { defaultApiSettings, settingsStorageKey } from './apiRoute.ts';
import { defaultPrompts, promptsStorageKey } from './prompts.ts';
import { voiceSettingsStorageKey } from './languagesSettings.ts';
import { cloudSettingsFromSelection } from './providerSelection.ts';

export type Values = Record<string, unknown>;
export type OptionData = { settings: Values; prompts: Values; voice: Values };
export type OptionUpdates = OptionData & { localService: string; cloudService: string };
export interface StorageArea {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(values: Record<string, unknown>): Promise<void>;
}

const keys = [settingsStorageKey, promptsStorageKey, voiceSettingsStorageKey];
function record(value: unknown): Values {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Values : {};
}

export async function readOptions(storage: StorageArea): Promise<OptionData> {
  const stored = await storage.get(keys);
  return { settings: record(stored[settingsStorageKey]), prompts: record(stored[promptsStorageKey]), voice: record(stored[voiceSettingsStorageKey]) };
}

export function initialOptions(saved: OptionData): OptionData {
  const settings: Values = { ...saved.settings };
  for (const [key, fallback] of Object.entries(defaultApiSettings)) settings[key] ??= fallback;
  return {
    settings,
    prompts: { ...defaultPrompts, ...saved.prompts,
      active_system_prompt_key: saved.prompts.active_system_prompt_key || defaultPrompts.active_system_prompt_key,
      responseLanguage: saved.prompts.responseLanguage || defaultPrompts.responseLanguage },
    voice: saved.voice,
  };
}

export function mergeOptions(existing: OptionData, updates: OptionUpdates): Record<string, unknown> {
  return {
    [settingsStorageKey]: { ...existing.settings, ...updates.settings, localApiMode: updates.localService, ...cloudSettingsFromSelection(updates.cloudService) },
    [promptsStorageKey]: { ...existing.prompts, ...updates.prompts },
    [voiceSettingsStorageKey]: { ...existing.voice, ...updates.voice },
  };
}

/** Serialize read/merge/write operations so rapid edits do not overwrite one another. */
export function createOptionsWriter(storage: StorageArea) {
  let pending = Promise.resolve();
  const enqueue = (operation: () => Promise<void>) => {
    const write = pending.then(operation);
    pending = write.catch(() => {});
    return write;
  };
  const save = (updates: OptionUpdates): Promise<void> => enqueue(async () => {
      const existing = await readOptions(storage);
      await storage.set(mergeOptions(existing, updates));
  });
  save.setDefaultVoice = (name: string) => enqueue(async () => {
    const existing = await readOptions(storage);
    if (!existing.voice.ttsVoiceName) {
      await storage.set({ [voiceSettingsStorageKey]: { ...existing.voice, ttsVoiceName: name } });
    }
  });
  return save;
}
