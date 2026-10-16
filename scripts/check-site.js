'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

const widths = [320, 375, 414, 768, 1440];
let base;
const screenshots = path.join(os.tmpdir(), 'lighthigh-review');
const server = spawn(process.execPath, [path.join(__dirname, 'serve.js')], { env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
let serverError = '';
server.stderr.on('data', data => { serverError += data; });

// Setup examples are tabs: select the tab that owns a control before using it.
async function showPanel(page, control) {
  const panel = await control.evaluate(el => el.closest('[data-panel]')?.dataset.panel);
  if (panel) await page.locator(`input[name="lexer"][value="${panel}"]`).check();
}

const painted = page => page.evaluate(() => [...CSS.highlights.values()].flatMap(group => [...group]).filter(range => document.querySelector('[data-output]').contains(range.startContainer)).map(range => range.toString()).sort());

async function run() {
  await new Promise((resolve, reject) => {
    server.stdout.once('data', data => { base = 'http://127.0.0.1:' + data.toString().match(/localhost:(\d+)/)[1]; resolve(); });
    server.once('error', reject);
    server.once('exit', code => reject(new Error('Preview server exited: ' + code + '\n' + serverError)));
  });
  await fs.mkdir(screenshots, { recursive: true });
  const browser = await chromium.launch();
  try {
    const errors = [];
    const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('response', response => { if (response.status() >= 400) errors.push(response.status() + ' ' + response.url()); });
    for (const [route, status, text] of [
      ['/', 200, '<!doctype html>'], ['/site/demo.js', 200, 'import sprae'],
      ['/site/missing.js', 404, 'Not found'], ['/site/fonts', 404, 'Not found'],
      ['/.git/config', 404, 'Not found'], ['/package.json', 404, 'Not found'],
      ['/site/%2e%2e%2fpackage.json', 404, 'Not found'],
      ['/site/%', 400, 'Bad request'], ['/site/%E0%A4%A', 400, 'Bad request'],
      ['/site/%00', 400, 'Bad request'], ['/', 200, '<!doctype html>']
    ]) {
      const response = await fetch(base + route);
      assert.equal(response.status, status, 'Preview route ' + route);
      assert((await response.text()).includes(text), 'Preview response ' + route);
    }
    console.log('PASS preview server: public routes, missing files, traversal, malformed encoding, NUL then healthy request');

    await page.goto(base + '/');
    const head = await page.evaluate(() => ({
      assets: [...document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="manifest"], link[rel="preload"]')].map(el => el.href),
      canonical: document.querySelector('link[rel="canonical"]')?.href,
      og: Object.fromEntries([...document.querySelectorAll('meta[property^="og:"]')].map(el => [el.getAttribute('property'), el.content])),
      description: document.querySelector('meta[name="description"]')?.content,
      data: JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent)
    }));
    // Absolute URLs name the deployed site; check them against the local copy.
    const local = url => url.replace(head.canonical, base + '/');
    assert.equal(head.canonical, 'https://dy.github.io/lighthigh/', 'Canonical names the deployed home');
    assert.equal(head.og['og:url'], head.canonical, 'Social URL matches canonical');
    assert(head.description.length >= 50 && head.description.length <= 160, 'Description fits search snippets');
    assert.equal(head.data.url, head.canonical, 'Structured data names the canonical URL');
    const manifest = await (await fetch(base + '/site/manifest.webmanifest')).json();
    const icons = manifest.icons.map(icon => new URL(icon.src, base + '/site/manifest.webmanifest').href);
    for (const url of [...head.assets, ...icons, local(head.og['og:image']), base + '/sitemap.xml']) assert.equal((await fetch(url)).status, 200, 'Head asset ' + url);
    assert((await (await fetch(base + '/sitemap.xml')).text()).includes('<loc>' + head.canonical + '</loc>'), 'Sitemap lists the canonical home');
    console.log('PASS search and share metadata: canonical, description, structured data, icons, manifest, social card, sitemap');

    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto(base + '/');
    await page.locator('[data-demo][data-ready="true"]').waitFor();
    await page.evaluate(() => document.fonts.ready);
    const output = page.locator('[data-output]');
    const source = page.locator('[data-source]');
    const initial = await output.textContent();
    assert(initial.length > 0, 'Nonempty initial source');
    assert(await source.isVisible(), 'Editor available immediately');
    for (const link of await page.locator('a[href^="https://"]').all()) {
      assert.equal(await link.getAttribute('target'), '_blank', 'External links open in a new tab');
      assert((await link.getAttribute('rel')).split(/\s+/).includes('noopener'), 'External links use noopener');
    }
    const invariant = async () => {
      assert.equal(await output.locator('*').count(), 0, 'No generated markup');
      assert(await output.evaluate(el => [...el.childNodes].every(node => node.nodeType === Node.TEXT_NODE)), 'Only text nodes');
    };
    await invariant();
    assert((await painted(page)).length > 0, 'Native ranges painted');
    await output.evaluate(el => {
      window.reviewSourceNode = el.firstChild;
      const range = document.createRange();
      range.setStart(el.firstChild, 0);
      range.setEnd(el.firstChild, 5);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
    });
    await page.locator('[data-theme] input[value="nord"]').check();
    assert.equal(await output.textContent(), initial, 'Repaint preserves source');
    assert(await output.evaluate(el => el.firstChild === window.reviewSourceNode), 'Repaint preserves original text node');
    assert.equal(await page.evaluate(() => getSelection().toString()), initial.slice(0, 5), 'Repaint preserves selection');
    await page.locator('[data-theme] input[value="github-light"]').check();
    await invariant();

    for (const value of ['1', '1', 'const x=', 'const x=1', 'const x=1\n', '1']) {
      await source.fill(value);
      assert.equal(await output.textContent(), value, 'Exact source at final token boundary');
      const expected = value.startsWith('const') ? (value.includes('1') ? ['1', 'const'] : ['const']) : ['1'];
      if (value.includes('=')) expected.push('=');
      assert.deepEqual(await painted(page), expected.sort(), 'Semantic ranges for ' + JSON.stringify(value));
      await invariant();
    }
    await source.fill('const answer = "<script>literal</script>";\n// Unicode: कृष्ण');
    assert.equal(await output.textContent(), await source.inputValue(), 'Literal input rendered safely');
    await invariant();
    await source.fill('');
    assert.equal(await output.textContent(), '', 'Empty source');
    assert.deepEqual(await painted(page), [], 'No stale ranges after empty source');
    for (const language of ['css', 'html', 'javascript']) {
      await page.locator('[data-language]').selectOption(language);
      await invariant();
      assert((await output.textContent()).length > 0, language + ' example');
    }
    assert.equal(await output.textContent(), initial, 'JavaScript example restores the original source');
    const palettes = await page.locator('[data-theme] input').evaluateAll(inputs => inputs.map(input => input.value));
    assert.equal(palettes.length, 18, '18 named palettes');
    await output.evaluate(el => { window.reviewSourceNode = el.firstChild; });
    for (const palette of palettes) {
      await page.locator(`[data-theme] input[value="${palette}"]`).check();
      assert.equal(await page.locator('[data-demo]').getAttribute('data-palette'), palette);
      assert(await output.evaluate(el => el.firstChild === window.reviewSourceNode), 'Palette preserves text node');
      await invariant();
    }
    for (const button of await page.locator('[data-copy]').all()) {
      const text = await button.evaluate(el => document.querySelector(el.dataset.copyTarget).textContent);
      await showPanel(page, button);
      await button.click();
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), text, 'Clipboard holds exact source');
    }
    await page.waitForTimeout(1900);
    await page.locator('input[name="lexer"][value="script"]').check();
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => window.scrollTo(0, 0));
      const layout = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, clipped: [...document.querySelectorAll('button, select, a:not(.skip-link)')].filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.width && rect.height && (rect.left < -1 || rect.right > innerWidth + 1);
      }).map(el => el.textContent.trim()) }));
      assert(layout.scroll <= layout.width, 'Page overflow at ' + width);
      assert.deepEqual(layout.clipped, [], 'Clipped controls at ' + width);
      await page.screenshot({ path: path.join(screenshots, 'home-' + width + '.png'), fullPage: true });
    }
    console.log('PASS home: native paint, controls, clipboard, five widths');

    await require('./check-browser.js')(context, base, errors);

    const fallback = await context.newPage();
    fallback.on('pageerror', error => errors.push(error.message));
    await fallback.addInitScript(() => Object.defineProperty(CSS, 'highlights', { value: undefined }));
    await fallback.goto(base + '/');
    await fallback.locator('[data-demo][data-ready="true"]').waitFor();
    assert((await fallback.locator('[data-output]').textContent()).length > 0, 'Unsupported browser preserves readable code');
    assert((await fallback.locator('[data-status]').textContent()).includes('require'), 'Compatibility explanation');
    await fallback.close();
    console.log('PASS unsupported-browser fallback');

    const denied = await context.newPage();
    await denied.setViewportSize({ width: 320, height: 900 });
    denied.on('pageerror', error => errors.push(error.message));
    await denied.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('Clipboard denied')) } }));
    await denied.goto(base + '/');
    await denied.locator('[data-demo][data-ready="true"]').waitFor();
    const copy = denied.locator('[data-copy]').first();
    const label = await copy.getAttribute('aria-label');
    const target = await copy.getAttribute('data-copy-target');
    await copy.click();
    await denied.waitForFunction(() => document.querySelector('[data-copy]').dataset.copied === 'Selected');
    assert.equal(await denied.evaluate(() => getSelection().toString()), await denied.locator(target).textContent(), 'Denied copy selects exact text');
    const feedback = await copy.boundingBox();
    assert(feedback.x >= 16 && feedback.x + feedback.width <= 304, 'Copy feedback preserves mobile gutters');
    assert.equal(await denied.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Denied copy fits at 320px');
    await denied.waitForFunction(label => document.querySelector('[data-copy]').getAttribute('aria-label') === label, label);
    await denied.close();
    console.log('PASS denied clipboard: exact selection and label restoration');
    assert.deepEqual(errors, [], 'No browser errors or missing local assets');
    console.log('Screenshots: ' + screenshots);
  } finally { await browser.close(); }
}

run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.kill());
