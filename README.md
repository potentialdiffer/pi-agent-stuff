# Pi Agent Stuff

Custom extensions, skills, and prompts for the [Pi Coding Agent](https://github.com/mariozechner/pi-coding-agent). Focused on research and engineering workflows.

## Contents

### Extensions (`extensions/`)
- **pdf-reader/** - PDF processing with poppler
  - `pdf_extract_text` - Extract text with layout preservation
  - `pdf_get_info` - Get PDF metadata (title, author, pages)
  - `pdf_extract_pages` - Extract specific page ranges
  - Requires: poppler-utils (pdftotext, pdfinfo)
- **pi-status/** - Git status and euro spending in footer
  - Shows branch, clean status, changes, staged, untracked counts
  - Converts USD token costs to estimated EUR using daily ECB exchange rates
- **security-gate/** - Security protection
  - Blocks dangerous commands (rm -rf, dd, mkfs, etc.)
  - Protects system paths (/etc, /usr, /bin, etc.)
  - Confirms wildcard and recursive operations
- **pi-zotero/** - Zotero integration
  - Better BibTeX parsing and export
  - Zotero API for citation management
  - Paper search and metadata retrieval
- **pi-rtk-optimizer/** - RTK query optimization configuration
- **mistral-agent-tools/** - Mistral AI tools
  - `mistral_generate_image` - Image generation from text prompts
  - `/mistral-websearch` - Websearch with citations (command-only; the LLM-callable `mistral_websearch` tool is deregistered in favor of pi-web-access's `web_search`)
  - `/mistral-setup` - Configure API key
  - `/mistral-image` - Generate images
  - `/mistral-websearch` - Search the web
  - `/explore-images` - Browse generated images
  - Requires: Mistral API key

### Skills (`skills/`)
- **git-info/** - Git repository analysis (see `SKILL.md` for details)
- **review/** - Document and PDF review
  - Structured analysis for academic papers, code docs, general documents
  - Auto-extracts PDF text using pdf-reader tools
  - Provides strengths, weaknesses, questions, suggestions
  - Includes rating system (1-10 scale)

### Prompts (`prompts/`)
- **review.md** - Code review prompt template
  - Checks for performance, security, and readability issues
  - Pedantic review style

## Requirements

Installer/sync commands below target Linux/macOS (POSIX); Windows command-shim
execution is not currently supported by these scripts.

- **Node.js ≥ 10.12** on your `PATH` — required to run the post-install script
  (`scripts/postinstall.cjs`, plain CommonJS, runs on Node ≥ 10.12 including
  old distro binaries such as Ubuntu 20.04's system `node`; Pi's bundled Node
  under `~/.local/share/pi-node/current/bin/node` also qualifies).
- **`pi` CLI** on your `PATH` — explicit sync calls `pi install` to add missing
  external extensions; update-and-sync also calls `pi update --extensions`.
- Per-extension extras: `poppler-utils` for pdf-reader, a Mistral API key for
  mistral-agent-tools.

## Installation

```bash
git clone https://github.com/potentialdiffer/pi-agent-stuff.git
cd pi-agent-stuff
```

Add to your Pi config to load extensions, skills, and prompts.

### With Pi

```bash
pi install git:github.com/potentialdiffer/pi-agent-stuff
```

**`pi update --extensions` alone does not apply this repo's shipped settings.**
The install lifecycle deliberately skips synchronization: nested package commands
and settings writes can race Pi's outer installer. Explicit sync works inside a
Pi-managed checkout without removing that safety guard.

After installation, run from the installed checkout (default path shown):

```bash
cd ~/.pi/agent/git/github.com/potentialdiffer/pi-agent-stuff
node scripts/postinstall.cjs --sync
# Equivalent: npm run sync
```

For subsequent updates, use one sequential command:

```bash
node scripts/postinstall.cjs --update-and-sync
# Equivalent: npm run update:sync
```

This waits for `pi update --extensions` to finish successfully, then starts a fresh
sync process using the **updated** script, manifests, and dependencies. No startup
hook or background synchronization is installed. Use `--extensions` (plural);
Pi's singular `--extension` update alias requires a package source.

From a development clone, run the same commands in that clone. Sync then uses that
clone's shipped files; update still updates Pi-managed installations, not the
clone. An absolute script path also works from another working directory. Pi's
update command retains its normal project-scope/trust behavior for that directory.

### Sync behavior and safety

- `PI_CODING_AGENT_DIR` selects the agent directory, default `~/.pi/agent`. Both
  child Pi commands and settings sync use it; leading `~` is supported.
- `settings.pi-agent-stuff.json` is authoritative for its keys. Nested objects
  merge recursively, arrays replace, and unrelated settings survive. Shipped
  settings cannot contain `packages`; use `external-extensions.json` instead.
- Package sync is **additive**: missing exact sources are installed, object-form
  entries/filters are recognized, unrelated packages and this package's own entry
  are preserved. Removing a source from the manifest does **not** uninstall it;
  remove obsolete packages explicitly with `pi remove <source>`. Changing a source
  version in the manifest requests that exact source on the next sync. Manifest
  sources override user-pinned versions of the same package (filters survive).
- Malformed/unreadable settings fail closed. Writes use Pi's settings-lock
  protocol plus atomic replacement; existing symlinks and file permissions are
  preserved. New settings files use mode `0600`.
- Explicit sync/update failures return nonzero and never claim success. Already
  completed package installs remain if a later step fails; fix the error and rerun.
  A repeated successful sync is a no-op when nothing changed. On a fresh setup,
  an empty private settings file can remain after a failed package install.
- Do not run package update/sync commands concurrently. If Pi currently holds the
  settings lock, sync fails safely; retry after its operation finishes. Ordinary
  Pi settings saves coordinate through the same short-lived lock. Sync does not
  hold that lock while invoking `pi install`.
- An explicit flag never bypasses an **install lifecycle** guard. Default
  postinstall invocation also skips in managed checkouts or with
  `npm_config_omit`; its message includes the explicit recovery command.
- After syncing, restart Pi to apply startup defaults and newly installed
  extensions (`/reload` can refresh resources, but not every startup setting).

Installer regression tests (offline, temporary configuration only):

```bash
npm ci --ignore-scripts --legacy-peer-deps
npm run test:install
```

## Configuration

For **pi-zotero**, create a `config.json` in the extension directory with your Zotero API credentials:
```json
{
  "apiKey": "your-api-key",
  "libraryId": "your-library-id",
  "libraryType": "user",
  "betterBibtex": {
    "enabled": true,
    "port": 23119
  }
}
```

## License

MIT
