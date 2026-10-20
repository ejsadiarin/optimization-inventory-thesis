import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const distDir = resolve(process.argv[2] ?? 'dist');
const errors = [];

function fail(message) {
  errors.push(message);
}

function requireFile(relativePath) {
  const path = join(distDir, relativePath);
  if (!existsSync(path)) {
    fail(`Missing ${relativePath} in ${distDir}`);
    return null;
  }
  return path;
}

function readJson(relativePath) {
  const path = requireFile(relativePath);
  if (!path) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`Could not parse ${relativePath}: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

const manifestPath = requireFile('manifest.webmanifest');
const swPath = requireFile('sw.js');

if (swPath && statSync(swPath).size === 0) {
  fail('sw.js is empty');
}

const manifest = manifestPath ? readJson('manifest.webmanifest') : null;

if (manifest) {
  for (const field of [
    'name',
    'short_name',
    'description',
    'start_url',
    'display',
    'theme_color',
    'background_color',
  ]) {
    if (!manifest[field]) fail(`Manifest is missing required field: ${field}`);
  }

  if (manifest.display !== 'standalone') {
    fail(`Manifest display must be "standalone" (found "${manifest.display}")`);
  }

  const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
  if (icons.length === 0) fail('Manifest has no icons');

  const hasIcon = (size, purpose) =>
    icons.some((icon) => icon.sizes === size && String(icon.purpose ?? 'any').includes(purpose));

  if (!hasIcon('192x192', 'any')) fail('Manifest is missing a 192x192 any icon');
  if (!hasIcon('512x512', 'any')) fail('Manifest is missing a 512x512 any icon');
  if (!hasIcon('512x512', 'maskable')) fail('Manifest is missing a 512x512 maskable icon');

  for (const icon of icons) {
    if (typeof icon.src !== 'string') {
      fail('Manifest icon is missing a src');
      continue;
    }
    const iconPath = join(distDir, icon.src.replace(/^\//, ''));
    if (!existsSync(iconPath)) fail(`Manifest icon does not exist: ${icon.src}`);
  }
}

const indexPath = requireFile('index.html');
if (indexPath) {
  const html = readFileSync(indexPath, 'utf8');
  if (!html.includes('rel="manifest"')) fail('index.html does not link the web manifest');
  if (!html.includes('name="theme-color"')) fail('index.html does not set a theme-color meta tag');
}

if (errors.length > 0) {
  console.error('PWA verification failed:');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log('PWA verification passed:');
console.log('  - manifest.webmanifest has installable metadata and 192/512/maskable icons');
console.log('  - sw.js is present');
console.log('  - icon assets and index.html links are present');
