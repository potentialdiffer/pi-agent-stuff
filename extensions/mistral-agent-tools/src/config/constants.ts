// ============================================================================
// Default Configuration Constants
// ============================================================================

export const DEFAULT_CONFIG = {
  // Debug Configuration
  DEBUG_MODE: process.env.MISTRAL_DEBUG === "true" || false,
  
  // API Configuration
  DEFAULT_MODEL: "mistral-medium-latest",
  BASE_URL: "https://api.mistral.ai",
  
  // Timeout and Retry Configuration
  API_TIMEOUT_MS: 120_000, // 2 minutes for full generation
  POLL_INTERVAL_MS: 2000, // 2 seconds between polls
  MAX_POLL_ATTEMPTS: 15, // 30 seconds total polling
  MAX_RETRIES: 3,
  
  // Websearch-specific Configuration
  WEBSEARCH_POLL_INTERVAL_MS: 5000, // 5 seconds between polls (websearch may take longer)
  WEBSEARCH_MAX_POLL_ATTEMPTS: 30, // 150 seconds (2.5 minutes) total polling
  WEBSEARCH_API_TIMEOUT_MS: 180_000, // 3 minutes for websearch
  
  // Caching Configuration
  AGENT_CACHE_TTL_MS: 1000 * 60 * 60, // 1 hour
  CONVERSATION_CACHE_TTL_MS: 1000 * 60 * 15, // 15 minutes
  MAX_CACHED_AGENTS: 10,
  MAX_CACHED_CONVERSATIONS: 20,
  
  // Image Configuration
  DEFAULT_IMAGE_WIDTH: 1024,
  DEFAULT_IMAGE_HEIGHT: 1024,
  DEFAULT_TEMPERATURE: 0.3,
  DEFAULT_TOP_P: 0.95,
  
  // File Configuration
  TEMP_DIR: "mistral-agent-tools-temp",
  MAX_IMAGE_SIZE_BYTES: 10 * 1024 * 1024, // 10MB
  
  // Display Configuration
  MAX_DISPLAY_WIDTH: 800,
  MAX_DISPLAY_HEIGHT: 600,
  
  // Websearch Configuration
  DEFAULT_WEBSEARCH_MODEL: "mistral-medium-latest",
  WEBSEARCH_AGENT_CACHE_TTL_MS: 1000 * 60 * 60, // 1 hour
  MAX_CACHED_WEBSEARCH_AGENTS: 10,
  WEBSEARCH_MAX_TOKENS: 10240, // Limit output tokens for concise responses
} as const;

export type DefaultConfig = typeof DEFAULT_CONFIG;

// ============================================================================
// File Paths
// ============================================================================

import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs";

export function getAuthFilePath(): string {
  const agentDir = process.env.PI_AGENT_DIR || path.join(os.homedir(), ".pi", "agent");
  return path.join(agentDir, "auth.json");
}

export function getTempDir(): string {
  const baseDir = process.env.PI_TEMP_DIR || os.tmpdir();
  return path.join(baseDir, DEFAULT_CONFIG.TEMP_DIR);
}

export function getImagePath(fileName: string): string {
  return path.join(getTempDir(), fileName);
}

export function getPiImagesDir(): string {
  return path.join(process.cwd(), ".pi-images");
}

export function getPiImagePath(fileName: string): string {
  const dir = getPiImagesDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, fileName);
}

// ============================================================================
// Debug Utilities
// ============================================================================

/**
 * Debug logger that only outputs when DEBUG_MODE is enabled
 * Usage: debugLog("message") or debugLog("label:", data)
 */
export function debugLog(...args: any[]): void {
  if (DEFAULT_CONFIG.DEBUG_MODE) {
    console.log("[DEBUG]", ...args);
  }
}

/**
 * Debug logger for verbose output
 * Usage: debugVerbose("detailed message")
 */
export function debugVerbose(...args: any[]): void {
  if (DEFAULT_CONFIG.DEBUG_MODE) {
    console.debug("[VERBOSE]", ...args);
  }
}

// ============================================================================
// Validation
// ============================================================================

export const VALID_MODELS = [
  "mistral-medium-latest",
  "mistral-large-latest",
  "mistral-small-latest",
] as const;

export const VALID_IMAGE_TYPES = ["png", "jpeg", "jpg", "webp"] as const;

export type ValidModel = typeof VALID_MODELS[number];

export type ValidImageType = typeof VALID_IMAGE_TYPES[number];

export function isValidModel(model: string): model is ValidModel {
  return VALID_MODELS.includes(model as ValidModel);
}

export function isValidImageType(type: string): type is ValidImageType {
  return VALID_IMAGE_TYPES.includes(type as ValidImageType);
}
