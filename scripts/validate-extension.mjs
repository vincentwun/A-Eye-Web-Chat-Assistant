import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? 'src');
const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));

if (manifest.manifest_version !== 3) throw new Error('Expected Manifest V3');
if (typeof manifest.name !== 'string' || !manifest.name.trim()) throw new Error('Missing extension name');
if (typeof manifest.version !== 'string' || !/^\d+(\.\d+){0,3}$/.test(manifest.version)) {
  throw new Error('Invalid extension version');
}

const files = [
  manifest.background?.service_worker,
  manifest.side_panel?.default_path,
  manifest.options_page ?? manifest.options_ui?.page,
  ...Object.values(manifest.icons ?? {}),
  ...(manifest.content_scripts ?? []).flatMap(script => [...(script.js ?? []), ...(script.css ?? [])]),
  ...(manifest.web_accessible_resources ?? []).flatMap(entry => entry.resources ?? []),
];
if (!manifest.background?.service_worker || !manifest.side_panel?.default_path || !(manifest.options_page ?? manifest.options_ui?.page)) {
  throw new Error('Background, side panel, or options entrypoint is missing');
}
if (Object.keys(manifest.icons ?? {}).length === 0) throw new Error('Extension icons are missing');

for (const file of new Set(files)) {
  if (typeof file !== 'string' || !file || /[*?]/.test(file)) {
    throw new Error(`Unsupported or empty manifest resource: ${file}`);
  }
  const resolved = path.resolve(root, file.replace(/^\//, ''));
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Resource escapes extension directory: ${file}`);
  try {
    if (!(await stat(resolved)).isFile()) throw new Error('Not a file');
  } catch {
    throw new Error(`Manifest resource not found: ${file}`);
  }
}

console.log(`Validated Manifest V3 ${manifest.version}: ${new Set(files).size} referenced files`);
