'use strict';

const assert = require('node:assert/strict');

module.exports = async function checkBrowser(context, base, errors) {
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(base + '/');
    await page.locator('[data-demo][data-ready="true"]').waitFor();
    await page.evaluate(() => document.fonts.ready);
    const language = page.locator('[data-language]');
    const pick = name => page.locator(`[data-theme] input[value="${name}"]`).check();
    const picked = () => page.locator('[data-theme] input:checked').inputValue();
    const initialWidth = (await language.boundingBox()).width;
    const languages = await language.locator('option').evaluateAll(options => options.map(option => option.value));
    assert.equal(languages.length, 14);
    for (const name of languages) {
      await language.selectOption(name);
      await page.waitForFunction(name => document.querySelector('[data-language]').value === name && document.querySelector('[data-output]').textContent === document.querySelector('[data-source]').value, name);
      const actual = await page.evaluate(() => {
        const code = document.querySelector('[data-output]');
        return [...CSS.highlights.values()].flatMap(group => [...group]).filter(range => code.contains(range.startContainer)).map(range => range.toString()).sort();
      });
      const expected = await page.evaluate(name => {
        const source = document.querySelector('[data-source]').value;
        return LighthighAuto.tokenize(source, name).map(token => source.slice(token.start, token.end)).sort();
      }, name);
      assert(expected.length > 0, name + ': bundled grammar paints its example');
      assert.deepEqual(actual, expected, name + ': selector paints the exact token text');
      assert.equal(await page.locator('[data-output] > *').count(), 0, name + ': no token wrappers');
    }
    await language.selectOption('css');
    assert((await language.boundingBox()).width < initialWidth - 15, 'Language select shrinks for CSS');
    await language.selectOption('typescript');
    const wideLanguage = (await language.boundingBox()).width;
    await language.selectOption('go');
    assert((await language.boundingBox()).width < wideLanguage - 15, 'Language select grows and shrinks');
    assert.equal(await page.locator('[data-theme] input').count(), 18, '18 palette swatches');
    await pick('nord');
    assert.equal(await page.locator('[data-theme-name]').textContent(), 'Nord', 'Swatch names the chosen palette');
    await page.keyboard.press('ArrowRight');
    assert.equal(await picked(), 'tokyo-night', 'Arrow keys move between swatches');
    for (const width of [320, 375, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await language.selectOption('typescript');
      await pick('github-light-high-contrast');
      const layout = await page.evaluate(() => {
        const rects = ['[data-language]', '[data-theme-name]', '[data-theme]'].map(selector => document.querySelector(selector).getBoundingClientRect());
        const overlaps = rects.flatMap((a, i) => rects.slice(i + 1).filter(b => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom)).length;
        const footer = document.querySelector('.site-footer');
        const links = [...footer.children].map(el => ({ rect: el.getBoundingClientRect().toJSON(), size: getComputedStyle(el).fontSize }));
        return { overlaps, right: Math.max(...rects.map(rect => rect.right)), links, width: innerWidth, scroll: document.documentElement.scrollWidth };
      });
      assert.equal(layout.overlaps, 0, 'Toolbar controls do not overlap at ' + width);
      assert(layout.right <= width && layout.scroll <= width, 'Toolbar fits at ' + width);
      assert.deepEqual(layout.links.map(link => link.size), ['11px', '11px'], 'Footer marks share a type size');
      assert(Math.abs((layout.links[0].rect.left + layout.links[1].rect.right) / 2 - width / 2) < 1, 'Footer marks are centered');
    }
    await language.selectOption('javascript');
    await pick('github-light');
    assert(Math.abs((await language.boundingBox()).width - initialWidth) < 1, 'Select width returns with the language');
    const idle = await language.evaluate(el => getComputedStyle(el).color);
    await page.locator('[data-theme] input:checked').focus();
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(() => document.activeElement.matches('[data-language]:focus-visible')), true, 'Keyboard reaches the select');
    assert.notEqual(await language.evaluate(el => getComputedStyle(el).color), idle, 'Keyboard focus recolors the select instead of a ring');
    console.log('PASS selectors: 14 languages, exact ranges, auto width, focus, responsive toolbar and footer');

    await page.evaluate(() => {
      const code = document.createElement('code');
      const first = document.createTextNode('a');
      const middle = document.createElement('em');
      middle.textContent = '😀';
      code.append(first, middle, document.createTextNode('b'));
      document.body.append(code);
      const clear = LighthighAuto.highlight(code, [[0, 4, 'string'], [1, 3, 'keyword']]);
      const ranges = [...CSS.highlights.values()].flatMap(group => [...group]).filter(range => code.contains(range.startContainer));
      if (ranges.map(range => range.toString()).join('|') !== 'a😀b|😀') throw new Error('Native ranges preserve nested text boundaries');
      if (code.firstChild !== first || code.children[0] !== middle) throw new Error('Highlight replaced original nodes');
      clear(); clear(); code.remove();
    });
    const source = page.locator('[data-source]');
    const output = page.locator('[data-output]');
    await source.fill('1');
    await source.press('End');
    await page.keyboard.insertText(' + 2');
    await source.press('Enter');
    await page.keyboard.insertText('// कृष्ण 😀');
    assert.equal(await output.textContent(), '1 + 2\n// कृष्ण 😀', 'Direct editing: newline and Unicode');
    assert.equal(await source.evaluate(el => el.selectionStart), '1 + 2\n// कृष्ण 😀'.length, 'Caret stays at insertion point');
    await source.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
    assert.equal(await output.textContent(), await source.inputValue(), 'Undo repaints exact native textarea value');
    assert.notEqual(await source.inputValue(), '1 + 2\n// कृष्ण 😀', 'Undo changes the source');
    await source.fill(Array.from({ length: 50 }, (_, i) => '// ' + i + ' ' + 'word '.repeat(60)).join('\n'));
    await source.evaluate(el => { el.scrollTop = 200; el.scrollLeft = 180; el.dispatchEvent(new Event('scroll')); });
    const scroll = await page.evaluate(() => {
      const input = document.querySelector('[data-source]'), pre = document.querySelector('.code-editor pre');
      return [input.scrollTop, pre.scrollTop, input.scrollLeft, pre.scrollLeft];
    });
    assert(scroll[0] > 0 && scroll[2] > 0, 'Editor exercises both scroll axes');
    assert.deepEqual(scroll, [scroll[0], scroll[0], scroll[2], scroll[2]], 'Painted text follows textarea scroll');
    await language.selectOption('javascript');
    const paper = await page.locator('body').evaluate(el => getComputedStyle(el).backgroundColor);
    await pick('nord');
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.code-editor')).backgroundColor === 'rgb(46, 52, 64)', null, { timeout: 2000 }); // Dark palette fades into the code pane
    assert.equal(await page.locator('body').evaluate(el => getComputedStyle(el).backgroundColor), paper, 'Page remains light');
    assert((await page.locator('#cdn-code').textContent()).includes('data-theme="nord"'), 'Setup snippet follows the chosen palette');
    const themeSelection = await source.evaluate(el => { el.focus(); el.setSelectionRange(2, 7); return [el.selectionStart, el.selectionEnd]; });
    await pick('github-light');
    assert.deepEqual(await source.evaluate(el => [el.selectionStart, el.selectionEnd]), themeSelection, 'Theme change preserves editor selection');
    for (const button of await page.locator('[data-copy]').all()) {
      const panel = await button.evaluate(el => el.closest('[data-panel]')?.dataset.panel);
      if (panel) await page.locator(`input[name="lexer"][value="${panel}"]`).check();
      const before = await button.innerHTML();
      await button.click();
      assert.equal(await button.innerHTML(), before, 'Copy feedback preserves the shared icon');
      assert.equal(await button.textContent(), '', 'Copy button stays icon-only');
    }
    const setup = await page.locator('#cdn-code').textContent();
    const src = setup.match(/src="([^"]+)"/)[1];
    const pkg = require('../package.json');
    assert.equal(src, 'https://cdn.jsdelivr.net/npm/' + pkg.name + '@' + pkg.version.split('.')[0], 'Setup pins the current major on the CDN');
    assert.equal(pkg.jsdelivr, pkg.unpkg, 'CDNs serve the same entry');
    assert.equal((await fetch(base + '/' + pkg.jsdelivr)).status, 200, 'CDN entry is the hosted browser bundle');
    await page.route(src, route => route.fulfill({ path: require('node:path').join(__dirname, '..', pkg.jsdelivr), contentType: 'text/javascript' }));
    await page.route('**/site/pasted-setup.html', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html>' + setup }));
    await page.goto(base + '/site/pasted-setup.html');
    await page.waitForFunction(() => window.LighthighAuto && CSS.highlights.size > 0);
    assert.equal(await page.locator('code').innerHTML(), '\nconst answer = 42\n', 'Pasted one-script setup preserves source markup');
    console.log('PASS home: direct typing, Unicode, undo, caret, scroll, 18 themes, icon-only copy, executable setup');

    const fixture = `<!doctype html><html><head><script>window.Prism = { existing: true };</script><script defer src="/site/vendor/auto.min.js" data-theme="solarized-light"></script></head><body>
      <pre data-lighthigh><code id="a" class="lighthigh language-javascript">const a=1</code></pre>
      <pre><code id="b" data-lighthigh="css" data-theme="nord">a { color: red; }</code></pre>
      <pre><code id="c" class="lighthigh language-html">&lt;a href="x"&gt;😀&lt;/a&gt;</code></pre>
      <pre><code id="empty" data-lighthigh></code></pre>
      <code id="unknown" data-lighthigh="not-bundled">print(1)</code>
    </body></html>`;
    await page.route('**/site/auto-fixture.html', route => route.fulfill({ contentType: 'text/html', body: fixture }));
    await page.goto(base + '/site/auto-fixture.html');
    await page.waitForFunction(() => window.LighthighAuto && CSS.highlights.size > 0);
    assert(await page.evaluate(() => window.Prism.existing), 'Bundle preserves an existing Prism global');
    const initialCount = await page.evaluate(() => CSS.highlights.size);
    const ranges = id => page.evaluate(id => [...CSS.highlights.values()].flatMap(group => [...group]).filter(range => document.getElementById(id).contains(range.startContainer)).map(range => range.toString()).sort(), id);
    assert.deepEqual(await ranges('a'), ['1', '=', 'const'], 'Class and attribute overlap paints once');
    assert.deepEqual(await ranges('empty'), [], 'Empty block paints no ranges');
    assert.deepEqual(await ranges('unknown'), [], 'Unknown language remains plain text');
    assert.equal(await page.locator('#a').locator('*').count(), 0, 'Prism never runs its HTML renderer');
    assert.equal(await page.locator('#a').evaluate(el => getComputedStyle(el.parentElement).backgroundColor), 'rgb(253, 246, 227)', 'Script theme applies globally');
    assert.equal(await page.locator('#b').evaluate(el => getComputedStyle(el.parentElement).backgroundColor), 'rgb(46, 52, 64)', 'Block theme overrides script theme');
    await page.evaluate(() => {
      const a = document.getElementById('a');
      window.savedText = a.firstChild;
      LighthighAuto.highlightAll();
      LighthighAuto.highlightAll();
    });
    assert.equal(await page.evaluate(() => CSS.highlights.size), initialCount, 'Repeated scan does not accumulate registrations');
    assert(await page.locator('#a').evaluate(el => el.firstChild === window.savedText), 'Repeated scan preserves text node identity');
    for (const text of ['', '1', '1', 'const x=', 'const x=1', 'const x=1\n', '1']) {
      await page.evaluate(text => {
        const a = document.getElementById('a');
        a.textContent = text;
        LighthighAuto.highlightAll(a);
      }, text);
      assert.equal(await page.locator('#a').textContent(), text, 'Auto refresh preserves exact source');
      assert.deepEqual(await ranges('a'), text.startsWith('const') ? (text.includes('1') ? ['1', '=', 'const'] : ['=', 'const']) : text ? ['1'] : [], 'Auto refresh boundaries: ' + JSON.stringify(text));
    }
    for (const theme of ['not-a-theme', 'constructor', '__proto__']) {
      await page.evaluate(theme => {
        const a = document.getElementById('a');
        a.dataset.theme = theme;
        LighthighAuto.highlightAll(a);
      }, theme);
      assert.equal(await page.locator('#a').evaluate(el => getComputedStyle(el.parentElement).backgroundColor), 'rgb(255, 255, 255)', 'Unknown theme falls back to GitHub Light: ' + theme);
    }
    for (const language of ['not-bundled', 'constructor', 'extend', '__proto__']) {
      await page.evaluate(language => {
        const a = document.getElementById('a');
        a.dataset.language = language;
        LighthighAuto.highlightAll(a);
      }, language);
      assert.deepEqual(await ranges('a'), [], 'Unsupported language clears existing ranges: ' + language);
    }
    await page.evaluate(() => { delete document.getElementById('a').dataset.language; LighthighAuto.highlightAll(); });
    await page.evaluate(() => {
      const parent = document.createElement('div');
      parent.id = 'nested'; parent.className = 'lighthigh'; parent.textContent = 'const outer=';
      const child = document.createElement('span');
      child.id = 'nested-child'; child.textContent = '1';
      parent.append(child); document.body.append(parent);
      LighthighAuto.highlightAll();
    });
    assert.deepEqual(await ranges('nested'), ['1', '=', 'const'], 'Nested marker lifecycle: parent initially owns ranges');
    for (const scoped of [false, true]) {
      await page.evaluate(scoped => {
        const child = document.getElementById('nested-child');
        child.className = 'lighthigh';
        LighthighAuto.highlightAll(scoped ? child : document);
      }, scoped);
      assert.deepEqual(await ranges('nested'), ['1'], 'Nested marker lifecycle: child replaces parent without stale ranges, scoped=' + scoped);
      await page.evaluate(scoped => {
        document.getElementById('nested-child').className = '';
        LighthighAuto.highlightAll(scoped ? document.getElementById('nested') : document);
      }, scoped);
      assert.deepEqual(await ranges('nested'), ['1', '=', 'const'], 'Nested marker lifecycle: parent replaces child without duplicate ranges, scoped=' + scoped);
    }
    await page.evaluate(() => { document.getElementById('nested').remove(); LighthighAuto.highlightAll(); });
    await page.evaluate(() => {
      const fresh = document.createElement('code');
      fresh.id = 'fresh'; fresh.className = 'lighthigh'; fresh.textContent = '42';
      document.body.append(fresh);
      LighthighAuto.highlightAll();
    });
    assert.deepEqual(await ranges('fresh'), ['42'], 'Explicit scan discovers added blocks');
    await page.evaluate(() => { document.getElementById('fresh').className = ''; LighthighAuto.highlightAll(); });
    assert.deepEqual(await ranges('fresh'), [], 'Removing marker clears its ranges on rescan');
    await page.evaluate(() => { document.getElementById('fresh').className = 'lighthigh'; LighthighAuto.highlightAll(); });
    assert.deepEqual(await ranges('fresh'), ['42'], 'Restoring marker paints again');
    await page.evaluate(() => { document.getElementById('fresh').remove(); LighthighAuto.highlightAll(); });
    assert.equal(await page.evaluate(() => [...CSS.highlights.values()].flatMap(group => [...group]).some(range => !range.startContainer.isConnected)), false, 'Scan disposes removed block ranges');
    await page.evaluate(() => { LighthighAuto.dispose(); LighthighAuto.dispose(); });
    assert.equal(await page.evaluate(() => CSS.highlights.size), 0, 'Repeated dispose removes every owned range');
    await page.evaluate(() => LighthighAuto.highlightAll());
    assert.deepEqual(await ranges('a'), ['1'], 'Dispose then reuse starts cleanly');

    await page.route('**/site/blocking-auto-fixture.html', route => route.fulfill({ contentType: 'text/html', body: fixture.replace(' defer', '').replace('</head>', '<script>window.beforeReady = CSS.highlights.size;</script></head>') }));
    await page.goto(base + '/site/blocking-auto-fixture.html');
    await page.waitForFunction(() => window.LighthighAuto && CSS.highlights.size > 0);
    assert.equal(await page.evaluate(() => window.beforeReady), 0, 'Blocking script waits until the document has code to scan');
    assert.deepEqual(await ranges('a'), ['1', '=', 'const'], 'DOMContentLoaded scan paints exact tokens');
    await page.evaluate(() => { document.body.replaceChildren(); LighthighAuto.highlightAll(); LighthighAuto.highlightAll(); });
    assert.equal(await page.evaluate(() => CSS.highlights.size), 0, 'Empty document rescans remove all old registrations');

    const fallback = await context.newPage();
    try {
      await fallback.addInitScript(() => Object.defineProperty(CSS, 'highlights', { value: undefined }));
      fallback.on('pageerror', error => errors.push(error.message));
      await fallback.route('**/site/auto-fixture.html', route => route.fulfill({ contentType: 'text/html', body: fixture }));
      await fallback.goto(base + '/site/auto-fixture.html');
      await fallback.waitForFunction(() => !!window.LighthighAuto);
      assert.equal(await fallback.locator('#a').textContent(), 'const a=1');
      assert.equal(await fallback.locator('#a').getAttribute('style'), null, 'Unsupported browser leaves source styles untouched');
      assert.equal(await fallback.locator('style[data-lighthigh]').count(), 0, 'Unsupported browser creates no highlighting styles');
    } finally { await fallback.close(); }
    console.log('PASS browser bundle: both markers, nested deduplication, languages, themes, rescan, disposal, unsupported fallback');
  } finally { await page.close(); }
};
