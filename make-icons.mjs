// Dev tool: renders the PWA icons from the real map data using headless Chrome.
// Needs playwright-core (installed locally, or point PLAYWRIGHT_CORE at any
// install's index.mjs) and Google Chrome.
//   PLAYWRIGHT_CORE=/path/to/node_modules/playwright-core/index.mjs node make-icons.mjs
import { readFileSync, mkdirSync } from 'node:fs';
const { chromium } = await import('playwright-core')
  .catch(() => import(process.env.PLAYWRIGHT_CORE || 'playwright-core'));

const mapData = readFileSync(new URL('./map-data.js', import.meta.url), 'utf8');
mkdirSync(new URL('./icons/', import.meta.url), { recursive: true });

const ACCENT = {
  'Oceania': '#22d3ee', 'South America': '#34d399', 'North America': '#a78bfa',
  'Europe': '#60a5fa', 'Africa': '#f59e0b', 'Asia': '#f472b6', 'Antarctica': '#2b3a55',
};

// pad=0: full-bleed ("any" icons); pad=0.12: extra margin for maskable safe zone
const page_html = (pad) => `<!DOCTYPE html><html><head><style>
  html,body{margin:0;padding:0}
  #tile{width:512px;height:512px;position:relative;overflow:hidden;
    background:radial-gradient(140% 110% at 30% 15%, #16305c 0%, #0b1830 55%, #060d1f 100%)}
  svg{position:absolute;inset:${12 + pad * 512}px;width:auto;height:auto;
    filter:drop-shadow(0 6px 18px rgba(0,0,0,.55))}
</style></head><body><div id="tile"></div>
<script>${mapData}<\/script>
<script>
  const ACCENT = ${JSON.stringify(ACCENT)};
  const M = window.MAP;
  // frame on the populated world (skip the empty poles)
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 55 1000 400');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.style.width = '100%'; svg.style.height = '100%';
  for (const c of M.countries) {
    const p = document.createElementNS(svgNS, 'path');
    p.setAttribute('d', c.d);
    p.setAttribute('fill', ACCENT[c.c] || '#3d4f74');
    p.setAttribute('fill-opacity', c.c === 'Antarctica' ? '.5' : '.95');
    p.setAttribute('stroke', '#060d1f'); p.setAttribute('stroke-width', '.7');
    svg.appendChild(p);
  }
  document.getElementById('tile').appendChild(svg);
<\/script></body></html>`;

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});

async function shoot(pad, size, out) {
  const page = await browser.newPage({
    viewport: { width: 512, height: 512 },
    deviceScaleFactor: size / 512,
  });
  await page.setContent(page_html(pad));
  await page.waitForTimeout(150);
  await page.locator('#tile').screenshot({ path: new URL(`./icons/${out}`, import.meta.url).pathname });
  await page.close();
  console.log('wrote icons/' + out, size + 'px');
}

await shoot(0, 512, 'icon-512.png');
await shoot(0, 192, 'icon-192.png');
await shoot(0.12, 512, 'icon-maskable-512.png');
await shoot(0, 180, 'apple-touch-icon.png');
await browser.close();
