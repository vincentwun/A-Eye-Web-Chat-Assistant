import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { languageOptions } from '../../src/option/languageOptions.ts';
import { availableLanguages, availableResponseLanguages } from '../../src/option/languagesSettings.ts';

test('language options preserve code, label, order and escaping', () => {
  const markup = renderToStaticMarkup(createElement('select', null, languageOptions({ 'en-US': 'English', 'x': 'A & B' })));
  assert.equal(markup, '<select><option value="en-US">English</option><option value="x">A &amp; B</option></select>');
  assert.deepEqual(languageOptions({}), []);
});

test('each configured input and response language produces an option', () => {
  for (const languages of [availableLanguages, availableResponseLanguages]) {
    const options = languageOptions(languages);
    assert.deepEqual(options.map(option => [option.props.value, option.props.children]), Object.entries(languages));
    assert.equal(new Set(options.map(option => option.key)).size, options.length);
  }
});
