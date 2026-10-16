'use strict';

const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const vendor = path.join(root, 'site/vendor');
const sprae = path.join(root, 'node_modules/sprae');
const bundle = fs.readFileSync(path.join(sprae, 'dist/sprae.js'));
const pkg = JSON.parse(fs.readFileSync(path.join(sprae, 'package.json'), 'utf8'));
const license = fs.readFileSync(path.join(sprae, 'license'), 'utf8');

async function build() {
  const { build } = require('esbuild');
  const { createHighlighter } = await import('shiki');
  const names = ['github-light', 'github-light-high-contrast', 'solarized-light', 'catppuccin-latte', 'rose-pine-dawn', 'one-light', 'vitesse-light', 'ayu-light', 'min-light', 'light-plus', 'material-theme-lighter', 'everforest-light', 'github-dark', 'dracula', 'nord', 'tokyo-night', 'monokai', 'catppuccin-mocha'];
  const highlighter = await createHighlighter({ themes: names, langs: ['javascript', 'html'] });
  const sample = '// comment\nconst message = "hello";\nconst answer = 42;\nfunction greet(name) { return name; }\nclass Person {}\nconst user = { active: true };';
  const semantic = { comment: '//', keyword: 'const', operator: '=', string: 'hello', number: '42', constant: 'true', function: 'greet', type: 'Person', variable: 'message', property: 'active', punctuation: ';' };
  const themes = {};
  try {
    for (const name of names) {
      const theme = highlighter.getTheme(name);
      const result = highlighter.codeToTokens(sample, { lang: 'javascript', theme: name });
      const color = (tokens, offset, fallback) => tokens.flat().find(t => t.offset <= offset && t.offset + t.content.length > offset)?.color || fallback;
      const colors = Object.fromEntries(Object.entries(semantic).map(([key, text]) => [key, color(result.tokens, sample.indexOf(text), result.fg)]));
      const html = highlighter.codeToTokens('<a href="url">text</a>', { lang: 'html', theme: name });
      colors.tag = color(html.tokens, 1, result.fg);
      colors.attribute = colors['attr-name'] = color(html.tokens, 3, result.fg);
      colors['attr-value'] = colors.string;
      colors['class-name'] = colors.type;
      colors.boolean = colors.constant;
      colors.plain = colors.punctuation;
      colors.regex = colors.url = colors.string;
      colors.selector = colors.tag;
      colors.atrule = colors.important = colors.keyword;
      colors.builtin = colors.type;
      colors.entity = colors.constant;
      themes[name] = { name: theme.displayName || name, type: theme.type, foreground: result.fg, background: result.bg, colors };
    }
  } finally { highlighter.dispose(); }
  const json = JSON.stringify(themes, null, 2) + '\n';
  const browser = await build({ entryPoints: [path.join(root, 'browser/auto.js')], bundle: true, minify: true, format: 'iife', globalName: 'LighthighAuto', write: false, legalComments: 'inline', plugins: [{ name: 'generated-themes', setup(build) {
    build.onResolve({ filter: /themes\.json$/ }, () => ({ path: 'themes', namespace: 'generated' }));
    build.onLoad({ filter: /.*/, namespace: 'generated' }, () => ({ contents: json, loader: 'json' }));
  } }] });
  const notices = 'Sprae ' + pkg.version + '\nhttps://github.com/dy/sprae\n\n' + license + '\n\nPrism 1.30.0\nhttps://prismjs.com\n\n' + fs.readFileSync(path.join(root, 'node_modules/prismjs/LICENSE'), 'utf8') + '\n\nSemantic palettes sampled from Shiki 4.5.0 themes. Theme sources: https://github.com/shikijs/textmate-grammars-themes/tree/main/packages/tm-themes\n\n' + fs.readFileSync(path.join(root, 'node_modules/@shikijs/themes/LICENSE'), 'utf8');
  // Finish every read and compilation before replacing any generated output.
  fs.mkdirSync(vendor, { recursive: true });
  fs.writeFileSync(path.join(vendor, 'sprae.js'), bundle);
  fs.writeFileSync(path.join(vendor, 'NOTICE.txt'), notices);
  fs.writeFileSync(path.join(vendor, 'auto.min.js'), '/*! Lighthigh (MIT).\n' + notices.replaceAll('*/', '* /') + '\n*/\n' + browser.outputFiles[0].text);
  fs.writeFileSync(path.join(root, 'themes.json'), json);
  console.log('Browser bundle and themes ready.');
}
build().catch(error => { console.error(error); process.exitCode = 1; });
