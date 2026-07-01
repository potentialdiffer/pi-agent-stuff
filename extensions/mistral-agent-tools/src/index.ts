import type { ExtensionAPI, ExtensionContext, InputEvent } from "@earendil-works/pi-coding-agent";
import { registerImageGenerationTool, registerWebsearchTool, registerOcrTool } from "./tools/index.ts";
import { 
  registerSetupCommands, 
  registerStatusCommands, 
  registerGenerateCommands,
  registerExploreImagesCommand,
  registerWebsearchCommands,
  registerOcrCommands
} from "./commands/index.ts";
import { isConfigured, getApiKey } from "./modules/index.ts";
import { clearAgentCache, clearWebsearchAgentCache, cleanupTempImages, continueWebsearchConversation, extractWebsearchResults } from "./modules/index.ts";
import { formatWebsearchResult } from "./modules/websearch-display.ts";
import { DEFAULT_CONFIG, debugLog, debugAutocomplete } from "./config/index.ts";

// ============================================================================
// Mistral Agent Tools Extension
// Main entry point for image generation and websearch tools
// ============================================================================

/**
 * Mistral Agent Tools Extension for pi
 * 
 * Features:
 * - Image generation via Mistral's image generation API
 * - Websearch with citations via Mistral's websearch tool
 * - API key management (environment variable or auth.json)
 * - Agent caching for better performance
 * - Conversation-based workflows
 * - Image display in pi's TUI
 * - Image explorer for browsing saved images
 * 
 * Commands:
 * - /mistral-setup - Configure API key
 * - /mistral-status - Check configuration
 * - /mistral-image <prompt> - Generate an image
 * - /mistral-websearch <query> - Search the web
 * - /mistral-remove-key - Remove API key
 * - /mistral-cache-clear - Clear agent cache
 * - /explore-images - Browse saved images
 * 
 * Tools:
 * - mistral_generate_image - LLM-callable image generation
 * - mistral_websearch - LLM-callable websearch
 */

// Extension state
let lastWebsearchConversationId: string | null = null;
let lastWebsearchModel: string | null = null;

// State management functions
export function getLastWebsearchConversationId(): string | null {
  return lastWebsearchConversationId;
}

export function getLastWebsearchModel(): string | null {
  return lastWebsearchModel;
}

export function setLastWebsearchConversation(id: string, model: string): void {
  lastWebsearchConversationId = id;
  lastWebsearchModel = model;
}

export function clearLastWebsearchConversation(): void {
  lastWebsearchConversationId = null;
  lastWebsearchModel = null;
}

// Default export for pi extension loading (backward compatible name)
export default function mistralImageExtension(pi: ExtensionAPI) {
  // ========================================================================
  // Session Lifecycle Events
  // ========================================================================

  // Session start: Check configuration and notify user
  pi.on("session_start", async (_event, ctx) => {
    // Reset conversation tracking on new session
    lastWebsearchConversationId = null;
    lastWebsearchModel = null;
    
    try {
      getApiKey();
      ctx.ui.notify("✓ Mistral Agent Tools: Ready", "info");
    } catch (error) {
      ctx.ui.notify(
        "⚠ Mistral Agent Tools: Not configured. Run /mistral-setup to add your API key.",
        "warning"
      );
    }
  });

  // Session shutdown: Clean up resources
  pi.on("session_shutdown", async (event, ctx) => {
    // Clear conversation tracking
    lastWebsearchConversationId = null;
    lastWebsearchModel = null;
    
    // Clear agent caches on shutdown (optional - could persist across sessions)
    // clearAgentCache();
    // clearWebsearchAgentCache();
    
    // Clean up old temp files
    try {
      const deleted = await cleanupTempImages();
      if (deleted > 0) {
        debugLog(`Cleaned up ${deleted} old temp files`);
      }
    } catch (error) {
      console.error("[Mistral Agent Tools] Failed to cleanup temp files:", error);
    }
  });

  // Session before switch: Save state if needed
  pi.on("session_before_switch", async (event, ctx) => {
    // Clear conversation tracking on session switch
    lastWebsearchConversationId = null;
    lastWebsearchModel = null;
  });

  // ========================================================================
  // Resource Discovery
  // ========================================================================

  pi.on("resources_discover", async (event, _ctx) => {
    // Could add custom resources (skills, prompts, themes) here
    return {};
  });

  // ========================================================================
  // Register Tools
  // ========================================================================

  // Register the OCR tool
  debugAutocomplete("Registering OCR tool...");
  registerOcrTool(pi);
  debugAutocomplete("OCR tool registered successfully");

  // Register the image generation tool
  debugAutocomplete("Registering image generation tool...");
  registerImageGenerationTool(pi);
  debugAutocomplete("Image generation tool registered successfully");

  // Register the websearch tool
  debugAutocomplete("Registering websearch tool...");
  registerWebsearchTool(pi);
  debugAutocomplete("Websearch tool registered successfully");

  // ========================================================================
  // Register Commands
  // ========================================================================

  // Setup commands
  debugAutocomplete("Registering setup commands...");
  registerSetupCommands(pi);

  // Status commands
  debugAutocomplete("Registering status commands...");
  registerStatusCommands(pi);

  // Generate commands
  debugAutocomplete("Registering generate commands...");
  registerGenerateCommands(pi);

  // Image explorer command
  debugAutocomplete("Registering explore-images command...");
  registerExploreImagesCommand(pi);

  // Websearch commands
  debugAutocomplete("Registering websearch commands...");
  registerWebsearchCommands(pi);

  // OCR commands
  debugAutocomplete("Registering OCR commands...");
  registerOcrCommands(pi);
  debugAutocomplete("All commands registered successfully");

  // ========================================================================
  // Tool Events
  // ========================================================================

  // Track websearch conversation ID from tool results
  pi.on("tool_result", async (event, ctx) => {
    if (event.toolName === "mistral_websearch" && !event.isError) {
      // Store conversation ID for follow-up questions
      const conversationId = event.details?.conversationId;
      const model = event.details?.model;
      if (conversationId) {
        lastWebsearchConversationId = String(conversationId);
        lastWebsearchModel = model || DEFAULT_CONFIG.DEFAULT_WEBSEARCH_MODEL;
        debugLog(`Stored conversation ID for follow-up: ${String(conversationId).substring(0, 20)}...`);
      }
    }
  });

  // Intercept tool calls for logging
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName === "mistral_generate_image") {
      debugLog(`Image generation called: ${String(event.input?.prompt || "").substring(0, 50)}...`);
    } else if (event.toolName === "mistral_websearch") {
      debugLog(`Websearch called: ${String(event.input?.query || "").substring(0, 50)}...`);
    } else if (event.toolName === "ocr") {
      debugLog(`OCR called: ${String(event.input?.document || "").substring(0, 50)}...`);
    }
  });

  // Handle tool results (already tracked above, just log here)
  pi.on("tool_result", async (event, ctx) => {
    if (event.toolName === "mistral_generate_image") {
      if (event.isError) {
        console.error("[Mistral Agent Tools] Image generation failed:", event.details);
      } else {
        debugLog("Image generation successful");
      }
    } else if (event.toolName === "mistral_websearch") {
      if (event.isError) {
        console.error("[Mistral Agent Tools] Websearch failed:", event.details);
        // Clear conversation on error
        lastWebsearchConversationId = null;
        lastWebsearchModel = null;
      } else {
        debugLog("Websearch successful");
      }
    }
  });

  // ========================================================================
  // Input Events
  // ========================================================================

  // Could intercept user input to auto-detect image generation requests
  pi.on("input", async (event: InputEvent, ctx: ExtensionContext) => {
    // Check if input looks like an image generation request
    const inputText = String(event.text || "");
    const lowerInput = inputText.toLowerCase();
    
    const imagePatterns = [
      /^\/(mistral-)?image\s+/, // /image or /mistral-image
      /^generate (an? )?image of /i,
      /^create (an? )?image of /i,
      /^draw /i,
      /^make (an? )?image of /i,
    ];

    const websearchPatterns = [
      /^\/(mistral-)?websearch\s+/, // /websearch or /mistral-websearch
      /^search (the )?web for /i,
      /^look up /i,
      /^find information about /i,
    ];

    for (const pattern of imagePatterns) {
      if (pattern.test(lowerInput)) {
        debugLog(`Detected image request: ${inputText.substring(0, 50)}...`);
        break;
      }
    }

    for (const pattern of websearchPatterns) {
      if (pattern.test(lowerInput)) {
        debugLog(`Detected websearch request: ${inputText.substring(0, 50)}...`);
        break;
      }
    }

    // Auto-continue websearch conversation for follow-up questions
    // Only trigger for user input (not agent output or other sources)
    if (lastWebsearchConversationId && event.source === "interactive" && !inputText.startsWith("/") && inputText.trim()) {
      const trimmedInput = inputText.trim();
      
      // Check if this looks like a follow-up question (not a command)
      const isQuestion = /^\?|what|how|who|where|when|why|can you|tell me|explain|more about|follow up/i.test(trimmedInput.toLowerCase());
      const isShortQuery = trimmedInput.length < 200;
      
      if (isQuestion || isShortQuery) {
        debugLog(`Auto-continuing websearch conversation ${String(lastWebsearchConversationId).substring(0, 20)}... with: ${String(trimmedInput).substring(0, 50)}`);
        
        try {
          // Check if configured
          if (!isConfigured()) {
            return { action: "continue" };
          }
          
          const apiKey = getApiKey();
          const model = lastWebsearchModel || DEFAULT_CONFIG.DEFAULT_WEBSEARCH_MODEL;
          
          // Continue the conversation
          const { conversation, agentId } = await continueWebsearchConversation(
            lastWebsearchConversationId,
            { query: trimmedInput, model },
            apiKey
          );
          
          // Display results
          const result = extractWebsearchResults(conversation);
          const formatted = formatWebsearchResult(result, 80);
          
          ctx.ui.notify(`[Auto-continued] ${formatted}`, "info");
          
          // Update conversation tracking
          lastWebsearchModel = model;
          
          return { action: "suppress" }; // Suppress the original input
        } catch (error) {
          console.error("[Mistral Agent Tools] Auto-continue failed:", error);
          // Clear conversation on error
          lastWebsearchConversationId = null;
          lastWebsearchModel = null;
        }
      }
    }

    return { action: "continue" };
  });

  // ========================================================================
  // Error Handling
  // ========================================================================

  // Global error handler for extension errors
  process.on("uncaughtException", (error) => {
    console.error("[Mistral Agent Tools] Uncaught exception:", error);
  });

  process.on("unhandledRejection", (reason) => {
    console.error("[Mistral Agent Tools] Unhandled rejection:", reason);
  });

  // ========================================================================
  // Initialization Complete
  // ========================================================================

  debugLog(`Extension loaded successfully, model: ${DEFAULT_CONFIG.DEFAULT_MODEL}, configured: ${isConfigured()}`);
}

// Export for testing
export { mistralImageExtension };
