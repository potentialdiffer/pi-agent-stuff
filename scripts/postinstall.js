import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const externalExtPath = join(repoRoot, 'external-extensions.json');
const settingsPath = join(homedir(), '.pi', 'agent', 'settings.json');

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

// Find packages to install and remove
const toInstall = desiredPackages.filter(p => !currentPackages.includes(p));
const toRemove = currentPackages.filter(p => !desiredPackages.includes(p));

// Install new packages
if (toInstall.length > 0) {
  console.log('\n📦 Installing new external extensions:');
  for (const pkg of toInstall) {
    console.log(`   → ${pkg}`);
    execSync(`pi install ${pkg}`, { stdio: 'inherit' });
  }
}

// Remove old packages
if (toRemove.length > 0) {
  console.log('\n🗑️  Removing old external extensions:');
  for (const pkg of toRemove) {
    console.log(`   → ${pkg}`);
    execSync(`pi remove ${pkg}`, { stdio: 'inherit' });
  }
}

console.log('\n✅ External extensions synchronized.');
