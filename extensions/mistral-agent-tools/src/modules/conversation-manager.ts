import { Mistral } from "@mistralai/mistralai";
import type { ConversationResponse, MessageOutputEntry, ToolFileChunk } from "@mistralai/mistralai/models/components/index.js";
import { ImageGenerationParams, ImageGenerationError } from "../config/types.ts";
import { DEFAULT_CONFIG } from "../config/constants.ts";
import { getApiKey } from "../modules/auth.ts";

// ============================================================================
// Conversation Manager Module
// Manages conversation lifecycle for image generation
// ============================================================================

interface PollingOptions {
  intervalMs?: number;
  maxAttempts?: number;
  signal?: AbortSignal;
}

/**
 * Start a conversation for image generation
 * Note: Mistral API requires ONLY ONE of agentId or model
 * Using raw fetch to avoid SDK auto-adding both
 */
export async function startImageConversation(
  client: Mistral,
  agentId: string | null,
  params: ImageGenerationParams,
  signal?: AbortSignal,
  apiKey?: string
): Promise<{ 
  conversationId: string; 
  response: ConversationResponse; 
  fileIds: string[]; 
}> {
  // Check if signal is already aborted
  if (signal?.aborted) {
    throw new ImageGenerationError(
      "Conversation start aborted by signal",
      "conversation_start",
      true
    );
  }
  
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
    
    // Use raw fetch to have full control over the request body
    // Build request with agent_id (required for image generation)
    const requestBody = {
      agent_id: agentId,
      inputs: params.prompt,
      stream: false,
    };
    
    console.debug(`[Mistral Conversation] Sending request to: ${baseUrl}/v1/conversations`);
    console.debug(`[Mistral Conversation] API key: ${resolvedApiKey.substring(0, 8)}...${resolvedApiKey.substring(resolvedApiKey.length - 4)}`);
    console.debug(`[Mistral Conversation] Request body:`, JSON.stringify(requestBody, null, 2));
    
    const response = await fetch(`${baseUrl}/v1/conversations`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resolvedApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: signal,
    });
    
    console.debug(`[Mistral Conversation] Response status: ${response.status}`);
    console.debug(`[Mistral Conversation] Response headers:`, Object.fromEntries(response.headers.entries()));
    
    if (!response.ok) {
      const errorText = await response.text();
      console.debug(`[Mistral Conversation] Response body: ${errorText}`);
      throw new Error(`API error: ${response.status} - ${errorText}`);
    }
    
    const responseData = await response.json() as ConversationResponse;
    console.debug(`[Mistral Conversation] Response data:`, JSON.stringify(responseData, null, 2));

    // Extract file IDs from response
    const fileIds = extractFileIdsFromResponse(responseData);
    console.debug(`[Mistral Conversation] Extracted file IDs: ${fileIds.length}`);

    return {
      conversationId: responseData.id,
      response: responseData,
      fileIds,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new ImageGenerationError(
      `Failed to start conversation: ${errorMessage}`,
      "conversation_start",
      true
    );
  }
}

/**
 * Extract file IDs from conversation response
 * Handles both direct tool_file chunks and nested structures
 */
export function extractFileIdsFromResponse(response: ConversationResponse): string[] {
  const fileIds: string[] = [];

  // Check if response has outputs
  if (!response.outputs || response.outputs.length === 0) {
    return fileIds;
  }

  // Get the last output (most recent)
  const lastOutput = response.outputs[response.outputs.length - 1];

  // Check if it's a message output entry
  if (lastOutput.type === "message.output" || lastOutput.object === "entry") {
    const messageOutput = lastOutput as MessageOutputEntry;

    if (messageOutput.content && Array.isArray(messageOutput.content)) {
      for (const chunk of messageOutput.content) {
        // Check for tool_file chunk (Mistral's newer format)
        if (typeof chunk !== "string" && chunk?.type === "tool_file") {
          const toolFile = chunk as any;
          if (toolFile.file_id) {
            fileIds.push(toolFile.file_id);
          } else if (toolFile.fileId) {
            fileIds.push(toolFile.fileId);
          }
        }
        // Check for nested tool.file_id (older format)
        else if (typeof chunk === "object" && chunk !== null && "tool" in chunk) {
          const toolChunk = chunk as any;
          if (toolChunk.tool?.file_id) {
            fileIds.push(toolChunk.tool.file_id);
          } else if (toolChunk.tool?.fileId) {
            fileIds.push(toolChunk.tool.fileId);
          }
        }
        // Check for direct file_id property
        else if (typeof chunk === "object" && chunk !== null && ("file_id" in chunk || "fileId" in chunk)) {
          const fileChunk = chunk as any;
          if (fileChunk.file_id) {
            fileIds.push(fileChunk.file_id);
          } else if (fileChunk.fileId) {
            fileIds.push(fileChunk.fileId);
          }
        }
      }
    }
  }

  // Also check content directly on response
  if (response.content && Array.isArray(response.content)) {
    for (const chunk of response.content) {
      if (typeof chunk !== "string" && chunk?.type === "tool_file") {
        const toolFile = chunk as any;
        if (toolFile.file_id && !fileIds.includes(toolFile.file_id)) {
          fileIds.push(toolFile.file_id);
        } else if (toolFile.fileId && !fileIds.includes(toolFile.fileId)) {
          fileIds.push(toolFile.fileId);
        }
      }
    }
  }

  return fileIds;
}

/**
 * Poll conversation for file IDs (for async generation)
 * Uses exponential backoff
 */
export async function pollForFileIds(
  client: Mistral,
  conversationId: string,
  options: PollingOptions = {},
  apiKey?: string
): Promise<string[]> {
  const {
    intervalMs = DEFAULT_CONFIG.POLL_INTERVAL_MS,
    maxAttempts = DEFAULT_CONFIG.MAX_POLL_ATTEMPTS,
    signal,
  } = options;

  // Check if already aborted before starting
  if (signal?.aborted) {
    throw new ImageGenerationError(
      "Conversation polling aborted before starting",
      "file_extraction",
      false
    );
  }

  let attempt = 0;
  let lastError: Error | undefined;

  while (attempt < maxAttempts) {
    attempt++;

    // Check if aborted during polling
    if (signal?.aborted) {
      console.debug(`[Mistral Conversation] Polling aborted by signal after ${attempt - 1} attempts`);
      throw new ImageGenerationError(
        `Conversation polling aborted after ${attempt - 1} attempts (signal aborted)`,
        "file_extraction",
        true // Make it retryable since it might be a timeout
      );
    }

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
      const response = await fetch(`${baseUrl}/v1/conversations/${conversationId}`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${resolvedApiKey}`,
          "Content-Type": "application/json",
        },
        signal: signal,
      });
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      const responseData = await response.json() as ConversationResponse;
      const fileIds = extractFileIdsFromResponse(responseData);

      if (fileIds.length > 0) {
        return fileIds;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      // Continue polling on error
    }

    // Exponential backoff: wait interval * 2^(attempt-1)
    const waitTime = intervalMs * Math.pow(2, attempt - 1);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }

  const errorMessage = lastError?.message || "Timeout waiting for file IDs";
  throw new ImageGenerationError(
    `Failed to get file IDs after ${maxAttempts} attempts: ${errorMessage}`,
    "file_extraction",
    true
  );
}

/**
 * Get conversation by ID
 */
export async function getConversation(
  client: Mistral,
  conversationId: string,
  signal?: AbortSignal,
  apiKey?: string
): Promise<ConversationResponse> {
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
  const response = await fetch(`${baseUrl}/v1/conversations/${conversationId}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${resolvedApiKey}`,
      "Content-Type": "application/json",
    },
    signal: signal,
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  return await response.json() as ConversationResponse;
}

/**
 * Delete a conversation
 */
export async function deleteConversation(
  client: Mistral,
  conversationId: string,
  apiKey?: string
): Promise<boolean> {
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
    const baseUrl = "https://api.mistral.ai";
    const response = await fetch(`${baseUrl}/v1/conversations/${conversationId}`, {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${resolvedApiKey}`,
        "Content-Type": "application/json",
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * List messages in a conversation
 */
export async function listConversationMessages(
  client: Mistral,
  conversationId: string,
  signal?: AbortSignal,
  apiKey?: string
): Promise<MessageOutputEntry[]> {
  const response = await getConversation(client, conversationId, signal, apiKey);

  return response.outputs
    .filter(output => output.type === "message.output")
    .map(output => output as MessageOutputEntry);
}

/**
 * Check if conversation is complete (has file IDs)
 */
export async function isConversationComplete(
  client: Mistral,
  conversationId: string,
  signal?: AbortSignal,
  apiKey?: string
): Promise<boolean> {
  try {
    const response = await getConversation(client, conversationId, signal, apiKey);
    const fileIds = extractFileIdsFromResponse(response);
    return fileIds.length > 0;
  } catch {
    return false;
  }
}
