import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve(process.argv[2] ?? '.output/chrome-mv3');
const legacy = JSON.parse(await readFile('tests/fixtures/legacy-manifest.json', 'utf8'));
const built = JSON.parse(await readFile(path.join(output, 'manifest.json'), 'utf8'));
// The fixture captures the previous release; the current version may advance independently.
delete legacy.version;
delete built.version;
assert.deepEqual(built.background, { type: 'module', service_worker: 'background.js' });
delete legacy.background;
delete built.background;
assert.deepEqual(built.content_scripts, [{ matches: ['<all_urls>'], run_at: 'document_end', js: ['content-scripts/permission.js'] }]);
delete legacy.content_scripts;
delete built.content_scripts;
assert.deepEqual(built.side_panel, { default_path: 'sidepanel.html' });
delete legacy.side_panel;
delete built.side_panel;
assert.deepEqual(built.options_ui, { page: 'options.html', open_in_tab: true });
delete legacy.options_page;
delete built.options_page;
delete built.options_ui;
assert.deepEqual(built, legacy, 'WXT manifest differs from the legacy manifest');

for (const resource of [
  'permission/permission.html',
]) {
  assert.deepEqual(await readFile(path.join(output, resource)), await readFile(path.join('src', resource)), `${resource} differs`);
}
console.log('WXT manifest and critical legacy resources match.');
