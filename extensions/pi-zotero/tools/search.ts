import { Type } from 'typebox';
import { ZoteroClient, ZoteroItem } from '../zotero-api';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

export function registerSearchTool(pi: ExtensionAPI, zoteroClient: ZoteroClient) {
  pi.registerTool({
    name: 'zotero_search',
    label: 'Zotero Search',
    description: 'Search Zotero library for references',
    promptSnippet: 'Search Zotero library for papers, books, or other references by title, author, or keywords',
    promptGuidelines: [
      'Use zotero_search when the user wants to find academic papers, references, or citations',
      'Search supports title, author, year, DOI, and keyword queries',
    ],
    parameters: Type.Object({
      query: Type.String({ description: 'Search query (title, author, keywords, etc.)' }),
      limit: Type.Optional(Type.Number({ description: 'Maximum number of results to return', default: 10, minimum: 1, maximum: 50 })),
      includeAbstract: Type.Optional(Type.Boolean({ description: 'Include abstract in results', default: false })),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const { query, limit = 10, includeAbstract = false } = params;

      try {
        onUpdate?.({ content: [{ type: 'text', text: `Searching Zotero for "${query}"...` }] });
        const results = await zoteroClient.search(query, limit);

        // Format results
        const formattedResults = results.slice(0, limit).map((data: any, i) => {
          const title = data.title || data.data?.title || data.citeKey || data.key || 'Untitled';
          const authors = data.authors ? data.authors.join(', ') :
            (data.data?.creators ? data.data.creators.map((c: any) => `${c.firstName} ${c.lastName}`.trim()).filter(Boolean).join(', ') : '');
          const year = data.year || data.data?.date?.split('-')[0] || data.data?.year || '';
          const citeKey = data.citeKey || data.key || data.data?.key || '';
          
          let result = `${i + 1}. **${title}** (${year})\n`;
          if (authors) result += `   *Authors: ${authors}*\n`;
          if (citeKey) result += `   *Cite Key: ${citeKey}*\n`;
          if (includeAbstract && (data.abstract || data.data?.abstractNote)) {
            const abstract = data.abstract || data.data?.abstractNote || '';
            result += `   *Abstract: ${abstract.substring(0, 200)}${abstract.length > 200 ? '...' : ''}*\n`;
          }
          
          return result;
        });

        if (formattedResults.length === 0) {
          return {
            content: [{ type: 'text', text: `No results found for "${query}"` }],
            details: { query, count: 0 },
          };
        }

        return {
          content: [
            { type: 'text', text: `Found ${formattedResults.length} results for "${query}":\n\n` },
            ...formattedResults.map(r => ({ type: 'text', text: r })),
          ],
          details: {
            query,
            count: formattedResults.length,
            results: results.map((r: any) => ({
              citeKey: r.citeKey || r.key || r.data?.key,
              title: r.title || r.data?.title,
            })),
          },
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Zotero search failed: ${error instanceof Error ? error.message : String(error)}` }],
          details: { error: true },
          isError: true,
        };
      }
    },
  });
}
