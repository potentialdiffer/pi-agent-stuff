import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { Mistral } from "@mistralai/mistralai";
import { ImageGenerationParams, ImageGenerationResult, ImageGenerationError } from "../config/index.ts";
import { 
  getApiKey, 
  createMistralClient,
  getOrCreateImageAgent,
  startImageConversation,
  pollForFileIds,
  downloadImages,
  formatImageForDisplay,
  formatImagesForDisplay,
  createImageSummary
} from "../modules/index.ts";
import { DEFAULT_CONFIG } from "../config/index.ts";
import { Image, Container, Text, Spacer } from "@earendil-works/pi-tui";

// ============================================================================
// Image Generation Tool
// Main tool callable by the LLM
// ============================================================================

interface ToolParams {
  prompt: string;
  model?: string;
  temperature?: number;
  topP?: number;
}

/**
 * Create the mistral_generate_image tool definition
 */
export function createImageGenerationTool(pi: ExtensionAPI) {
  return {
    name: "mistral_generate_image",
    label: "Mistral Generate Image",
    description: "Generate images using Mistral's image generation API",
    promptSnippet: "Generate images from text descriptions",
    promptGuidelines: [
      "Use mistral_generate_image when user requests to create, generate, or draw images.",
      "Provide detailed, descriptive prompts for best results.",
      "Include style, lighting, composition, and subject details in prompts.",
    ],
    parameters: Type.Object({
      prompt: Type.String({
        description: "Text description of the image to generate",
        minLength: 1,
        maxLength: 10000,
      }),
      model: Type.Optional(
        Type.String({
          description: "Mistral model to use for generation",
          default: DEFAULT_CONFIG.DEFAULT_MODEL,
        })
      ),
      temperature: Type.Optional(
        Type.Number({
          description: "Sampling temperature (0-1)",
          default: DEFAULT_CONFIG.DEFAULT_TEMPERATURE,
          minimum: 0,
          maximum: 1,
        })
      ),
      topP: Type.Optional(
        Type.Number({
          description: "Top-p sampling parameter (0-1)",
          default: DEFAULT_CONFIG.DEFAULT_TOP_P,
          minimum: 0,
          maximum: 1,
        })
      ),
    }),
    
    async execute(
      toolCallId: string,
      params: ToolParams,
      signal: AbortSignal | undefined,
      onUpdate: ((update: { content: Array<{ type: string; text?: string; data?: string; mimeType?: string }> }) => void) | undefined,
      ctx: ExtensionContext
    ) {
      const startTime = Date.now();

      try {
        // Notify user that generation is starting
        onUpdate?.({
          content: [
            { type: "text", text: `🎨 Starting image generation: "${params.prompt}"` },
          ],
        });

        // Get API key
        const apiKey = getApiKey();
        console.debug(`[Mistral Image Tool] Retrieved API key: ${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)}`);
        
        // Create Mistral client
        const client = createMistralClient(apiKey);

        // Update progress
        onUpdate?.({
          content: [
            { type: "text", text: "✓ API authenticated, creating agent..." },
          ],
        });

        // Use default model if not specified
        const model = params.model || DEFAULT_CONFIG.DEFAULT_MODEL;

        onUpdate?.({
          content: [
            { type: "text", text: "✓ Starting image generation..." },
          ],
        });

        // Get or create agent for image generation
        const { agentId } = await getOrCreateImageAgent(model, apiKey);

        // Start conversation with agent
        const conversationParams: ImageGenerationParams = {
          prompt: params.prompt,
          model: model,
          temperature: params.temperature,
          topP: params.topP,
        };

        const { conversationId, response, fileIds } = await startImageConversation(
          client,
          agentId,
          conversationParams,
          signal,
          apiKey
        );

        // Check if we got file IDs immediately
        let finalFileIds = fileIds;
        
        if (finalFileIds.length === 0) {
          onUpdate?.({
            content: [
              { type: "text", text: "⏳ Waiting for image generation to complete..." },
            ],
          });

          // Poll for file IDs
          finalFileIds = await pollForFileIds(client, conversationId, { signal }, apiKey);
        }

        onUpdate?.({
          content: [
            { type: "text", text: `✓ Image generated! Found ${finalFileIds.length} file(s)` },
          ],
        });

        // Download all images
        onUpdate?.({
          content: [
            { type: "text", text: "⬇️ Downloading images..." },
          ],
        });

        const images = await downloadImages(client, finalFileIds, { signal });

        if (images.length === 0) {
          throw new ImageGenerationError(
            "No images were generated",
            "download",
            false
          );
        }

        // Format for display
        onUpdate?.({
          content: [
            { type: "text", text: "🖼️ Preparing images for display..." },
          ],
        });

        const displayResult = images.length === 1
          ? formatImageForDisplay(images[0])
          : formatImagesForDisplay(images);

        const elapsedMs = Date.now() - startTime;

        // Add summary to content
        displayResult.content.unshift({
          type: "text",
          text: `Image generation complete in ${Math.round(elapsedMs / 1000)}s`,
        });

        return {
          content: displayResult.content,
          details: {
            ...displayResult.details,
            model: params.model || DEFAULT_CONFIG.DEFAULT_MODEL,
            prompt: params.prompt,
            conversationId,
            fileIds: finalFileIds,
            generationTimeMs: elapsedMs,
            timestamp: Date.now(),
          },
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isGenerationError = error instanceof ImageGenerationError;

        console.error("[Mistral Image] Generation failed:", error);

        return {
          content: [
            { 
              type: "text", 
              text: `❌ Image generation failed: ${errorMessage}` 
            },
          ],
          details: {
            error: true,
            errorMessage,
            errorType: isGenerationError ? error.phase : "unknown",
            retryable: isGenerationError ? error.retryable : false,
            timestamp: Date.now(),
          },
          isError: true,
        };
      }
    },

    renderResult(result: any, _options: any, theme: any, _ctx: ExtensionContext) {
      // Handle error case
      if (result.isError) {
        return new Text(theme.fg("error", "❌ " + result.content[0]?.text || "Image generation failed"), 1, 1);
      }

      // Create ImageTheme-compatible theme object with fallbackColor method
      const imageTheme = {
        fallbackColor: (str: string) => theme.fg("muted", str)
      };

      const container = new Container();
      
      // Add summary text
      const summaryText = result.content.find((c: any) => c.type === "text" && c.text?.includes("Image generation complete"));
      if (summaryText) {
        container.addChild(new Text(theme.fg("success", summaryText.text), 1, 1));
        container.addChild(new Spacer(1));
      }

      // Find all image content items
      const imageItems = result.content.filter((c: any) => c.type === "image");
      
      if (imageItems.length === 0) {
        return new Text(theme.fg("muted", "No images to display"), 1, 1);
      }

      // Display each image
      for (const imageItem of imageItems) {
        if (imageItem.data && imageItem.mimeType) {
          try {
            // Create Image component with base64 data
            const imageComponent = new Image(
              imageItem.data,
              imageItem.mimeType,
              imageTheme,
              {
                maxWidthCells: 80,
                maxHeightCells: 24
              }
            );
            container.addChild(imageComponent);
            container.addChild(new Spacer(1));
          } catch (error) {
            console.error("[Mistral Image] Failed to create image component:", error);
            container.addChild(new Text(theme.fg("error", "⚠ Could not display image"), 1, 0));
            container.addChild(new Spacer(1));
          }
        }
      }

      // Add details
      if (result.details) {
        const detailsLines = [
          `Model: ${result.details.model || "unknown"}`,
          `Prompt: ${result.details.prompt?.substring(0, 60)}${result.details.prompt?.length > 60 ? "..." : ""}`,
          `Size: ${result.details.size ? Math.round(result.details.size / 1024) + "KB" : "unknown"}`,
          `Time: ${result.details.generationTimeMs ? Math.round(result.details.generationTimeMs / 1000) + "s" : "unknown"}`,
        ];
        container.addChild(new Text(detailsLines.map(l => theme.fg("dim", l)).join(" • "), 1, 0));
      }

      return container;
    },
  };
}

/**
 * Register the image generation tool with pi
 */
export function registerImageGenerationTool(pi: ExtensionAPI): void {
  const tool = createImageGenerationTool(pi);
  pi.registerTool(tool);
}
