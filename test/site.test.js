'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { execFileSync, spawnSync } = require('node:child_process');
const { EventEmitter } = require('node:events');
const root = path.resolve(__dirname, '..');

test('site build preserves upstream license and repeated output', () => {
  const build = path.join(root, 'scripts/build-site.js');
  execFileSync(process.execPath, [build]);
  const files = ['sprae.js', 'NOTICE.txt', 'auto.min.js'];
  const before = files.map(file => fs.readFileSync(path.join(root, 'site/vendor', file)));
  execFileSync(process.execPath, [build]);
  files.forEach((file, i) => assert.deepEqual(fs.readFileSync(path.join(root, 'site/vendor', file)), before[i]));
  assert(before[1].toString().includes(fs.readFileSync(path.join(root, 'node_modules/sprae/license'), 'utf8')));
});

test('missing build inputs leave existing vendor files untouched', () => {
  const inputs = {
    'node_modules/sprae/dist/sprae.js': 'new bundle',
    'node_modules/sprae/package.json': '{"version":"1.0.0"}',
    'node_modules/sprae/license': 'upstream license'
  };
  const existing = { 'sprae.js': 'existing bundle', 'NOTICE.txt': 'existing notice' };
  for (const [input, invalid] of [...Object.keys(inputs).map(name => [name, false]), ['node_modules/sprae/package.json', true]]) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lighthigh-build-'));
    try {
      fs.mkdirSync(path.join(dir, 'scripts'));
      fs.mkdirSync(path.join(dir, 'site/vendor'), { recursive: true });
      fs.mkdirSync(path.join(dir, 'node_modules/sprae/dist'), { recursive: true });
      fs.copyFileSync(path.join(root, 'scripts/build-site.js'), path.join(dir, 'scripts/build-site.js'));
      for (const [name, content] of Object.entries(inputs)) fs.writeFileSync(path.join(dir, name), content);
      for (const [name, content] of Object.entries(existing)) fs.writeFileSync(path.join(dir, 'site/vendor', name), content);
      if (invalid) fs.writeFileSync(path.join(dir, input), '{');
      else fs.unlinkSync(path.join(dir, input));
      const result = spawnSync(process.execPath, [path.join(dir, 'scripts/build-site.js')]);
      assert.ifError(result.error);
      assert.notEqual(result.status, 0, input);
      for (const [name, content] of Object.entries(existing)) assert.equal(fs.readFileSync(path.join(dir, 'site/vendor', name), 'utf8'), content, input);
      assert.deepEqual(fs.readdirSync(path.join(dir, 'site/vendor')).sort(), Object.keys(existing).sort());
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
});

test('preview serves public assets and confines symlinks to the public allowlist', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lighthigh-preview-'));
  try {
    const project = path.join(dir, 'project');
    fs.mkdirSync(path.join(project, 'site'), { recursive: true });
    for (const [name, content] of [
      ['index.html', 'home'], ['README.md', 'private repo file'],
      ['site/index.html', 'site home'], ['site/code.js', 'public script'],
      ['site/.private.txt', 'hidden file'], ['site/public.txt', 'public text']
    ]) fs.writeFileSync(path.join(project, name), content);
    fs.writeFileSync(path.join(dir, 'outside.txt'), 'outside allowlist canary');
    fs.symlinkSync(path.join(dir, 'outside.txt'), path.join(project, 'site/escaped.txt'));
    fs.symlinkSync(path.join(project, 'site/.private.txt'), path.join(project, 'site/hidden.txt'));
    fs.symlinkSync(path.join(project, 'site/public.txt'), path.join(project, 'site/alias.txt'));
    let handle;
    const server = { listen(_port, _host, ready) { ready(); }, address() { return { port: 0 }; } };
    vm.runInNewContext(fs.readFileSync(path.join(root, 'scripts/serve.js'), 'utf8'), {
      URL, __dirname: path.join(project, 'scripts'), process: { env: { PORT: '0' } }, console: { log() {} },
      require: name => name === 'node:http' ? { createServer(handler) { handle = handler; return server; } } : require(name)
    });
    const request = url => new Promise(resolve => {
      let status, headers;
      handle({ url }, {
        writeHead(code, values) { status = code; headers = values; return this; },
        end(data) { resolve({ status, headers, body: String(data) }); }
      });
    });
    for (const [url, body] of [
      ['/', 'home'], ['/site/', 'site home'],
      ['/site/code.js?v=1', 'public script'], ['/site/alias.txt', 'public text']
    ]) {
      const response = await request(url);
      assert.equal(response.status, 200, url);
      assert.equal(response.body, body, url);
      assert.equal(response.headers['Cache-Control'], 'no-cache');
    }
    assert.equal((await request('/site/code.js')).headers['Content-Type'], 'text/javascript; charset=utf-8');
    for (const url of ['/README.md', '/package.json', '/site/.private.txt', '/site%2f..%2fREADME.md', '/site/missing.txt', '/site/escaped.txt', '/site/hidden.txt']) {
      assert.equal((await request(url)).status, 404, url);
    }
    for (const url of ['/site/%', '/site/%00']) assert.equal((await request(url)).status, 400, url);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

for (const failure of ['newContext', 'newPage']) test('browser check cleans up after ' + failure + ' rejects', async () => {
  const server = new EventEmitter();
  server.stdout = new EventEmitter();
  server.stderr = new EventEmitter();
  let closed = 0;
  let killed = 0;
  let done;
  const finished = new Promise(resolve => { done = resolve; });
  server.kill = () => { killed++; done(); };
  const browser = {
    newContext: async () => {
      if (failure === 'newContext') throw new Error(failure);
      return { newPage: async () => { throw new Error(failure); } };
    },
    close: async () => { closed++; }
  };
  const taskProcess = { execPath: process.execPath, env: {} };
  const modules = {
    'node:fs/promises': { mkdir: async () => {} },
    'node:child_process': { spawn: () => { queueMicrotask(() => server.stdout.emit('data', Buffer.from('Lighthigh: http://localhost:1234\n'))); return server; } },
    playwright: { chromium: { launch: async () => browser } }
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'scripts/check-site.js'), 'utf8'), {
    require: name => modules[name] || require(name), __dirname: path.join(root, 'scripts'),
    process: taskProcess, console: { log() {}, error() {} }
  });
  await finished;
  assert.equal(closed, 1);
  assert.equal(killed, 1);
  assert.equal(taskProcess.exitCode, 1);
});

test('late build failure preserves generated output', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lighthigh-late-build-'));
  try {
    for (const name of ['scripts', 'browser', 'site/vendor']) fs.mkdirSync(path.join(dir, name), { recursive: true });
    fs.symlinkSync(path.join(root, 'node_modules'), path.join(dir, 'node_modules'));
    for (const name of ['scripts/build-site.js', 'browser/auto.js', 'adapters.js', 'index.js']) fs.copyFileSync(path.join(root, name), path.join(dir, name));
    const output = ['themes.json', ...['sprae.js', 'auto.min.js', 'NOTICE.txt'].map(file => 'site/vendor/' + file)];
    for (const name of output) fs.writeFileSync(path.join(dir, name), 'existing ' + name);
    fs.writeFileSync(path.join(dir, 'browser/auto.js'), 'this is invalid JavaScript {');
    const result = spawnSync(process.execPath, [path.join(dir, 'scripts/build-site.js')]);
    assert.ifError(result.error);
    assert.notEqual(result.status, 0);
    for (const name of output) assert.equal(fs.readFileSync(path.join(dir, name), 'utf8'), 'existing ' + name, name);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
