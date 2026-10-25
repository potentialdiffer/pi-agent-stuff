// CommonJS deliberately: installer must parse on Node >= 10.12, including old
// system Node binaries. No ESM, node: imports, optional chaining or ?? here.
const fs = require('fs');
const { execFileSync } = require('child_process');
const { homedir } = require('os');
const { join, resolve, sep, dirname } = require('path');

const repoRoot = resolve(__dirname, '..');

function agentDirectory(env) {
  const value = env.PI_CODING_AGENT_DIR || join(homedir(), '.pi', 'agent');
  return resolve(value.replace(/^~(?=$|[/\\])/, homedir()));
}

function inside(path, root) {
  // Resolve symlinks as well, so an alias cannot bypass the checkout guard.
  function canonical(value) {
    try { return fs.realpathSync(value); } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      return resolve(value);
    }
  }
  return canonical(path).startsWith(canonical(root) + sep);
}

function lifecycleInstall(env) {
  return /^(preinstall|install|postinstall|prepare|prepublish)$/.test(env.npm_lifecycle_event || '') ||
    /^(install|ci|update|rebuild)$/.test(env.npm_command || '');
}

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateKeys(value) {
  if (!value || typeof value !== 'object') return;
  Object.keys(value).forEach(function (key) {
    if (key === '__proto__') {
      throw new Error('Unsafe JSON key: ' + key);
    }
    validateKeys(value[key]);
  });
}

function readJson(path, missing) {
  let text;
  try { text = fs.readFileSync(path, 'utf8'); } catch (error) {
    if (error.code === 'ENOENT' && missing !== undefined) {
      try {
        if (fs.lstatSync(path).isSymbolicLink()) throw new Error('Dangling settings symlink: ' + path);
      } catch (statError) { if (statError.code !== 'ENOENT') throw statError; }
      return missing;
    }
    throw error;
  }
  try {
    const value = JSON.parse(text.replace(/^\uFEFF/, ''));
    validateKeys(value);
    return value;
  } catch (error) {
    throw new Error('Invalid JSON in ' + path + ': ' + error.message);
  }
}

function packageSource(entry) {
  if (typeof entry === 'string' && entry.trim()) return entry;
  if (object(entry) && typeof entry.source === 'string' && entry.source.trim()) return entry.source;
  throw new Error('Each settings.packages entry must be a source string or an object with source');
}

function readSettings(path) {
  const settings = readJson(path, {});
  if (!object(settings)) throw new Error('Settings must be a JSON object: ' + path);
  if (settings.packages !== undefined) {
    if (!Array.isArray(settings.packages)) throw new Error('settings.packages must be an array');
    settings.packages.forEach(packageSource);
  }
  return settings;
}

// Shipped keys win; unrelated user keys survive. Arrays replace, not concatenate.
function deepMerge(target, shipped) {
  const out = Object.assign({}, target);
  Object.keys(shipped).forEach(function (key) {
    const value = shipped[key];
    out[key] = object(value) && object(out[key]) ? deepMerge(out[key], value) : value;
  });
  return out;
}

function withSettingsLock(path, fn) {
  fs.mkdirSync(dirname(path), { recursive: true });
  // Same lock protocol as Pi's FileSettingsStorage. Never hold this lock while
  // calling pi install: its own settings write needs the same lock.
  const release = require('proper-lockfile').lockSync(path, { realpath: false });
  try { return fn(); } finally { release(); }
}

function atomicWrite(path, text) {
  let destination = path;
  let mode = 0o600;
  try {
    // Preserve settings symlinks rather than replacing the link itself.
    destination = fs.realpathSync(path);
    mode = fs.statSync(destination).mode & 0o777;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    // A dangling symlink is not a missing settings file we should replace.
    try {
      if (fs.lstatSync(path).isSymbolicLink()) throw new Error('Dangling settings symlink: ' + path);
    } catch (statError) { if (statError.code !== 'ENOENT') throw statError; }
  }
  const temporary = destination + '.pi-agent-stuff-' + process.pid + '-' + Date.now() + '.tmp';
  let fd;
  try {
    fd = fs.openSync(temporary, 'wx', 0o600);
    fs.writeFileSync(fd, text, 'utf8');
    // open's mode is filtered by umask. Restore exact existing permissions only
    // after writing the private temporary file, before making it visible.
    fs.fchmodSync(fd, mode);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(temporary, destination);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

function runPi(args, env) {
  // Argument array, not a shell command: package sources are never shell code.
  execFileSync('pi', args, { stdio: 'inherit', env: env });
}

function sync(env) {
  const settingsPath = join(agentDirectory(env), 'settings.json');
  const desired = readJson(join(repoRoot, 'external-extensions.json'));
  const shipped = readJson(join(repoRoot, 'settings.pi-agent-stuff.json'));
  if (!Array.isArray(desired) || desired.some(function (entry) {
    return typeof entry !== 'string' || !entry.trim() || entry[0] === '-';
  })) throw new Error('external-extensions.json must contain nonempty package source strings (not flags)');
  if (!object(shipped) || Object.prototype.hasOwnProperty.call(shipped, 'packages')) {
    throw new Error('Shipped settings must be an object without packages; use external-extensions.json');
  }

  // Validate before invoking package commands. Malformed/unreadable settings
  // are errors, not empty configuration. Only ENOENT means absent.
  const current = withSettingsLock(settingsPath, function () {
    const settings = readSettings(settingsPath);
    // Pi creates missing settings with its default umask-derived mode. Create
    // our missing file privately first so pi install preserves mode 0600 too.
    if (!fs.existsSync(settingsPath)) atomicWrite(settingsPath, '{}\n');
    return settings;
  });
  const sources = (current.packages || []).map(packageSource);
  const missing = desired.filter(function (source, index) {
    return desired.indexOf(source) === index && sources.indexOf(source) === -1;
  });
  missing.forEach(function (source) {
    console.log('Installing external extension: ' + source);
    runPi(['install', source], env);
  });

  withSettingsLock(settingsPath, function () {
    // pi install may have changed packages or other keys. Never reuse snapshot.
    const latest = readSettings(settingsPath);
    const installed = (latest.packages || []).map(packageSource);
    const unsaved = desired.filter(function (source) { return installed.indexOf(source) === -1; });
    if (unsaved.length) throw new Error('Pi did not save installed packages: ' + unsaved.join(', '));
    const merged = deepMerge(latest, shipped);
    if (JSON.stringify(merged) !== JSON.stringify(latest)) {
      atomicWrite(settingsPath, JSON.stringify(merged, null, 2) + '\n');
    }
  });
  console.log('External extensions synchronized (unrelated packages preserved).');
  console.log('Shipped settings synchronized: ' + settingsPath);
}

function main(args, env) {
  if (args.length > 1 || (args.length && ['--sync', '--update-and-sync', '--help'].indexOf(args[0]) === -1)) {
    throw new Error('Usage: node scripts/postinstall.cjs [--sync | --update-and-sync | --help]');
  }
  if (args[0] === '--help') {
    console.log('Usage: node scripts/postinstall.cjs [--sync | --update-and-sync]');
    console.log('--sync: explicitly apply shipped settings and add missing external packages.');
    console.log('--update-and-sync: wait for pi update --extensions, then run fresh --sync code.');
    return;
  }
  const explicit = args.length > 0;
  // An explicit flag bypasses checkout/omit guards, NEVER an install lifecycle.
  if (lifecycleInstall(env) || (!explicit && (env.npm_config_omit ||
      inside(repoRoot, join(agentDirectory(env), 'git')) ||
      inside(repoRoot, join(homedir(), '.pi', 'agent', 'git'))))) {
    console.log('Skipping automatic postinstall to avoid racing Pi package/settings writes.');
    console.log('After Pi exits, run: node "' + join(repoRoot, 'scripts', 'postinstall.cjs') + '" --sync');
    if (explicit) throw new Error('Explicit sync is not allowed during an install lifecycle');
    return;
  }
  if (args[0] === '--update-and-sync') {
    runPi(['update', '--extensions'], env);
    // Update may replace this script/manifests/dependencies. Start a new process
    // only AFTER Pi exits; do not run pre-update code cached in this process.
    execFileSync(process.execPath, [join(repoRoot, 'scripts', 'postinstall.cjs'), '--sync'], {
      stdio: 'inherit', env: env
    });
  } else {
    sync(env);
  }
}

if (require.main === module) {
  try { main(process.argv.slice(2), process.env); } catch (error) {
    console.error('pi-agent-stuff sync failed: ' + error.message);
    // A lifecycle must not make Pi roll back its checkout. Explicit commands
    // must fail visibly instead of falsely reporting successful synchronization.
    process.exitCode = lifecycleInstall(process.env) ? 0 : 1;
  }
}

module.exports = { main: main, deepMerge: deepMerge, agentDirectory: agentDirectory };
