import { ZoteroConfig } from './config';

export interface ZoteroItem {
  key: string;
  version: number;
  library: {
    type: 'user' | 'group';
    id: number;
    name: string;
  };
  links: {
    self: { href: string };
    alternate: { href: string; type: string };
  };
  meta: {
    createdByUser: boolean;
    parsedDate: string;
  };
  data: {
    key: string;
    version: number;
    itemType: string;
    title: string;
    creators: Array<{
      creatorType: string;
      firstName: string;
      lastName: string;
    }>;
    abstractNote?: string;
    DOI?: string;
    publicationTitle?: string;
    date?: string;
    year?: string;
    volume?: string;
    issue?: string;
    pages?: string;
    url?: string;
    tags: Array<{ tag: string }>;
    collections: string[];
    [key: string]: any;
  };
}

export interface ZoteroCollection {
  key: string;
  version: number;
  library: {
    type: 'user' | 'group';
    id: number;
  };
  links: {
    self: { href: string };
    alternate: { href: string; type: string };
  };
  meta: {
    numCollections: number;
    numItems: number;
  };
  data: {
    key: string;
    version: number;
    name: string;
    parentCollection?: string;
  };
}

export interface ZoteroSearchResult {
  total: number;
  start: number;
  items: ZoteroItem[];
}

const LOCAL_API_BASE = 'http://localhost:23119/api';
const WEB_API_BASE = 'https://api.zotero.org';

// Rate limiting
const RATE_LIMIT_DELAY = 100; // ms between requests
let lastRequestTime = 0;

async function rateLimit() {
  const now = Date.now();
  const delay = Math.max(0, RATE_LIMIT_DELAY - (now - lastRequestTime));
  if (delay > 0) {
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  lastRequestTime = Date.now();
}

export class ZoteroClient {
  config: ZoteroConfig;
  localApiAvailable: boolean | null = null;

  constructor(config: ZoteroConfig) {
    this.config = config;
  }

  async checkLocalAPI(): Promise<boolean> {
    try {
      const response = await fetch(`${LOCAL_API_BASE}/user`, {
        headers: {
          'Zotero-Allowed-Request': 'true',
          'Zotero-API-Version': '3',
        },
      });
      this.localApiAvailable = response.ok;
      return this.localApiAvailable;
    } catch {
      this.localApiAvailable = false;
      return false;
    }
  }

  async isLocalAPIAvailable(): Promise<boolean> {
    if (this.localApiAvailable === null) {
      return this.checkLocalAPI();
    }
    return this.localApiAvailable;
  }

  // Local API methods (read-only)
  async localRequest(path: string, params?: Record<string, string>): Promise<any> {
    await rateLimit();
    const url = new URL(`${LOCAL_API_BASE}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.append(key, value);
      }
    }

    const response = await fetch(url.toString(), {
      headers: {
        'Zotero-Allowed-Request': 'true',
        'Zotero-API-Version': '3',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        this.localApiAvailable = false;
      }
      throw new Error(`Local API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  async searchLocal(query: string, limit: number = 10): Promise<ZoteroItem[]> {
    const params: Record<string, string> = {
      q: query,
      qmode: 'everything',
      limit: limit.toString(),
      format: 'json',
    };

    try {
      const data = await this.localRequest(`/users/${this.config.libraryId}/items`, params);
      return data as ZoteroItem[];
    } catch {
      return [];
    }
  }

  async searchGroupLocal(query: string, limit: number = 10): Promise<ZoteroItem[]> {
    const ids = this.config.groupLibraryIds;
    if (!ids?.length) return [];
    const params: Record<string, string> = {
      q: query,
      qmode: 'everything',
      limit: limit.toString(),
      format: 'json',
    };
    const results = await Promise.all(ids.map(async id => {
      try {
        const data = await this.localRequest(`/groups/${id}/items`, params);
        return data as ZoteroItem[];
      } catch {
        return [];
      }
    }));
    return results.flat();
  }

  async getItemLocal(itemKey: string): Promise<ZoteroItem | null> {
    try {
      const data = await this.localRequest(`/users/${this.config.libraryId}/items/${itemKey}`);
      return data as ZoteroItem;
    } catch {
      return null;
    }
  }

  async getItemGroupLocal(itemKey: string): Promise<ZoteroItem | null> {
    const ids = this.config.groupLibraryIds;
    if (!ids?.length) return null;
    for (const id of ids) {
      try {
        const data = await this.localRequest(`/groups/${id}/items/${itemKey}`);
        return data as ZoteroItem;
      } catch {
        // try next group
      }
    }
    return null;
  }

  async listCollectionsLocal(): Promise<ZoteroCollection[]> {
    try {
      const data = await this.localRequest(`/users/${this.config.libraryId}/collections`, { format: 'json' });
      return data as ZoteroCollection[];
    } catch {
      return [];
    }
  }

  async listCollectionsGroupLocal(): Promise<ZoteroCollection[]> {
    const ids = this.config.groupLibraryIds;
    if (!ids?.length) return [];
    const results = await Promise.all(ids.map(async id => {
      try {
        const data = await this.localRequest(`/groups/${id}/collections`, { format: 'json' });
        return data as ZoteroCollection[];
      } catch {
        return [];
      }
    }));
    return results.flat();
  }

  async getCollectionItemsLocal(collectionKey: string, limit: number = 50): Promise<ZoteroItem[]> {
    try {
      const data = await this.localRequest(
        `/users/${this.config.libraryId}/collections/${collectionKey}/items`,
        { limit: limit.toString(), format: 'json' }
      );
      return data as ZoteroItem[];
    } catch {
      return [];
    }
  }

  // Web API methods (full CRUD)
  async webRequest(
    method: string,
    path: string,
    body?: any,
    params?: Record<string, string>,
    libraryBase?: string
  ): Promise<any> {
    await rateLimit();

    const base = libraryBase ?? `${WEB_API_BASE}/users/${this.config.libraryId}`;
    const url = new URL(`${base}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.append(key, value);
      }
    }

    const headers: Record<string, string> = {
      'Zotero-API-Key': this.config.apiKey,
      'Zotero-API-Version': '3',
      'Content-Type': 'application/json',
    };

    const response = await fetch(url.toString(), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      if (response.status === 429) {
        // Rate limited - wait and retry
        const retryAfter = parseInt(response.headers.get('retry-after') || '10', 10) * 1000;
        await new Promise(resolve => setTimeout(resolve, retryAfter));
        return this.webRequest(method, path, body, params, libraryBase);
      }
      if (response.status === 403) {
        throw new Error('Zotero API authentication failed. Check your API key.');
      }
      if (response.status === 404) {
        throw new Error(`Zotero API: Resource not found (${path})`);
      }
      throw new Error(`Zotero Web API error: ${response.status} ${response.statusText}`);
    }

    const text = await response.text();
    if (!text.trim()) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  async searchWeb(query: string, limit: number = 10): Promise<ZoteroItem[]> {
    const params = {
      q: query,
      qmode: 'everything',
      limit: limit.toString(),
      format: 'json',
    };

    const data = await this.webRequest('GET', '/items', undefined, params);
    return data as ZoteroItem[];
  }

  async searchGroupWeb(query: string, limit: number = 10): Promise<ZoteroItem[]> {
    const ids = this.config.groupLibraryIds;
    if (!ids?.length) return [];
    const params = {
      q: query,
      qmode: 'everything',
      limit: limit.toString(),
      format: 'json',
    };
    const results = await Promise.all(ids.map(async id => {
      try {
        const data = await this.webRequest('GET', '/items', undefined, params, `${WEB_API_BASE}/groups/${id}`);
        return data as ZoteroItem[];
      } catch {
        return [];
      }
    }));
    return results.flat();
  }

  async getItemWeb(itemKey: string): Promise<ZoteroItem | null> {
    try {
      const data = await this.webRequest('GET', `/items/${itemKey}`);
      return data as ZoteroItem;
    } catch {
      return null;
    }
  }

  async getItemGroupWeb(itemKey: string): Promise<ZoteroItem | null> {
    const ids = this.config.groupLibraryIds;
    if (!ids?.length) return null;
    for (const id of ids) {
      try {
        const data = await this.webRequest('GET', `/items/${itemKey}`, undefined, undefined, `${WEB_API_BASE}/groups/${id}`);
        return data as ZoteroItem;
      } catch {
        // try next group
      }
    }
    return null;
  }

  async getItem(itemKey: string): Promise<ZoteroItem | null> {
    const localAvailable = await this.isLocalAPIAvailable();
    if (localAvailable) {
      const item = await this.getItemLocal(itemKey);
      if (item) return item;
      if (this.config.libraryType === 'both') {
        const groupItem = await this.getItemGroupLocal(itemKey);
        if (groupItem) return groupItem;
      }
    }
    const item = await this.getItemWeb(itemKey);
    if (item) return item;
    if (this.config.libraryType === 'both') {
      return this.getItemGroupWeb(itemKey);
    }
    return null;
  }

  async search(query: string, limit: number = 10): Promise<ZoteroItem[]> {
    const localAvailable = await this.isLocalAPIAvailable();
    if (localAvailable) {
      const results = await this.searchLocal(query, limit);
      const groupResults = this.config.libraryType === 'both' ? await this.searchGroupLocal(query, limit) : [];
      const combined = [...results, ...groupResults];
      if (combined.length > 0) return combined;
    }
    const results = await this.searchWeb(query, limit);
    if (this.config.libraryType === 'both') {
      const groupResults = await this.searchGroupWeb(query, limit);
      return [...results, ...groupResults];
    }
    return results;
  }

  async listCollections(): Promise<ZoteroCollection[]> {
    const localAvailable = await this.isLocalAPIAvailable();
    if (localAvailable) {
      const results = await this.listCollectionsLocal();
      const groupResults = this.config.libraryType === 'both' ? await this.listCollectionsGroupLocal() : [];
      const combined = [...results, ...groupResults];
      if (combined.length > 0) return combined;
    }

    const data = await this.webRequest('GET', '/collections', undefined, { format: 'json' });
    const results = data as ZoteroCollection[];
    if (this.config.libraryType === 'both' && this.config.groupLibraryIds?.length) {
      const groupResults = await Promise.all(this.config.groupLibraryIds.map(async id => {
        try {
          const groupData = await this.webRequest('GET', '/collections', undefined, { format: 'json' }, `${WEB_API_BASE}/groups/${id}`);
          return groupData as ZoteroCollection[];
        } catch {
          return [];
        }
      }));
      return [...results, ...groupResults.flat()];
    }
    return results;
  }

  async getCollectionKeyByName(name: string): Promise<string | null> {
    const collections = await this.listCollections();
    const collection = collections.find(c => c.data.name === name);
    return collection?.data.key || null;
  }

  async getCollectionByPath(path: string): Promise<string | null> {
    const segments = path.split('/').map(s => s.trim()).filter(s => s.length > 0);
    if (segments.length === 0) return null;

    const all = await this.listCollections();

    if (segments.length === 1) {
      // Plain name: match at any level for backwards compatibility
      return all.find(c => c.data.name === segments[0])?.data.key ?? null;
    }

    // Path-based: first segment must be a root-level collection
    let candidates = all.filter(c => c.data.name === segments[0] && !c.data.parentCollection);

    for (let i = 1; i < segments.length; i++) {
      if (candidates.length === 0) return null;
      const parentKeys = new Set(candidates.map(c => c.data.key));
      candidates = all.filter(c =>
        c.data.name === segments[i] && c.data.parentCollection && parentKeys.has(c.data.parentCollection as string)
      );
    }

    return candidates[0]?.data.key ?? null;
  }

  async createItem(item: Partial<ZoteroItem['data']>): Promise<ZoteroItem> {
    // Validate library type for writes
    if (this.config.libraryType === 'group') {
      throw new Error('Cannot write to group libraries. Only user libraries are allowed.');
    }

    // Check for duplicates by DOI or title
    if (item.DOI) {
      const existing = await this.searchWeb(`DOI:"${item.DOI}"`, 1);
      if (existing.length > 0) {
        throw new Error(`Item with DOI ${item.DOI} already exists in library`);
      }
    }

    if (item.title) {
      const existing = await this.searchWeb(`title:"${item.title}"`, 1);
      if (existing.length > 0) {
        throw new Error(`Item with title "${item.title}" already exists in library`);
      }
    }

    const response = await this.webRequest('POST', '/items', [item]);

    // Response format: { successful: { "0": {fullItem}, ... }, failed: { "0": { code, message } } }
    // Keys are zero-based batch indices, not Zotero item keys
    const successful = response?.successful || {};
    const batchIndex = Object.keys(successful)[0];
    if (!batchIndex) {
      throw new Error('Failed to create item: ' + JSON.stringify(response?.failed || response));
    }

    const actualKey = successful[batchIndex]?.key;
    if (!actualKey) {
      throw new Error('Failed to create item: no key in response');
    }

    // Fetch the created item to get full data
    const createdItem = await this.getItemWeb(actualKey);
    if (!createdItem) {
      throw new Error('Failed to retrieve created item');
    }
    return createdItem;
  }

  async updateItem(itemKey: string, updates: Partial<ZoteroItem['data']>, version?: number): Promise<ZoteroItem> {
    if (this.config.libraryType === 'group') {
      throw new Error('Cannot write to group libraries. Only user libraries are allowed.');
    }

    // Get current item to get version if not provided
    let currentItem: ZoteroItem | null = null;
    if (!version) {
      currentItem = await this.getItem(itemKey);
      if (!currentItem) {
        throw new Error(`Item ${itemKey} not found`);
      }
      version = currentItem.version;
    }

    const response = await this.webRequest('PATCH', `/items/${itemKey}`, {
      ...updates,
      version,
    });

    // Fetch updated item
    const updatedItem = await this.getItemWeb(itemKey);
    if (!updatedItem) {
      throw new Error('Failed to retrieve updated item');
    }
    return updatedItem;
  }

  async createItemsBatch(items: Partial<ZoteroItem['data']>[]): Promise<{
    successful: ZoteroItem[];
    failed: Array<{ index: number; title?: string; code: number; message: string }>;
  }> {
    if (this.config.libraryType === 'group') {
      throw new Error('Cannot write to group libraries. Only user libraries are allowed.');
    }

    const BATCH_SIZE = 50;
    const allSuccessful: ZoteroItem[] = [];
    const allFailed: Array<{ index: number; title?: string; code: number; message: string }> = [];

    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const chunk = items.slice(i, i + BATCH_SIZE);
      const response = await this.webRequest('POST', '/items', chunk);

      const successful = response?.successful || {};
      const failed = response?.failed || {};

      for (const [batchIndex, item] of Object.entries(successful)) {
        allSuccessful.push(item as ZoteroItem);
      }

      for (const [batchIndex, error] of Object.entries(failed)) {
        const globalIndex = i + parseInt(batchIndex);
        allFailed.push({
          index: globalIndex,
          title: items[globalIndex]?.title,
          code: (error as any).code,
          message: (error as any).message,
        });
      }
    }

    return { successful: allSuccessful, failed: allFailed };
  }

  async deleteItem(itemKey: string): Promise<void> {
    if (this.config.libraryType === 'group') {
      throw new Error('Cannot write to group libraries. Only user libraries are allowed.');
    }

    await this.webRequest('DELETE', `/items/${itemKey}`);
  }

  async createCollection(name: string, parentKey?: string): Promise<ZoteroCollection> {
    if (this.config.libraryType === 'group') {
      throw new Error('Cannot write to group libraries. Only user libraries are allowed.');
    }

    const response = await this.webRequest('POST', '/collections', [{
      name,
      parentCollection: parentKey || false,
    }]);

    const successful = response.successful || {};
    const batchIndex = Object.keys(successful)[0];
    if (!batchIndex) {
      throw new Error('Failed to create collection: ' + JSON.stringify(response.failed || response));
    }

    const actualKey = successful[batchIndex]?.key;
    if (!actualKey) {
      throw new Error('Failed to create collection: no key in response');
    }

    // Fetch the created collection
    const collections = await this.listCollections();
    const created = collections.find(c => c.data.key === actualKey);
    if (!created) {
      throw new Error('Failed to retrieve created collection');
    }
    return created;
  }

  async deleteCollection(collectionKey: string): Promise<void> {
    if (this.config.libraryType === 'group') {
      throw new Error('Cannot write to group libraries. Only user libraries are allowed.');
    }

    await this.webRequest('DELETE', `/collections/${collectionKey}`);
  }

  // Helper to create item from BBT entry
  async createItemFromBBT(bbtEntry: any, collectionName?: string): Promise<ZoteroItem> {
    const item: Partial<ZoteroItem['data']> = {
      itemType: this.mapEntryType(bbtEntry.entryType),
      title: bbtEntry.title,
      abstractNote: bbtEntry.abstract,
      DOI: bbtEntry.doi,
      date: bbtEntry.year,
      url: bbtEntry.url,
    };

    // Map authors
    if (bbtEntry.authors && bbtEntry.authors.length > 0) {
      item.creators = bbtEntry.authors.map((author: string) => {
        // Simple parsing: "Last, First" or "First Last"
        const parts = author.split(', ');
        if (parts.length === 2) {
          return {
            creatorType: 'author',
            firstName: parts[1],
            lastName: parts[0],
          };
        }
        // Try splitting by space
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

    // Map journal
    if (bbtEntry.journal) {
      item.publicationTitle = bbtEntry.journal;
    }

    // Map volume, issue, pages
    if (bbtEntry.volume) item.volume = bbtEntry.volume;
    if (bbtEntry.number) item.issue = bbtEntry.number;
    if (bbtEntry.pages) item.pages = bbtEntry.pages;

    // Map tags
    if (bbtEntry.tags && bbtEntry.tags.length > 0) {
      item.tags = bbtEntry.tags.map((tag: string) => ({ tag }));
    }

    // Map collection
    if (collectionName) {
      const collectionKey = await this.getCollectionByPath(collectionName);
      if (collectionKey) {
        item.collections = [collectionKey];
      }
    }

    return this.createItem(item);
  }

  mapEntryType(entryType: string): string {
    const typeMap: Record<string, string> = {
      article: 'journalArticle',
      book: 'book',
      inproceedings: 'conferencePaper',
      incollection: 'bookSection',
      phdthesis: 'thesis',
      mastersthesis: 'thesis',
      techreport: 'report',
      misc: 'webpage',
      webpage: 'webpage',
    };
    return typeMap[entryType.toLowerCase()] || entryType;
  }

  async checkLibraryType(): Promise<'user' | 'group'> {
    if (this.config.libraryType === 'both') return 'user';
    try {
      const data = await this.localRequest(`/users/${this.config.libraryId}`);
      return data?.library?.type || this.config.libraryType;
    } catch {
      return this.config.libraryType as 'user' | 'group';
    }
  }
}
