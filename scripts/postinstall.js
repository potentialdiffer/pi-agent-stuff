import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const externalExtPath = join(repoRoot, 'external-extensions.json');
const settingsPath = join(homedir(), '.pi', 'agent', 'settings.json');

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
