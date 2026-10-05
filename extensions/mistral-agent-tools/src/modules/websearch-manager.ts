// ============================================================================
// Websearch Manager
// Manages websearch agent lifecycle and conversation handling
// ============================================================================

import type { Agent, ConversationResponse, MessageOutputEntry, ToolExecutionEntry, ModelConversation, AgentConversation, ConversationHistory } from "@mistralai/mistralai/models/components/index.js";
import { DEFAULT_CONFIG, debugLog, debugVerbose } from "../config/constants.ts";
import { createMistralClient } from "./auth.ts";
import { ConfigurationError, MistralApiError, WebsearchError } from "../config/types.ts";

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
  // Validate conversationId is a string
  if (typeof conversationId !== 'string' || conversationId.trim() === '') {
    console.warn('[Mistral Websearch] Invalid conversationId, skipping cache:', conversationId);
    return;
  }

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
    initialQuery: typeof initialQuery === 'string' ? initialQuery : '',
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
 * Check if a message output entry already carries a usable answer.
 *
 * SDK 2.7.0: content is either a plain string (uncited answers) or an array
 * of typed chunks (never an array of strings). Must guard the string case
 * first - calling .some() on a string throws.
 *
 * Mistral no longer populates completedAt on conversation history entries
 * (verified null minutes after successful completion), so the presence of
 * answer text is the reliable completion signal for polling.
 */
function hasMeaningfulContent(entry: MessageOutputEntry): boolean {
  const content = entry.content;
  if (typeof content === "string") {
    return content.trim().length > 0;
  }
  if (!content || content.length === 0) {
    return false;
  }
  // Only text chunks count as an answer; a message with only tool_reference
  // chunks (or whitespace-only text) is not a usable answer yet.
  return content.some(
    (chunk) => chunk.type === "text" && typeof chunk.text === "string" && chunk.text.trim().length > 0
  );
}

/**
 * Check if a conversation is complete by examining its outputs.
 * A conversation is considered complete when:
 * - The last message output has a non-null completedAt timestamp or answer text, OR
 * - The web_search tool execution has a non-null completedAt timestamp
 * 
 * This is necessary because Mistral's ConversationResponse does not have a status field.
 * CompletedAt is checked first (documented signal), answer text is the fallback
 * for when Mistral omits completion timestamps.
 */
function isConversationComplete(response: ConversationResponse): boolean {
  // Check if there's a completed message output (most common case)
  const messageOutputs = response.outputs.filter(
    (o): o is MessageOutputEntry => o.type === "message.output"
  );
  
  if (messageOutputs.length > 0) {
    const lastMessage = messageOutputs[messageOutputs.length - 1];
    if (lastMessage.completedAt != null || hasMeaningfulContent(lastMessage)) {
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
 * getHistory returns the WHOLE conversation, not just the current turn.
 * Only entries AFTER the last message.input belong to the current turn:
 * earlier turns' message.output entries always carry answer text and would
 * falsely mark a pending follow-up complete (stale-answer bug).
 */
function getCurrentTurnEntries(entries: ConversationHistory["entries"]): ConversationHistory["entries"] {
  const lastInput = entries.map((e) => e.type).lastIndexOf("message.input");
  return lastInput === -1 ? entries : entries.slice(lastInput + 1);
}

/**
 * Check if a conversation history indicates completion.
 * The current turn is complete when its message output has completedAt set
 * or already carries answer text. A completed tool.execution alone does NOT
 * count: without a message.output there is no answer to extract (extraction
 * would throw "No content found"), and history completedAt is currently
 * never populated anyway (verified null after successful completion).
 */
function isConversationHistoryComplete(history: ConversationHistory): boolean {
  const turn = getCurrentTurnEntries(history.entries);
  if (turn.length === 0) {
    return false;
  }

  // Check entries in order, last entry is most recent. Only a message output
  // with a completion timestamp or answer text completes the turn; otherwise
  // keep polling for the answer.
  for (let i = turn.length - 1; i >= 0; i--) {
    const entry = turn[i];

    if (entry.type === "message.output") {
      const messageEntry = entry as MessageOutputEntry;
      if (messageEntry.completedAt != null || hasMeaningfulContent(messageEntry)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check whether a conversation response already contains a usable result:
 * an entry with a completion timestamp (the documented signal) or a
 * message output that already carries answer text.
 *
 * Mistral has stopped populating completedAt on some response paths
 * (verified null on entries whose content is fully present), so text
 * presence is the reliable fallback.
 */
export function hasCompletedConversationOutput(response: ConversationResponse): boolean {
  return response.outputs.some((output) => {
    if (output.type === "message.output") {
      const message = output as MessageOutputEntry;
      return message.completedAt != null || hasMeaningfulContent(message);
    }
    return output.type === "tool.execution" && (output as ToolExecutionEntry).completedAt != null;
  });
}

/**
 * Convert ConversationHistory to a ConversationResponse-like structure
 * for compatibility with extractWebsearchResults.
 * This is a workaround since extractWebsearchResults expects ConversationResponse.
 */
function conversationHistoryToResponse(history: ConversationHistory): ConversationResponse {
  // Filter the CURRENT TURN for message output entries (these contain the
  // assistant's response). Without the turn slice this returns a previous
  // turn's answer for a follow-up query.
  const messageOutputs = getCurrentTurnEntries(history.entries).filter(
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
 * Uses conversations.getHistory() to retrieve entries. A conversation counts as
 * complete when an entry has completedAt set or a message output already carries
 * answer text (Mistral has stopped populating completedAt reliably).
 * Polling runs at a fixed interval with a hard deadline of
 * WEBSEARCH_MAX_POLL_ATTEMPTS * WEBSEARCH_POLL_INTERVAL_MS.
 */
export async function pollWebsearchConversation(
  conversationId: string,
  agentId: string,
  apiKey: string,
  signal?: AbortSignal
): Promise<ConversationResponse> {
  const client = createMistralClient(apiKey);

  const totalBudgetMs =
    DEFAULT_CONFIG.WEBSEARCH_MAX_POLL_ATTEMPTS * DEFAULT_CONFIG.WEBSEARCH_POLL_INTERVAL_MS;
  const deadline = Date.now() + totalBudgetMs;

  for (let attempt = 0; attempt < DEFAULT_CONFIG.WEBSEARCH_MAX_POLL_ATTEMPTS; attempt++) {
    if (signal?.aborted) {
      throw new Error("Websearch polling aborted");
    }

    // First poll fires immediately; later polls wait the fixed interval.
    // Fixed interval - never exponential backoff, which made the "2.5 minute"
    // polling window silently grow to days. The wall-clock deadline is a
    // backstop against attempt-count overshoot from slow API calls.
    if (attempt > 0) {
      const waitMs = Math.min(DEFAULT_CONFIG.WEBSEARCH_POLL_INTERVAL_MS, deadline - Date.now());
      if (waitMs <= 0) {
        break;
      }
      debugLog(`Waiting ${waitMs}ms before next attempt...`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      break;
    }

    try {
      // Get conversation history which includes entries with completion info.
      // Bound each call to the remaining deadline so a hung request cannot
      // stall past the hard deadline. Note: AbortSignal.any() throws on
      // nullish entries (unlike the WHATWG spec), so only include the
      // caller's signal when one was actually provided.
      const callSignals = [AbortSignal.timeout(Math.max(remainingMs, 1))];
      if (signal) {
        callSignals.push(signal);
      }
      const history = await client.beta.conversations.getHistory(
        { conversationId: conversationId },
        { signal: AbortSignal.any(callSignals) }
      );
      
      debugLog(`Poll attempt ${attempt + 1}: entries=${history.entries.length}`);
      debugVerbose(`Last entry type: ${history.entries[history.entries.length - 1]?.type}`);
      
      // Check if conversation is complete
      if (isConversationHistoryComplete(history)) {
        debugLog(`Conversation completed`);
        // Convert history to ConversationResponse format for compatibility
        return conversationHistoryToResponse(history);
      }
    } catch (error) {
      // User abort: the SDK throws RequestAbortedError (its name is NOT
      // "AbortError"), so key off the signal itself. This also covers an
      // abort during the final attempt, which would otherwise be reported
      // as the 120s timeout.
      if (signal?.aborted) {
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw error;
      }
      // Transient getHistory failure (429/5xx/network) or per-call timeout:
      // keep waiting out the deadline instead of burning all attempts back
      // to back, then surface a clear timeout error.
      debugLog(`Poll attempt ${attempt + 1} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new WebsearchError(
    `Websearch conversation ${conversationId} did not complete within ${Math.round(totalBudgetMs / 1000)} seconds. ` +
      `Mistral's web_search backend may be delayed or stuck (news-type queries are known to hang ` +
      `server-side). Retry, or rephrase as a non-news query.`,
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
  const hasCompletedOutput = hasCompletedConversationOutput(appendResponse);

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
