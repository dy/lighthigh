import sprae from './vendor/sprae.js';

const examples = {
  "javascript": "import highlight from 'lighthigh'\n\nconst code = document.querySelector('code')\n\nhighlight(code, lexer, {\n  theme: {\n    keyword: '#d73a49',\n    string: '#032f62'\n  }\n})",
  "css": "/* Colors belong in CSS. */\n:root {\n  --ink: oklch(30% 0.02 255);\n  --accent: oklch(50% 0.16 305);\n}\n\ncode {\n  color: var(--ink);\n  font-size: 14px;\n}\n\n::highlight(keyword) {\n  color: var(--accent);\n}",
  "html": "<!-- Highlighted text is still text. -->\n<article class=\"example\">\n  <h1>Native syntax highlighting</h1>\n  <pre><code data-lighthigh=\"javascript\">\n    const answer = 42\n  </code></pre>\n</article>",
  "typescript": "type Palette = {\n  keyword: string\n  string: string\n}\n\nconst theme: Palette = {\n  keyword: '#d73a49',\n  string: '#032f62'\n}\n\nexport function color(type: keyof Palette): string {\n  return theme[type]\n}",
  "jsx": "import { useState } from 'react'\n\nexport function Counter() {\n  const [count, setCount] = useState(0)\n\n  return (\n    <button onClick={() => setCount(count + 1)}>\n      Clicked {count} times\n    </button>\n  )\n}",
  "tsx": "type GreetingProps = { name: string }\n\nexport function Greeting({ name }: GreetingProps) {\n  return (\n    <article className=\"greeting\">\n      <h1>Hello, {name}.</h1>\n      <p>A little color goes a long way.</p>\n    </article>\n  )\n}",
  "json": "{\n  \"name\": \"lighthigh\",\n  \"dependencies\": {},\n  \"languages\": [\"JavaScript\", \"Python\", \"Rust\"],\n  \"tokenSpans\": 0,\n  \"native\": true\n}",
  "python": "# A little color. No extra markup.\nfrom dataclasses import dataclass\n\n@dataclass\nclass Color:\n    name: str\n    hex: str\n\npalette = [Color(\"keyword\", \"#d73a49\")]\n\nfor color in palette:\n    print(f\"{color.name}: {color.hex}\")",
  "bash": "#!/usr/bin/env bash\nset -eu\n\nfiles=(index.html guide.html)\n\nfor file in \"${files[@]}\"; do\n  if [[ -f \"$file\" ]]; then\n    printf \"Found %s\\n\" \"$file\"\n  fi\ndone",
  "sql": "-- Most-used languages this week\nSELECT language, COUNT(*) AS snippets\nFROM highlights\nWHERE created_at >= '2026-10-01'\nGROUP BY language\nHAVING COUNT(*) > 10\nORDER BY snippets DESC\nLIMIT 5;",
  "go": "package main\n\nimport \"fmt\"\n\ntype Color struct {\n    Name string\n    Hex  string\n}\n\nfunc main() {\n    color := Color{\"keyword\", \"#d73a49\"}\n    fmt.Printf(\"%s: %s\\n\", color.Name, color.Hex)\n}",
  "rust": "struct Color {\n    name: &'static str,\n    hex: &'static str,\n}\n\nfn main() {\n    let color = Color {\n        name: \"keyword\",\n        hex: \"#d73a49\",\n    };\n    println!(\"{}: {}\", color.name, color.hex);\n}",
  "markdown": "# A light high\n\nSyntax highlighting with **zero token spans**.\n\n- Keep your lexer\n- Choose a palette\n- Leave your text alone\n\n```javascript\nconst answer = 42\n```\n",
  "yaml": "# Site settings\nname: lighthigh\ntheme: github-light\nlanguages:\n  - javascript\n  - python\n  - rust\nhighlighting:\n  native: true\n  token-spans: 0"
};

const { highlight, tokenize, themes } = window.LighthighAuto;
const supported = !!(globalThis.CSS?.highlights && globalThis.Highlight && globalThis.Range);
const paintSnippet = el => supported && highlight(el, tokenize, { theme: themes['github-light'].colors, language: el.dataset.syntax || 'javascript' });

// The title paints itself: "high" in the accent color, without a span.
if (supported) highlight(document.querySelector('[data-title]'), [{ start: 5, end: 9, type: 'high' }], { theme: { high: 'var(--color-accent)' } });

const measure = document.createElement('canvas').getContext('2d');
function fitSelect(select) {
  const style = getComputedStyle(select);
  measure.font = style.font;
  select.style.width = Math.ceil(measure.measureText(select.selectedOptions[0]?.textContent || '').width + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)) + 'px';
}

const root = document.querySelector('[data-demo]');
const output = root.querySelector('[data-output]');
const textarea = root.querySelector('[data-source]');
const language = root.querySelector('[data-language]');
const swatches = root.querySelector('[data-theme]');
const status = root.querySelector('[data-status]');

document.fonts.ready.then(() => fitSelect(language));
window.addEventListener('resize', () => fitSelect(language));

// One radio per palette; its swatch previews background, keyword, string, and function.
for (const type of ['light', 'dark']) {
  const group = document.createElement('span');
  group.className = 'swatch-group';
  for (const [id, theme] of Object.entries(themes)) {
    if (theme.type !== type) continue;
    const label = document.createElement('label');
    label.title = theme.name;
    label.style.cssText = `--bg: ${theme.background}; --a: ${theme.colors.keyword}; --b: ${theme.colors.string}; --c: ${theme.colors.function}`;
    const input = Object.assign(document.createElement('input'), { type: 'radio', name: 'theme', value: id });
    input.setAttribute('aria-label', theme.name);
    label.append(input);
    group.append(label);
  }
  swatches.append(group);
}

textarea.addEventListener('scroll', () => {
  output.parentElement.scrollTop = textarea.scrollTop;
  output.parentElement.scrollLeft = textarea.scrollLeft;
});

function paint(source, lang, palette) {
  if (output.textContent !== source) output.textContent = source;
  const theme = themes[palette];
  root.dataset.palette = palette;
  root.style.setProperty('--demo-foreground', theme.foreground);
  root.style.setProperty('--demo-background', theme.background);
  if (supported) highlight(output, tokenize(source, lang), { theme: theme.colors });
  swatches.querySelectorAll('input').forEach(el => { el.checked = el.value === palette; });
  root.querySelector('[data-theme-name]').textContent = theme.name;
  // The setup snippet installs the palette picked here.
  document.querySelectorAll('[data-follow-theme]').forEach(el => {
    const text = el.textContent.replace(/data-theme="[^"]*"/, `data-theme="${palette}"`);
    if (text !== el.textContent) { el.textContent = text; paintSnippet(el); }
  });
  root.dataset.ready = 'true';
}

root.setAttribute(':fx', 'paint(source, language, palette)');
textarea.setAttribute(':value', 'source');
textarea.setAttribute(':oninput', 'event => edit(event.target.value)');
language.setAttribute(':value', 'language');
language.setAttribute(':onchange', 'event => switchLanguage(event.target.value)');
swatches.setAttribute(':onchange', 'event => pick(event.target.value)');
const state = sprae(root, {
  source: textarea.value, language: language.value, palette: root.dataset.palette, paint,
  edit: source => { state.source = source; },
  switchLanguage: lang => { state.language = lang; state.source = examples[lang]; fitSelect(language); },
  pick: palette => { state.palette = palette; }
});
if (!supported) status.textContent = 'Live colors require a browser with the CSS Custom Highlight API. The code is still readable.';

document.querySelectorAll('[data-copy]').forEach(button => {
  const label = button.getAttribute('aria-label');
  let timer;
  button.addEventListener('click', async () => {
    const target = document.querySelector(button.dataset.copyTarget);
    let feedback = 'Copied';
    try { await navigator.clipboard.writeText(target.textContent); }
    catch {
      getSelection().selectAllChildren(target);
      feedback = 'Selected';
    }
    button.dataset.copied = feedback;
    button.setAttribute('aria-label', feedback === 'Selected' ? 'Code selected. Press Control+C or Command+C to copy.' : feedback);
    document.querySelector('#copy-status').textContent = button.getAttribute('aria-label');
    clearTimeout(timer);
    timer = setTimeout(() => {
      delete button.dataset.copied;
      button.setAttribute('aria-label', label);
      document.querySelector('#copy-status').textContent = '';
    }, 1800);
  });
});

document.querySelectorAll('[data-highlight]').forEach(paintSnippet);
