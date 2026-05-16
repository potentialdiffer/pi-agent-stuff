import { Type } from 'typebox';
import { Static } from 'typebox';
import { ZoteroClient } from '../zotero-api';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

const UpdateItemParams = Type.Object({
  itemKey: Type.String({ description: 'Zotero item key to update' }),
  title: Type.Optional(Type.String({ description: 'New title' })),
  authors: Type.Optional(Type.Array(
    Type.String({ description: 'Author name (format: "Last, First" or "First Last")' }),
    { description: 'Updated list of authors' }
  )),
  year: Type.Optional(Type.String({ description: 'Updated publication year' })),
  doi: Type.Optional(Type.String({ description: 'Updated DOI' })),
  abstract: Type.Optional(Type.String({ description: 'Updated abstract' })),
  journal: Type.Optional(Type.String({ description: 'Updated journal title' })),
  volume: Type.Optional(Type.String({ description: 'Updated volume' })),
  issue: Type.Optional(Type.String({ description: 'Updated issue number' })),
  pages: Type.Optional(Type.String({ description: 'Updated page range' })),
  url: Type.Optional(Type.String({ description: 'Updated URL' })),
  addTags: Type.Optional(Type.Array(
    Type.String({ description: 'Tag to add' }),
    { description: 'Tags to add (existing tags preserved)' }
  )),
  removeTags: Type.Optional(Type.Array(
    Type.String({ description: 'Tag to remove' }),
    { description: 'Tags to remove' }
  )),
  setTags: Type.Optional(Type.Array(
    Type.String({ description: 'Tag name' }),
    { description: 'Replace all tags with these' }
  )),
  addToCollection: Type.Optional(Type.String({ description: 'Collection name, path (e.g. "Parent/Child"), or key (8-char ID) to add item to' })),
  removeFromCollection: Type.Optional(Type.String({ description: 'Collection name, path (e.g. "Parent/Child"), or key (8-char ID) to remove item from' })),
  confirm: Type.Optional(Type.Boolean({ 
    description: 'Confirm update (required for actual update)',
    default: false 
  })),
});

type UpdateItemParams = Static<typeof UpdateItemParams>;

export function registerUpdateTool(pi: ExtensionAPI, zoteroClient: ZoteroClient) {
  pi.registerTool({
    name: 'zotero_update_item',
    label: 'Update Zotero Item',
    description: 'Update an existing item in Zotero library',
    promptSnippet: 'Update metadata, tags, or collections for existing Zotero items',
    promptGuidelines: [
      'Use zotero_update_item when the user wants to modify an existing reference in Zotero',
      'Always provide the itemKey to identify which item to update',
      'Set confirm=true to actually update the item (dry run by default)',
      'Requires Zotero API key and user library (not group libraries)',
    ],
    parameters: UpdateItemParams,
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const {
        itemKey,
        title,
        authors,
        year,
        doi,
        abstract,
        journal,
        volume,
        issue,
        pages,
        url,
        addTags = [],
        removeTags = [],
        setTags,
        addToCollection,
        removeFromCollection,
        confirm = false,
      } = params;

      try {
        onUpdate?.({ content: [{ type: 'text', text: `Preparing to update item: ${itemKey}` }] });
        // Check library type
        const libraryType = await zoteroClient.checkLibraryType();
        if (libraryType !== 'user') {
          return {
            content: [{ type: 'text', text: 'ERROR: Cannot update items in group libraries. Only user libraries are supported for writes.' }],
            details: { error: 'group_library_not_allowed' },
            isError: true,
          };
        }

        // Get current item
        try { onUpdate?.({ content: [{ type: 'text', text: 'Fetching current item...' }] }); } catch (e) {}

        const currentItem = await zoteroClient.getItemWeb(itemKey);
        if (!currentItem) {
          return {
            content: [{ type: 'text', text: `Item with key "${itemKey}" not found` }],
            details: { error: 'item_not_found', itemKey },
            isError: true,
          };
        }

        // Build updates
        const updates: any = {};
        const currentData = currentItem.data;

        if (title !== undefined && title !== currentData.title) {
          updates.title = title;
        }
        if (year !== undefined && year !== currentData.date) {
          updates.date = year;
        }
        if (doi !== undefined && doi !== currentData.DOI) {
          updates.DOI = doi;
        }
        if (abstract !== undefined && abstract !== currentData.abstractNote) {
          updates.abstractNote = abstract;
        }
        if (journal !== undefined && journal !== currentData.publicationTitle) {
          updates.publicationTitle = journal;
        }
        if (volume !== undefined && volume !== currentData.volume) {
          updates.volume = volume;
        }
        if (issue !== undefined && issue !== currentData.issue) {
          updates.issue = issue;
        }
        if (pages !== undefined && pages !== currentData.pages) {
          updates.pages = pages;
        }
        if (url !== undefined && url !== currentData.url) {
          updates.url = url;
        }

        // Handle authors
        if (authors !== undefined && authors.length > 0) {
          updates.creators = authors.map(author => {
            const commaParts = author.split(', ');
            if (commaParts.length === 2) {
              return {
                creatorType: 'author',
                firstName: commaParts[1],
                lastName: commaParts[0],
              };
            }
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

        // Handle tags
        const currentTags = new Set((currentData.tags || []).map((t: any) => t.tag));
        
        if (setTags) {
          updates.tags = setTags.map(tag => ({ tag }));
        } else {
          // Add tags
          for (const tag of addTags) {
            if (!currentTags.has(tag)) {
              currentTags.add(tag);
            }
          }
          // Remove tags
          for (const tag of removeTags) {
            currentTags.delete(tag);
          }
          
          if (addTags.length > 0 || removeTags.length > 0) {
            updates.tags = Array.from(currentTags).map(tag => ({ tag }));
          }
        }

        // Handle collections
        const currentCollections = new Set(currentData.collections || []);

        const resolveCollectionKey = async (nameOrKey: string): Promise<string | null> => {
          // Zotero item keys are 8 uppercase alphanumeric characters
          if (/^[A-Z0-9]{8}$/.test(nameOrKey)) return nameOrKey;
          return zoteroClient.getCollectionByPath(nameOrKey);
        };

        if (addToCollection) {
          const collectionKey = await resolveCollectionKey(addToCollection);
          if (collectionKey && !currentCollections.has(collectionKey)) {
            currentCollections.add(collectionKey);
            updates.collections = Array.from(currentCollections);
          }
        }

        if (removeFromCollection) {
          const collectionKey = await resolveCollectionKey(removeFromCollection);
          if (collectionKey && currentCollections.has(collectionKey)) {
            currentCollections.delete(collectionKey);
            updates.collections = Array.from(currentCollections);
          }
        }

        // Check if there are any updates
        if (Object.keys(updates).length === 0) {
          return {
            content: [{ type: 'text', text: 'No changes to apply. All provided values match current item.' }],
            details: { noChanges: true, itemKey },
          };
        }

        if (!confirm) {
          // Dry run
          try { onUpdate?.({ content: [{ type: 'text', text: 'Dry run - here are the changes that would be applied:' }] }); } catch (e) {}
          
          const changes: string[] = [];
          if (updates.title !== undefined) changes.push(`Title: "${currentData.title}" -> "${updates.title}"`);
          if (updates.date !== undefined) changes.push(`Year: "${currentData.date}" -> "${updates.date}"`);
          if (updates.DOI !== undefined) changes.push(`DOI: "${currentData.DOI}" -> "${updates.DOI}"`);
          if (updates.abstractNote !== undefined) changes.push(`Abstract: Updated`);
          if (updates.publicationTitle !== undefined) changes.push(`Journal: "${currentData.publicationTitle}" -> "${updates.publicationTitle}"`);
          if (updates.volume !== undefined) changes.push(`Volume: "${currentData.volume}" -> "${updates.volume}"`);
          if (updates.issue !== undefined) changes.push(`Issue: "${currentData.issue}" -> "${updates.issue}"`);
          if (updates.pages !== undefined) changes.push(`Pages: "${currentData.pages}" -> "${updates.pages}"`);
          if (updates.url !== undefined) changes.push(`URL: "${currentData.url}" -> "${updates.url}"`);
          if (updates.creators !== undefined) changes.push(`Authors: Updated`);
          if (updates.tags !== undefined) {
            const newTags = updates.tags.map((t: any) => t.tag).join(', ');
            const oldTags = (currentData.tags || []).map((t: any) => t.tag).join(', ');
            changes.push(`Tags: "${oldTags}" -> "${newTags}"`);
          }
          if (updates.collections !== undefined) {
            changes.push(`Collections: Updated`);
          }

          return {
            content: [
              { type: 'text', text: `**Changes to apply to item ${itemKey}:**\n\n` },
              ...changes.map(c => ({ type: 'text', text: `- ${c}\n` })),
              { type: 'text', text: `\nSet confirm=true to apply these changes.` },
            ],
            details: {
              dryRun: true,
              itemKey,
              current: currentData,
              updates,
            },
          };
        }

        // Actually update the item
        try { onUpdate?.({ content: [{ type: 'text', text: 'Updating item in Zotero...' }] }); } catch (e) {}

        const updatedItem = await zoteroClient.updateItem(itemKey, updates, currentItem.version);

        return {
          content: [
            { type: 'text', text: `✓ Item updated successfully!\n` },
            { type: 'text', text: `Key: ${updatedItem.key}\n` },
            { type: 'text', text: `Version: ${updatedItem.version}\n` },
            { type: 'text', text: `Title: ${updatedItem.data.title}\n` },
          ],
          details: {
            updated: true,
            itemKey: updatedItem.key,
            version: updatedItem.version,
            changes: updates,
            item: updatedItem,
          },
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Failed to update item: ${error instanceof Error ? error.message : String(error)}` }],
          details: { error: true, itemKey },
          isError: true,
        };
      }
    },
  });
}
