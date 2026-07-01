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

## Repository Structure

- **extensions/**: Custom Pi extensions (pdf-reader, pi-status, security-gate, pi-zotero, pi-rtk-optimizer, mistral-agent-tools)
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

Post-install script runs `scripts/postinstall.js` for setup.

## Installation

```bash
pi install pi:git@github.com:potentialdiffer/pi-agent-stuff.git
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
