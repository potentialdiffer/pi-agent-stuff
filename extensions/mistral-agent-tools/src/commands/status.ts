import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { isConfigured, getApiKey, getBaseUrl, createMistralClient } from "../modules/auth.ts";
import { listAgents, getCacheStats, clearAgentCache } from "../modules/agent-manager.ts";
import { getWebsearchAgentCacheStats } from "../modules/websearch-manager.ts";
import { DEFAULT_CONFIG } from "../config/constants.ts";

// ============================================================================
// Status Command
// Shows configuration and status information
// ============================================================================

/**
 * Create the /mistral-status command
 */
export function createStatusCommand(pi: ExtensionAPI) {
  return {
    description: "Check Mistral image generation configuration status",
    prompt: "Mistral Status",
    handler: async (args: string | undefined, ctx: ExtensionCommandContext) => {
      const lines: string[] = [];
      lines.push("=== Mistral Agent Tools Status ===\n");

      // Configuration status
      if (isConfigured()) {
        lines.push("✓ Configuration: Configured");
        
        // Show API key info (masked)
        try {
          const apiKey = getApiKey();
          const maskedKey = `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
          lines.push(`  API Key: ${maskedKey}`);
        } catch {
          lines.push("  API Key: <available>");
        }

        // Show base URL
        const baseUrl = getBaseUrl();
        if (baseUrl) {
          lines.push(`  Base URL: ${baseUrl}`);
        } else {
          lines.push(`  Base URL: ${DEFAULT_CONFIG.BASE_URL} (default)`);
        }
      } else {
        lines.push("✗ Configuration: Not configured");
        lines.push("  Run /mistral-setup to add your API key");
      }

      lines.push("");

      // Agent cache status
      const cacheStats = getCacheStats();
      const websearchCacheStats = getWebsearchAgentCacheStats();
      lines.push("Agent Caches:");
      lines.push(`  Image agents: ${cacheStats.size}/${cacheStats.maxSize}`);
      lines.push(`  Websearch agents: ${websearchCacheStats.size}/${DEFAULT_CONFIG.MAX_CACHED_WEBSEARCH_AGENTS}`);

      // Try to list agents if configured
      if (isConfigured()) {
        try {
          const client = createMistralClient();
          const agents = await listAgents();
          lines.push(`  Total agents: ${agents.length}`);
          
          if (agents.length > 0) {
            lines.push("  Recent agents:");
            const recentAgents = agents.slice(-3).reverse();
            for (const agent of recentAgents) {
              lines.push(`    - ${agent.name} (${agent.model})`);
            }
          }
        } catch (error) {
          lines.push(`  Agents: Error listing (${error instanceof Error ? error.message : String(error)})`);
        }
      }

      lines.push("");
      lines.push("Defaults:");
      lines.push(`  Model: ${DEFAULT_CONFIG.DEFAULT_MODEL}`);
      lines.push(`  Temperature: ${DEFAULT_CONFIG.DEFAULT_TEMPERATURE}`);
      lines.push(`  Top-p: ${DEFAULT_CONFIG.DEFAULT_TOP_P}`);
      lines.push(`  Timeout: ${DEFAULT_CONFIG.API_TIMEOUT_MS / 1000}s`);

      lines.push("\n=== Help ===");
      lines.push("/mistral-setup             - Configure API key");
      lines.push("/mistral-image <prompt>     - Generate an image");
      lines.push("/mistral-websearch <query> - Search the web");
      lines.push("/mistral-remove-key       - Remove API key");

      ctx.ui.notify(lines.join("\n"), "info");
    },
  };
}

/**
 * Create the /mistral-cache-clear command
 */
export function createCacheClearCommand(pi: ExtensionAPI) {
  return {
    description: "Clear Mistral agent cache",
    prompt: "Clear Mistral Cache",
    handler: async (args: string | undefined, ctx: ExtensionCommandContext) => {
      const before = getCacheStats().size;
      clearAgentCache();
      const after = getCacheStats().size;
      
      ctx.ui.notify(
        `✓ Cleared ${before - after} cached agents`,
        "info"
      );
    },
  };
}

/**
 * Register status commands
 */
export function registerStatusCommands(pi: ExtensionAPI): void {
  pi.registerCommand("mistral-status", createStatusCommand(pi));
  pi.registerCommand("mistral-cache-clear", createCacheClearCommand(pi));
}
