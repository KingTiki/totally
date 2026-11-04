// Render the brand icon to platform-required PNG sizes.
import { chromium } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const svg = await readFile(new URL('../static/favicon.svg', import.meta.url), 'utf8');
await mkdir(new URL('../static/icons/', import.meta.url), { recursive: true });
const browser = await chromium.launch();
try {
  for (const [name, size] of [
    ['pwa-192.png', 192],
    ['pwa-512.png', 512],
    ['apple-touch-icon.png', 180]
  ]) {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1
    });
    await page.setContent(
      `<style>html,body{margin:0;background:#2f5d50;width:100%;height:100%}svg{display:block;width:100%;height:100%}</style>${svg}`
    );
    await page.screenshot({
      path: fileURLToPath(new URL(`../static/icons/${name}`, import.meta.url))
    });
    await page.close();
  }
} finally {
  await browser.close();
}
