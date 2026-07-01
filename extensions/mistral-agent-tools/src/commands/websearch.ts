// ============================================================================
// Websearch Command
// /mistral-websearch command for pi
// ============================================================================

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { isConfigured, getApiKey } from "../modules/auth.ts";
import { DEFAULT_CONFIG, debugLog, debugAutocomplete } from "../config/constants.ts";
import {
  startWebsearchConversation,
  continueWebsearchConversation,
  pollWebsearchConversation,
  extractWebsearchResults,
  clearWebsearchAgentCache,
  getWebsearchAgentCacheStats,
  clearWebsearchConversation,
  clearAllWebsearchConversations,
  listWebsearchConversations,
  getCachedWebsearchConversation,
} from "../modules/websearch-manager.ts";
import { formatWebsearchResult } from "../modules/websearch-display.ts";
import { clearLastWebsearchConversation, setLastWebsearchConversation } from "../index.ts";

// ============================================================================
// Websearch Command
// ============================================================================

/**
 * Create the /mistral-websearch command
 */
export function createWebsearchCommand(pi: ExtensionAPI) {
  return {
    description: "Search the web using Mistral (usage: /mistral-websearch <query>)",
    prompt: "Websearch",
    getArgumentCompletions: (prefix: string) => {
      debugAutocomplete(`Websearch command getArgumentCompletions called with prefix: "${prefix}"`);
      const result = [];
      debugAutocomplete(`Websearch command getArgumentCompletions returning:`, result);
      return result;
    },
    handler: async (args: string | undefined, ctx: ExtensionCommandContext) => {
      if (!args?.trim()) {
        ctx.ui.notify("Usage: /mistral-websearch <query>", "warning");
        ctx.ui.notify(
          "Example: /mistral-websearch Who is Albert Einstein?",
          "info"
        );
        return;
      }

      // Check configuration
      if (!isConfigured()) {
        ctx.ui.notify("MISTRAL_API_KEY not set. Run /mistral-setup first.", "error");
        return;
      }

      // Validate API key
      try {
        getApiKey();
      } catch (error) {
        ctx.ui.notify(`Configuration error: ${error instanceof Error ? error.message : String(error)}`, "error");
        return;
      }

      const query = args.trim();
      ctx.ui.notify(`🔍 Searching the web for: "${query}"`, "info");

      // Clear any existing conversation tracking (new search)
      clearLastWebsearchConversation();

      try {
        debugLog(`Starting websearch for: ${query}`);
        // Start websearch conversation
        const { conversation, agentId, conversationId } = await startWebsearchConversation(
          {
            query,
            model: DEFAULT_CONFIG.DEFAULT_WEBSEARCH_MODEL,
            temperature: DEFAULT_CONFIG.DEFAULT_TEMPERATURE,
            topP: DEFAULT_CONFIG.DEFAULT_TOP_P,
          },
          getApiKey()
        );

        // Poll if needed - check if any output has completedAt set
        const hasCompletedOutput = conversation.outputs.some(output => 
          (output.type === "message.output" && output.completedAt != null) ||
          (output.type === "tool.execution" && output.completedAt != null)
        );
        
        if (!hasCompletedOutput) {
          ctx.ui.notify("⏳ Waiting for search results...", "info");
          const polledConversation = await pollWebsearchConversation(
            conversationId,
            agentId,
            getApiKey()
          );
          await displayWebsearchResults(polledConversation, ctx, conversationId);
          // Store conversation for follow-up
          setLastWebsearchConversation(conversationId, DEFAULT_CONFIG.DEFAULT_WEBSEARCH_MODEL);
          return;
        }

        await displayWebsearchResults(conversation, ctx, conversationId);
        
        // Store conversation for follow-up
        setLastWebsearchConversation(conversationId, DEFAULT_CONFIG.DEFAULT_WEBSEARCH_MODEL);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(`❌ Websearch failed: ${errorMessage}`, "error");
        // Clear on error
        clearLastWebsearchConversation();
      }
    },
  };
}

/**
 * Display websearch results
 */
async function displayWebsearchResults(conversation: any, ctx: ExtensionCommandContext, conversationId?: string): Promise<void> {
  try {
    const result = extractWebsearchResults(conversation);
    const formatted = formatWebsearchResult(result, 80);
    
    // Add conversation ID hint if available
    const displayText = conversationId 
      ? `${formatted}\n\n[Conversation: ${conversationId.substring(0, 20)}... - Use /mistral-websearch-continue to follow up]`
      : formatted;
    
    ctx.ui.notify(displayText, "info");
  } catch (error) {
    // Fallback display
    const entry = conversation.outputs?.[conversation.outputs.length - 1];
    if (entry && entry.content) {
      const content = entry.content
        .map((c: any) => typeof c === "string" ? c : JSON.stringify(c))
        .join(" ");
      ctx.ui.notify(`Websearch completed:\n\n${content}`, "info");
      return;
    }
    
    ctx.ui.notify("Websearch completed but no results could be extracted.", "info");
  }
}

// ============================================================================
// Conversation Management Commands
// ============================================================================

/**
 * Create the /mistral-websearch-continue command
 */
export function createWebsearchContinueCommand(pi: ExtensionAPI) {
  return {
    description: "Continue a websearch conversation (usage: /mistral-websearch-continue <conversation_id> <query>)",
    prompt: "Continue Websearch",
    getArgumentCompletions: (prefix: string) => {
      debugAutocomplete(`Websearch-continue command getArgumentCompletions called with prefix: "${prefix}"`);
      const conversations = listWebsearchConversations();
      debugAutocomplete(`Websearch-continue: found ${conversations.length} conversations in cache`);
      const filtered = conversations.filter(c => typeof c.conversationId === 'string' && typeof c.initialQuery === 'string');
      debugAutocomplete(`Websearch-continue: filtered to ${filtered.length} valid conversations`);
      const result = filtered.map(c => ({
        value: c.conversationId,
        label: `${c.conversationId.substring(0, 20)}... - "${c.initialQuery.substring(0, 30)}${c.initialQuery.length > 30 ? "..." : ""}"`
      }));
      debugAutocomplete(`Websearch-continue command getArgumentCompletions returning ${result.length} items:`, result);
      return result;
    },
    handler: async (args: string | undefined, ctx: ExtensionCommandContext) => {
      if (!args?.trim()) {
        ctx.ui.notify("Usage: /mistral-websearch-continue <conversation_id> <query>", "warning");
        return;
      }

      // Check configuration
      if (!isConfigured()) {
        ctx.ui.notify("MISTRAL_API_KEY not set. Run /mistral-setup first.", "error");
        return;
      }

      try {
        getApiKey();
      } catch (error) {
        ctx.ui.notify(`Configuration error: ${error instanceof Error ? error.message : String(error)}`, "error");
        return;
      }

      // Parse conversation_id and query
      const parts = args.trim().split(/\s+/, 2);
      if (parts.length < 2) {
        ctx.ui.notify("Usage: /mistral-websearch-continue <conversation_id> <query>", "warning");
        return;
      }

      const conversationId = parts[0];
      const query = parts[1];

      // Check if conversation exists in cache
      const cached = getCachedWebsearchConversation(conversationId);
      if (!cached) {
        ctx.ui.notify(`Conversation ${conversationId.substring(0, 20)}... not found in cache. Use /mistral-websearch-list to see active conversations.`, "error");
        return;
      }

      ctx.ui.notify(`🔍 Continuing conversation ${conversationId.substring(0, 20)}... with: "${query}"`, "info");

      try {
        debugLog(`Continuing websearch conversation ${conversationId} with: ${query}`);
        
        const { conversation, agentId } = await continueWebsearchConversation(
          conversationId,
          {
            query,
            model: cached.model,
          },
          getApiKey()
        );

        await displayWebsearchResults(conversation, ctx, conversationId);
        
        // Update conversation tracking for follow-up
        setLastWebsearchConversation(conversationId, cached.model);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(`❌ Failed to continue conversation: ${errorMessage}`, "error");
        // Clear on error
        clearLastWebsearchConversation();
      }
    },
  };
}

/**
 * Create the /mistral-websearch-last command
 */
export function createWebsearchLastCommand(pi: ExtensionAPI) {
  return {
    description: "Continue the last websearch conversation (usage: /mistral-websearch-last <query>)",
    prompt: "Continue Last Websearch",
    handler: async (args: string | undefined, ctx: ExtensionCommandContext) => {
      if (!args?.trim()) {
        ctx.ui.notify("Usage: /mistral-websearch-last <query>", "warning");
        return;
      }

      // Check configuration
      if (!isConfigured()) {
        ctx.ui.notify("MISTRAL_API_KEY not set. Run /mistral-setup first.", "error");
        return;
      }

      try {
        getApiKey();
      } catch (error) {
        ctx.ui.notify(`Configuration error: ${error instanceof Error ? error.message : String(error)}`, "error");
        return;
      }

      const query = args.trim();

      // Get the most recent conversation
      const conversations = listWebsearchConversations();
      if (conversations.length === 0) {
        ctx.ui.notify("No active websearch conversations found. Start a new one with /mistral-websearch.", "error");
        return;
      }

      // Sort by lastUsedAt, get most recent
      conversations.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
      const lastConversation = conversations[0];

      ctx.ui.notify(`🔍 Continuing last conversation ${lastConversation.conversationId.substring(0, 20)}... with: "${query}"`, "info");

      try {
        debugLog(`Continuing last websearch conversation ${lastConversation.conversationId} with: ${query}`);
        
        const { conversation, agentId } = await continueWebsearchConversation(
          lastConversation.conversationId,
          {
            query,
            model: lastConversation.model,
          },
          getApiKey()
        );

        await displayWebsearchResults(conversation, ctx, lastConversation.conversationId);
        
        // Update conversation tracking for follow-up
        setLastWebsearchConversation(lastConversation.conversationId, lastConversation.model);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(`❌ Failed to continue conversation: ${errorMessage}`, "error");
        // Clear on error
        clearLastWebsearchConversation();
      }
    },
  };
}

/**
 * Create the /mistral-websearch-list command
 */
export function createWebsearchListCommand(pi: ExtensionAPI) {
  return {
    description: "List active websearch conversations",
    prompt: "List Websearch Conversations",
    handler: async (args: string | undefined, ctx: ExtensionCommandContext) => {
      const conversations = listWebsearchConversations();
      
      if (conversations.length === 0) {
        ctx.ui.notify("No active websearch conversations.", "info");
        return;
      }

      const lines = ["Active Websearch Conversations:", "─".repeat(60)];
      
      // Sort by lastUsedAt, most recent first
      conversations.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
      
      for (let i = 0; i < Math.min(conversations.length, 10); i++) {
        const conv = conversations[i];
        const ageMinutes = Math.floor((Date.now() - conv.lastUsedAt) / 60000);
        const shortId = conv.conversationId.substring(0, 16);
        const shortQuery = conv.initialQuery.substring(0, 40);
        lines.push(`  [${i + 1}] ${shortId}... - "${shortQuery}${conv.initialQuery.length > 40 ? "..." : ""}" (${ageMinutes}m ago)`);
      }
      
      if (conversations.length > 10) {
        lines.push(`  ... and ${conversations.length - 10} more`);
      }
      
      lines.push("─".repeat(60));
      lines.push("Use: /mistral-websearch-continue <id> <query>");
      lines.push("     /mistral-websearch-last <query>");
      
      ctx.ui.notify(lines.join("\n"), "info");
    },
  };
}

/**
 * Create the /mistral-websearch-clear command
 */
export function createWebsearchClearCommand(pi: ExtensionAPI) {
  return {
    description: "Clear a websearch conversation (usage: /mistral-websearch-clear <conversation_id>)",
    prompt: "Clear Websearch Conversation",
    getArgumentCompletions: (prefix: string) => {
      debugAutocomplete(`Websearch-clear command getArgumentCompletions called with prefix: "${prefix}"`);
      const conversations = listWebsearchConversations();
      debugAutocomplete(`Websearch-clear: found ${conversations.length} conversations in cache`);
      const filtered = conversations.filter(c => typeof c.conversationId === 'string' && typeof c.initialQuery === 'string');
      debugAutocomplete(`Websearch-clear: filtered to ${filtered.length} valid conversations`);
      const result = filtered.map(c => ({
        value: c.conversationId,
        label: `${c.conversationId.substring(0, 20)}... - "${c.initialQuery.substring(0, 30)}${c.initialQuery.length > 30 ? "..." : ""}"`
      }));
      debugAutocomplete(`Websearch-clear command getArgumentCompletions returning ${result.length} items:`, result);
      return result;
    },
    handler: async (args: string | undefined, ctx: ExtensionCommandContext) => {
      if (!args?.trim()) {
        ctx.ui.notify("Usage: /mistral-websearch-clear <conversation_id>", "warning");
        ctx.ui.notify("Use /mistral-websearch-list to see conversation IDs", "info");
        return;
      }

      const conversationId = args.trim().split(" ")[0];
      
      const cleared = clearWebsearchConversation(conversationId);
      if (cleared) {
        ctx.ui.notify(`✓ Cleared conversation ${conversationId.substring(0, 20)}...`, "info");
      } else {
        ctx.ui.notify(`Conversation ${conversationId.substring(0, 20)}... not found`, "warning");
      }
    },
  };
}

/**
 * Create the /mistral-websearch-clear-all command
 */
export function createWebsearchClearAllCommand(pi: ExtensionAPI) {
  return {
    description: "Clear all websearch conversations",
    prompt: "Clear All Websearch Conversations",
    handler: async (args: string | undefined, ctx: ExtensionCommandContext) => {
      const before = listWebsearchConversations().length;
      clearAllWebsearchConversations();
      ctx.ui.notify(`✓ Cleared all ${before} websearch conversations`, "info");
    },
  };
}

// ============================================================================
// Cache Management Commands
// ============================================================================

/**
 * Create the /mistral-websearch-cache-clear command
 */
export function createWebsearchCacheClearCommand(pi: ExtensionAPI) {
  return {
    description: "Clear the websearch agent cache",
    prompt: "Clear Websearch Cache",
    handler: async (args: string | undefined, ctx: ExtensionCommandContext) => {
      const before = getWebsearchAgentCacheStats().size;
      clearWebsearchAgentCache();
      const after = getWebsearchAgentCacheStats().size;
      
      ctx.ui.notify(
        `✓ Cleared ${before - after} cached websearch agents`,
        "info"
      );
    },
  };
}

/**
 * Create the /mistral-websearch-cache-stats command
 */
export function createWebsearchCacheStatsCommand(pi: ExtensionAPI) {
  return {
    description: "Show websearch agent cache statistics",
    prompt: "Websearch Cache Stats",
    handler: async (args: string | undefined, ctx: ExtensionCommandContext) => {
      const stats = getWebsearchAgentCacheStats();
      ctx.ui.notify(
        `Websearch Agent Cache:\n- Size: ${stats.size}\n- Max: ${DEFAULT_CONFIG.MAX_CACHED_WEBSEARCH_AGENTS}\n- Entries: ${stats.entries.join(", ") || "none"}`,
        "info"
      );
    },
  };
}

// ============================================================================
// Register Functions
// ============================================================================

/**
 * Register websearch commands
 */
export function registerWebsearchCommands(pi: ExtensionAPI): void {
  pi.registerCommand("mistral-websearch", createWebsearchCommand(pi));
  
  // Conversation management commands
  pi.registerCommand("mistral-websearch-continue", createWebsearchContinueCommand(pi));
  pi.registerCommand("mistral-websearch-last", createWebsearchLastCommand(pi));
  pi.registerCommand("mistral-websearch-list", createWebsearchListCommand(pi));
  pi.registerCommand("mistral-websearch-clear", createWebsearchClearCommand(pi));
  pi.registerCommand("mistral-websearch-clear-all", createWebsearchClearAllCommand(pi));
  
  // Cache management commands
  pi.registerCommand("mistral-websearch-cache-clear", createWebsearchCacheClearCommand(pi));
  pi.registerCommand("mistral-websearch-cache-stats", createWebsearchCacheStatsCommand(pi));
}
