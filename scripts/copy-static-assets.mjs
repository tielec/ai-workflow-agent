import fs from 'fs-extra';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');

const assets = [
  {
    source: path.join(projectRoot, 'metadata.json.template'),
    target: path.join(distDir, 'metadata.json.template'),
  },
  {
    source: path.join(projectRoot, 'src', 'prompts'),
    target: path.join(distDir, 'prompts'),
  },
  {
    source: path.join(projectRoot, 'src', 'templates'),
    target: path.join(distDir, 'templates'),
  },
];

async function copyAssets() {
  await fs.ensureDir(distDir);

  for (const asset of assets) {
    if (!(await fs.pathExists(asset.source))) {
      console.warn(`[WARN] Asset not found: ${asset.source}`);
      continue;
    }

    await fs.copy(asset.source, asset.target, {
      overwrite: true,
      recursive: true,
    });
    console.info(`[OK] Copied ${asset.source} -> ${asset.target}`);
  }
}

copyAssets().catch((error) => {
  console.error('[ERROR] Failed to copy static assets');
  console.error(error);
  process.exit(1);
});
