#!/usr/bin/env node
// Append the pi-agent-stuff review policy to a project's AGENTS.md and
// optionally enable the GPT-6.1-Sol watchdog in that project's .pi/settings.json.
// Idempotent. Explicit invocation only — never run from postinstall.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';
import process from 'node:process';

const MARKER_START = '<!-- pi-agent-stuff:review-policy v1 -->';
const MARKER_END = '<!-- /pi-agent-stuff:review-policy -->';

const POLICY_BLOCK = `${MARKER_START}
## Review Policy

Before declaring any task done with changed source files:

1. Run deterministic checks first (tests, typecheck, lint). LLM review only
   after green.
2. One fresh-context \`opus-reviewer\` pass on the diff. Second pass only on a
   structured P0/P1 finding. Max 3 rounds; stop when clean.
3. Diff touches auth, payments, data migration, public API, or CI/pipeline
   config: ensemble — \`opus-reviewer\` AND \`gpt-sol-reviewer\`, fix the
   intersection of findings before finishing.
4. Done means checks green and no P0/P1 findings — never "reviewers agree".
5. \`astra-oracle\` only on explicit operator request or after Opus/Sol
   provably failed.
${MARKER_END}
`;

const WATCHDOG_BLOCK = {
  subagents: {
    watchdog: {
      enabled: true,
      model: 'openai/gpt-6.1-sol',
      cadence: { everyNTools: 10 },
      children: { enabled: true },
    },
  },
};

const usage = `Usage: node install-review-policy.js <project-path> [--watchdog]

  <project-path>   Target project directory (defaults to current directory)
  --watchdog       Also merge the GPT-6.1-Sol change watchdog into
                   <project>/.pi/settings.json (existing keys are preserved;
                   watchdog keys are overwritten by this template)
`;

function fail(msg, code = 1) {
  console.error(`error: ${msg}`);
  process.exit(code);
}

function deepMergeShipped(target, shipped) {
  const out = { ...target };
  for (const key of Object.keys(shipped)) {
    const sv = shipped[key];
    const tv = out[key];
    if (
      sv && typeof sv === 'object' && !Array.isArray(sv) &&
      tv && typeof tv === 'object' && !Array.isArray(tv)
    ) {
      out[key] = deepMergeShipped(tv, sv);
    } else {
      out[key] = sv;
    }
  }
  return out;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('-h') || args.includes('--help')) {
    console.log(usage);
    process.exit(0);
  }
  const wantWatchdog = args.includes('--watchdog');
  const targetArg = args.filter((a) => !a.startsWith('--'))[0] ?? '.';
  const project = isAbsolute(targetArg) ? targetArg : resolve(targetArg);

  if (!existsSync(project)) fail(`project path not found: ${project}`);

  // 1. AGENTS.md policy append
  const agentsFile = resolve(project, 'AGENTS.md');
  const existing = existsSync(agentsFile) ? readFileSync(agentsFile, 'utf8') : '';

  if (existing.includes(MARKER_START)) {
    console.log(`skip: review policy already present in ${agentsFile}`);
  } else {
    const sep = existing.endsWith('\n') || existing === '' ? '' : '\n';
    const withBlock = `${existing}${sep}${existing === '' ? '' : '\n'}${POLICY_BLOCK}`;
    writeFileSync(agentsFile, withBlock, 'utf8');
    console.log(`added: review policy -> ${agentsFile}`);
  }

  // 2. Optional watchdog settings merge
  if (wantWatchdog) {
    const settingsPath = resolve(project, '.pi', 'settings.json');
    let current = {};
    if (existsSync(settingsPath)) {
      try {
        current = JSON.parse(readFileSync(settingsPath, 'utf8'));
      } catch (e) {
        fail(`cannot parse existing ${settingsPath}: ${e.message}`);
      }
    }
    const merged = deepMergeShipped(current, WATCHDOG_BLOCK);
    mkdirSync(resolve(project, '.pi'), { recursive: true });
    writeFileSync(settingsPath, JSON.stringify(merged, null, 2) + '\n', 'utf8');
    console.log(`merged: watchdog config -> ${settingsPath}`);
  }

  console.log('note: named agents require the pi-agent-stuff package installed (pi install pi:git@github.com:potentialdiffer/pi-agent-stuff.git)');
}

main();
