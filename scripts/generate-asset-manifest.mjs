import { readdir, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const publicDir = new URL('../public/', import.meta.url);
const excluded = new Set(['asset-manifest.json']);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else files.push(full);
  }
  return files;
}

const root = publicDir.pathname;
const assets = (await walk(root))
  .map((file) => relative(root, file).split(sep).join('/'))
  .filter((path) => !excluded.has(path))
  .filter((path) => !path.endsWith('.map'))
  .map((path) => `./${path}`)
  .sort();

await writeFile(join(root, 'asset-manifest.json'), `${JSON.stringify(assets, null, 2)}\n`);
console.log(`Generated asset manifest with ${assets.length} assets.`);
