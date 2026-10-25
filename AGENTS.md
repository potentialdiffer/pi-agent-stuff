# Pi Agent Stuff - Repository Workflow

**THIS IS THE UPSTREAM SOURCE REPOSITORY** for the personal monorepo containing all Pi coding agent configuration.

## Critical Rule

**NO CHANGES MUST BE DONE TO THE PI CONFIGURATION IN THE HOME DIRECTORY.**

All modifications to Pi configuration MUST be made in this repository following the workflow below.

## Workflow

Always follow this sequence:

1. **Make changes** in this repository (`pi-agent-stuff/`)
2. **Commit** changes to git
3. **Push** to remote (GitHub) -> done by user
4. **Update extensions** with Pi: `pi update --extensions` -> done by user
5. **Test/use** the updated configuration -> done by user

## Review Policy

Before declaring any task done with changed source files in this repo:

1. Run deterministic checks first (tests, typecheck, lint). LLM review only after green.
2. One fresh-context `opus-reviewer` pass on the diff. Second pass only on a structured P0/P1 finding. Max 3 rounds; stop when clean.
3. Diff touches auth, payments, data migration, public API, or CI/pipeline config: ensemble — `opus-reviewer` AND `gpt-sol-reviewer`, fix the intersection of findings before finishing.
4. Done means checks green and no P0/P1 findings — never "reviewers agree".
5. `astra-oracle` only on explicit operator request or after Opus/Sol provably failed.

Apply this policy to any other project with `node scripts/install-review-policy.cjs <project-path>` (add `--watchdog` to also enable the GPT-6.1-Sol change watchdog in that project's `.pi/settings.json`). Template: `templates/review-policy.md`.

## Repository Structure

- **extensions/**: Custom Pi extensions (pdf-reader, pi-status, security-gate, pi-zotero, pi-rtk-optimizer, mistral-agent-tools, pi-vision)
- **agents/**: Subagent agent definitions shipped via `pi.subagents.agents` (opus-oracle, opus-reviewer on Claude Opus 5.5; gpt-sol-reviewer, astra-oracle on OpenAI)
- **skills/**: SKILL files for specialized tasks (git-info, literature-review, data-analysis, latex-assistant, python-code, review)
- **prompts/**: Prompt templates (review.md)
- **docs/**: Documentation for extensions, skills, and prompts
- **templates/**: Template files
- **scripts/**: Installation and setup scripts

## External Dependencies

See `external-extensions.json` for npm-based extensions:
- pi-caveman
- pi-observational-memory
- @juicesharp/rpiv-ask-user-question

## Package Configuration

This repository is configured as a Pi package. The `package.json` defines:
- Extensions directory: `./extensions`
- Skills directory: `./skills`
- Prompts directory: `./prompts`

Post-install script `scripts/postinstall.cjs` syncs external extensions (`external-extensions.json`) and ships settings (`settings.pi-agent-stuff.json`). Automatic invocation deliberately self-skips during install lifecycles, with `npm_config_omit`, or in Pi-managed checkouts to avoid racing Pi's own settings writes. After `pi install` / `pi update --extensions`, run `node scripts/postinstall.cjs --sync` (`npm run sync`) explicitly from the desired checkout. For sequential updates plus sync, use `node scripts/postinstall.cjs --update-and-sync` (`npm run update:sync`); it waits for Pi to exit before launching fresh sync code. Explicit flags never bypass an install lifecycle guard. Sync preserves unrelated packages, fails on invalid settings, and uses Pi-compatible locking plus atomic settings writes. Test with `npm run test:install`; tests use only temporary configuration and a fake Pi executable. Scripts under `scripts/` are plain CommonJS (`.cjs`) so installer commands run on Node.js ≥ 10.12, including old distro binaries.

## Installation

```bash
pi install git:github.com/potentialdiffer/pi-agent-stuff
```

## Updates

To update all extensions, skills, and prompts:

```bash
pi update --extensions
```

## Important Notes

- Configuration files (like `extensions/pi-zotero/config.json`) contain sensitive data. Never commit API keys.
- Use `config.example.json` as template and add actual `config.json` to `.gitignore`.
- Test changes in this repo before updating the home directory Pi installation.
- The home directory Pi configuration is read-only for direct edits.
