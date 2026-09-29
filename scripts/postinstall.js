import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, sep } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const externalExtPath = join(repoRoot, 'external-extensions.json');
const shippedSettingsPath = join(repoRoot, 'settings.pi-agent-stuff.json');
const settingsPath = join(homedir(), '.pi', 'agent', 'settings.json');

// Skip when invoked as part of pi's own package installation: pi installs
// git packages with `npm install --omit=dev --legacy-peer-deps`, which sets
// npm_config_omit. The checkout-path check below additionally covers installs
// pi makes with bun/pnpm or under NODE_ENV=production, where npm does not
// export npm_config_omit to lifecycle scripts. Running nested `pi install`/
// `pi remove` and writing ~/.pi/agent/settings.json at that moment can race
// with the outer pi process (which manages the same settings), and a nested
// failure would fail `npm install`, making pi roll back the entire git
// checkout. Run `node scripts/postinstall.js` manually to sync external
// extensions and shipped settings.
function isPiManagedCheckout() {
  const piGitRoot = join(homedir(), '.pi', 'agent', 'git');
  return repoRoot.startsWith(piGitRoot + sep);
}

if (process.env.npm_config_omit || isPiManagedCheckout()) {
  const reason = process.env.npm_config_omit
    ? `dependency-only install detected: npm_config_omit=${process.env.npm_config_omit}`
    : 'running inside a pi-managed git checkout';
  console.log(`\n⏭️  Skipping postinstall (${reason}).`);
  console.log('    Run `node scripts/postinstall.js` manually to sync external extensions and settings.');
  process.exit(0);
}

// Deep-merge shipped settings into target. Nested objects merge recursively;
// shipped values win for defined keys, target keeps keys shipped file omits.
function deepMerge(target, shipped) {
  const out = { ...target };
  for (const key of Object.keys(shipped)) {
    const sv = shipped[key];
    const tv = out[key];
    if (
      sv && typeof sv === 'object' && !Array.isArray(sv) &&
      tv && typeof tv === 'object' && !Array.isArray(tv)
    ) {
      out[key] = deepMerge(tv, sv);
    } else {
      out[key] = sv;
    }
  }
  return out;
}

function main() {
  // Read own package.json to identify this repo
  const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
  const repoUrl = pkg.repository.url;
  const match = repoUrl.match(/github.com\/([^\/]+)\/([^.]+)/);
  const user = match[1];
  const repo = match[2];

  // Possible identifiers for this repo in settings
  const ownIdentifiers = [
    `git:github.com/${user}/${repo}`,
    `git:git@github.com:${user}/${repo}.git`,
    `https://github.com/${user}/${repo}`,
    `https://github.com/${user}/${repo}.git`,
    `github.com/${user}/${repo}`,
    `github:${user}/${repo}`,
    `${user}/${repo}`
  ];

  // Read desired packages
  const desiredPackages = JSON.parse(readFileSync(externalExtPath, 'utf8'));

  // Read current installed packages from pi settings
  let currentPackages = [];
  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    currentPackages = settings.packages || [];
  } catch (e) {
    // Settings file doesn't exist yet
  }

  // Find packages to install and remove (excluding own repo)
  const toInstall = desiredPackages.filter(p => !currentPackages.includes(p) && !ownIdentifiers.includes(p));
  const toRemove = currentPackages.filter(p =>
    !desiredPackages.includes(p) &&
    !ownIdentifiers.includes(p)
  );

  // Install new packages. Never let a nested `pi install` failure fail the
  // surrounding `npm install` (pi would roll back the whole checkout).
  if (toInstall.length > 0) {
    console.log('\n📦 Installing new external extensions:');
    for (const pkg of toInstall) {
      console.log(`   → ${pkg}`);
      try {
        execSync(`pi install ${pkg}`, { stdio: 'inherit' });
      } catch (e) {
        console.warn(`   ⚠️  Failed to install ${pkg}: ${e?.message || e} (continuing)`);
      }
    }
  }

  // Remove old packages. Same non-fatal policy as installs.
  if (toRemove.length > 0) {
    console.log('\n🗑️  Removing old external extensions:');
    for (const pkg of toRemove) {
      console.log(`   → ${pkg}`);
      try {
        execSync(`pi remove ${pkg}`, { stdio: 'inherit' });
      } catch (e) {
        console.warn(`   ⚠️  Failed to remove ${pkg}: ${e?.message || e} (continuing)`);
      }
    }
  }

  console.log('\n✅ External extensions synchronized.');

  // Merge shipped settings into global pi settings
  try {
    const shippedSettings = JSON.parse(readFileSync(shippedSettingsPath, 'utf8'));
    let currentSettings = {};
    try {
      currentSettings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    } catch (e) {
      // Settings file doesn't exist yet
    }
    const merged = deepMerge(currentSettings, shippedSettings);
    writeFileSync(settingsPath, JSON.stringify(merged, null, 2) + '\n', 'utf8');
    console.log('\n⚙️  Settings merged into ~/.pi/agent/settings.json');
  } catch (e) {
    console.log('\n⚠️  Could not merge settings:', e.message);
  }
}

// Postinstall must never fail the surrounding `npm install`: pi rolls back
// the whole git checkout when its dependency install exits non-zero.
try {
  main();
} catch (e) {
  console.warn(`\n⚠️  postinstall: ${e?.message || e} (non-fatal, continuing)`);
  process.exit(0);
}
