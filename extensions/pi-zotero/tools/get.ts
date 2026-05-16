import { Type } from 'typebox';
import { Static } from 'typebox';
import { ZoteroClient } from '../zotero-api';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

// Helper functions (module-level, not class methods)
function zoteroItemToBibTeX(item: any): string {
  const data = item.data || item;
  const entryType = mapItemTypeToBibTeX(data.itemType);
  const citeKey = data.key || 'unknown';

  let bibtex = `@${entryType}{${citeKey},\n`;

  if (data.title) {
    bibtex += `  title = {${escapeBibTeX(data.title)}},\n`;
  }
  if (data.creators && data.creators.length > 0) {
    const authors = data.creators.map((c: any) => {
      if (c.firstName && c.lastName) {
        return `${c.lastName}, ${c.firstName}`;
      }
      return c.name || '';
    }).filter(Boolean).join(' and ');
    if (authors) {
      bibtex += `  author = {${authors}},\n`;
    }
  }
  if (data.publicationTitle) {
    bibtex += `  journal = {${escapeBibTeX(data.publicationTitle)}},\n`;
  }
  if (data.year) {
    bibtex += `  year = {${data.year}},\n`;
  }
  if (data.volume) {
    bibtex += `  volume = {${data.volume}},\n`;
  }
  if (data.issue) {
    bibtex += `  number = {${data.issue}},\n`;
  }
  if (data.pages) {
    bibtex += `  pages = {${data.pages}},\n`;
  }
  if (data.DOI) {
    bibtex += `  doi = {${data.DOI}},\n`;
  }
  if (data.abstractNote) {
    bibtex += `  abstract = {${escapeBibTeX(data.abstractNote)}},\n`;
  }
  if (data.url) {
    bibtex += `  url = {${data.url}},\n`;
  }

  bibtex += '}';
  return bibtex;
}

function escapeBibTeX(str: string): string {
  return str.replace(/[{}]/g, '\\$&');
}

function mapItemTypeToBibTeX(itemType: string): string {
  const typeMap: Record<string, string> = {
    journalArticle: 'article',
    book: 'book',
    bookSection: 'incollection',
    conferencePaper: 'inproceedings',
    thesis: 'phdthesis',
    report: 'techreport',
    webpage: 'misc',
  };
  return typeMap[itemType] || itemType.toLowerCase();
}

function formatCitation(entry: any): string {
  const data = entry.data || entry;

  const authors = data.creators?.map((c: any) => `${c.firstName} ${c.lastName}`.trim()).filter(Boolean).join(', ');
  const year = data.year || data.date?.split('-')[0] || '';
  const title = data.title || '';
  const journal = data.publicationTitle || '';

  return `${authors || 'Unknown'} (${year}) ${title}${journal ? `, ${journal}` : ''}.`;
}

function formatSummary(entry: any): string {
  const data = entry.data || entry;

  const lines: string[] = [];
  
  lines.push(`**${data.title || 'Untitled'}**`);
  
  // Authors
  const authors = data.creators?.map((c: any) => `${c.firstName} ${c.lastName}`.trim()).filter(Boolean).join(', ');
  if (authors) {
    lines.push(`\n**Authors:** ${authors}`);
  }

  // Year
  const year = data.year || data.date?.split('-')[0] || '';
  if (year) {
    lines.push(`\n**Year:** ${year}`);
  }

  // Journal/Source
  const journal = data.publicationTitle || '';
  if (journal) {
    lines.push(`\n**Journal:** ${journal}`);
  }

  // Volume/Issue/Pages
  if (data.volume) {
    lines.push(`\n**Volume:** ${data.volume}`);
  }
  if (data.issue) {
    lines.push(`\n**Issue:** ${data.issue}`);
  }
  if (data.pages) {
    lines.push(`\n**Pages:** ${data.pages}`);
  }

  // DOI
  const doi = data.DOI || '';
  if (doi) {
    lines.push(`\n**DOI:** ${doi}`);
  }

  // URL
  if (data.url) {
    lines.push(`\n**URL:** ${data.url}`);
  }

  // Abstract
  const abstract = data.abstractNote || '';
  if (abstract) {
    lines.push(`\n**Abstract:** ${abstract}`);
  }

  // Tags
  const tags = data.tags?.map((t: any) => t.tag).join(', ');
  if (tags) {
    lines.push(`\n**Tags:** ${tags}`);
  }

  // Item Key
  if (data.key) {
    lines.push(`\n**Item Key:** ${data.key}`);
  }

  return lines.join('');
}

const GetEntryParams = Type.Object({
  key: Type.String({ description: 'Zotero item key' }),
  format: Type.Optional(Type.Union([
    Type.Literal('json'),
    Type.Literal('bibtex'),
    Type.Literal('citation'),
    Type.Literal('summary'),
  ], { description: 'Output format' })),
});

type GetEntryParams = Static<typeof GetEntryParams>;

export function registerGetTool(pi: ExtensionAPI, zoteroClient: ZoteroClient) {
  pi.registerTool({
    name: 'zotero_get_entry',
    label: 'Get Zotero Entry',
    description: 'Get a specific entry from Zotero by item key',
    promptSnippet: 'Retrieve full details of a specific reference by its Zotero item key',
    promptGuidelines: [
      'Use zotero_get_entry when the user references a specific item key or asks for details about a particular paper',
    ],
    parameters: GetEntryParams,
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const { key, format = 'json' } = params;

      try {
        onUpdate?.({ content: [{ type: 'text', text: `Searching for: ${key}` }] });
        const entry = await zoteroClient.getItem(key);

        if (!entry) {
          return {
            content: [{ type: 'text', text: `Entry with key "${key}" not found in Zotero` }],
            details: { error: 'not_found', key },
            isError: true,
          };
        }

        // Format output
        switch (format) {
          case 'json':
            return {
              content: [{ type: 'text', text: JSON.stringify(entry, null, 2) }],
              details: { entry },
            };

          case 'bibtex':
            const bibtex = zoteroItemToBibTeX(entry);
            return {
              content: [{ type: 'text', text: bibtex }],
              details: { entry },
            };

          case 'citation':
            const citation = formatCitation(entry);
            return {
              content: [{ type: 'text', text: citation }],
              details: { entry },
            };

          case 'summary':
          default:
            const summary = formatSummary(entry);
            return {
              content: [{ type: 'text', text: summary }],
              details: { entry },
            };
        }
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Failed to get entry: ${error instanceof Error ? error.message : String(error)}` }],
          details: { error: true, key },
          isError: true,
        };
      }
    },

  });
}
