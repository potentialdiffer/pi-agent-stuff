import type { ExtensionAPI, ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import { loadConfig, saveConfig, getConfigPath, ZoteroConfig } from './config';
import { ZoteroClient } from './zotero-api';
import {
  registerSearchTool,
  registerGetTool,
  registerCreateTool,
  registerUpdateTool,
  registerDeleteTool,
  registerImportTool,
  registerListCollectionsTool,
} from './tools';

// Global instances (recreated on reload)
let zoteroClient: ZoteroClient | null = null;
let currentConfig: ZoteroConfig | null = null;

export default function (pi: ExtensionAPI) {
  // Load configuration
  function loadExtensionConfig(): ZoteroConfig {
    if (currentConfig) return currentConfig;
    currentConfig = loadConfig();
    return currentConfig;
  }

  function getZoteroClient(): ZoteroClient {
    if (!zoteroClient) {
      const config = loadExtensionConfig();
      zoteroClient = new ZoteroClient(config);
    }
    return zoteroClient;
  }

  function resetClients(): void {
    zoteroClient = null;
    currentConfig = null;
  }

  // Register tools
  try {
    const config = loadExtensionConfig();
    const client = new ZoteroClient(config);

    registerSearchTool(pi, client);
    registerGetTool(pi, client);
    registerCreateTool(pi, client);
    registerUpdateTool(pi, client);
    registerDeleteTool(pi, client);
    registerImportTool(pi, client);
    registerListCollectionsTool(pi, client);

    zoteroClient = client;
    currentConfig = config;
  } catch (e) {
    console.warn(`Failed to initialize Zotero tools: ${e}`);
    // Tools will be registered when config is set up
  }

  // Register commands
  pi.registerCommand('zotero-setup', {
    description: 'Configure Zotero API and Better BibTeX settings',
    handler: async (args, ctx) => {
      await setupCommand(ctx);
    },
  });

  pi.registerCommand('zotero-status', {
    description: 'Check Zotero API and Better BibTeX status',
    handler: async (args, ctx) => {
      await statusCommand(ctx);
    },
  });

  pi.registerCommand('zotero-query', {
    description: 'Interactive search for Zotero references',
    handler: async (args, ctx) => {
      await queryCommand(ctx);
    },
  });

  pi.registerCommand('zotero-query-abstract', {
    description: 'Interactive search with abstracts for Zotero references',
    handler: async (args, ctx) => {
      await queryAbstractCommand(ctx);
    },
  });

  // Event handlers
  pi.on('session_start', async (event, ctx) => {
    // Reload config and clients on session start/reload
    resetClients();
    
    try {
      const config = loadExtensionConfig();
      const client = new ZoteroClient(config);

      // Re-register tools with fresh instances
      registerSearchTool(pi, client);
      registerGetTool(pi, client);
      registerCreateTool(pi, client);
      registerUpdateTool(pi, client);
      registerDeleteTool(pi, client);
      registerImportTool(pi, client);
      registerListCollectionsTool(pi, client);

      zoteroClient = client;
      currentConfig = config;

      // Check API
      try {
        const libraryType = await client.checkLibraryType();
        ctx.ui.notify(`Zotero: API connected (${libraryType} library)`, 'info');
      } catch (e) {
        ctx.ui.notify(`Zotero: API connection failed: ${e}`, 'error');
      }
    } catch (e) {
      ctx.ui.notify(`Zotero: Failed to initialize: ${e}`, 'error');
    }
  });

  pi.on('session_shutdown', async (event, ctx) => {
    resetClients();
  });
};

// Command handlers
async function setupCommand(ctx: ExtensionCommandContext): Promise<void> {
  ctx.ui.notify('Zotero Setup Wizard', 'info');

  // Get current config
  let config: Partial<ZoteroConfig> = {};
  try {
    const existing = loadConfig();
    config = { ...existing };
  } catch {
    // No existing config
  }

  // Step 1: Zotero API key
  const apiKey = await ctx.ui.input(
    'Zotero API Key (from zotero.org/settings/keys)',
    config.apiKey || ''
  );

  if (!apiKey) {
    ctx.ui.notify('Setup cancelled', 'warn');
    return;
  }

  // Step 3: Library ID
  const libraryId = await ctx.ui.input(
    'Zotero Library ID (from zotero.org/settings/keys)',
    config.libraryId || ''
  );

  if (!libraryId) {
    ctx.ui.notify('Setup cancelled', 'warn');
    return;
  }

  // Step 4: Library type
  const libraryTypeSelection = await ctx.ui.select(
    'Library Type',
    [
      'User Library (My Library) - Read/Write allowed',
      'Group Library - Read only (writes disabled)',
      'Both - User Library (Read/Write) + Group Library (Read)',
    ]
  );

  if (!libraryTypeSelection) {
    ctx.ui.notify('Setup cancelled', 'warn');
    return;
  }

  let libraryType: 'user' | 'group' | 'both';
  if (libraryTypeSelection.includes('Both')) {
    libraryType = 'both';
  } else if (libraryTypeSelection.includes('User Library')) {
    libraryType = 'user';
  } else {
    libraryType = 'group';
  }

  // Step 5 (conditional): Group library IDs for 'both' mode
  let groupLibraryIds: string[] | undefined;
  if (libraryType === 'both') {
    const collected: string[] = [];
    const existing: string[] = (config as any).groupLibraryIds || [];
    ctx.ui.notify('Enter group library IDs one at a time. Leave the field empty to finish.', 'info');
    while (true) {
      const groupId = await ctx.ui.input(
        `Group Library ID ${collected.length + 1} (leave empty to finish)`,
        collected.length < existing.length ? existing[collected.length] : ''
      );
      if (!groupId) break;
      collected.push(groupId);
    }
    if (collected.length === 0) {
      ctx.ui.notify('Setup cancelled: at least one group library ID is required', 'warn');
      return;
    }
    groupLibraryIds = collected;
  }

  // Build and save config
  const newConfig: ZoteroConfig = {
    apiKey,
    libraryId,
    libraryType,
    groupLibraryIds,
  };

  saveConfig(newConfig);

  // Test connection
  ctx.ui.notify('Testing Zotero API connection...', 'info');

  try {
    const client = new ZoteroClient(newConfig);
    const connected = await client.checkLocalAPI();
    const libType = await client.checkLibraryType();
    
    ctx.ui.notify(`✓ Setup complete!\nAPI: ${connected ? 'Local connected' : 'Local not available, using Web'}\nLibrary: ${libType}`, 'success');
    
    // Reload extension
    await ctx.reload();
  } catch (e) {
    ctx.ui.notify(`✓ Config saved, but API test failed: ${e}\nPlease check your credentials.`, 'warn');
  }
}

async function statusCommand(ctx: ExtensionCommandContext): Promise<void> {
  ctx.ui.notify('Checking Zotero status...', 'info');

  try {
    const config = loadConfig();
    const client = new ZoteroClient(config);

    const statusLines: string[] = [
      '=== Zotero Extension Status ===',
      '',
    ];

    // Local API status
    const localAvailable = await client.isLocalAPIAvailable();
    statusLines.push(`Local API: ${localAvailable ? '✓ Connected' : '✗ Not available'}`);

    // Web API status
    try {
      const libraryType = await client.checkLibraryType();
      statusLines.push(`Web API: ✓ Connected`);
      const modeLabel = config.libraryType === 'both'
        ? `both (user: ${config.libraryId}, groups: ${config.groupLibraryIds?.join(', ')})`
        : `${libraryType} (${config.libraryId})`;
      statusLines.push(`Library: ${modeLabel}`);
    } catch (e) {
      statusLines.push(`Web API: ✗ Connection failed - ${e}`);
    }

    // Collection count
    try {
      const collections = await client.listCollections();
      statusLines.push(`Collections: ${collections.length}`);
    } catch (e) {
      // Ignore
    }

    ctx.ui.notify(statusLines.join('\n'), 'info');
  } catch (e) {
    ctx.ui.notify(`Status check failed: ${e}`, 'error');
  }
}

async function refreshCommand(ctx: ExtensionCommandContext): Promise<void> {
  ctx.ui.notify('Refresh command removed - using local Zotero API only', 'warn');
}

async function queryCommand(ctx: ExtensionCommandContext, includeAbstract: boolean = false): Promise<void> {
  const config = loadConfig();
  const client = new ZoteroClient(config);
  const limit = 100;

  // Step 1: Get search query
  const query = await ctx.ui.input('Enter search query (title, author, keywords, etc.)');
  
  if (!query || query.trim() === '') {
    ctx.ui.notify('Search cancelled: no query provided', 'warn');
    return;
  }

  // Execute search
  ctx.ui.notify(`Searching Zotero for "${query}"...`, 'info');

  try {
    const results = await client.search(query, limit);

    if (results.length === 0) {
      ctx.ui.notify(`No results found for "${query}"`, 'warn');
      return;
    }

    // Format results
    const lines: string[] = [
      `=== Zotero Search Results (${results.length} total) ===`,
      '',
    ];

    results.forEach((data: any, i) => {
      const title = data.title || data.data?.title || data.citeKey || data.key || 'Untitled';
      const authors = data.authors 
        ? data.authors.join(', ')
        : (data.data?.creators 
            ? data.data.creators.map((c: any) => `${c.firstName} ${c.lastName}`.trim()).filter(Boolean).join(', ')
            : '');
      const year = data.year || data.data?.date?.split('-')[0] || data.data?.year || '';
      const citeKey = data.citeKey || data.key || data.data?.key || '';
      const abstract = includeAbstract ? (data.abstract || data.data?.abstractNote || '') : '';

      lines.push(`${i + 1}. **${title}** ${year ? `(${year})` : ''}`);
      if (authors) lines.push(`   Authors: ${authors}`);
      if (citeKey) lines.push(`   Cite Key: ${citeKey}`);
      if (includeAbstract && abstract) {
        lines.push(`   Abstract: ${abstract.substring(0, 150)}${abstract.length > 150 ? '...' : ''}`);
      }
      lines.push('');
    });

    ctx.ui.notify(lines.join('\n'), 'info');

    // Option to load results into context
    const loadToContext = await ctx.ui.select('Load results into agent context?', ['Yes', 'No']);
    if (loadToContext === 'Yes') {
      const contextResults = results.map((data: any, i) => ({
        index: i + 1,
        title: data.title || data.data?.title || data.citeKey || data.key || 'Untitled',
        authors: data.authors 
          ? data.authors.join(', ')
          : (data.data?.creators 
              ? data.data.creators.map((c: any) => `${c.firstName} ${c.lastName}`.trim()).filter(Boolean).join(', ')
              : ''),
        year: data.year || data.data?.date?.split('-')[0] || data.data?.year || '',
        citeKey: data.citeKey || data.key || data.data?.key || '',
        abstract: includeAbstract ? (data.abstract || data.data?.abstractNote || '') : '',
      }));

      const contextMessage = [
        '=== ZOTERO SEARCH RESULTS (loaded into context) ===',
        `Query: "${query}"`,
        `Results: ${contextResults.length} total`,
        '',
        '---',
        JSON.stringify(contextResults, null, 2),
        '---',
        'Use these results by referencing title, authors, citeKey, or index.',
      ].join('\n');

      ctx.ui.notify(contextMessage, 'info');
    }

  } catch (error) {
    ctx.ui.notify(`Search failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
  }
}

async function queryAbstractCommand(ctx: ExtensionCommandContext): Promise<void> {
  await queryCommand(ctx, true);
}
