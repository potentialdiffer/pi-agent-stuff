import { Mistral } from "@mistralai/mistralai";
import { AgentCacheEntry, ImageGenerationError } from "../config/types.ts";
import { DEFAULT_CONFIG } from "../config/constants.ts";
import { createMistralClient, getApiKey } from "./auth.ts";

// ============================================================================
// Agent Manager Module
// Manages Mistral agent lifecycle and caching
// ============================================================================

interface AgentConfig {
  model: string;
  name?: string;
  description?: string;
  instructions?: string;
  temperature?: number;
  topP?: number;
}

interface CachedAgent extends AgentCacheEntry {
  client: Mistral;
}

// Agent cache: model -> cached agent data
const agentCache: Map<string, CachedAgent> = new Map();

/**
 * Get or create an agent for image generation
 */
export async function getOrCreateImageAgent(
  model: string = DEFAULT_CONFIG.DEFAULT_MODEL,
  apiKey?: string
): Promise<{ agentId: string; client: Mistral }> {
  const cacheKey = model;
  
  // Check cache
  const cached = agentCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < DEFAULT_CONFIG.AGENT_CACHE_TTL_MS) {
    return { agentId: cached.id, client: cached.client };
  }

  // Get resolved API key
  let resolvedApiKey = apiKey;
  if (!resolvedApiKey) {
    try {
      resolvedApiKey = getApiKey();
    } catch {
      resolvedApiKey = undefined;
    }
  }
  
  // Create new agent
  const client = createMistralClient(resolvedApiKey);
  const agent = await createImageGenerationAgent(client, model, resolvedApiKey);

  // Cache it
  const cacheEntry: CachedAgent = {
    id: agent.id,
    model: model,
    createdAt: Date.now(),
    client,
  };
  agentCache.set(cacheKey, cacheEntry);

  // Clean up old entries if cache is full
  cleanupAgentCache();

  return { agentId: agent.id, client };
}

/**
 * Create a new image generation agent
 */
async function createImageGenerationAgent(
  client: Mistral,
  model: string,
  apiKey?: string
): Promise<{ id: string }> {
  try {
    let resolvedApiKey = apiKey;
    if (!resolvedApiKey) {
      try {
        resolvedApiKey = getApiKey();
      } catch {
        resolvedApiKey = undefined;
      }
    }
    if (!resolvedApiKey) {
      throw new Error("API key is required");
    }
    const baseUrl = "https://api.mistral.ai";
    const requestBody = {
      model: model,
      name: "Image Generation Agent",
      description: "Agent used to generate images using Mistral's image generation tool.",
      instructions: "Use the image generation tool when you have to create images. Generate high-quality images based on user prompts.",
      tools: [{ type: "image_generation" }],
      completion_args: {
        temperature: DEFAULT_CONFIG.DEFAULT_TEMPERATURE,
        top_p: DEFAULT_CONFIG.DEFAULT_TOP_P,
      },
    };
    
    console.debug(`[Mistral Agent] Creating agent with API key: ${resolvedApiKey.substring(0, 8)}...${resolvedApiKey.substring(resolvedApiKey.length - 4)}`);
    console.debug(`[Mistral Agent] Request URL: ${baseUrl}/v1/agents`);
    console.debug(`[Mistral Agent] Request body:`, JSON.stringify(requestBody, null, 2));
    
    const response = await fetch(`${baseUrl}/v1/agents`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resolvedApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });
    
    console.debug(`[Mistral Agent] Response status: ${response.status}`);
    console.debug(`[Mistral Agent] Response headers:`, Object.fromEntries(response.headers.entries()));
    
    if (!response.ok) {
      const errorText = await response.text();
      console.debug(`[Mistral Agent] Response body: ${errorText}`);
      throw new Error(`API error: ${response.status} - ${errorText}`);
    }
    const agent = await response.json();
    console.debug(`[Mistral Agent] Agent created: ${agent.id}`);
    return { id: agent.id };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new ImageGenerationError(
      `Failed to create image generation agent: ${errorMessage}`,
      "agent_creation",
      true
    );
  }
}

/**
 * Get an existing agent by ID
 */
export async function getAgentById(
  agentId: string,
  apiKey?: string
): Promise<{ agentId: string; client: Mistral } | null> {
  try {
    let resolvedApiKey = apiKey;
    if (!resolvedApiKey) {
      try {
        resolvedApiKey = getApiKey();
      } catch {
        resolvedApiKey = undefined;
      }
    }
    if (!resolvedApiKey) return null;
    const client = createMistralClient(resolvedApiKey);
    const baseUrl = "https://api.mistral.ai";
    const response = await fetch(`${baseUrl}/v1/agents/${agentId}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${resolvedApiKey}`,
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) return null;
    const agent = await response.json();
    return { agentId: agent.id, client };
  } catch {
    return null;
  }
}

/**
 * Delete an agent by ID
 */
export async function deleteAgent(agentId: string, apiKey?: string): Promise<boolean> {
  try {
    let resolvedApiKey = apiKey;
    if (!resolvedApiKey) {
      try {
        resolvedApiKey = getApiKey();
      } catch {
        resolvedApiKey = undefined;
      }
    }
    if (!resolvedApiKey) return false;
    const client = createMistralClient(resolvedApiKey);
    const baseUrl = "https://api.mistral.ai";
    const response = await fetch(`${baseUrl}/v1/agents/${agentId}`, {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${resolvedApiKey}`,
        "Content-Type": "application/json",
      },
    });
    // Remove from cache
    for (const [key, cached] of agentCache.entries()) {
      if (cached.id === agentId) {
        agentCache.delete(key);
        break;
      }
    }
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * List all agents
 */
export async function listAgents(apiKey?: string): Promise<Array<{ id: string; name: string; model: string }>> {
  try {
    let resolvedApiKey = apiKey;
    if (!resolvedApiKey) {
      try {
        resolvedApiKey = getApiKey();
      } catch {
        resolvedApiKey = undefined;
      }
    }
    if (!resolvedApiKey) return [];
    const client = createMistralClient(resolvedApiKey);
    const baseUrl = "https://api.mistral.ai";
    const response = await fetch(`${baseUrl}/v1/agents`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${resolvedApiKey}`,
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) return [];
    const result = await response.json();
    return result.data.map((agent: any) => ({
      id: agent.id,
      name: agent.name,
      model: agent.model,
    }));
  } catch {
    return [];
  }
}

/**
 * Clear agent cache
 */
export function clearAgentCache(): void {
  agentCache.clear();
}

/**
 * Clean up old cached agents
 */
function cleanupAgentCache(): void {
  const now = Date.now();
  const ttl = DEFAULT_CONFIG.AGENT_CACHE_TTL_MS;
  
  for (const [key, cached] of agentCache.entries()) {
    if (now - cached.createdAt > ttl) {
      agentCache.delete(key);
    }
  }

  // Also enforce max size
  while (agentCache.size > DEFAULT_CONFIG.MAX_CACHED_AGENTS) {
    // Delete oldest entry
    let oldestKey: string | undefined;
    let oldestTime = Infinity;
    
    for (const [key, cached] of agentCache.entries()) {
      if (cached.createdAt < oldestTime) {
        oldestTime = cached.createdAt;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      agentCache.delete(oldestKey);
    }
  }
}

/**
 * Get cache statistics
 */
export function getCacheStats(): { size: number; maxSize: number } {
  return {
    size: agentCache.size,
    maxSize: DEFAULT_CONFIG.MAX_CACHED_AGENTS,
  };
}
