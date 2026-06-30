import type { ConversationResponse, ToolFileChunk, MessageOutputEntry } from "@mistralai/mistralai/models/components/index.js";

// ============================================================================
// Configuration Types
// ============================================================================

export interface MistralConfig {
  apiKey: string;
  defaultModel: string;
  baseUrl?: string;
  timeoutMs: number;
  maxRetries: number;
}

export interface AgentCacheEntry {
  id: string;
  model: string;
  createdAt: number;
}

export interface ConversationState {
  id: string;
  agentId: string;
  prompt: string;
  createdAt: number;
  status: "pending" | "completed" | "failed";
  fileIds: string[];
}

// ============================================================================
// Image Generation Types
// ============================================================================

export interface ImageGenerationParams {
  prompt: string;
  model?: string;
  temperature?: number;
  topP?: number;
  width?: number;
  height?: number;
}

export interface ImageGenerationResult {
  imageData: Buffer;
  fileName: string;
  fileType: string;
  fileId: string;
  model: string;
  prompt: string;
}

export interface GeneratedImage {
  data: Buffer;
  mimeType: string;
  fileName: string;
  size: number;
}

// ============================================================================
// Websearch Types
// ============================================================================

export interface WebsearchParams {
  query: string;
  model?: string;
  temperature?: number;
  topP?: number;
}

export interface WebsearchReference {
  tool: string;
  title: string;
  url: string;
  source: string;
}

export interface WebsearchResult {
  text: string;
  references: WebsearchReference[];
}

// ============================================================================
// Mistral SDK Response Types (re-exported for clarity)
// ============================================================================

export type {
  ConversationResponse,
  ToolFileChunk,
  MessageOutputEntry,
};

// ============================================================================
// Error Types
// ============================================================================

export class MistralAuthError extends Error {
  constructor(message: string = "Mistral authentication failed") {
    super(message);
    this.name = "MistralAuthError";
  }
}

export class MistralApiError extends Error {
  statusCode?: number;
  details?: any;
  constructor(
    message: string,
    statusCode?: number,
    details?: any
  ) {
    super(message);
    this.name = "MistralApiError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class ImageGenerationError extends Error {
  phase: "agent_creation" | "conversation_start" | "file_extraction" | "download";
  retryable: boolean;
  constructor(
    message: string,
    phase: "agent_creation" | "conversation_start" | "file_extraction" | "download",
    retryable: boolean = false
  ) {
    super(message);
    this.name = "ImageGenerationError";
    this.phase = phase;
    this.retryable = retryable;
  }
}

export class WebsearchError extends Error {
  phase: "agent_creation" | "conversation_start" | "polling" | "result_extraction";
  retryable: boolean;
  constructor(
    message: string,
    phase: "agent_creation" | "conversation_start" | "polling" | "result_extraction",
    retryable: boolean = false
  ) {
    super(message);
    this.name = "WebsearchError";
    this.phase = phase;
    this.retryable = retryable;
  }
}

export class ConfigurationError extends Error {
  constructor(message: string = "Mistral extension not configured") {
    super(message);
    this.name = "ConfigurationError";
  }
}

// ============================================================================
// UI Types
// ============================================================================

export interface ProgressUpdate {
  phase: "initializing" | "generating" | "downloading" | "processing";
  message: string;
  percentage?: number;
}

export interface ImageDisplayOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
}
