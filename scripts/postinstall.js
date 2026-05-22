import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const packages = JSON.parse(readFileSync(new URL('../external-extensions.json', import.meta.url)));

for (const pkg of packages) {
  execSync(`pi install ${pkg}`, { stdio: 'inherit' });
}
