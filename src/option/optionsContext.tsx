import { createContext, useContext } from "react";
import type { OptionData } from "./optionsStorage";

export type OptionsView = OptionData & {
  cloud: string;
  local: string;
  setCloud(value: string): void;
  setLocal(value: string): void;
  ollamaCustom: boolean;
  lmstudioCustom: boolean;
  setOllamaCustom(value: boolean): void;
  setLmstudioCustom(value: boolean): void;
  voices: SpeechSynthesisVoice[];
  selectedVoice: string;
  setSelectedVoice(value: string): void;
};

export const OptionsContext = createContext<OptionsView | null>(null);
export function useOptions() {
  const context = useContext(OptionsContext);
  if (!context) throw new Error("Options context is missing");
  return context;
}
export function fieldValue(
  data: OptionData,
  area: keyof OptionData,
  key: string,
) {
  return String(data[area][key] ?? "");
}
