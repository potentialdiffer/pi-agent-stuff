// ============================================================================
// Websearch Tool
// Mistral websearch tool for pi
// ============================================================================

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { getApiKey } from "../modules/auth.js";
import { DEFAULT_CONFIG, debugLog } from "../config/constants.js";
import { clearLastWebsearchConversation, setLastWebsearchConversation } from "../index.js";
import {
  startWebsearchConversation,
  pollWebsearchConversation,
  extractWebsearchResults,
} from "../modules/websearch-manager.js";
import { formatWithMarkdown } from "../modules/websearch-display.js";
import { Text, Container, Spacer } from "@earendil-works/pi-tui";

// ============================================================================
// Websearch Tool Definition
// ============================================================================

interface WebsearchToolParams {
  query: string;
  model?: string;
  temperature?: number;
  topP?: number;
}

/**
 * Create the mistral_websearch tool definition
 */
export function createWebsearchTool(pi: ExtensionAPI) {
  return {
    name: "mistral_websearch",
    label: "Mistral Websearch",
    description: "Search the web using Mistral's websearch tool with citations",
    promptSnippet: "Search the web for information and return results with citations",
    promptGuidelines: [
      "Use mistral_websearch when user asks questions that require up-to-date information.",
      "Use for factual queries, news, recent events, or any information not in your training data.",
      "Provide the exact query the user asked, don't modify it unless necessary for clarity.",
      "The tool returns results with numbered citations that you should include in your response.",
    ],
    parameters: Type.Object({
      query: Type.String({
        description: "The search query or question to answer",
        minLength: 1,
        maxLength: 10000,
      }),
      model: Type.Optional(
        Type.String({
          description: "Mistral model to use for websearch",
          default: DEFAULT_CONFIG.DEFAULT_WEBSEARCH_MODEL,
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
      params: WebsearchToolParams,
      signal: AbortSignal | undefined,
      onUpdate: ((update: { content: Array<{ type: string; text?: string }> }) => void) | undefined,
      ctx: ExtensionContext
    ) {
      const startTime = Date.now();

      try {
        // Notify user that search is starting
        onUpdate?.({
          content: [
            { type: "text", text: `🔍 Starting websearch: "${params.query}"` },
          ],
        });

        // Get API key
        const apiKey = getApiKey();
        debugLog(`Retrieved API key`);

        // Use default model if not specified
        const model = params.model || DEFAULT_CONFIG.DEFAULT_WEBSEARCH_MODEL;
        const temperature = params.temperature ?? DEFAULT_CONFIG.DEFAULT_TEMPERATURE;
        const topP = params.topP ?? DEFAULT_CONFIG.DEFAULT_TOP_P;

        // Clear any existing conversation tracking (new search)
        clearLastWebsearchConversation();

        onUpdate?.({
          content: [
            { type: "text", text: "✓ Starting websearch conversation..." },
          ],
        });

        // Start websearch conversation
        const { conversation: conversationResponse, agentId, conversationId } = await startWebsearchConversation(
          {
            query: params.query,
            model,
            temperature,
            topP,
          },
          apiKey,
          signal
        );

        // Check if conversation is complete
        let finalConversation = conversationResponse;
        
        // Check completion by looking at outputs' completedAt field
        const hasCompletedOutput = conversationResponse.outputs.some(output => 
          (output.type === "message.output" && output.completedAt != null) ||
          (output.type === "tool.execution" && output.completedAt != null)
        );
        
        if (!hasCompletedOutput) {
          onUpdate?.({
            content: [
              { type: "text", text: "⏳ Waiting for websearch results..." },
            ],
          });

          // Poll for results using conversation history
          finalConversation = await pollWebsearchConversation(
            conversationId,
            agentId,
            apiKey,
            signal
          );
        }

        onUpdate?.({
          content: [
            { type: "text", text: "✓ Websearch completed" },
          ],
        });

        // Extract results
        const result = extractWebsearchResults(finalConversation);
        
        // Cache the conversation if it has an ID
        if (result.conversationId && !finalConversation.conversationId.startsWith('conv_')) {
          // Already cached in startWebsearchConversation
        }
        
        const elapsedMs = Date.now() - startTime;

        // Store conversation for follow-up
        if (result.conversationId) {
          setLastWebsearchConversation(result.conversationId, model);
        }

        // Return formatted result
        return {
          content: [
            { type: "text", text: result.text },
          ],
          details: {
            query: params.query,
            model: model,
            conversationId: result.conversationId,
            references: result.references,
            referenceCount: result.references.length,
            generationTimeMs: elapsedMs,
            timestamp: Date.now(),
          },
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        console.error("[Mistral Websearch] Search failed:", error);

        return {
          content: [
            { 
              type: "text", 
              text: `❌ Websearch failed: ${errorMessage}` 
            },
          ],
          details: {
            error: true,
            errorMessage,
            query: params.query,
            timestamp: Date.now(),
          },
          isError: true,
        };
      }
    },

    renderResult(result: any, _options: any, theme: any, _ctx: ExtensionContext) {
      // Handle error case
      if (result.isError) {
        return new Text(theme.fg("error", "❌ " + result.content[0]?.text || "Websearch failed"), 1, 1);
      }

      const container = new Container();
      
      // Add the main text content
      const textContent = result.content.find((c: any) => c.type === "text");
      if (textContent && textContent.text) {
        container.addChild(new Text(textContent.text, 1, 0));
        container.addChild(new Spacer(1));
      }

      // Add conversation ID if available
      if (result.details?.conversationId) {
        container.addChild(new Spacer(0.5));
        container.addChild(new Text(theme.fg("dim", `Conversation: ${result.details.conversationId.substring(0, 20)}...`), 1, 0));
      }

      // Add references if available
      if (result.details?.references && result.details.references.length > 0) {
        container.addChild(new Text(theme.fg("dim", "─".repeat(60)), 1, 0));
        container.addChild(new Text(theme.fg("accent", "References:"), 1, 0));
        container.addChild(new Text(theme.fg("dim", "─".repeat(60)), 1, 0));
        container.addChild(new Spacer(0.5));
        
        for (let i = 0; i < result.details.references.length; i++) {
          const ref = result.details.references[i];
          const refText = `[${i + 1}] ${ref.title} - ${ref.url}`;
          container.addChild(new Text(refText, 1, 0));
        }
      }

      // Add summary
      if (result.details) {
        const summaryLines = [
          `Query: ${result.details.query?.substring(0, 60)}${result.details.query?.length > 60 ? "..." : ""}`,
          `Model: ${result.details.model || "unknown"}`,
          `References: ${result.details.referenceCount || 0}`,
          `Time: ${result.details.generationTimeMs ? Math.round(result.details.generationTimeMs / 1000) + "s" : "unknown"}`,
        ];
        if (result.details.conversationId) {
          summaryLines.push(`Conv: ${result.details.conversationId.substring(0, 12)}...`);
        }
        container.addChild(new Spacer(1));
        container.addChild(new Text(summaryLines.map(l => theme.fg("dim", l)).join(" • "), 1, 0));
      }

      return container;
    },
  };
}

/**
 * Register the websearch tool with pi
 */
export function registerWebsearchTool(pi: ExtensionAPI): void {
  const tool = createWebsearchTool(pi);
  pi.registerTool(tool);
}
