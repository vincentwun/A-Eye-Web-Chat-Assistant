import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, rmdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../../scripts/validate-extension.mjs', import.meta.url));

test('manifest validation rejects a missing referenced resource', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'a-eye-validation-'));
  const manifest = path.join(directory, 'manifest.json');
  try {
    await writeFile(manifest, JSON.stringify({
      manifest_version: 3, name: 'Test', version: '1.0',
      background: { service_worker: 'missing.js' }, side_panel: { default_path: 'panel.html' },
      options_page: 'options.html', icons: { 16: 'icon.png' },
    }));
    const result = spawnSync(process.execPath, [script, directory], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Manifest resource not found: missing\.js/);
  } finally {
    await rm(manifest, { force: true });
    await rmdir(directory);
  }
});
