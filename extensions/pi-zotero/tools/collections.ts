import { Type } from 'typebox';
import { Static } from 'typebox';
import { ZoteroClient, ZoteroCollection } from '../zotero-api';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

const ListCollectionsParams = Type.Object({
  showItemCounts: Type.Optional(Type.Boolean({
    description: 'Show item and subcollection counts next to each collection (default: true)',
    default: true,
  })),
  maxDepth: Type.Optional(Type.Number({
    description: 'Maximum tree depth to display; 0 means unlimited (default: 0)',
    default: 0,
    minimum: 0,
  })),
});

type ListCollectionsParams = Static<typeof ListCollectionsParams>;

export function registerListCollectionsTool(pi: ExtensionAPI, zoteroClient: ZoteroClient) {
  pi.registerTool({
    name: 'zotero_list_collections',
    label: 'List Zotero Collections',
    description: 'List all Zotero collections and subcollections as an indented hierarchy tree',
    promptSnippet: 'Show Zotero collection hierarchy with keys for use in other tools',
    promptGuidelines: [
      'Use zotero_list_collections to discover what collections exist before adding items',
      'The output includes 8-char collection keys needed for zotero_create_item, zotero_update_item, and zotero_import_batch',
      'Subcollections can be referenced by path in other tools, e.g. "Parent/Child"',
    ],
    parameters: ListCollectionsParams,
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const { showItemCounts = true, maxDepth = 0 } = params;

      try {
        onUpdate?.({ content: [{ type: 'text', text: 'Fetching collections...' }] });

        const collections = await zoteroClient.listCollections();

        if (collections.length === 0) {
          return {
            content: [{ type: 'text', text: 'No collections found. Use Zotero to create collections first.' }],
            details: { count: 0, collections: [] },
          };
        }

        // Build lookup maps; normalize parentCollection to null for roots (API may return false or undefined)
        const byKey = new Map<string, ZoteroCollection>();
        const childrenOf = new Map<string | null, ZoteroCollection[]>();

        for (const c of collections) {
          byKey.set(c.data.key, c);
          const parent = (c.data.parentCollection as any) || null;
          if (!childrenOf.has(parent)) childrenOf.set(parent, []);
          childrenOf.get(parent)!.push(c);
        }

        // Sort children alphabetically at each level
        for (const children of childrenOf.values()) {
          children.sort((a, b) => a.data.name.localeCompare(b.data.name));
        }

        const lines: string[] = [];

        function renderNode(key: string, depth: number): void {
          if (maxDepth > 0 && depth >= maxDepth) return;

          const collection = byKey.get(key);
          if (!collection) return;

          const indent = '  '.repeat(depth);
          const name = collection.data.name;
          const numItems = collection.meta?.numItems ?? 0;
          const numSubs = collection.meta?.numCollections ?? 0;

          let line = `${indent}${name}`;
          if (showItemCounts && (numItems > 0 || numSubs > 0)) {
            const parts: string[] = [];
            if (numItems > 0) parts.push(`${numItems} item${numItems !== 1 ? 's' : ''}`);
            if (numSubs > 0) parts.push(`${numSubs} subcollection${numSubs !== 1 ? 's' : ''}`);
            line += `  (${parts.join(', ')})`;
          }
          line += `  [key: ${collection.data.key}]`;
          lines.push(line);

          const children = childrenOf.get(collection.data.key) || [];
          for (const child of children) {
            renderNode(child.data.key, depth + 1);
          }
        }

        const roots = (childrenOf.get(null) || []).sort((a, b) => a.data.name.localeCompare(b.data.name));

        for (const root of roots) {
          renderNode(root.data.key, 0);
        }

        return {
          content: [
            { type: 'text', text: `Collections (${collections.length} total):\n\n` },
            { type: 'text', text: lines.join('\n') },
          ],
          details: {
            count: collections.length,
            collections: collections.map(c => ({
              key: c.data.key,
              name: c.data.name,
              parentKey: (c.data.parentCollection as any) || null,
              numItems: c.meta?.numItems ?? 0,
              numSubcollections: c.meta?.numCollections ?? 0,
            })),
          },
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Failed to list collections: ${error instanceof Error ? error.message : String(error)}` }],
          details: { error: true },
          isError: true,
        };
      }
    },
  });
}
