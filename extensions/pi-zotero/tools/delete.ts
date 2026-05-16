import { Type } from 'typebox';
import { Static } from 'typebox';
import { ZoteroClient } from '../zotero-api';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

const DeleteItemParams = Type.Object({
  itemKey: Type.String({ description: 'Zotero item key to delete' }),
  confirm: Type.Boolean({ 
    description: 'Must be true to confirm deletion (this moves the item to trash)',
  }),
  force: Type.Optional(Type.Boolean({ 
    description: 'Skip confirmation prompt (use with caution)',
    default: false,
  })),
});

type DeleteItemParams = Static<typeof DeleteItemParams>;

export function registerDeleteTool(pi: ExtensionAPI, zoteroClient: ZoteroClient) {
  pi.registerTool({
    name: 'zotero_delete_item',
    label: 'Delete Zotero Item',
    description: 'Delete an item from Zotero library (moves to trash)',
    promptSnippet: 'Remove references from Zotero by moving them to trash',
    promptGuidelines: [
      'Use zotero_delete_item when the user explicitly wants to remove a reference',
      'Always require confirm=true to actually delete (this is a safety measure)',
      'Deletion moves items to trash, where they can be recovered for 30 days',
      'Never delete from group libraries - only user libraries are allowed',
      'Warn the user before deletion and ask for explicit confirmation',
    ],
    parameters: DeleteItemParams,
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const { itemKey, confirm, force = false } = params;

      try {
        onUpdate?.({ content: [{ type: 'text', text: `Preparing to delete item: ${itemKey}` }] });
        // Check library type
        const libraryType = await zoteroClient.checkLibraryType();
        if (libraryType !== 'user') {
          return {
            content: [{ type: 'text', text: 'ERROR: Cannot delete items from group libraries. Only user libraries are supported for writes.' }],
            details: { error: 'group_library_not_allowed' },
            isError: true,
          };
        }

        // Get item to show what will be deleted
        try { onUpdate?.({ content: [{ type: 'text', text: 'Fetching item details...' }] }); } catch (e) {}

        const item = await zoteroClient.getItemWeb(itemKey);
        if (!item) {
          return {
            content: [{ type: 'text', text: `Item with key "${itemKey}" not found` }],
            details: { error: 'item_not_found', itemKey },
            isError: true,
          };
        }

        const title = item.data.title || itemKey;
        const authors = item.data.creators?.map((c: any) => `${c.firstName} ${c.lastName}`.trim()).filter(Boolean).join(', ') || 'Unknown';
        const year = item.data.date?.split('-')[0] || item.data.year || 'Unknown';

        if (!confirm && !force) {
          return {
            content: [
              { type: 'text', text: `⚠️  DELETION CONFIRMATION REQUIRED\n\n` },
              { type: 'text', text: `You are about to delete:\n` },
              { type: 'text', text: `**${title}**\n` },
              { type: 'text', text: `by ${authors} (${year})\n` },
              { type: 'text', text: `Item Key: ${itemKey}\n\n` },
              { type: 'text', text: `This will move the item to trash. It can be recovered within 30 days.\n` },
              { type: 'text', text: `To confirm deletion, call this tool again with confirm=true` },
            ],
            details: {
              requiresConfirmation: true,
              itemKey,
              title,
              authors,
              year,
            },
            isError: false,
          };
        }

        // Actually delete the item
        try { onUpdate?.({ content: [{ type: 'text', text: `Deleting "${title}"...` }] }); } catch (e) {}

        await zoteroClient.deleteItem(itemKey);

        return {
          content: [
            { type: 'text', text: `✓ Item deleted successfully!\n` },
            { type: 'text', text: `Moved to trash: ${title}\n` },
            { type: 'text', text: `Item Key: ${itemKey}\n\n` },
            { type: 'text', text: `Note: Items in trash are automatically purged after 30 days.\n` },
            { type: 'text', text: `To recover: Open Zotero desktop -> Trash -> Right-click -> Restore` },
          ],
          details: {
            deleted: true,
            itemKey,
            title,
          },
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Failed to delete item: ${error instanceof Error ? error.message : String(error)}` }],
          details: { error: true, itemKey },
          isError: true,
        };
      }
    },
  });
}
