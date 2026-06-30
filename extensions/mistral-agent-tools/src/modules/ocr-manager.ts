// ============================================================================
// OCR Manager
// Manages Mistral OCR document processing
// ============================================================================

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { createMistralClient, getApiKey } from "./auth.ts";
import { debugLog, debugVerbose } from "../config/constants.ts";

// ============================================================================
// Configuration
// ============================================================================

const OCR_CONFIG = {
  DEFAULT_OCR_MODEL: "mistral-ocr-latest",
  OCR_API_TIMEOUT_MS: 300_000,
  MAX_DOCUMENT_SIZE_BYTES: 50 * 1024 * 1024,
  DEFAULT_TABLE_FORMAT: "html",
  DEFAULT_INCLUDE_IMAGE_BASE64: false,
  OCR_CACHE_TTL_MS: 1000 * 60 * 60 * 24,
  MAX_CACHED_OCR_RESULTS: 50,
};

// ============================================================================
// OCR Cache
// ============================================================================

const ocrCache = new Map();

function generateDocumentHash(document, params) {
  let hashSource = document.type === "document_url" 
    ? `url:${String(document.document_url || "")}`
    : document.type === "base64" 
      ? `base64:${String(document.base64 || "").substring(0, 100)}`
      : `file:${String(document.file_path || "")}:${document.mime_type}`;
  
  hashSource += JSON.stringify({
    model: params.model,
    table_format: params.table_format,
    include_image_base64: params.include_image_base64,
  });
  
  return crypto.createHash("sha256").update(hashSource).digest("hex");
}

function isCacheValid(entry) {
  return Date.now() - entry.createdAt < OCR_CONFIG.OCR_CACHE_TTL_MS;
}

function addToCache(hash, result, documentType, documentSize) {
  while (ocrCache.size >= OCR_CONFIG.MAX_CACHED_OCR_RESULTS) {
    let oldestKey, oldestTime = Infinity;
    for (const [key, entry] of ocrCache) {
      if (entry.createdAt < oldestTime) {
        oldestTime = entry.createdAt;
        oldestKey = key;
      }
    }
    if (oldestKey) ocrCache.delete(oldestKey);
  }
  
  ocrCache.set(hash, { hash, result, createdAt: Date.now(), documentType, documentSize });
}

function getFromCache(hash) {
  const entry = ocrCache.get(hash);
  if (!entry) return null;
  if (!isCacheValid(entry)) {
    ocrCache.delete(hash);
    return null;
  }
  return entry.result;
}

// ============================================================================
// Document Processing
// ============================================================================

async function readFileAsBase64(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  if (fileBuffer.length > OCR_CONFIG.MAX_DOCUMENT_SIZE_BYTES) {
    throw new Error(`Document too large: ${fileBuffer.length} bytes`);
  }
  const mimeType = getMimeTypeFromFile(filePath, fileBuffer);
  return { base64: fileBuffer.toString("base64"), mimeType, size: fileBuffer.length };
}

function getMimeTypeFromFile(filePath, buffer) {
  const ext = path.extname(filePath).toLowerCase().substring(1);
  const mimeTypes = {
    pdf: "application/pdf", png: "image/png", jpg: "image/jpeg",
    jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif",
    tiff: "image/tiff", bmp: "image/bmp",
  };
  if (mimeTypes[ext]) return mimeTypes[ext];
  if (buffer.length >= 4) {
    const header = buffer.subarray(0, 4).toString("hex");
    if (header.startsWith("89504e47")) return "image/png";
    if (header.startsWith("ffd8ffe")) return "image/jpeg";
    if (header === "47494638") return "image/gif";
    if (header.startsWith("25504446")) return "application/pdf";
  }
  return "application/octet-stream";
}

function validateDocumentInput(document) {
  if (document.type === "document_url" && !String(document.document_url || "").startsWith("http")) {
    throw new Error("Invalid URL");
  }
  if (document.type === "base64" && !document.base64) {
    throw new Error("Base64 data required");
  }
  if (document.type === "file" && !fs.existsSync(String(document.file_path || ""))) {
    throw new Error(`File not found: ${document.file_path}`);
  }
}

// ============================================================================
// OCR Processing
// ============================================================================

export async function processDocument(params, apiKey) {
  const startTime = Date.now();
  validateDocumentInput(params.document);
  
  const cacheHash = generateDocumentHash(params.document, params);
  const cachedResult = getFromCache(cacheHash);
  if (cachedResult) {
    debugLog(`OCR cache hit: ${cacheHash.substring(0, 16)}`);
    return cachedResult;
  }
  
  const key = apiKey || getApiKey();
  const client = createMistralClient(key);
  const documentInput = await prepareDocumentInput(params.document);
  
  const requestParams = {
    model: params.model || OCR_CONFIG.DEFAULT_OCR_MODEL,
    document: {
      type: documentInput.type === "document_url" ? "document_url" : "document_base64",
      document_url: documentInput.document_url,
      document_base64: documentInput.base64,
    },
    table_format: params.table_format || OCR_CONFIG.DEFAULT_TABLE_FORMAT,
    include_image_base64: params.include_image_base64 ?? OCR_CONFIG.DEFAULT_INCLUDE_IMAGE_BASE64,
  };
  
  debugLog(`OCR request: model=${requestParams.model}, type=${requestParams.document.type}`);
  
  const response = await client.ocr.process(requestParams);
  const result = parseOcrResponse(response, Date.now() - startTime);
  
  const documentSize = documentInput.base64 ? Buffer.byteLength(documentInput.base64, "base64") : 0;
  addToCache(cacheHash, result, params.document.type, documentSize);
  
  return result;
}

async function prepareDocumentInput(document) {
  if (document.type === "document_url") return { document_url: document.document_url };
  if (document.type === "base64") return { base64: document.base64 };
  if (document.type === "file") {
    const { base64 } = await readFileAsBase64(document.file_path);
    return { base64 };
  }
  throw new Error(`Unknown type: ${document.type}`);
}

function parseOcrResponse(response, processingTimeMs) {
  const result = { text: "", metadata: { document_type: "unknown", page_count: 0, processing_time_ms: processingTimeMs } };
  
  if (Array.isArray(response)) {
    result.pages = [];
    let fullText = "";
    for (let i = 0; i < response.length; i++) {
      const page = response[i];
      const pageText = page.markdown || page.text || "";
      fullText += pageText + "\n\n";
      result.pages.push({
        page_number: i + 1,
        text: pageText,
        images: page.images?.map(img => ({
          base64: img.base64,
          mime_type: img.mime_type,
          position: img.bbox ? { x: img.bbox[0], y: img.bbox[1], width: img.bbox[2], height: img.bbox[3] } : undefined,
          page_number: i + 1,
        })),
      });
    }
    result.text = fullText.trim();
    result.metadata.page_count = response.length;
    result.metadata.document_type = response.length > 1 ? "multi-page" : "single-page";
  } else if (response.text) {
    result.text = response.text;
    result.pages = [{ page_number: 1, text: response.text }];
    result.metadata.page_count = 1;
  } else if (response.markdown) {
    result.text = response.markdown;
    result.pages = [{ page_number: 1, text: response.markdown }];
    result.metadata.page_count = 1;
  }
  
  if (response.images?.length) {
    result.images = response.images.map((img, i) => ({
      base64: img.base64,
      mime_type: img.mime_type,
      position: img.bbox ? { x: img.bbox[0], y: img.bbox[1], width: img.bbox[2], height: img.bbox[3] } : undefined,
      page_number: img.page_index !== undefined ? img.page_index + 1 : undefined,
    }));
  }
  
  if (result.pages && !result.text) result.text = result.pages.map(p => p.text).join("\n\n");
  if (!result.pages && result.text) {
    result.pages = [{ page_number: 1, text: result.text }];
    result.metadata.page_count = 1;
  }
  
  return result;
}

// ============================================================================
// Convenience Functions
// ============================================================================

export async function processDocumentUrl(url, params, apiKey) {
  return processDocument({ document: { type: "document_url", document_url: url }, ...params }, apiKey);
}

export async function processDocumentFile(filePath, params, apiKey) {
  return processDocument({ document: { type: "file", file_path: filePath }, ...params }, apiKey);
}

// ============================================================================
// Cache Management
// ============================================================================

export function clearOcrCache() { ocrCache.clear(); }

export function getOcrCacheStats() { return { size: ocrCache.size, entries: Array.from(ocrCache.keys()) }; }

export function clearStaleOcrCache() {
  const now = Date.now();
  let cleared = 0;
  for (const [hash, entry] of ocrCache) {
    if (now - entry.createdAt >= OCR_CONFIG.OCR_CACHE_TTL_MS) {
      ocrCache.delete(hash);
      cleared++;
    }
  }
  return cleared;
}

export function getSupportedDocumentTypes() {
  return ["pdf", "png", "jpg", "jpeg", "webp", "gif", "tiff", "bmp"];
}
