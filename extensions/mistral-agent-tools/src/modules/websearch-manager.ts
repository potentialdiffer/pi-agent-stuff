// ============================================================================
// Websearch Manager
// Manages websearch agent lifecycle and conversation handling
// ============================================================================

import type { Agent, ConversationResponse, MessageOutputEntry, ToolExecutionEntry, ModelConversation, AgentConversation, ConversationHistory } from "@mistralai/mistralai/models/components/index.js";
import { DEFAULT_CONFIG, debugLog, debugVerbose } from "../config/constants.js";
import { createMistralClient } from "./auth.js";
import { ConfigurationError, MistralApiError, WebsearchError } from "../config/types.js";

// ============================================================================
// Types
// ============================================================================

interface WebsearchAgentCacheEntry {
  agent: Agent;
  model: string;
  createdAt: number;
}

interface WebsearchConversationParams {
  query: string;
  model?: string;
  temperature?: number;
  topP?: number;
  conversationId?: string; // Optional: continue existing conversation
}

interface WebsearchConversationCacheEntry {
  conversationId: string;
  agentId: string;
  model: string;
  createdAt: number;
  lastUsedAt: number;
  initialQuery: string;
}

export interface WebsearchConversationInfo {
  conversationId: string;
  agentId: string;
  model: string;
  createdAt: number;
  lastUsedAt: number;
  initialQuery: string;
}

// ============================================================================
// Cache
// ============================================================================

const websearchAgentCache = new Map<string, WebsearchAgentCacheEntry>();
const websearchConversationCache = new Map<string, WebsearchConversationCacheEntry>();

function getWebsearchAgentCacheKey(model: string): string {
  return `websearch:${model}`;
}

function isWebsearchAgentCacheValid(entry: WebsearchAgentCacheEntry): boolean {
  const now = Date.now();
  const ttl = DEFAULT_CONFIG.AGENT_CACHE_TTL_MS;
  return now - entry.createdAt < ttl;
}

function isWebsearchConversationCacheValid(entry: WebsearchConversationCacheEntry): boolean {
  const now = Date.now();
  const ttl = DEFAULT_CONFIG.CONVERSATION_CACHE_TTL_MS;
  return now - entry.lastUsedAt < ttl;
}

// ============================================================================
// Agent Management
// ============================================================================

/**
 * Get or create a websearch agent for the specified model
 */
export async function getOrCreateWebsearchAgent(
  model: string = DEFAULT_CONFIG.DEFAULT_MODEL,
  apiKey: string
): Promise<{ agentId: string; agent: Agent }> {
  const cacheKey = getWebsearchAgentCacheKey(model);
  
  // Check cache
  const cached = websearchAgentCache.get(cacheKey);
  if (cached && isWebsearchAgentCacheValid(cached)) {
    return { agentId: cached.agent.id, agent: cached.agent };
  }

  // Create new agent
  const client = createMistralClient(apiKey);
  
  try {
    const agent = await client.beta.agents.create({
      model: model,
      name: "WebSearch Agent",
      description: "Agent able to fetch new information on the web.",
      instructions: "Use your websearch abilities when answering requests you don't know. Be concise and direct. Use short sentences. Avoid fluff, filler words, and unnecessary explanations. Get to the point quickly.",
      tools: [{ type: "web_search" }],
      completionArgs: {
        temperature: DEFAULT_CONFIG.DEFAULT_TEMPERATURE,
        topP: DEFAULT_CONFIG.DEFAULT_TOP_P,
        maxTokens: DEFAULT_CONFIG.WEBSEARCH_MAX_TOKENS,
      },
    });

    // Cache the agent
    websearchAgentCache.set(cacheKey, {
      agent,
      model,
      createdAt: Date.now(),
    });

    return { agentId: agent.id, agent };
  } catch (error) {
    throw new WebsearchError(
      `Failed to create websearch agent: ${error instanceof Error ? error.message : String(error)}`,
      "agent_creation",
      true
    );
  }
}

/**
 * Clear websearch agent cache
 */
export function clearWebsearchAgentCache(): void {
  websearchAgentCache.clear();
}

/**
 * Get websearch agent cache statistics
 */
export function getWebsearchAgentCacheStats(): { size: number; entries: string[] } {
  return {
    size: websearchAgentCache.size,
    entries: Array.from(websearchAgentCache.keys()),
  };
}

// ============================================================================
// Conversation Cache Management
// ============================================================================

/**
 * Add conversation to cache
 */
export function cacheWebsearchConversation(
  conversationId: string,
  agentId: string,
  model: string,
  initialQuery: string
): void {
  // Enforce max cached conversations
  while (websearchConversationCache.size >= DEFAULT_CONFIG.MAX_CACHED_CONVERSATIONS) {
    // Remove oldest entry
    let oldestKey: string | undefined;
    let oldestTime = Infinity;
    for (const [key, entry] of websearchConversationCache) {
      if (entry.lastUsedAt < oldestTime) {
        oldestTime = entry.lastUsedAt;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      websearchConversationCache.delete(oldestKey);
    }
  }

  websearchConversationCache.set(conversationId, {
    conversationId,
    agentId,
    model,
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
    initialQuery,
  });
}

/**
 * Get conversation from cache
 */
export function getCachedWebsearchConversation(conversationId: string): WebsearchConversationCacheEntry | null {
  const entry = websearchConversationCache.get(conversationId);
  if (!entry) return null;
  
  if (!isWebsearchConversationCacheValid(entry)) {
    websearchConversationCache.delete(conversationId);
    return null;
  }
  
  // Update last used time
  entry.lastUsedAt = Date.now();
  return entry;
}

/**
 * List all cached conversations
 */
export function listWebsearchConversations(): WebsearchConversationCacheEntry[] {
  const now = Date.now();
  const ttl = DEFAULT_CONFIG.CONVERSATION_CACHE_TTL_MS;
  
  // Clean up stale entries first
  for (const [id, entry] of websearchConversationCache) {
    if (now - entry.lastUsedAt >= ttl) {
      websearchConversationCache.delete(id);
    }
  }
  
  return Array.from(websearchConversationCache.values());
}

/**
 * Clear specific conversation from cache
 */
export function clearWebsearchConversation(conversationId: string): boolean {
  return websearchConversationCache.delete(conversationId);
}

/**
 * Clear all websearch conversations from cache
 */
export function clearAllWebsearchConversations(): void {
  websearchConversationCache.clear();
}

/**
 * Clear stale websearch conversations
 */
export function clearStaleWebsearchConversations(): number {
  const now = Date.now();
  const ttl = DEFAULT_CONFIG.CONVERSATION_CACHE_TTL_MS;
  let cleared = 0;
  
  for (const [id, entry] of websearchConversationCache) {
    if (now - entry.lastUsedAt >= ttl) {
      websearchConversationCache.delete(id);
      cleared++;
    }
  }
  
  return cleared;
}

/**
 * Get websearch conversation cache statistics
 */
export function getWebsearchConversationCacheStats(): { size: number; entries: string[] } {
  return {
    size: websearchConversationCache.size,
    entries: Array.from(websearchConversationCache.keys()),
  };
}

// ============================================================================
// Completion Detection
// ============================================================================

/**
 * Check if a conversation is complete by examining its outputs.
 * A conversation is considered complete when:
 * - The last message output has a non-null completedAt timestamp, OR
 * - The web_search tool execution has a non-null completedAt timestamp
 * 
 * This is necessary because Mistral's ConversationResponse does not have a status field.
 * Completion must be determined by checking the completedAt field on output entries.
 */
function isConversationComplete(response: ConversationResponse): boolean {
  // Check if there's a completed message output (most common case)
  const messageOutputs = response.outputs.filter(
    (o): o is MessageOutputEntry => o.type === "message.output"
  );
  
  if (messageOutputs.length > 0) {
    const lastMessage = messageOutputs[messageOutputs.length - 1];
    if (lastMessage.completedAt != null) {
      return true;
    }
  }

  // Check if web_search tool execution is complete
  const toolExecutions = response.outputs.filter(
    (o): o is ToolExecutionEntry => o.type === "tool.execution"
  );
  
  const websearchTool = toolExecutions.find(tool => tool.name === "web_search");
  if (websearchTool?.completedAt != null) {
    return true;
  }

  // If any tool execution is complete, consider conversation complete
  if (toolExecutions.some(tool => tool.completedAt != null)) {
    return true;
  }

  return false;
}

/**
 * Check if a conversation history indicates completion.
 * A conversation is complete when the last message output or tool execution has completedAt set.
 */
function isConversationHistoryComplete(history: ConversationHistory): boolean {
  if (history.entries.length === 0) {
    return false;
  }

  // Check entries in order, last entry is most recent
  for (let i = history.entries.length - 1; i >= 0; i--) {
    const entry = history.entries[i];
    
    // Check message output completion
    if (entry.type === "message.output") {
      const messageEntry = entry as MessageOutputEntry;
      if (messageEntry.completedAt != null) {
        return true;
      }
    }
    
    // Check tool execution completion
    if (entry.type === "tool.execution") {
      const toolEntry = entry as ToolExecutionEntry;
      if (toolEntry.completedAt != null) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Convert ConversationHistory to a ConversationResponse-like structure
 * for compatibility with extractWebsearchResults.
 * This is a workaround since extractWebsearchResults expects ConversationResponse.
 */
function conversationHistoryToResponse(history: ConversationHistory): ConversationResponse {
  // Filter for message output entries (these contain the assistant's response)
  const messageOutputs = history.entries.filter(
    (e): e is MessageOutputEntry => e.type === "message.output"
  );

  return {
    object: "conversation.response",
    conversationId: history.conversationId,
    outputs: messageOutputs,
    usage: {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    },
  };
}

// ============================================================================
// Conversation Management
// ============================================================================

/**
 * Start a websearch conversation and poll for results
 */
export async function startWebsearchConversation(
  params: WebsearchConversationParams,
  apiKey: string,
  signal?: AbortSignal
): Promise<{ conversation: ConversationResponse; agentId: string; conversationId: string }> {
  const model = params.model || DEFAULT_CONFIG.DEFAULT_MODEL;
  const { agentId } = await getOrCreateWebsearchAgent(model, apiKey);

  const client = createMistralClient(apiKey);

  try {
    debugLog(`Starting conversation with agentId: ${agentId}, query: ${params.query.substring(0, 50)}...`);
    
    // Use agentId only - agent already has model and tools configured
    // store: true to allow conversation continuation
    const response = await client.beta.conversations.start(
      {
        agentId: agentId,
        inputs: params.query,
        stream: false,
        store: true,
      },
      { signal }
    );

    const conversationId = response.conversationId;
    
    // Cache the conversation
    cacheWebsearchConversation(conversationId, agentId, model, params.query);

    debugLog(`Conversation started: id=${conversationId}, complete=${isConversationComplete(response)}`);
    debugVerbose(`Outputs count: ${response.outputs.length}, usage:`, response.usage);
    return { conversation: response, agentId, conversationId };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw error;
    }
    throw new WebsearchError(
      `Failed to start websearch conversation: ${error instanceof Error ? error.message : String(error)}`,
      "conversation_start",
      true
    );
  }
}

/**
 * Poll conversation for websearch results using conversation history.
 * 
 * Uses conversations.getHistory() to retrieve entries with completion timestamps.
 * This is necessary because conversations.get() doesn't return outputs/entries.
 */
export async function pollWebsearchConversation(
  conversationId: string,
  agentId: string,
  apiKey: string,
  signal?: AbortSignal
): Promise<ConversationResponse> {
  const client = createMistralClient(apiKey);

  for (let attempt = 0; attempt < DEFAULT_CONFIG.WEBSEARCH_MAX_POLL_ATTEMPTS; attempt++) {
    if (signal?.aborted) {
      throw new Error("Websearch polling aborted");
    }

    try {
      // Get conversation history which includes entries with completion info
      const history = await client.beta.conversations.getHistory(
        { conversationId: conversationId },
        { signal }
      );
      
      debugLog(`Poll attempt ${attempt + 1}: entries=${history.entries.length}`);
      debugVerbose(`Last entry type: ${history.entries[history.entries.length - 1]?.type}`);
      
      // Check if conversation is complete
      if (isConversationHistoryComplete(history)) {
        debugLog(`Conversation completed`);
        // Convert history to ConversationResponse format for compatibility
        return conversationHistoryToResponse(history);
      }

      // Wait before next poll
      const delay = DEFAULT_CONFIG.WEBSEARCH_POLL_INTERVAL_MS * Math.pow(2, attempt); // Exponential backoff
      debugLog(`Waiting ${delay}ms before next attempt...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw error;
      }
      if (attempt === DEFAULT_CONFIG.WEBSEARCH_MAX_POLL_ATTEMPTS - 1) {
        throw new WebsearchError(
          `Failed to poll websearch conversation: ${error instanceof Error ? error.message : String(error)}`,
          "polling",
          true
        );
      }
    }
  }

  throw new WebsearchError(
    `Max polling attempts (${DEFAULT_CONFIG.WEBSEARCH_MAX_POLL_ATTEMPTS}) reached for websearch conversation`,
    "polling",
    false
  );
}

/**
 * Append a message to an existing websearch conversation
 */
export async function appendToWebsearchConversation(
  conversationId: string,
  query: string,
  apiKey: string,
  signal?: AbortSignal
): Promise<{ conversation: ConversationResponse; agentId: string }> {
  const client = createMistralClient(apiKey);

  try {
    debugLog(`Appending to conversation ${conversationId}, query: ${query.substring(0, 50)}...`);
    
    const response = await client.beta.conversations.append(
      {
        conversationId: conversationId,
        conversationAppendRequest: {
          inputs: query,
          stream: false,
          store: true,
        },
      },
      { signal }
    );

    debugLog(`Appended to conversation: id=${response.conversationId}, complete=${isConversationComplete(response)}`);
    debugVerbose(`Outputs count: ${response.outputs.length}, usage:`, response.usage);
    
    // Get agentId from cached conversation or fall back to any agent
    const cached = getCachedWebsearchConversation(conversationId);
    const agentId = cached?.agentId || "unknown";
    
    return { conversation: response, agentId };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw error;
    }
    throw new WebsearchError(
      `Failed to append to websearch conversation: ${error instanceof Error ? error.message : String(error)}`,
      "conversation_append",
      true
    );
  }
}

/**
 * Continue an existing websearch conversation with a new query
 * This appends the query and polls for results
 */
export async function continueWebsearchConversation(
  conversationId: string,
  params: WebsearchConversationParams,
  apiKey: string,
  signal?: AbortSignal
): Promise<{ conversation: ConversationResponse; agentId: string }> {
  // Append the new query to the existing conversation
  const { conversation: appendResponse, agentId } = await appendToWebsearchConversation(
    conversationId,
    params.query,
    apiKey,
    signal
  );

  // Update conversation cache with new query and usage
  const cached = getCachedWebsearchConversation(conversationId);
  if (cached) {
    cached.lastUsedAt = Date.now();
  }

  // Check if conversation is complete
  const hasCompletedOutput = appendResponse.outputs.some(output =>
    (output.type === "message.output" && output.completedAt != null) ||
    (output.type === "tool.execution" && output.completedAt != null)
  );

  if (!hasCompletedOutput) {
    debugLog(`Continuation not complete, polling...`);
    // Poll for results
    const polledResponse = await pollWebsearchConversation(
      appendResponse.conversationId,
      agentId,
      apiKey,
      signal
    );
    return { conversation: polledResponse, agentId };
  }

  return { conversation: appendResponse, agentId };
}

// ============================================================================
// Result Extraction
// ============================================================================

export interface WebsearchReference {
  tool: string;
  title: string;
  url: string;
  source: string;
}

export interface WebsearchResult {
  text: string;
  references: WebsearchReference[];
  conversationId?: string; // Optional: conversation ID for continuation
}

/**
 * Extract websearch results from conversation response
 */
export function extractWebsearchResults(conversation: ConversationResponse): WebsearchResult {
  const entry = conversation.outputs[conversation.outputs.length - 1] as MessageOutputEntry;
  
  if (!entry || !entry.content) {
    throw new WebsearchError("No content found in websearch response", "result_extraction", false);
  }

  let text = "";
  const references: WebsearchReference[] = [];
  let refIndex = 1;

  for (const chunk of entry.content) {
    if (typeof chunk === "string") {
      text += chunk;
    } else if (chunk && typeof chunk === "object") {
      if (chunk.type === "text" && chunk.text) {
        text += chunk.text;
      } else if (chunk.type === "tool_reference") {
        // Insert citation marker
        const ref: WebsearchReference = {
          tool: chunk.tool || "web_search",
          title: chunk.title || "",
          url: chunk.url || "",
          source: chunk.source || "",
        };
        
        // Replace with citation marker
        const citationMarker = `[${refIndex}]`;
        text += citationMarker;
        references.push(ref);
        refIndex++;
      }
    }
  }

  return { 
    text, 
    references,
    conversationId: conversation.conversationId
  };
}
