import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { isConfigured, getApiKey } from "../modules/auth.ts";
import { DEFAULT_CONFIG } from "../config/constants.ts";

// ============================================================================
// Generate Command
// Direct image generation command
// ============================================================================

/**
 * Create the /mistral-image command
 */
export function createGenerateCommand(pi: ExtensionAPI) {
  return {
    description: "Generate an image using Mistral (usage: /mistral-image <prompt>)",
    prompt: "Generate Image",
    getArgumentCompletions: (prefix: string) => {
      // Could provide prompt suggestions in the future
      return [];
    },
    handler: async (args: string | undefined, ctx: ExtensionCommandContext) => {
      if (!args?.trim()) {
        ctx.ui.notify("Usage: /mistral-image <prompt>", "warning");
        ctx.ui.notify(
          "Example: /mistral-image a beautiful sunset over mountains, digital art style",
          "info"
        );
        return;
      }

      // Check configuration
      if (!isConfigured()) {
        ctx.ui.notify("MISTRAL_API_KEY not set. Run /mistral-setup first.", "error");
        return;
      }

      // Validate API key (optional - will be checked in tool execution)
      try {
        getApiKey();
      } catch (error) {
        ctx.ui.notify(`Configuration error: ${error instanceof Error ? error.message : String(error)}`, "error");
        return;
      }

      // Send the prompt as a user message
      // This will trigger the LLM to potentially use the mistral_generate_image tool
      const prompt = args.trim();
      
      // Check if prompt looks like it should use the tool directly
      const shouldUseToolDirectly = shouldUseImageTool(prompt);

      if (shouldUseToolDirectly) {
        // Send a message that clearly indicates image generation is requested
        await pi.sendUserMessage([
          { type: "text", text: `Generate an image: ${prompt}` },
        ]);
      } else {
        // Send the prompt as-is, let LLM decide
        await pi.sendUserMessage(prompt);
      }
    },
  };
}

/**
 * Create the /mistral-image-direct command for direct tool calling
 */
export function createDirectGenerateCommand(pi: ExtensionAPI) {
  return {
    description: "Directly call Mistral image generation tool",
    prompt: "Direct Image Generation",
    handler: async (args: string | undefined, ctx: ExtensionCommandContext) => {
      if (!args?.trim()) {
        ctx.ui.notify("Usage: /mistral-image-direct <prompt>", "warning");
        return;
      }

      if (!isConfigured()) {
        ctx.ui.notify("MISTRAL_API_KEY not set. Run /mistral-setup first.", "error");
        return;
      }

      // Use pi.sendUserMessage with a special format that triggers the tool
      // The LLM should recognize this as a direct image generation request
      const prompt = args.trim();
      
      // Format as a tool call request
      const message = `Please use the mistral_generate_image tool to create an image with this prompt: ${prompt}`;
      
      await pi.sendUserMessage(message);
    },
  };
}

/**
 * Determine if a prompt should directly use the image generation tool
 */
function shouldUseImageTool(prompt: string): boolean {
  const lowerPrompt = prompt.toLowerCase();
  
  const imageKeywords = [
    "generate image",
    "create image",
    "draw " ,
    "make an image",
    "produce an image",
    "render " ,
    "generate a picture",
    "create a picture",
    "make a picture",
    "image of " ,
    "picture of " ,
  ];

  return imageKeywords.some(keyword => lowerPrompt.includes(keyword));
}

/**
 * Register generate commands
 */
export function registerGenerateCommands(pi: ExtensionAPI): void {
  pi.registerCommand("mistral-image", createGenerateCommand(pi));
  pi.registerCommand("mistral-image-direct", createDirectGenerateCommand(pi));
}
