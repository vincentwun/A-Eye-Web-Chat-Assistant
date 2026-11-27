import { createElement } from 'react';

/** Render the stored language codes as stable, selectable options. */
export function languageOptions(languages: Record<string, string>) {
  return Object.entries(languages).map(([code, label]) =>
    createElement('option', { key: code, value: code }, label),
  );
}
