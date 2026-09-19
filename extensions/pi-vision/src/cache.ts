// ============================================================================
// pi-vision description cache
// sha256(image data [+ question]) -> description, TTL + size-bounded LRU
// Prevents repeat Pixtral calls for the same image across turns
// ============================================================================

import * as crypto from "node:crypto";
import { getConfig } from "./config.ts";

interface CacheEntry {
  description: string;
  createdAt: number;
}

const store = new Map<string, CacheEntry>();

export function cacheKey(data: string, question?: string): string {
  const hash = crypto.createHash("sha256").update(data).digest("hex");
  if (question) {
    const qHash = crypto.createHash("sha256").update(question).digest("hex").slice(0, 16);
    return `${hash}:${qHash}`;
  }
  return hash;
}

export function get(key: string): string | null {
  const entry = store.get(key);
  if (!entry) return null;
  const ttlMs = getConfig().cacheTtlHours * 60 * 60 * 1000;
  if (Date.now() - entry.createdAt >= ttlMs) {
    store.delete(key);
    return null;
  }
  return entry.description;
}

export function set(key: string, description: string): void {
  const max = getConfig().cacheMaxEntries;
  // Evict oldest entries when full
  while (store.size >= max) {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [k, e] of store) {
      if (e.createdAt < oldestTime) {
        oldestTime = e.createdAt;
        oldestKey = k;
      }
    }
    if (!oldestKey) break;
    store.delete(oldestKey);
  }
  store.set(key, { description, createdAt: Date.now() });
}

export function clear(): void {
  store.clear();
}

export function stats(): { size: number } {
  return { size: store.size };
}
