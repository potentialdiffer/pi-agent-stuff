import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { validateApiKey, saveApiKey, isConfigured, removeApiKey } from "../modules/auth.js";
import { DEFAULT_CONFIG } from "../config/constants.js";

// ============================================================================
// Setup Command
// Handles Mistral API key configuration
// ============================================================================

/**
 * Create the /mistral-setup command
 */
export function createSetupCommand(pi: ExtensionAPI) {
  return {
    description: "Set up Mistral API key for image generation and websearch",
    prompt: "Mistral API Key Setup",
    handler: async (args: string | undefined, ctx: ExtensionCommandContext) => {
      ctx.ui.notify("Mistral Image Generation Setup", "info");

      // Check if already configured
      if (isConfigured()) {
        const override = await ctx.ui.confirm(
          "API Key Already Configured",
          "You already have a Mistral API key configured. Overwrite it?"
        );
        
        if (!override) {
          ctx.ui.notify("Setup cancelled - using existing API key", "info");
          return;
        }
      }

      // Get API key from user
      const apiKey = await ctx.ui.input(
        "Enter your Mistral API key:",
        undefined,
        { password: true }
      );

      if (!apiKey?.trim()) {
        ctx.ui.notify("Setup cancelled - no API key provided", "warning");
        return;
      }

      // Optional: Get custom base URL
      let baseUrl: string | undefined;
      const useCustomUrl = await ctx.ui.confirm(
        "Custom Base URL",
        "Use a custom Mistral API base URL?"
      );

      if (useCustomUrl) {
        baseUrl = await ctx.ui.input(
          "Enter Mistral API base URL:",
          DEFAULT_CONFIG.BASE_URL
        );
      }

      // Validate the API key
      ctx.ui.notify("Validating API key...", "info");
      
      const isValid = await validateApiKey(apiKey.trim(), baseUrl?.trim());

      if (!isValid) {
        ctx.ui.notify("❌ Invalid API key. Please check and try again.", "error");
        
        // Offer to retry
        const retry = await ctx.ui.confirm(
          "Retry Setup",
          "Try again with a different API key?"
        );
        
        if (retry) {
          // Re-run setup
          await (createSetupCommand(pi).handler as Function)(args, ctx);
        }
        
        return;
      }

      // Save the API key
      saveApiKey(apiKey.trim(), baseUrl?.trim());
      
      ctx.ui.notify(
        "✓ API key saved successfully!\nYou can now use /mistral-image and /mistral-websearch.\nRestart pi or reload extensions for changes to take effect.",
        "info"
      );
    },
  };
}

/**
 * Create the /mistral-remove-key command
 */
export function createRemoveKeyCommand(pi: ExtensionAPI) {
  return {
    description: "Remove Mistral API key configuration",
    prompt: "Remove Mistral API Key",
    handler: async (args: string | undefined, ctx: ExtensionCommandContext) => {
      if (!isConfigured()) {
        ctx.ui.notify("No Mistral API key is currently configured", "warning");
        return;
      }

      const confirm = await ctx.ui.confirm(
        "Remove API Key",
        "Are you sure you want to remove your Mistral API key? You will need to reconfigure it to generate images."
      );

      if (!confirm) {
        ctx.ui.notify("API key removal cancelled", "info");
        return;
      }

      removeApiKey();
      ctx.ui.notify("✓ Mistral API key removed\nImage generation and websearch will no longer work.", "info");
    },
  };
}

/**
 * Register setup commands
 */
export function registerSetupCommands(pi: ExtensionAPI): void {
  pi.registerCommand("mistral-setup", createSetupCommand(pi));
  pi.registerCommand("mistral-remove-key", createRemoveKeyCommand(pi));
}
