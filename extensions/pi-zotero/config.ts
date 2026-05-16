import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

export interface ZoteroConfig {
  apiKey: string;
  libraryId: string;
  libraryType: 'user' | 'group' | 'both';
  groupLibraryIds?: string[];
}

const DEFAULT_CONFIG: Partial<ZoteroConfig> = {
  libraryType: 'user',
};

const CONFIG_PATH = path.join(os.homedir(), '.config', 'pi-zotero.json');

export function loadConfig(): ZoteroConfig {
  // Try loading from file
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const fileConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) as Partial<ZoteroConfig>;
      return { ...DEFAULT_CONFIG, ...fileConfig } as ZoteroConfig;
    } catch (e) {
      console.warn(`Failed to parse config file: ${e}`);
    }
  }

  // Try loading from environment variables
  const envConfig: Partial<ZoteroConfig> = {};
  if (process.env.ZOTERO_API_KEY) envConfig.apiKey = process.env.ZOTERO_API_KEY;
  if (process.env.ZOTERO_LIBRARY_ID) envConfig.libraryId = process.env.ZOTERO_LIBRARY_ID;
  if (process.env.ZOTERO_LIBRARY_TYPE) envConfig.libraryType = process.env.ZOTERO_LIBRARY_TYPE as 'user' | 'group' | 'both';
  if (process.env.ZOTERO_GROUP_LIBRARY_IDS) envConfig.groupLibraryIds = process.env.ZOTERO_GROUP_LIBRARY_IDS.split(',').map(s => s.trim()).filter(Boolean);

  const config = { ...DEFAULT_CONFIG, ...envConfig } as ZoteroConfig;

  // Validate required fields
  if (!config.apiKey) {
    throw new Error('Zotero API key is required. Set ZOTERO_API_KEY environment variable or configure via /zotero-setup');
  }
  if (!config.libraryId) {
    throw new Error('Zotero library ID is required. Set ZOTERO_LIBRARY_ID environment variable or configure via /zotero-setup');
  }

  return config;
}

export function saveConfig(config: ZoteroConfig): void {
  const dir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}
