// Offline integration tests. Every config write and fake Pi command stays in
// a disposable directory; never invokes real pi or touches user configuration.
// No node:test dependency: keep installer/test syntax compatible with Node 10.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const lockfile = require('proper-lockfile');
const { agentDirectory } = require('./postinstall.cjs');

const script = fs.readFileSync(path.join(__dirname, 'postinstall.cjs'), 'utf8');
let passed = 0;

function json(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

function remove(directory) {
  fs.readdirSync(directory).forEach(function (name) {
    const file = path.join(directory, name);
    if (fs.lstatSync(file).isDirectory()) remove(file); else fs.unlinkSync(file);
  });
  fs.rmdirSync(directory);
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-sync-test-'));
  const home = path.join(root, 'home');
  const agent = path.join(home, '.pi', 'agent');
  const repo = path.join(agent, 'git', 'github.com', 'potentialdiffer', 'pi-agent-stuff');
  const bin = path.join(root, 'bin');
  fs.mkdirSync(path.join(repo, 'scripts'), { recursive: true });
  fs.mkdirSync(bin);
  const file = path.join(repo, 'scripts', 'postinstall.cjs');
  fs.writeFileSync(file, script);
  // Only test dependencies resolve through this link, not user's home config.
  fs.symlinkSync(path.join(__dirname, '..', 'node_modules'), path.join(repo, 'node_modules'), 'dir');
  const settings = path.join(agent, 'settings.json');
  const log = path.join(root, 'pi-calls.jsonl');
  const env = Object.assign({}, process.env, {
    HOME: home, USERPROFILE: home, PI_CODING_AGENT_DIR: agent,
    PATH: bin + path.delimiter + process.env.PATH,
    FAKE_PI_LOG: log, FAKE_REPO: repo,
    npm_config_omit: '', npm_lifecycle_event: '', npm_command: ''
  });
  // Assert sandbox invariants before any child can run.
  assert.ok(env.PI_CODING_AGENT_DIR.indexOf(root + path.sep) === 0);
  fs.writeFileSync(path.join(bin, 'pi'), '#!/usr/bin/env node\n' + [
    "const fs = require('fs');",
    "const path = require('path');",
    'const args = process.argv.slice(2);',
    "fs.appendFileSync(process.env.FAKE_PI_LOG, JSON.stringify(args) + '\\n');",
    "if (process.env.FAKE_PI_FAIL === args[0]) process.exit(7);",
    "if (args[0] === 'install' && !process.env.FAKE_PI_NO_SAVE) {",
    "  const file = path.join(process.env.PI_CODING_AGENT_DIR, 'settings.json');",
    "  if (process.env.FAKE_EXPECT_MODE && (fs.statSync(file).mode & 0o777) !== Number(process.env.FAKE_EXPECT_MODE)) throw new Error('insecure settings before install');",
    "  let settings = {}; try { settings = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }",
    "  settings.packages = (settings.packages || []).concat(args[1]);",
    "  settings.installerChange = 'preserved';",
    "  fs.writeFileSync(file, process.env.FAKE_PI_CORRUPT ? '{broken' : JSON.stringify(settings));",
    '}',
    "if (args[0] === 'update' && process.env.FAKE_UPDATE_SHIPPED) {",
    "  fs.writeFileSync(path.join(process.env.FAKE_REPO, 'settings.pi-agent-stuff.json'), process.env.FAKE_UPDATE_SHIPPED);",
    '}',
    "if (args[0] === 'update' && process.env.FAKE_UPDATE_SCRIPT) {",
    "  fs.writeFileSync(path.join(process.env.FAKE_REPO, 'scripts', 'postinstall.cjs'), process.env.FAKE_UPDATE_SCRIPT);",
    '}'
  ].join('\n'));
  fs.chmodSync(path.join(bin, 'pi'), 0o755);
  json(path.join(repo, 'external-extensions.json'), ['npm:required']);
  json(path.join(repo, 'settings.pi-agent-stuff.json'), {
    defaultModel: 'shipped', nested: { shipped: true }, models: ['shipped']
  });
  return {
    root: root, repo: repo, home: home, agent: agent, settings: settings, env: env,
    run: function (args, extraEnv, entry) {
      const result = spawnSync(process.execPath, [entry || file].concat(args || []), {
        cwd: root, env: Object.assign({}, env, extraEnv), encoding: 'utf8'
      });
      if (result.error) throw result.error;
      return result;
    },
    calls: function () {
      try { return fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse); }
      catch (error) { if (error.code === 'ENOENT') return []; throw error; }
    },
    read: function () { return JSON.parse(fs.readFileSync(settings, 'utf8')); }
  };
}

function ok(result) { assert.strictEqual(result.status, 0, result.stdout + result.stderr); }
function fail(result) { assert.notStrictEqual(result.status, 0, result.stdout + result.stderr); }
function withUmask(mask, fn) {
  const previous = process.umask(mask);
  try { return fn(); } finally { process.umask(previous); }
}
function test(name, fn) {
  const f = fixture();
  try { fn(f); passed++; console.log('PASS ' + name); }
  finally { remove(f.root); }
}

// Checkout and lifecycle guards must run before dependencies/config are read.
test('managed default invocation skips and gives usable explicit command', function (f) {
  const result = f.run();
  ok(result);
  assert.ok(result.stdout.includes('--sync'));
  assert.deepStrictEqual(f.calls(), []);
  assert.ok(!fs.existsSync(f.settings));
});

test('install lifecycles skip even outside managed checkout', function (f) {
  const standalone = path.join(f.root, 'standalone.cjs');
  fs.writeFileSync(standalone, script);
  ['postinstall', 'prepare', 'install'].forEach(function (event) {
    const result = f.run([], { npm_lifecycle_event: event }, standalone);
    ok(result);
    assert.ok(result.stdout.includes('Skipping automatic'));
  });
  assert.deepStrictEqual(f.calls(), []);
});

test('explicit lifecycle invocation cannot bypass safety guard', function (f) {
  const result = f.run(['--sync'], { npm_lifecycle_event: 'postinstall' });
  ok(result); // npm lifecycle remains nonfatal
  assert.ok(result.stderr.includes('not allowed during an install lifecycle'));
  assert.deepStrictEqual(f.calls(), []);
});

test('custom managed root and symlink checkout aliases still skip automatic sync', function (f) {
  const custom = path.join(f.root, 'custom');
  const entry = path.join(custom, 'git', 'vendor', 'package', 'scripts', 'postinstall.cjs');
  fs.mkdirSync(path.dirname(entry), { recursive: true });
  fs.writeFileSync(entry, script);
  const alias = path.join(f.root, 'alias.cjs');
  fs.symlinkSync(entry, alias);
  ok(f.run([], { PI_CODING_AGENT_DIR: custom }, entry));
  ok(f.run([], { PI_CODING_AGENT_DIR: custom }, alias));
  assert.deepStrictEqual(f.calls(), []);
  assert.ok(!fs.existsSync(path.join(custom, 'settings.json')));
});

test('explicit sync works in managed checkout despite omit and npm run markers', function (f) {
  json(f.settings, {
    packages: ['git:github.com/potentialdiffer/pi-agent-stuff', 'npm:personal',
      { source: 'npm:required', extensions: [] }],
    nested: { user: 42, shipped: false }, models: ['user'], userOnly: true
  });
  ok(f.run(['--sync'], { npm_config_omit: 'dev', npm_lifecycle_event: 'sync', npm_command: 'run-script' }));
  assert.deepStrictEqual(f.calls(), []);
  assert.deepStrictEqual(f.read(), {
    packages: ['git:github.com/potentialdiffer/pi-agent-stuff', 'npm:personal',
      { source: 'npm:required', extensions: [] }],
    nested: { user: 42, shipped: true }, models: ['shipped'], userOnly: true,
    defaultModel: 'shipped'
  });
});

test('fresh settings created securely; install changes survive; repeat is no-op', function (f) {
  withUmask(0o022, function () {
    ok(f.run(['--sync'], { FAKE_EXPECT_MODE: String(0o600) }));
  });
  assert.strictEqual(fs.statSync(f.settings).mode & 0o777, 0o600);
  assert.deepStrictEqual(f.calls(), [['install', 'npm:required']]);
  assert.strictEqual(f.read().installerChange, 'preserved');
  assert.strictEqual(f.read().defaultModel, 'shipped');
  const stat = fs.statSync(f.settings);
  const bytes = fs.readFileSync(f.settings, 'utf8');
  ok(f.run(['--sync']));
  assert.strictEqual(fs.readFileSync(f.settings, 'utf8'), bytes);
  assert.strictEqual(fs.statSync(f.settings).mtimeMs, stat.mtimeMs);
  assert.deepStrictEqual(f.calls(), [['install', 'npm:required']]);
});

test('missing agent directory and settings created with restrictive permissions', function (f) {
  json(path.join(f.repo, 'external-extensions.json'), []);
  const agent = path.join(f.root, 'new', 'agent');
  ok(f.run(['--sync'], { PI_CODING_AGENT_DIR: agent }));
  const file = path.join(agent, 'settings.json');
  assert.strictEqual(fs.statSync(file).mode & 0o777, 0o600);
});

test('custom agent directory honored and default home config untouched', function (f) {
  const agent = path.join(f.root, 'custom agent');
  ok(f.run(['--sync'], { PI_CODING_AGENT_DIR: agent }));
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(agent, 'settings.json'))).defaultModel, 'shipped');
  assert.ok(!fs.existsSync(f.settings));
  assert.strictEqual(agentDirectory({ PI_CODING_AGENT_DIR: '~/custom' }), path.join(os.homedir(), 'custom'));
});

['{ invalid', 'null', '[]', '{"packages":{}}', '{"packages":[{}]}', '{"__proto__":{"polluted":true}}'].forEach(function (bytes) {
  test('invalid settings fail closed: ' + bytes, function (f) {
    fs.writeFileSync(f.settings, bytes);
    fail(f.run(['--sync']));
    assert.strictEqual(fs.readFileSync(f.settings, 'utf8'), bytes);
    assert.deepStrictEqual(f.calls(), []);
  });
});

test('legitimate constructor and prototype setting keys do not block sync', function (f) {
  json(f.settings, { packages: ['npm:required'], extension: { constructor: 'x', prototype: { user: true } } });
  ok(f.run(['--sync']));
  assert.deepStrictEqual(f.read().extension, { constructor: 'x', prototype: { user: true } });
});

test('unreadable settings path is not treated as missing', function (f) {
  fs.mkdirSync(f.settings);
  fail(f.run(['--sync']));
  assert.deepStrictEqual(f.calls(), []);
});

test('BOM settings parse and merge', function (f) {
  fs.writeFileSync(f.settings, '\uFEFF{"packages":["npm:required"]}');
  ok(f.run(['--sync']));
  assert.strictEqual(f.read().defaultModel, 'shipped');
});

test('failed package install returns nonzero, never reports success or merges', function (f) {
  const result = f.run(['--sync'], { FAKE_PI_FAIL: 'install' });
  fail(result);
  assert.ok(!result.stdout.includes('synchronized'));
  assert.deepStrictEqual(f.read(), {});
  assert.strictEqual(fs.statSync(f.settings).mode & 0o777, 0o600);
  assert.ok(!fs.existsSync(f.settings + '.lock'));
});

test('successful CLI exit without saving packages is not reported as successful sync', function (f) {
  const result = f.run(['--sync'], { FAKE_PI_NO_SAVE: '1' });
  fail(result);
  assert.ok(result.stderr.includes('did not save installed packages'));
  assert.deepStrictEqual(f.read(), {});
});

test('settings corrupted during package install are never overwritten', function (f) {
  fail(f.run(['--sync'], { FAKE_PI_CORRUPT: '1' }));
  assert.strictEqual(fs.readFileSync(f.settings, 'utf8'), '{broken');
  assert.ok(!fs.existsSync(f.settings + '.lock'));
});

test('dangling settings symlink fails before installing or writing', function (f) {
  const absent = path.join(f.root, 'absent-settings.json');
  fs.symlinkSync(absent, f.settings);
  fail(f.run(['--sync']));
  assert.ok(fs.lstatSync(f.settings).isSymbolicLink());
  assert.ok(!fs.existsSync(absent));
  assert.deepStrictEqual(f.calls(), []);
});

test('invalid manifests rejected before package commands', function (f) {
  [null, {}, ['--help'], [''], [12]].forEach(function (value) {
    json(path.join(f.repo, 'external-extensions.json'), value);
    fail(f.run(['--sync']));
  });
  json(path.join(f.repo, 'external-extensions.json'), ['npm:required']);
  [[], null, { packages: [] }].forEach(function (value) {
    json(path.join(f.repo, 'settings.pi-agent-stuff.json'), value);
    fail(f.run(['--sync']));
  });
  assert.deepStrictEqual(f.calls(), []);
  assert.ok(!fs.existsSync(f.settings));
});

test('package arguments passed literally, no shell expansion; duplicates installed once', function (f) {
  const source = 'npm:test;touch ' + path.join(f.root, 'shell-executed');
  json(path.join(f.repo, 'external-extensions.json'), [source, source]);
  ok(f.run(['--sync']));
  assert.deepStrictEqual(f.calls(), [['install', source]]);
  assert.ok(!fs.existsSync(path.join(f.root, 'shell-executed')));
});

test('Pi settings lock contention fails without writes or package commands', function (f) {
  json(f.settings, { packages: ['npm:required'], user: true });
  const bytes = fs.readFileSync(f.settings, 'utf8');
  const release = lockfile.lockSync(f.settings, { realpath: false });
  try {
    fail(f.run(['--sync']));
    assert.strictEqual(fs.readFileSync(f.settings, 'utf8'), bytes);
    assert.deepStrictEqual(f.calls(), []);
    assert.ok(fs.existsSync(f.settings + '.lock'));
  } finally { release(); }
  ok(f.run(['--sync']));
});

test('settings symlink and existing permissions preserved despite restrictive umask', function (f) {
  const target = path.join(f.root, 'linked-settings.json');
  json(target, { packages: ['npm:required'], keep: true });
  fs.chmodSync(target, 0o640);
  fs.symlinkSync(target, f.settings);
  withUmask(0o077, function () { ok(f.run(['--sync'])); });
  assert.ok(fs.lstatSync(f.settings).isSymbolicLink());
  assert.strictEqual(f.read().keep, true);
  assert.strictEqual(fs.statSync(target).mode & 0o777, 0o640);
});

test('atomic write failure keeps old settings and cleans temporary file/lock', function (f) {
  json(f.settings, { packages: ['npm:required'], keep: true });
  const bytes = fs.readFileSync(f.settings, 'utf8');
  // Inject filesystem failure without relying on permission tests (root differs).
  const preload = path.join(f.root, 'fail-rename.cjs');
  fs.writeFileSync(preload, "require('fs').renameSync = function () { throw new Error('injected rename failure'); };\n");
  fail(f.run(['--sync'], { NODE_OPTIONS: '--require=' + preload }));
  assert.strictEqual(fs.readFileSync(f.settings, 'utf8'), bytes);
  assert.ok(!fs.existsSync(f.settings + '.lock'));
  assert.ok(!fs.readdirSync(f.agent).some(function (name) { return name.endsWith('.tmp'); }));
});

test('update completes before sync and new shipped settings win', function (f) {
  ok(f.run(['--update-and-sync'], { FAKE_UPDATE_SHIPPED: '{"newRevision":true}' }));
  assert.deepStrictEqual(f.calls(), [['update', '--extensions'], ['install', 'npm:required']]);
  assert.strictEqual(f.read().newRevision, true);
  assert.strictEqual(f.read().defaultModel, undefined);
});

test('update wrapper runs fresh script instead of pre-update implementation', function (f) {
  const result = f.run(['--update-and-sync'], {
    FAKE_UPDATE_SCRIPT: "console.log('fresh sync loaded: ' + process.argv[2]);\n"
  });
  ok(result);
  assert.ok(result.stdout.includes('fresh sync loaded: --sync'));
  assert.deepStrictEqual(f.calls(), [['update', '--extensions']]);
});

test('failed update never runs sync', function (f) {
  fail(f.run(['--update-and-sync'], { FAKE_PI_FAIL: 'update' }));
  assert.deepStrictEqual(f.calls(), [['update', '--extensions']]);
  assert.ok(!fs.existsSync(f.settings));
});

test('sync error after update propagates to wrapper', function (f) {
  fail(f.run(['--update-and-sync'], { FAKE_PI_FAIL: 'install' }));
  assert.deepStrictEqual(f.calls(), [['update', '--extensions'], ['install', 'npm:required']]);
  assert.deepStrictEqual(f.read(), {});
});

test('unknown/conflicting arguments fail without side effects', function (f) {
  fail(f.run(['--force']));
  fail(f.run(['--sync', '--update-and-sync']));
  ok(f.run(['--help']));
  assert.deepStrictEqual(f.calls(), []);
});

console.log('\n' + passed + ' installer tests passed.');
