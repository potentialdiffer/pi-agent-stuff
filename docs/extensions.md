# Extensions Documentation

This document describes all extensions included in this monorepo.

## Available Extensions

### pi-status
**Location:** `extensions/pi-status/`

Displays Git repository status in the Pi footer.

**Features:**
- Shows current branch name
- Displays clean/dirty status
- Counts staged, unstaged, and untracked changes
- Updates automatically on directory changes

**Configuration:** None required. Works automatically in Git repositories.

---

### security-gate
**Location:** `extensions/security-gate/`

Provides security protection against dangerous commands and operations.

**Protections:**

#### Critical Pattern Blocking
Blocks commands matching dangerous patterns:
- `rm -rf /`, `rm -rf /usr`, etc.
- `dd` commands
- Filesystem creation (`mkfs`)
- Fork bombs
- Disk overwrites (`> /dev/sda`)
- Package removal (`apt remove`, `dnf remove`, etc.)
- Database operations (`DROP DATABASE`, `TRUNCATE TABLE`)
- Process killing (`kill -9`)
- Service management (`systemctl stop`)

#### System Path Protection
Protected paths: `/etc/`, `/usr/`, `/bin/`, `/sbin/`, `/lib/`, `/lib64/`, `/boot/`, `/proc/`, `/sys/`, `/dev/`

- **Read operations**: Allowed without confirmation
- **Write operations**: Requires explicit confirmation
- **Other commands**: Requires confirmation

#### Wildcard/Recursive Protection
- Read-only commands with wildcards: Allowed (e.g., `ls *`, `grep -r pattern`)
- Write commands with wildcards: Requires confirmation (e.g., `rm *`, `chmod -R`)

#### File Operation Protection
- **write tool**: Blocks writes to system paths and critical files (`.env`, `.env.local`, `config.json`, `settings.json`)
- **edit tool**: Blocks edits to system files
- **bash tool**: Confirms all `rm` commands (except in `/tmp/`) and critical patterns

**Configuration:** None required. Active by default on session start.

---

### pi-zotero
**Location:** `extensions/pi-zotero/`

Zotero integration for Pi, with Better BibTeX support.

**Features:**
- Better BibTeX (BBT) parsing and export
- Zotero API for citation management
- Paper search and metadata retrieval
- Collection listing and management
- Item creation, update, and deletion
- Automatic bibliography synchronization

**Configuration:**

Create a `config.json` file in the extension directory:

```json
{
  "apiKey": "your-zotero-api-key",
  "libraryId": "your-library-id",
  "libraryType": "user",
  "bbtPath": null,
  "useBetterBibtexAPI": false,
  "betterBibtex": {
    "enabled": true,
    "port": 23119
  }
}
```

**Available Commands:**
- `zotero-search`: Search papers in your library
- `zotero-get`: Get paper details by ID
- `zotero-create`: Create a new paper entry
- `zotero-update`: Update an existing paper
- `zotero-delete`: Delete a paper
- `zotero-sync`: Sync bibliography
- `zotero-import`: Import papers
- `zotero-list-collections`: List all collections

**Dependencies:**
- `bibtex-parse` (npm package)

**Note:** API key and library ID are sensitive. Add `config.json` to your `.gitignore`.
A `config.example.json` is provided as a template.

---

### pi-rtk-optimizer
**Location:** `extensions/pi-rtk-optimizer/`

RTK (React Toolkit) query optimization configuration.

**Features:**
- Query rewriting and optimization
- Response compaction
- Automatic output truncation
- Aggregation of test output

**Configuration:**

The extension uses a `config.json` file with the following options:

```json
{
  "enabled": true,
  "mode": "rewrite",
  "guardWhenRtkMissing": true,
  "showRewriteNotifications": true,
  "outputCompaction": {
    "enabled": true,
    "stripAnsi": true,
    "readCompaction": {
      "enabled": false
    },
    "truncate": {
      "enabled": true,
      "maxChars": 12000
    },
    "sourceCodeFilteringEnabled": false,
    "preserveExactSkillReads": false,
    "sourceCodeFiltering": "none",
    "smartTruncate": {
      "enabled": false,
      "maxLines": 220
    },
    "aggregateTestOutput": true,
    "filterBuildOutput": true,
    "compactGitOutput": true,
    "aggregateLinterOutput": true,
    "groupSearchOutput": true,
    "trackSavings": true
  }
}
```

**Note:** This is a configuration-only extension. It doesn't provide new tools but modifies the behavior of RTK queries.
