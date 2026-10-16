'use strict';

// Renders the raster icons and the social card from site/favicon.svg. Run after changing the mark.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const site = path.resolve(__dirname, '../site');
const svg = fs.readFileSync(path.join(site, 'favicon.svg'), 'utf8');
const colors = svg.match(/<style>(.*?)@media/)[1];
const body = svg.match(/<\/style>(.*)<\/svg>/s)[1];
const paper = '#fdfdff';

// The mark on an optional background, scaled about its center.
const tile = ({ bg, radius = 0, scale = 1 }) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none" stroke-width="3" stroke-linecap="round"><style>${colors}</style>${bg ? `<rect width="32" height="32" rx="${radius}" fill="${bg}"/>` : ''}<g transform="translate(16 16) scale(${scale}) translate(-16 -16)">${body}</g></svg>`;
const uri = markup => 'data:image/svg+xml;base64,' + Buffer.from(markup).toString('base64');

// PNG-in-ICO: a 6-byte header, one 16-byte entry per image, then the PNG data.
function ico(pngs) {
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(({ size, data }, i) => {
    const entry = 6 + 16 * i;
    header.writeUInt8(size % 256, entry);
    header.writeUInt8(size % 256, entry + 1);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...pngs.map(png => png.data)]);
}

const card = `<!doctype html><meta charset="utf-8"><style>
@font-face { font-family: 'DM Sans'; src: url('file://${site}/fonts/dm-sans.woff2') format('woff2'); font-weight: 100 900; }
html, body { margin: 0; width: 1200px; height: 630px; background: ${paper}; color: #1c1f25; font-family: 'DM Sans', Arial, sans-serif; }
main { height: 100%; box-sizing: border-box; padding: 96px 104px; display: grid; align-content: center; gap: 28px; }
.title { display: flex; align-items: center; gap: 16px; }
img { width: 132px; height: 132px; margin-left: -25px; }
h1 { margin: 0; font-weight: 380; font-size: 150px; line-height: 1; letter-spacing: -6px; }
h1 span { color: #1f5ed9; }
p { margin: 0; font-size: 46px; letter-spacing: -.5px; }
small { margin-top: 36px; font-size: 26px; color: #6b7180; }
</style><main><div class="title"><img src="${uri(tile({}))}"><h1>light<span>high</span></h1></div><p>A little highlight with no markup.</p><small>dy.github.io/lighthigh</small></main>`;

async function build() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const render = async (markup, size) => {
      await page.setViewportSize({ width: size, height: size });
      await page.setContent(`<style>html, body { margin: 0; background: transparent; }</style><img src="${uri(markup)}" width="${size}" height="${size}">`);
      return page.screenshot({ omitBackground: true });
    };
    // The tab icon gets a light tile: browsers without SVG favicons often draw dark tab bars.
    const small = tile({ bg: paper, radius: 7 });
    const icons = [];
    for (const size of [16, 32, 48]) icons.push({ size, data: await render(small, size) });
    // Home-screen icons are full squares; the platform applies its own mask.
    const square = tile({ bg: paper, scale: .8 });
    const outputs = {
      'favicon.ico': ico(icons),
      'apple-touch-icon.png': await render(square, 180),
      'icon-192.png': await render(square, 192),
      'icon-512.png': await render(square, 512)
    };
    const file = path.join(site, '.og.html');
    fs.writeFileSync(file, card);
    try {
      await page.setViewportSize({ width: 1200, height: 630 });
      await page.goto('file://' + file);
      await page.evaluate(() => document.fonts.ready);
      outputs['og.png'] = await page.screenshot();
    } finally { fs.unlinkSync(file); }
    for (const [name, data] of Object.entries(outputs)) fs.writeFileSync(path.join(site, name), data);
    console.log('Icons and social card ready.');
  } finally { await browser.close(); }
}
build().catch(error => { console.error(error); process.exitCode = 1; });
