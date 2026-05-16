# pi-zotero

A pi coding agent extension for managing a Zotero reference library. Provides tools to search, read, create, update, delete, and sync bibliographic references via the Zotero Web API and the local Zotero application.

---

## Setup

Run `/zotero-setup` in the agent to launch the interactive configuration wizard. Alternatively, set environment variables or edit `~/.config/pi-zotero.json` directly.

### Configuration file: `~/.config/pi-zotero.json`

```json
{
  "apiKey": "your-zotero-api-key",
  "libraryId": "12345678",
  "libraryType": "user",
  "bbtPath": "/path/to/library.bib",
  "useBetterBibtexAPI": false,
  "groupLibraryIds": []
}
```

### Environment variables (alternative)

| Variable | Description |
|---|---|
| `ZOTERO_API_KEY` | Zotero API key from zotero.org/settings/keys |
| `ZOTERO_LIBRARY_ID` | Numeric user library ID |
| `ZOTERO_LIBRARY_TYPE` | `user`, `group`, or `both` |
| `ZOTERO_BBT_PATH` | Path to Better BibTeX `.bib` export file |
| `ZOTERO_USE_BBT_API` | `true` to use Zotero local API instead of a file |
| `ZOTERO_GROUP_LIBRARY_IDS` | Comma-separated group library IDs (for `libraryType=both`) |

### Getting API credentials

1. Go to zotero.org/settings/keys
2. Create a new private key with "Library Read/Write" enabled
3. Copy the API key and the numeric Library ID shown on that page

### Library type modes

| Mode | Description |
|---|---|
| `user` | Single personal library — full read/write |
| `group` | Group library — read-only (writes are blocked) |
| `both` | Personal library (read/write) + one or more group libraries (read-only) |

### Better BibTeX (BBT) source

The extension uses a local bibliographic data source for fast offline search. Two options:

1. **BBT local API** (`useBetterBibtexAPI: true`) — queries the running Zotero desktop app at `http://localhost:23119`. Requires Zotero to be open with the Better BibTeX plugin installed.
2. **BBT `.bib` file** (`bbtPath`) — reads a static export file. Works when Zotero is closed.

---

## Key concepts for agents

### Item keys vs. cite keys

These are two completely different identifiers and must not be confused:

| | Zotero item key | BBT cite key |
|---|---|---|
| **Format** | 8-char uppercase alphanumeric — `YTP3BY9P` | Human-readable — `smith2023` |
| **Assigned by** | Zotero (auto-generated) | Better BibTeX plugin (author+year pattern) |
| **Used for** | `zotero_update_item`, `zotero_delete_item`, `addToCollection` | `zotero_search` (BBT source), `zotero_get_entry`, `zotero_sync` |
| **Available** | Always | Only when BBT is configured |

**Searching returns different key types depending on source:**
- A `[BBT]` result has a **cite key** (e.g., `smith2023`) in the `citeKey` field.
- A `[Zotero]` result has a **Zotero item key** (e.g., `YTP3BY9P`) in the `citeKey` field of the result list — but it is *not* a BibTeX cite key; it is the Zotero internal key.

**Converting cite key → Zotero item key:** Call `zotero_get_entry(key="smith2023", source="zotero")` and read `details.entry.key` from the response. This is required before calling `zotero_update_item` or `zotero_delete_item` with a cite key you found in BBT.

### Confirm pattern — always dry-run first

All write operations default to a **dry run** (`confirm=false`) that shows what would happen without making any changes. Always present the dry-run result to the user and call again with `confirm=true` only after they agree.

### Collection resolution

Wherever a `collection` parameter appears, pass any of:
- The collection's display name — e.g., `"PhD"` (resolved via lookup)
- A slash-separated path — e.g., `"PhD/Papers"` (resolves the "Papers" subcollection inside "PhD")
- The 8-character Zotero collection key — e.g., `"GCJ7XRBU"` (used directly, fastest)

Use `zotero_list_collections` to see the full hierarchy and copy keys before writing.

### Author name formats

Both formats are accepted:
- `"Last, First"` — e.g., `"Smith, John"` (preferred)
- `"First Last"` — e.g., `"John Smith"`

---

## Tools

### `zotero_search`

Search for references across BBT and/or Zotero.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `query` | string | required | Title, author, keywords, DOI, or cite key |
| `source` | `bbt` \| `local` \| `web` \| `all` | `all` | Where to search |
| `limit` | number | `10` | Maximum results (1–50) |
| `includeAbstract` | boolean | `false` | Include abstract in results |

**Source notes:**
- `bbt` — searches locally without any network request; fastest option and supports cite key queries
- `all` — tries all available sources and deduplicates by title

**Returns:** Numbered list with title, year, authors, cite key, and source tag (`[BBT]` or `[Zotero]`). `details.results` is a structured array of `{ type, citeKey, title }`.

---

### `zotero_list_collections`

List all collections and subcollections as an indented hierarchy tree.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `showItemCounts` | boolean | `true` | Show item and subcollection counts next to each name |
| `maxDepth` | number | `0` | Maximum depth to display; `0` means unlimited |

**Output format:**

```
Collections (12 total):

Literature  (2 subcollections)  [key: AB3FG71K]
  PhD  (8 items)  [key: CD9PQ22R]
  MSc  (6 items)  [key: EF5XY33T]
Misc  (3 items)  [key: GH7WZ44U]
```

**Returns:** Formatted tree. `details.collections` is a flat array of `{ key, name, parentKey, numItems, numSubcollections }` for programmatic use.

**Agent tip:** Call this first when you need to file an item into a specific subcollection. Copy the 8-char key from the output to avoid name-lookup overhead, or use the path `"Literature/PhD"` directly in other tools.

---

### `zotero_get_entry`

Retrieve full details of a single reference.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `key` | string | required | BBT cite key or Zotero item key |
| `source` | `bbt` \| `zotero` \| `auto` | `auto` | Where to look |
| `format` | `json` \| `bibtex` \| `citation` \| `summary` | `json` | Output format |

**Format options:**
- `json` — full raw object (best for programmatic use; contains `key`, `version`, and full `data`)
- `bibtex` — BibTeX-formatted string
- `citation` — one-line string: `Authors (Year) Title, Journal`
- `summary` — structured markdown with all available fields

**Source resolution order for `auto`:** BBT → Zotero local API → Zotero Web API → group libraries.

**Returns:** Formatted entry. `details.source` is `"bbt"` or `"zotero"`. `details.entry` contains the raw object. The Zotero item key is at `details.entry.key` (for `source="zotero"`).

---

### `zotero_create_item`

Create a single new item in the Zotero user library.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `title` | string | required | Item title |
| `authors` | string[] | `[]` | Author names |
| `year` | string | — | Publication year |
| `doi` | string | — | DOI |
| `abstract` | string | — | Abstract text |
| `journal` | string | — | Journal or publication title |
| `volume` | string | — | Volume |
| `issue` | string | — | Issue number |
| `pages` | string | — | Page range (e.g., `"123–145"`) |
| `url` | string | — | URL |
| `itemType` | enum | `journalArticle` | Zotero item type |
| `citeKey` | string | — | Pre-fill fields from matching BBT entry |
| `collection` | string | — | Collection name or 8-char key |
| `tags` | string[] | `[]` | Tags to apply |
| `confirm` | boolean | `false` | Set `true` to actually create |

**Valid `itemType` values:** `journalArticle`, `book`, `bookSection`, `conferencePaper`, `thesis`, `report`, `webpage`, `document`, `presentation`, `manuscript`

**Duplicate check:** Before creating, searches by DOI (if provided) then title. If a match exists, returns the existing item without creating a duplicate.

**BBT pre-fill:** When `citeKey` is given, any unset fields are filled from the matching BBT entry. Authors and tags are merged.

**Dry run response:** Shows all fields that would be set. `details.dryRun = true`.

**Created response:** `details.created = true`, `details.itemKey` holds the new 8-char Zotero key. `content` includes a link to view the item in Zotero.

> **Note:** Only works with user libraries. Group libraries are read-only.

---

### `zotero_import_batch`

Import multiple items in a single batched API call. Use this instead of repeated `zotero_create_item` when adding more than ~3 items.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `items` | object[] | required | Items to import (same fields as `zotero_create_item`, without `citeKey`) |
| `collection` | string | — | Collection applied to **all** items |
| `tags` | string[] | `[]` | Tags applied to **all** items (merged with per-item tags) |
| `skipDuplicateCheck` | boolean | `false` | Skip per-item DOI/title search (much faster for large imports) |
| `confirm` | boolean | `false` | Set `true` to actually import |

**Each item in `items` accepts:** `title`, `authors`, `year`, `doi`, `abstract`, `journal`, `volume`, `issue`, `pages`, `url`, `itemType`, `tags`

**Performance comparison for 100 items:**

| Approach | API requests |
|---|---|
| `zotero_create_item` × 100 | ~500 |
| `zotero_import_batch` with duplicate check | ~202 |
| `zotero_import_batch` with `skipDuplicateCheck=true` | **3** |

The Zotero API accepts up to 50 items per POST. This tool sends items in chunks of 50 and reads created item data directly from the batch response (no follow-up GETs).

**Dry run response:** Preview of up to 20 items. `details.toImport` shows count after duplicate filtering.

**Import response:** `details.created`, `details.failed`, `details.createdKeys` (array of new keys), `details.failures` (per-item errors).

---

### `zotero_update_item`

Update metadata, tags, or collections of an existing item.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `itemKey` | string | required | Zotero item key (8-char) |
| `title` | string | — | New title |
| `authors` | string[] | — | Replace all authors |
| `year` | string | — | New year |
| `doi` | string | — | New DOI |
| `abstract` | string | — | New abstract |
| `journal` | string | — | New journal |
| `volume` | string | — | New volume |
| `issue` | string | — | New issue |
| `pages` | string | — | New pages |
| `url` | string | — | New URL |
| `addTags` | string[] | `[]` | Tags to add (existing tags preserved) |
| `removeTags` | string[] | `[]` | Tags to remove |
| `setTags` | string[] | — | Replace all tags with this list |
| `addToCollection` | string | — | Collection name or key to add the item to |
| `removeFromCollection` | string | — | Collection name or key to remove the item from |
| `confirm` | boolean | `false` | Set `true` to apply changes |

**Behavior:** Only changed fields are sent in the update request. If no field differs from the current value, returns "No changes to apply" without making an API call.

**Dry run response:** Each change shown as `field: "old" -> "new"`. `details.updates` contains the prepared patch.

**Updated response:** `details.updated = true`, `details.itemKey`, new `version` number.

---

### `zotero_delete_item`

Move an item to the Zotero trash.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `itemKey` | string | required | Zotero item key |
| `confirm` | boolean | required | Must be `true` to delete |
| `force` | boolean | `false` | Skip the confirmation preview |

**Without `confirm=true`:** Returns a preview with title, authors, year, and a note that items can be recovered from trash within 30 days.

**Recovery:** Zotero desktop → Trash → right-click → Restore to Library.

> **Note:** Only works with user libraries.

---

### `zotero_sync`

Sync entries from the BBT source into the Zotero library. Identifies new items to create and optionally updates existing items that differ from BBT.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `citeKeys` | string[] | — | Specific keys to sync; syncs all entries if omitted |
| `collection` | string | — | Collection to place newly created items in |
| `dryRun` | boolean | `true` | Preview changes without executing |
| `updateExisting` | boolean | `false` | Update Zotero items where BBT data differs |

**Process:**
1. Loads BBT entries (all or the listed keys)
2. Fetches up to 1000 existing Zotero items
3. Matches entries by DOI first, then by title
4. Unmatched entries → `toCreate`; matched → `toUpdate` (if `updateExisting=true`) or `toSkip`

**Dry run response:** Report with counts and a preview of the first 10 items per category.

**Sync response:** Final counts for created, updated, skipped, and errors. Individual errors include the cite key and message.

> **Tip:** For first-time bulk imports, `zotero_import_batch` with `skipDuplicateCheck=true` is significantly faster. Use `zotero_sync` for ongoing synchronization of a curated BBT file.

---

## Common workflows

### Find a paper and get its details

```
zotero_search(query="neural scaling laws", limit=5)
# Pick a result, get full details:
zotero_get_entry(key="ABC12345", format="summary")
```

### Add a single paper

```
zotero_create_item(title="...", doi="10.1234/...", authors=["Smith, John"], year="2023", confirm=false)
# Review, then confirm:
zotero_create_item(..., confirm=true)
```

### Bulk-import a reading list

```
zotero_import_batch(
  items=[
    {title: "Paper A", authors: ["Smith, J"], year: "2022", doi: "10.1/a"},
    {title: "Paper B", authors: ["Jones, M"], year: "2023"}
  ],
  collection="PhD",
  skipDuplicateCheck=true,
  confirm=false
)
# Review preview, then confirm:
zotero_import_batch(..., confirm=true)
```

### Tag and file an existing item

```
# Find the item key via search, then:
zotero_update_item(itemKey="YTP3BY9P", addTags=["read", "important"], addToCollection="GCJ7XRBU", confirm=true)
```

### Sync BBT file to Zotero

```
zotero_sync(dryRun=true)
# If satisfied:
zotero_sync(dryRun=false)
```

---

## Data structures

### ZoteroItem

Returned by search, get, create, and update operations.

```typescript
{
  key: string;               // 8-char item key, e.g. "YTP3BY9P"
  version: number;           // Required for optimistic-lock updates
  library: { type, id, name };
  data: {
    key: string;
    itemType: string;
    title: string;
    creators: [{ creatorType: string; firstName: string; lastName: string }];
    abstractNote?: string;
    DOI?: string;
    publicationTitle?: string;  // Journal name
    date?: string;              // Full date string; use /\d{4}/ to extract year
    volume?: string;
    issue?: string;
    pages?: string;
    url?: string;
    tags: [{ tag: string }];
    collections: string[];      // Array of collection keys
  };
  links: {
    alternate: { href: string }; // Link to item on zotero.org
  };
}
```

### BBTEntry

Returned by BBT search and get operations.

```typescript
{
  citeKey: string;    // e.g. "smith2023"
  entryType: string;  // BibTeX type: "article", "book", "inproceedings", ...
  title: string;
  authors: string[];  // "Last, First" format
  year: string;
  abstract?: string;
  doi?: string;
  journal?: string;
  volume?: string;
  number?: string;    // Issue number (note: field is "number", not "issue")
  pages?: string;
  url?: string;
  tags: string[];     // Plain strings (not objects)
  raw: string;        // Raw BibTeX entry string
}
```

---

## Limitations

- **Group libraries are read-only.** Create, update, delete, sync, and import only operate on the user library.
- **`zotero_sync` fetches at most 1000 items** for duplicate detection. Libraries with more than 1000 items may see false "new item" classifications.
- **BBT local API requires Zotero to be running.** If Zotero is closed, the extension falls back to the `.bib` file if one is configured.
- **Batch import does not support `citeKey` pre-fill.** Use `zotero_create_item` for single items that should be pre-populated from BBT.
- **`itemType: "misc"` is not valid in Zotero.** Use `document`, `webpage`, or `manuscript` instead.

## File structure

```
pi-zotero/
├── index.ts          # Extension entry point and commands
├── config.ts         # Configuration loading and saving
├── bbt.ts            # Better BibTeX parser (file and local API)
├── zotero-api.ts     # Zotero API client (local + web)
├── tools/
│   ├── index.ts      # Re-exports all tools
│   ├── search.ts     # zotero_search
│   ├── get.ts        # zotero_get_entry
│   ├── create.ts     # zotero_create_item
│   ├── update.ts     # zotero_update_item
│   ├── delete.ts     # zotero_delete_item
│   ├── sync.ts       # zotero_sync
│   ├── import.ts     # zotero_import_batch
│   └── collections.ts # zotero_list_collections
├── package.json
└── tsconfig.json
```
