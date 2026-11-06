// Renders public/default-cover.png (1400x1400, the minimum Apple Podcasts
// accepts) from inline SVG using the preinstalled Playwright Chromium.
// Usage: node scripts/render-default-cover.mjs
import { chromium } from "playwright";

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="1400" viewBox="0 0 1400 1400">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#e2734d"/>
      <stop offset="1" stop-color="#a8411f"/>
    </linearGradient>
  </defs>
  <rect width="1400" height="1400" fill="url(#g)"/>
  <g fill="none" stroke="#fbf7f1" stroke-width="64" stroke-linecap="round" opacity="0.95">
    <path d="M430 610v180"/><path d="M560 500v400"/><path d="M690 420v560"/>
    <path d="M820 530v340"/><path d="M950 620v160"/>
  </g>
  <text x="700" y="1180" text-anchor="middle" font-family="Helvetica, Arial, sans-serif"
        font-size="96" font-weight="700" fill="#fbf7f1" letter-spacing="2">Ouve Isto</text>
</svg>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1400 }, deviceScaleFactor: 1 });
await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
await page.screenshot({ path: "public/default-cover.png", clip: { x: 0, y: 0, width: 1400, height: 1400 } });
await browser.close();
console.log("wrote public/default-cover.png");
