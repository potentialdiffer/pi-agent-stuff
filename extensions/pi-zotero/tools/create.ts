import { Type } from 'typebox';
import { Static } from 'typebox';
import { ZoteroClient, ZoteroItem } from '../zotero-api';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

const CreateItemParams = Type.Object({
  title: Type.String({ description: 'Title of the item' }),
  authors: Type.Optional(Type.Array(
    Type.String({ description: 'Author name (format: "Last, First" or "First Last")' }),
    { description: 'List of authors' }
  )),
  year: Type.Optional(Type.String({ description: 'Publication year' })),
  doi: Type.Optional(Type.String({ description: 'DOI of the publication' })),
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
  ], { description: 'Zotero item type' })),
  collection: Type.Optional(Type.String({ description: 'Collection name, path (e.g. "Parent/Child"), or 8-char key to add the item to' })),
  tags: Type.Optional(Type.Array(
    Type.String({ description: 'Tag name' }),
    { description: 'List of tags' }
  )),
  confirm: Type.Optional(Type.Boolean({ 
    description: 'Confirm creation (required for actual creation)',
    default: false 
  })),
});

type CreateItemParams = Static<typeof CreateItemParams>;

export function registerCreateTool(pi: ExtensionAPI, zoteroClient: ZoteroClient) {
  pi.registerTool({
    name: 'zotero_create_item',
    label: 'Create Zotero Item',
    description: 'Create a new item in Zotero library',
    promptSnippet: 'Create new references, papers, or books in Zotero',
    promptGuidelines: [
      'Use zotero_create_item when the user wants to add a new reference to their Zotero library',
      'Always check for duplicates first using DOI or title',
      'Set confirm=true to actually create the item (dry run by default)',
      'Requires Zotero API key and user library (not group libraries)',
    ],
    parameters: CreateItemParams,
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const {
        title,
        authors = [],
        year,
        doi,
        abstract,
        journal,
        volume,
        issue,
        pages,
        url,
        itemType = 'journalArticle',
        collection,
        tags = [],
        confirm = false,
      } = params;

      try {
        onUpdate?.({ content: [{ type: 'text', text: `Preparing to create item: ${title}` }] });
        // Check library type
        const libraryType = await zoteroClient.checkLibraryType();
        if (libraryType !== 'user') {
          return {
            content: [{ type: 'text', text: 'ERROR: Cannot create items in group libraries. Only user libraries are supported for writes.' }],
            details: { error: 'group_library_not_allowed' },
            isError: true,
          };
        }

        // Check for duplicates
        try { onUpdate?.({ content: [{ type: 'text', text: 'Checking for duplicates...' }] }); } catch (e) {}

        let duplicateFound = false;
        let duplicateKey: string | null = null;

        if (doi) {
          const existing = await zoteroClient.searchWeb(`DOI:"${doi}"`, 1);
          if (existing.length > 0) {
            duplicateFound = true;
            duplicateKey = existing[0].key;
          }
        }

        if (!duplicateFound && title) {
          const existing = await zoteroClient.searchWeb(`title:"${title}"`, 1);
          if (existing.length > 0) {
            duplicateFound = true;
            duplicateKey = existing[0].key;
          }
        }

        if (duplicateFound) {
          const duplicate = await zoteroClient.getItemWeb(duplicateKey!);
          return {
            content: [
              { type: 'text', text: `Duplicate found! An item with this DOI or title already exists in your library.` },
              { type: 'text', text: `\nExisting item: ${duplicate?.data.title || duplicateKey} (${duplicateKey})` },
            ],
            details: {
              duplicate: true,
              duplicateKey,
              duplicateTitle: duplicate?.data.title,
            },
            isError: false,
          };
        }

        // Build item data
        const itemData: any = {
          itemType,
          title,
          abstractNote: abstract,
          DOI: doi,
          date: year,
          url,
        };

        if (journal) itemData.publicationTitle = journal;
        if (volume) itemData.volume = volume;
        if (issue) itemData.issue = issue;
        if (pages) itemData.pages = pages;

        // Map authors
        if (authors.length > 0) {
          itemData.creators = authors.map(author => {
            // Parse "Last, First" format
            const commaParts = author.split(', ');
            if (commaParts.length === 2) {
              return {
                creatorType: 'author',
                firstName: commaParts[1],
                lastName: commaParts[0],
              };
            }
            // Parse "First Last" format
            const spaceParts = author.trim().split(/\s+/);
            if (spaceParts.length >= 2) {
              return {
                creatorType: 'author',
                firstName: spaceParts.slice(0, -1).join(' '),
                lastName: spaceParts[spaceParts.length - 1],
              };
            }
            return {
              creatorType: 'author',
              firstName: '',
              lastName: author,
            };
          });
        }

        // Map tags
        if (tags.length > 0) {
          itemData.tags = tags.map(tag => ({ tag }));
        }

        // Map collection — accept both collection names and Zotero key IDs
        if (collection) {
          let collectionKey: string | null = null;
          if (/^[A-Z0-9]{8}$/.test(collection)) {
            collectionKey = collection;
          } else {
            collectionKey = await zoteroClient.getCollectionByPath(collection);
          }
          if (collectionKey) {
            itemData.collections = [collectionKey];
          } else {
            try { onUpdate?.({ content: [{ type: 'text', text: `Warning: Collection "${collection}" not found, item will not be added to a collection` }] }); } catch (e) {}
          }
        }

        if (!confirm) {
          // Dry run - show what would be created
          try { onUpdate?.({ content: [{ type: 'text', text: 'Dry run - here is what would be created:' }] }); } catch (e) {}
          
          return {
            content: [
              { type: 'text', text: `**Item to create:**\n` },
              { type: 'text', text: `Title: ${itemData.title}\n` },
              { type: 'text', text: `Type: ${itemData.itemType}\n` },
              { type: 'text', text: `Authors: ${itemData.creators?.map((c: any) => `${c.firstName} ${c.lastName}`.trim()).join(', ') || 'None'}\n` },
              { type: 'text', text: `Year: ${itemData.date || 'Not set'}\n` },
              { type: 'text', text: `DOI: ${itemData.DOI || 'Not set'}\n` },
              { type: 'text', text: `Journal: ${itemData.publicationTitle || 'Not set'}\n` },
              { type: 'text', text: `Collection: ${collection || 'Not set'}\n` },
              { type: 'text', text: `Tags: ${itemData.tags?.map((t: any) => t.tag).join(', ') || 'None'}\n` },
              { type: 'text', text: `\nSet confirm=true to actually create this item.` },
            ],
            details: {
              dryRun: true,
              item: itemData,
            },
          };
        }

        // Actually create the item
        try { onUpdate?.({ content: [{ type: 'text', text: 'Creating item in Zotero...' }] }); } catch (e) {}

        const createdItem = await zoteroClient.createItem(itemData);

        return {
          content: [
            { type: 'text', text: `✓ Item created successfully!\n` },
            { type: 'text', text: `Key: ${createdItem.key}\n` },
            { type: 'text', text: `Title: ${createdItem.data.title}\n` },
            { type: 'text', text: `View in Zotero: ${createdItem.links.alternate.href}` },
          ],
          details: {
            created: true,
            itemKey: createdItem.key,
            version: createdItem.version,
            item: createdItem,
          },
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Failed to create item: ${error instanceof Error ? error.message : String(error)}` }],
          details: { error: true },
          isError: true,
        };
      }
    },
  });
}
