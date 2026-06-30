import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { Mistral } from "@mistralai/mistralai";
import { getAuthFilePath, debugLog, debugVerbose } from "../config/constants.ts";
import { MistralAuthError, ConfigurationError } from "../config/types.ts";

debugLog("Auth module loaded");

// ============================================================================
// Authentication Module
// Handles API key retrieval, validation, and persistence
// ============================================================================

interface AuthFileData {
  mistral?: {
    apiKey?: string;
    baseUrl?: string;
    type?: string;
    key?: string;
  };
  "mistral-image-api"?: {
    apiKey?: string;
    baseUrl?: string;
    type?: string;
    key?: string;
  };
}

/**
 * Get Mistral API key from environment or auth file
 * Priority: Environment variable > Auth file
 */
export function getApiKey(): string {
  // Check environment variable first
  const envKey = process.env.MISTRAL_API_KEY;
  debugLog(`Checking env MISTRAL_API_KEY: ${envKey ? 'found' : 'not found'}`);
  if (envKey && typeof envKey === "string" && envKey.trim()) {
    debugLog(`Using API key from environment variable`);
    return envKey.trim();
  }

  // Fall back to auth file
  const fileKey = getApiKeyFromAuthFile();
  debugLog(`File key result: ${fileKey ? 'found' : 'not found'}`);
  if (fileKey) {
    debugLog(`Using API key from auth file`);
    return fileKey;
  }

  debugLog(`No API key found, throwing ConfigurationError`);
  throw new ConfigurationError(
    "Mistral API key not found. " +
    "Set MISTRAL_API_KEY environment variable or run /mistral-setup."
  );
}

/**
 * Get API key from auth.json file for mistral-image-api
 * Uses separate provider entry to avoid conflicts with pi's mistral config
 */
function getApiKeyFromAuthFile(): string | null {
  const authFilePath = getAuthFilePath();
  
  debugLog(`Looking for auth file at: ${authFilePath}`);
  debugLog(`File exists: ${fs.existsSync(authFilePath)}`);
  
  if (!fs.existsSync(authFilePath)) {
    debugLog(`Auth file not found at: ${authFilePath}`);
    return null;
  }

  try {
    const content = fs.readFileSync(authFilePath, "utf-8");
    debugVerbose(`Auth file content: ${content}`);
    const authData = JSON.parse(content) as AuthFileData;
    
    // Try mistral-image-api first (separate entry for image generation)
    const imageApiConfig = authData["mistral-image-api"];
    debugLog(`mistral-image-api config:`, imageApiConfig);
    
    if (imageApiConfig) {
      debugLog(`Using mistral-image-api config:`, JSON.stringify(imageApiConfig, null, 2));
      
      // Pi's standard format: type: "api_key", key: "..."
      if (imageApiConfig.type === "api_key" && imageApiConfig.key) {
        debugLog(`Using pi standard format key from mistral-image-api`);
        return imageApiConfig.key.trim();
      }
      
      // Legacy format: apiKey: "..."
      if (imageApiConfig.apiKey) {
        debugLog(`Using apiKey from mistral-image-api`);
        return imageApiConfig.apiKey.trim();
      }
    }
    
    // Fallback to mistral config for backward compatibility
    const mistralConfig = authData.mistral;
    debugLog(`mistral config:`, mistralConfig);
    
    if (mistralConfig) {
      debugLog(`Falling back to mistral config:`, JSON.stringify(mistralConfig, null, 2));
      
      // Prefer apiKey over key for backward compatibility with existing setups
      if (mistralConfig.apiKey) {
        debugLog(`Using apiKey from mistral config`);
        return mistralConfig.apiKey.trim();
      }
      
      if (mistralConfig.type === "api_key" && mistralConfig.key) {
        debugLog(`Using key from mistral config`);
        return mistralConfig.key.trim();
      }
    }
    
    debugLog(`No valid API key found`);
    return null;
  } catch (error) {
    console.error(`[Mistral Auth] Error reading auth file:`, error);
    return null;
  }
}

/**
 * Save API key to auth.json file for mistral-image-api
 * Uses pi's standard format: type: "api_key", key: "..."
 * Stores in separate provider entry to avoid conflicts
 */
export function saveApiKey(apiKey: string, baseUrl?: string): void {
  const authFilePath = getAuthFilePath();
  
  // Ensure directory exists
  const dir = path.dirname(authFilePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Read existing auth file
  let authData: AuthFileData = {};
  if (fs.existsSync(authFilePath)) {
    try {
      const content = fs.readFileSync(authFilePath, "utf-8");
      authData = JSON.parse(content) as AuthFileData;
    } catch {
      authData = {};
    }
  }

  // Update mistral-image-api config using pi's standard format
  if (!authData["mistral-image-api"]) {
    authData["mistral-image-api"] = {};
  }
  authData["mistral-image-api"].type = "api_key";
  authData["mistral-image-api"].key = apiKey;
  if (baseUrl) {
    authData["mistral-image-api"].baseUrl = baseUrl;
  }

  // Write back
  fs.writeFileSync(authFilePath, JSON.stringify(authData, null, 2), "utf-8");
}

/**
 * Remove API key from auth file for mistral-image-api
 */
export function removeApiKey(): void {
  const authFilePath = getAuthFilePath();
  
  if (!fs.existsSync(authFilePath)) {
    return;
  }

  try {
    const content = fs.readFileSync(authFilePath, "utf-8");
    const authData = JSON.parse(content) as AuthFileData;
    
    if (authData["mistral-image-api"]) {
      // Remove all properties
      delete authData["mistral-image-api"];
    }

    fs.writeFileSync(authFilePath, JSON.stringify(authData, null, 2), "utf-8");
  } catch {
    // If we can't parse, just leave it
  }
}

/**
 * Validate API key by making a test API call
 */
export async function validateApiKey(apiKey: string, baseUrl?: string): Promise<boolean> {
  try {
    const client = new Mistral({
      apiKey,
      ...(baseUrl && { endpoint: baseUrl }),
    });
    
    // Lightweight validation - list models
    await client.models.list({ limit: 1 });
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Mistral Auth] Validation failed: ${errorMessage}`);
    return false;
  }
}

/**
 * Check if API is configured (without throwing)
 */
export function isConfigured(): boolean {
  try {
    getApiKey();
    return true;
  } catch {
    return false;
  }
}

/**
 * Get base URL from config or use default
 */
export function getBaseUrl(): string | undefined {
  // Check environment variable
  if (process.env.MISTRAL_BASE_URL) {
    return process.env.MISTRAL_BASE_URL;
  }

  // Check auth file
  const authFilePath = getAuthFilePath();
  if (fs.existsSync(authFilePath)) {
    try {
      const content = fs.readFileSync(authFilePath, "utf-8");
      const authData = JSON.parse(content) as AuthFileData;
      
      // Try mistral-image-api first
      const imageApiConfig = authData["mistral-image-api"];
      if (imageApiConfig) {
        if (imageApiConfig.baseUrl) {
          return imageApiConfig.baseUrl;
        }
        if (imageApiConfig.type === "api_key" && imageApiConfig.endpoint) {
          return imageApiConfig.endpoint;
        }
      }
      
      // Fallback to mistral config
      const mistralConfig = authData.mistral;
      if (mistralConfig) {
        if (mistralConfig.baseUrl) {
          return mistralConfig.baseUrl;
        }
        if (mistralConfig.type === "api_key" && mistralConfig.endpoint) {
          return mistralConfig.endpoint;
        }
      }
    } catch {
      // Ignore parse errors
    }
  }

  return undefined;
}

/**
 * Create Mistral client with configured settings
 */
export function createMistralClient(apiKey?: string): Mistral {
  const key = apiKey || getApiKey();
  const baseUrl = getBaseUrl();
  
  debugLog(`createMistralClient called with apiKey param: ${apiKey ? 'provided' : 'not provided'}`);
  debugLog(`Resolved API key: ${key ? key.substring(0, 8) + '...' + key.substring(key.length - 4) : 'UNDEFINED'}`);
  debugLog(`Base URL: ${baseUrl || 'default'}`);
  
  if (!key) {
    console.error(`[Mistral Auth] ERROR: API key is undefined!`);
    throw new ConfigurationError("API key is undefined");
  }
  
  return new Mistral({
    apiKey: key,
    ...(baseUrl && { endpoint: baseUrl }),
  });
}
