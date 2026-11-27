export interface AvailableVoice {
  name: string;
  lang: string;
  default: boolean;
}

/** Match the saved voice first, then the previous selection, then an English voice. */
export function selectVoice(voices: AvailableVoice[], saved: string | null | undefined, previous: string) {
  if (saved && voices.some(voice => voice.name === saved)) return { name: saved, persist: false };
  if (previous && voices.some(voice => voice.name === previous)) return { name: previous, persist: false };
  const fallback = voices.find(voice => voice.lang === 'en-US' && voice.default)
    ?? voices.find(voice => voice.lang === 'en-US');
  return { name: fallback?.name ?? '', persist: Boolean(fallback && !saved) };
}
