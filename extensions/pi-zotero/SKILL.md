# pi-zotero Agent Skill Guide

> **Purpose:** Instruct agents on effective use of the pi-zotero extension for managing Zotero bibliographic references.

---

## Quick Start

**First, check if configured:**
```
/zotero-status
```

If not configured, run the setup wizard:
```
/zotero-setup
```

---

## Core Concepts

### 1. Key Types - CRITICAL

| Identifier | Format | Example | Used For |
|---|---|---|---|
| **Zotero item key** | 8-char uppercase | `YTP3BY9P` | `zotero_update_item`, `zotero_delete_item`, `addToCollection` |
| **BBT cite key** | Human-readable | `smith2023` | `zotero_search` (BBT), `zotero_get_entry`, `zotero_sync` |

**Search results show different keys based on source:**
- `[BBT]` result → `citeKey` field = BBT cite key (e.g., `smith2023`)
- `[Zotero]` result → `citeKey` field = Zotero item key (e.g., `YTP3BY9P`)

**To update/delete a BBT-found item:**
1. Get the cite key from search (e.g., `smith2023`)
2. Call `zotero_get_entry(key="smith2023", source="zotero")`
3. Extract Zotero item key from `details.entry.key`
4. Use that key with `zotero_update_item` or `zotero_delete_item`

### 2. Dry-Run Pattern (ALWAYS USE)

All write operations default to `confirm=false` (dry run). **Always:**
1. Call with `confirm=false` first
2. Show user the preview
3. Only call with `confirm=true` after explicit user approval

### 3. Collection Resolution

Accepts any of:
- Display name: `"PhD"`
- Path: `"PhD/Papers"`
- 8-char key: `"GCJ7XRBU"` (fastest)

**Best practice:** Call `zotero_list_collections` first, copy the 8-char key.

### 4. Author Format

Both accepted:
- `"Last, First"` (preferred) - e.g., `"Smith, John"`
- `"First Last"` - e.g., `"John Smith"`

---

## Tool Selection Guide

| Goal | Tool | Notes |
|---|---|---|
| Find papers | `zotero_search` | Use `source="bbt"` for fast offline search |
| Get full details | `zotero_get_entry` | Use `format="summary"` for human-readable |
| Add single paper | `zotero_create_item` | Set `confirm=false` first |
| Add multiple papers | `zotero_import_batch` | Use `skipDuplicateCheck=true` for speed |
| Edit paper | `zotero_update_item` | Requires Zotero item key |
| Delete paper | `zotero_delete_item` | Requires `confirm=true` |
| File into collection | `zotero_update_item` | Use `addToCollection` parameter |
| See collection structure | `zotero_list_collections` | Copy 8-char keys from output |
| Sync BBT → Zotero | `zotero_sync` | Use `dryRun=true` first |
| Reload BBT file | `/zotero-refresh` | Command, not a tool |

---

## Common Workflows

### Workflow 0: Interactive Search (TUI)

For users who prefer a guided interface:

```
1. Run command: /zotero-query
   → Follow prompts:
   - Enter search query
   - Select source (all/bbt/zotero)
   - Load results into agent context? (Yes/No)
   → View 100 results without abstracts
   → If "Yes", results are formatted as JSON for agent use

2. OR use: /zotero-query-abstract
   → Same prompts but includes abstracts in results
```

**Context Loading:** When you select "Yes" to load results into context, the results are formatted as JSON and displayed. The agent can then reference these results in subsequent interactions using the provided structured data.

### Workflow 1: Find and Read a Paper

```
1. zotero_search(query="neural scaling laws", source="all", limit=5)
   → Pick a result, note its citeKey and source

2. zotero_get_entry(key="<citeKey>", format="summary")
   → Review full details
```

### Workflow 2: Add a Single Paper

```
1. zotero_create_item(
     title="Scaling Laws for Neural Networks",
     authors=["Smith, John", "Jones, Mary"],
     year="2023",
     doi="10.1234/journal.2023",
     abstract="...",
     journal="Nature AI",
     confirm=false
   )
   → Review dry-run output

2. zotero_create_item(..., confirm=true)
   → Only after user approval
```

### Workflow 3: Bulk Import Papers

```
1. zotero_list_collections()
   → Find target collection key

2. zotero_import_batch(
     items=[
       {title: "Paper A", authors: ["Smith, J"], year: "2022", doi: "10.1/a"},
       {title: "Paper B", authors: ["Jones, M"], year: "2023"}
     ],
     collection="GCJ7XRBU",  // or "PhD/Papers"
     skipDuplicateCheck=true,
     confirm=false
   )
   → Review preview

3. zotero_import_batch(..., confirm=true)
   → Execute import
```

### Workflow 4: Update an Existing Paper

```
1. zotero_search(query="Paper Title")
   → Find the item, note its citeKey and source

2. If source is [BBT]:
   zotero_get_entry(key="<citeKey>", source="zotero")
   → Extract Zotero item key from details.entry.key

3. zotero_update_item(
     itemKey="<zoteroItemKey>",
     addTags=["read", "important"],
     addToCollection="GCJ7XRBU",
     confirm=false
   )
   → Review changes

4. zotero_update_item(..., confirm=true)
   → Apply changes
```

### Workflow 5: Delete a Paper

```
1. zotero_search(query="Paper Title")
   → Get Zotero item key

2. zotero_delete_item(itemKey="<zoteroItemKey>", confirm=false)
   → Show user what will be deleted

3. zotero_delete_item(itemKey="<zoteroItemKey>", confirm=true)
   → Only after explicit user confirmation
```

### Workflow 6: Sync BBT File to Zotero

```
1. zotero_sync(dryRun=true)
   → Review what will be created/updated

2. zotero_sync(dryRun=false, updateExisting=true)
   → Execute sync
```

---

## Tool Reference

### zotero_search

Search for references.

**Required:** `query` (string)

**Options:**
- `source`: `bbt` (fast, offline), `local`, `web`, `all` (default)
- `limit`: 1-50 (default: 10)
- `includeAbstract`: boolean (default: false)

**When to use `bbt`:** Fast cite-key lookup, no network needed.

**When to use `all`:** Comprehensive search across all sources.

**Returns:** Numbered list with source tag (`[BBT]` or `[Zotero]`).

---

### zotero_get_entry

Get full details of a single reference.

**Required:** `key` (BBT cite key or Zotero item key)

**Options:**
- `source`: `bbt`, `zotero`, `auto` (default)
- `format`: `json` (default), `bibtex`, `citation`, `summary`

**Use `format="summary"`** for human-readable output.

**Use `format="json"`** for programmatic access to all fields.

---

### zotero_create_item

Create a single item in user library.

**Required:** `title`

**Common fields:** `authors`, `year`, `doi`, `abstract`, `journal`, `volume`, `issue`, `pages`, `url`, `itemType`

**Special parameters:**
- `citeKey`: Pre-fill unset fields from matching BBT entry
- `collection`: Collection name, path, or key
- `tags`: Array of tags
- `confirm`: Must be `true` to actually create (default: false)

**Item types:** `journalArticle`, `book`, `bookSection`, `conferencePaper`, `thesis`, `report`, `webpage`, `document`, `presentation`, `manuscript`

**Duplicate check:** Automatic by DOI, then title.

---

### zotero_import_batch

Import multiple items efficiently.

**Required:** `items` (array of item objects)

**Options:**
- `collection`: Applied to all items
- `tags`: Applied to all items (merged with per-item tags)
- `skipDuplicateCheck`: true for speed (default: false)
- `confirm`: Must be `true` to execute (default: false)

**Performance:** Use `skipDuplicateCheck=true` for large imports (>10 items).

**Note:** Does not support `citeKey` pre-fill. Use `zotero_create_item` for single items needing BBT pre-fill.

---

### zotero_update_item

Update an existing item.

**Required:** `itemKey` (Zotero item key, NOT cite key)

**Field updates:** `title`, `authors`, `year`, `doi`, `abstract`, `journal`, `volume`, `issue`, `pages`, `url`, `itemType`

**Tag operations:**
- `addTags`: Add tags (preserves existing)
- `removeTags`: Remove specific tags
- `setTags`: Replace all tags

**Collection operations:**
- `addToCollection`: Add to collection
- `removeFromCollection`: Remove from collection

**Always use `confirm=false` first.**

---

### zotero_delete_item

Move an item to trash.

**Required:** `itemKey` (Zotero item key), `confirm=true`

**Options:**
- `force`: Skip confirmation preview (default: false)

**Recovery:** Items can be recovered from Zotero desktop Trash within 30 days.

**Note:** Only works with user libraries (not group libraries).

---

### zotero_list_collections

List all collections as indented hierarchy.

**Options:**
- `showItemCounts`: Show counts (default: true)
- `maxDepth`: Limit depth (0 = unlimited)

**Best practice:** Copy 8-char keys from output for use in other tools.

---

### zotero_sync

Sync BBT entries to Zotero library.

**Options:**
- `citeKeys`: Specific keys to sync (syncs all if omitted)
- `collection`: Collection for new items
- `dryRun`: Preview without executing (default: true)
- `updateExisting`: Update items where BBT data differs (default: false)

**Limitations:** Fetches max 1000 items for duplicate detection.

---

## Commands (Not Tools)

| Command | Description |
|---|---|
| `/zotero-setup` | Interactive configuration wizard |
| `/zotero-status` | Check API and BBT status |
| `/zotero-refresh` | Reload BBT file |
| `/zotero-query` | Interactive TUI for searching Zotero (100 results, no abstracts) |
| `/zotero-query-abstract` | Interactive TUI for searching Zotero (100 results, with abstracts) |

---

## Pitfalls & Gotchas

1. **Item key vs cite key confusion** - This is the #1 source of errors. Always verify which type you have.

2. **Group libraries are read-only** - Create, update, delete, sync only work on user library.

3. **BBT local API requires running Zotero** - If Zotero is closed, falls back to `.bib` file if configured.

4. **Batch import limitations** - Does not support `citeKey` pre-fill. Use single `zotero_create_item` for that.

5. **`itemType: "misc"` is invalid** - Use `document`, `webpage`, or `manuscript` instead.

6. **Sync limitation** - `zotero_sync` fetches max 1000 items. Large libraries may have false positives for "new items".

7. **Author format inconsistency** - Some fields may use "First Last", others "Last, First". Normalize as needed.

8. **Collection path format** - Use forward slashes: `"PhD/Papers"` not `"PhD\Papers"`

---

## Best Practices

1. **Always dry-run first** - Never set `confirm=true` on first attempt.

2. **Use collection keys, not names** - Call `zotero_list_collections` once, copy 8-char keys, reuse them.

3. **Prefer BBT for search** - `source="bbt"` is fast and offline.

4. **Use batch for >3 items** - `zotero_import_batch` is significantly more efficient.

5. **Validate before acting** - After search, confirm you have the right item by checking title/authors/year.

6. **Handle key conversion explicitly** - If you get a cite key from BBT search and need to update/delete, explicitly convert it to Zotero item key via `zotero_get_entry`.

7. **Check status on errors** - If tools fail, run `/zotero-status` to diagnose configuration issues.

---

## Example Conversations

### User: "Find me papers by John Smith on neural networks"

```
Agent: zotero_search(query="Smith neural networks", source="all", limit=10)
→ Returns results

Agent: Here are 10 papers. Would you like details on any specific one?

User: "Show me #3"

Agent: zotero_get_entry(key="smith2023neural", format="summary")
→ Returns formatted details
```

### User: "Add this paper: Title X, DOI 10.123/abc"

```
Agent: zotero_search(query="10.123/abc", source="bbt")
→ Check if already exists

Agent: zotero_create_item(
  title="Title X",
  doi="10.123/abc",
  confirm=false
)
→ Dry run shows fields

Agent: This will create "Title X" with DOI 10.123/abc. No abstract or authors provided. Confirm?

User: "Yes, but add to my PhD collection"

Agent: zotero_list_collections()
→ Find PhD collection key

Agent: zotero_create_item(
  title="Title X",
  doi="10.123/abc",
  collection="GCJ7XRBU",
  confirm=true
)
→ Item created
```

### User: "I need to add 20 papers from this list"

```
Agent: Please provide the list of papers with their details (title, authors, year, DOI if available).

User: [provides list]

Agent: zotero_list_collections()
→ Get collection key from user

Agent: zotero_import_batch(
  items=[...],
  collection="<key>",
  skipDuplicateCheck=true,
  confirm=false
)
→ Preview

Agent: This will import 20 papers, skipping duplicates. 2 are already in your library. Confirm?

User: "Yes"

Agent: zotero_import_batch(..., confirm=true)
→ Import complete
```

---

## Configuration Troubleshooting

If tools return errors:

1. **"Not configured"** → Run `/zotero-setup`
2. **"API connection failed"** → Verify `apiKey` and `libraryId` in `~/.config/pi-zotero.json`
3. **"BBT file not found"** → Verify `bbtPath` points to valid `.bib` file, or set `useBetterBibtexAPI: true`
4. **"Local API not available"** → Start Zotero desktop with Better BibTeX plugin
5. **"Group library write failed"** → Group libraries are read-only; use user library instead

---

## Data Structure Reference

### ZoteroItem (from Zotero API)

```typescript
{
  key: string;                    // 8-char Zotero item key
  version: number;                // Required for updates
  library: { type: string; id: string; name: string };
  data: {
    key: string;
    itemType: string;
    title: string;
    creators: [{ creatorType: string; firstName: string; lastName: string }];
    abstractNote?: string;
    DOI?: string;
    publicationTitle?: string;   // Journal name
    date?: string;               // Extract year with /\d{4}/
    volume?: string;
    issue?: string;
    pages?: string;
    url?: string;
    tags: [{ tag: string }];
    collections: string[];       // Array of collection keys
  };
  links: {
    alternate: { href: string }; // Web link to item
  };
}
```

### BBTEntry (from Better BibTeX)

```typescript
{
  citeKey: string;       // e.g., "smith2023"
  entryType: string;    // BibTeX type: "article", "book", etc.
  title: string;
  authors: string[];    // "Last, First" format
  year: string;
  abstract?: string;
  doi?: string;
  journal?: string;
  volume?: string;
  number?: string;       // Issue number (field is "number", not "issue")
  pages?: string;
  url?: string;
  tags: string[];        // Plain strings
  raw: string;           // Raw BibTeX entry
}
```
