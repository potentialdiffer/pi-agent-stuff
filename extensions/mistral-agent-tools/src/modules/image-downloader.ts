import { Mistral } from "@mistralai/mistralai";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ToolFileChunk, MessageOutputEntry, ConversationResponse } from "@mistralai/mistralai/models/components/index.js";
import { ImageGenerationError, GeneratedImage } from "../config/types.js";
import { DEFAULT_CONFIG, getTempDir, getImagePath } from "../config/constants.js";

// ============================================================================
// Image Downloader Module
// Handles downloading images from Mistral's files API
// ============================================================================

interface DownloadOptions {
  signal?: AbortSignal;
  maxRetries?: number;
  timeoutMs?: number;
}

/**
 * Download an image file from Mistral
 */
export async function downloadImage(
  client: Mistral,
  fileId: string,
  options: DownloadOptions = {}
): Promise<GeneratedImage> {
  const {
    signal,
    maxRetries = DEFAULT_CONFIG.MAX_RETRIES,
    timeoutMs = DEFAULT_CONFIG.API_TIMEOUT_MS,
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const fileResponse = await client.files.download({ fileId, signal });
      const imageData = await extractImageData(fileResponse);

      // Validate image data
      if (!isValidImageData(imageData)) {
        throw new Error("Downloaded data is not a valid image");
      }

      // Generate file name
      const mimeType = detectMimeType(imageData);
      const fileName = generateFileName(fileId, mimeType);

      return {
        data: imageData,
        mimeType,
        fileName,
        size: imageData.length,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on certain errors
      if (isNonRetryableError(lastError)) {
        break;
      }

      // Wait before retry (exponential backoff)
      if (attempt < maxRetries) {
        const waitTime = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s...
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  throw new ImageGenerationError(
    `Failed to download image after ${maxRetries} attempts: ${lastError?.message || "Unknown error"}`,
    "download",
    false // Not retryable at this level
  );
}

/**
 * Download multiple images from file IDs
 */
export async function downloadImages(
  client: Mistral,
  fileIds: string[],
  options: DownloadOptions = {}
): Promise<GeneratedImage[]> {
  const results: GeneratedImage[] = [];
  
  for (const fileId of fileIds) {
    try {
      const image = await downloadImage(client, fileId, options);
      results.push(image);
    } catch (error) {
      console.error(`[Mistral Image] Failed to download file ${fileId}:`, error);
      // Continue with other files
    }
  }

  return results;
}

/**
 * Extract image data from various response formats
 */
async function extractImageData(response: unknown): Promise<Buffer> {
  // Handle Buffer directly
  if (Buffer.isBuffer(response)) {
    return response;
  }

  // Handle ReadableStream (from fetch)
  if (response && typeof response === "object" && "getReader" in response) {
    const stream = response as ReadableStream<Uint8Array>;
    return await streamToBuffer(stream);
  }

  // Handle Response object (from fetch)
  if (response && typeof response === "object" && "arrayBuffer" in response) {
    const resp = response as Response;
    const arrayBuffer = await resp.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  // Handle base64 string
  if (typeof response === "string") {
    try {
      return Buffer.from(response, "base64");
    } catch {
      // Not base64, maybe it's a URL or something else
    }
  }

  // Handle object with data property
  if (response && typeof response === "object" && "data" in response) {
    const obj = response as { data: unknown };
    if (typeof obj.data === "string") {
      try {
        return Buffer.from(obj.data, "base64");
      } catch {
        // Not base64
      }
    }
    if (Buffer.isBuffer(obj.data)) {
      return obj.data;
    }
  }

  // Handle object with arrayBuffer method
  if (response && typeof response === "object" && "arrayBuffer" in response) {
    const ab = await (response as { arrayBuffer(): Promise<ArrayBuffer> }).arrayBuffer();
    return Buffer.from(ab);
  }

  throw new Error(`Unable to extract image data from response type: ${typeof response}`);
}

/**
 * Convert ReadableStream to Buffer
 */
async function streamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  // Calculate total length
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = Buffer.alloc(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

/**
 * Save stream directly to file (from API documentation)
 */
export async function saveStreamToFile(stream: ReadableStream<Uint8Array>, filePath: string): Promise<void> {
  const reader = stream.getReader();
  const writableStream = fs.createWriteStream(filePath);

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    writableStream.write(Buffer.from(value));
  }

  writableStream.end();
}

/**
 * Validate that data looks like an image
 */
function isValidImageData(data: Buffer): boolean {
  // Minimum size check
  if (data.length < 8) {
    return false;
  }

  // Check for common image magic numbers
  const magicNumbers = [
    // PNG: \x89PNG\r\n\x1a\n
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    // JPEG: \xFF\xD8\xFF
    Buffer.from([0xFF, 0xD8, 0xFF]),
    // WebP: RIFF....WEBP
    Buffer.from([0x52, 0x49, 0x46, 0x46]),
  ];

  for (const magic of magicNumbers) {
    if (data.subarray(0, magic.length).equals(magic)) {
      return true;
    }
  }

  // If we can't identify by magic number, assume it's valid
  // (Mistral might return other formats)
  return data.length > 0;
}

/**
 * Detect MIME type from image data
 */
function detectMimeType(data: Buffer): string {
  if (data.length < 8) {
    return "image/png"; // Default
  }

  // PNG
  if (data[0] === 0x89 && 
      data[1] === 0x50 && 
      data[2] === 0x4E && 
      data[3] === 0x47) {
    return "image/png";
  }

  // JPEG
  if (data[0] === 0xFF && data[1] === 0xD8 && data[2] === 0xFF) {
    return "image/jpeg";
  }

  // WebP
  if (data[0] === 0x52 && 
      data[1] === 0x49 && 
      data[2] === 0x46 && 
      data[3] === 0x46) {
    return "image/webp";
  }

  return "image/png"; // Default
}

/**
 * Generate a file name for a downloaded image with correct extension based on MIME type
 */
function generateFileName(fileId: string, mimeType: string): string {
  const timestamp = Date.now();
  const shortId = fileId.slice(0, 8);
  
  const extensionMap: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
  };
  
  const extension = extensionMap[mimeType] || ".png";
  return `mistral-image-${timestamp}-${shortId}${extension}`;
}

/**
 * Save image to temporary directory
 */
export async function saveImageToTemp(
  image: GeneratedImage,
  customFileName?: string
): Promise<string> {
  const tempDir = getTempDir();
  
  // Ensure temp directory exists
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const fileName = customFileName || image.fileName;
  const filePath = getImagePath(fileName);
  
  await fs.promises.writeFile(filePath, image.data);
  
  return filePath;
}

/**
 * Save image to specific path
 */
export async function saveImage(
  image: GeneratedImage,
  targetPath: string
): Promise<string> {
  const dir = path.dirname(targetPath);
  
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  await fs.promises.writeFile(targetPath, image.data);
  
  return targetPath;
}

/**
 * Clean up temporary image files
 */
export async function cleanupTempImages(maxAgeMs: number = 1000 * 60 * 60 * 24): Promise<number> {
  const tempDir = getTempDir();
  
  if (!fs.existsSync(tempDir)) {
    return 0;
  }

  const now = Date.now();
  const files = await fs.promises.readdir(tempDir);
  let deletedCount = 0;

  for (const file of files) {
    try {
      const filePath = path.join(tempDir, file);
      const stat = await fs.promises.stat(filePath);
      
      if (now - stat.mtimeMs > maxAgeMs) {
        await fs.promises.unlink(filePath);
        deletedCount++;
      }
    } catch {
      // Ignore errors
    }
  }

  return deletedCount;
}

/**
 * Check if error is non-retryable
 */
function isNonRetryableError(error: Error): boolean {
  const nonRetryableCodes = [
    400, // Bad Request
    401, // Unauthorized
    403, // Forbidden
    404, // Not Found
    422, // Unprocessable Entity
  ];

  const message = error.message.toLowerCase();
  
  // Check for specific non-retryable conditions
  if (message.includes("invalid file id") ||
      message.includes("not found") ||
      message.includes("unauthorized") ||
      message.includes("forbidden")) {
    return true;
  }

  // Check status code if available
  const statusCode = (error as any).statusCode;
  if (statusCode && nonRetryableCodes.includes(statusCode)) {
    return true;
  }

  return false;
}

/**
 * Extract file IDs from conversation response (from API documentation pattern)
 */
export function extractFileIdsFromConversation(conversation: ConversationResponse): string[] {
  const fileIds: string[] = [];
  
  const entry = conversation.outputs[conversation.outputs.length - 1] as MessageOutputEntry;
  
  for (const chunk of entry.content) {
    if (typeof chunk !== "string" && 'fileId' in chunk) {
      const fileChunk = chunk as ToolFileChunk;
      fileIds.push(fileChunk.fileId);
    }
  }
  
  return fileIds;
}

/**
 * Process file chunks from conversation and download all images
 */
export async function downloadImagesFromConversation(
  client: Mistral,
  conversation: ConversationResponse,
  options: DownloadOptions = {}
): Promise<GeneratedImage[]> {
  const fileIds = extractFileIdsFromConversation(conversation);
  return downloadImages(client, fileIds, options);
}

/**
 * Process conversation and save all images to files (API documentation pattern)
 */
export async function processFileChunks(
  client: Mistral,
  conversation: ConversationResponse,
  baseFileName: string = "image_generated"
): Promise<string[]> {
  const savedPaths: string[] = [];
  const entry = conversation.outputs[conversation.outputs.length - 1] as MessageOutputEntry;
  
  for (let i = 0; i < entry.content.length; i++) {
    const chunk = entry.content[i];
    if (typeof chunk !== "string" && 'fileId' in chunk) {
      const fileChunk = chunk as ToolFileChunk;
      const fileStream = await client.files.download({ fileId: fileChunk.fileId });
      const filePath = `${baseFileName}_${i}.png`;
      await saveStreamToFile(fileStream, filePath);
      savedPaths.push(filePath);
    }
  }
  
  return savedPaths;
}
