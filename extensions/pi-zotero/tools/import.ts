import { Type } from 'typebox';
import { Static } from 'typebox';
import { ZoteroClient } from '../zotero-api';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

const ItemSchema = Type.Object({
  title: Type.String({ description: 'Title of the item' }),
  authors: Type.Optional(Type.Array(
    Type.String({ description: 'Author name (format: "Last, First" or "First Last")' }),
  )),
  year: Type.Optional(Type.String({ description: 'Publication year' })),
  doi: Type.Optional(Type.String({ description: 'DOI' })),
  abstract: Type.Optional(Type.String({ description: 'Abstract' })),
  journal: Type.Optional(Type.String({ description: 'Journal or publication title' })),
  volume: Type.Optional(Type.String({ description: 'Volume' })),
  issue: Type.Optional(Type.String({ description: 'Issue number' })),
  pages: Type.Optional(Type.String({ description: 'Page range' })),
  url: Type.Optional(Type.String({ description: 'URL' })),
  itemType: Type.Optional(Type.Union([
    Type.Literal('journalArticle'),
    Type.Literal('book'),
    Type.Literal('bookSection'),
    Type.Literal('conferencePaper'),
    Type.Literal('thesis'),
    Type.Literal('report'),
    Type.Literal('webpage'),
    Type.Literal('document'),
    Type.Literal('presentation'),
    Type.Literal('manuscript'),
  ], { description: 'Zotero item type (default: journalArticle)' })),
  tags: Type.Optional(Type.Array(Type.String({ description: 'Tag name' }))),
});

const BatchImportParams = Type.Object({
  items: Type.Array(ItemSchema, { description: 'List of items to import (up to 50 per batch)' }),
  collection: Type.Optional(Type.String({ description: 'Collection name, path (e.g. "Parent/Child"), or key (8-char ID) to add all items to' })),
  tags: Type.Optional(Type.Array(
    Type.String({ description: 'Tag to apply to all items' }),
    { description: 'Tags applied to every item in the batch' }
  )),
  skipDuplicateCheck: Type.Optional(Type.Boolean({
    description: 'Skip per-item duplicate check (faster for large imports)',
    default: false,
  })),
  confirm: Type.Optional(Type.Boolean({
    description: 'Confirm import — set to true to actually create items',
    default: false,
  })),
});

type BatchImportParams = Static<typeof BatchImportParams>;

function parseAuthors(authors: string[] = []) {
  return authors.map(author => {
    const commaParts = author.split(', ');
    if (commaParts.length === 2) {
      return { creatorType: 'author', firstName: commaParts[1], lastName: commaParts[0] };
    }
    const spaceParts = author.trim().split(/\s+/);
    if (spaceParts.length >= 2) {
      return { creatorType: 'author', firstName: spaceParts.slice(0, -1).join(' '), lastName: spaceParts[spaceParts.length - 1] };
    }
    return { creatorType: 'author', firstName: '', lastName: author };
  });
}

export function registerImportTool(pi: ExtensionAPI, zoteroClient: ZoteroClient) {
  pi.registerTool({
    name: 'zotero_import_batch',
    label: 'Batch Import to Zotero',
    description: 'Import multiple items into Zotero in a single batch request (up to 50 per API call)',
    promptSnippet: 'Import many references into Zotero at once efficiently',
    promptGuidelines: [
      'Use zotero_import_batch when the user wants to add multiple references to Zotero',
      'Much faster than zotero_create_item for more than ~3 items (50 items per API call instead of 5 calls per item)',
      'Set confirm=true to actually import; dry run by default',
      'Set skipDuplicateCheck=true for large imports when duplicates are unlikely',
    ],
    parameters: BatchImportParams,
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const {
        items,
        collection,
        tags: globalTags = [],
        skipDuplicateCheck = false,
        confirm = false,
      } = params;

      try {
        if (items.length === 0) {
          return {
            content: [{ type: 'text', text: 'No items provided.' }],
            details: { count: 0 },
          };
        }

        onUpdate?.({ content: [{ type: 'text', text: `Preparing ${items.length} item(s) for import...` }] });

        const libraryType = await zoteroClient.checkLibraryType();
        if (libraryType !== 'user') {
          return {
            content: [{ type: 'text', text: 'ERROR: Cannot create items in group libraries.' }],
            details: { error: 'group_library_not_allowed' },
            isError: true,
          };
        }

        // Resolve collection once
        let collectionKey: string | null = null;
        if (collection) {
          if (/^[A-Z0-9]{8}$/.test(collection)) {
            collectionKey = collection;
          } else {
            collectionKey = await zoteroClient.getCollectionByPath(collection);
            if (!collectionKey) {
              onUpdate?.({ content: [{ type: 'text', text: `Warning: Collection "${collection}" not found, items will not be added to a collection` }] });
            }
          }
        }

        // Build Zotero item data for each entry
        const itemDataList: any[] = items.map(item => {
          const data: any = {
            itemType: item.itemType || 'journalArticle',
            title: item.title,
            abstractNote: item.abstract,
            DOI: item.doi,
            date: item.year,
            url: item.url,
          };

          if (item.journal) data.publicationTitle = item.journal;
          if (item.volume) data.volume = item.volume;
          if (item.issue) data.issue = item.issue;
          if (item.pages) data.pages = item.pages;

          if (item.authors && item.authors.length > 0) {
            data.creators = parseAuthors(item.authors);
          }

          // Merge per-item tags with global tags
          const allTags = new Set([...globalTags, ...(item.tags || [])]);
          if (allTags.size > 0) {
            data.tags = Array.from(allTags).map(tag => ({ tag }));
          }

          if (collectionKey) {
            data.collections = [collectionKey];
          }

          return data;
        });

        // Duplicate check (optional, expensive for large batches)
        let skippedDuplicates: string[] = [];
        let itemsToImport = itemDataList;

        if (!skipDuplicateCheck) {
          onUpdate?.({ content: [{ type: 'text', text: `Checking for duplicates (${items.length} items)...` }] });
          const checked: any[] = [];
          for (const [i, item] of itemDataList.entries()) {
            let isDuplicate = false;
            if (item.DOI) {
              const existing = await zoteroClient.searchWeb(`DOI:"${item.DOI}"`, 1);
              if (existing.length > 0) isDuplicate = true;
            }
            if (!isDuplicate && item.title) {
              const existing = await zoteroClient.searchWeb(`title:"${item.title}"`, 1);
              if (existing.length > 0) isDuplicate = true;
            }
            if (isDuplicate) {
              skippedDuplicates.push(item.title || `item ${i}`);
            } else {
              checked.push(item);
            }
          }
          itemsToImport = checked;
        }

        if (!confirm) {
          // Dry run
          const lines = [
            `**Batch import preview (${itemsToImport.length} items):**\n`,
            ...(skippedDuplicates.length > 0 ? [`*Skipped as duplicates: ${skippedDuplicates.join(', ')}*\n\n`] : []),
            ...itemsToImport.slice(0, 20).map((item, i) => {
              const authors = item.creators?.map((c: any) => `${c.firstName} ${c.lastName}`.trim()).join(', ') || '';
              return `${i + 1}. **${item.title}** (${item.date || '?'}) — ${authors || 'no authors'} [${item.itemType}]\n`;
            }),
            ...(itemsToImport.length > 20 ? [`... and ${itemsToImport.length - 20} more\n`] : []),
            `\nCollection: ${collection || 'none'}\n`,
            `\nSet confirm=true to import these ${itemsToImport.length} items.`,
          ];

          return {
            content: lines.map(text => ({ type: 'text', text })),
            details: {
              dryRun: true,
              total: items.length,
              toImport: itemsToImport.length,
              skippedDuplicates,
            },
          };
        }

        if (itemsToImport.length === 0) {
          return {
            content: [{ type: 'text', text: `All ${items.length} items were duplicates — nothing to import.` }],
            details: { skippedDuplicates, created: 0 },
          };
        }

        onUpdate?.({ content: [{ type: 'text', text: `Importing ${itemsToImport.length} items in batches of 50...` }] });

        const result = await zoteroClient.createItemsBatch(itemsToImport);

        const summary = [
          `✓ Import complete!\n`,
          `Created: ${result.successful.length} / ${itemsToImport.length}\n`,
          ...(skippedDuplicates.length > 0 ? [`Duplicates skipped: ${skippedDuplicates.length}\n`] : []),
          ...(result.failed.length > 0 ? [
            `\nFailed (${result.failed.length}):\n`,
            ...result.failed.map(f => `  - ${f.title || `item ${f.index}`}: ${f.message}\n`),
          ] : []),
        ];

        return {
          content: summary.map(text => ({ type: 'text', text })),
          details: {
            created: result.successful.length,
            failed: result.failed.length,
            skippedDuplicates: skippedDuplicates.length,
            createdKeys: result.successful.map(i => i.key),
            failures: result.failed,
          },
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Batch import failed: ${error instanceof Error ? error.message : String(error)}` }],
          details: { error: true },
          isError: true,
        };
      }
    },
  });
}
