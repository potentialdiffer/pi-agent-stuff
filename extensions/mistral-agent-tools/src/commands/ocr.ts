// ============================================================================
// OCR Commands
// ============================================================================

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { getApiKey, isConfigured } from "../modules/auth.ts";
import { DEFAULT_CONFIG, debugLog } from "../config/constants.ts";
import {
  processDocumentUrl,
  processDocumentFile,
  clearOcrCache, getOcrCacheStats,
  getSupportedDocumentTypes
} from "../modules/ocr-manager.ts";

async function handleOcrCommand(input: string, ctx: ExtensionCommandContext, pi: ExtensionAPI) {
  if (!isConfigured()) {
    ctx.ui.notify("Mistral OCR: Not configured. Run /mistral-setup", "warning");
    return;
  }
  const trimmedInput = input.trim();
  if (!trimmedInput) {
    ctx.ui.notify("Usage: /mistral-ocr <url|file> [--model <model>] [--table-format <html|markdown|csv|none>]", "error");
    return;
  }

  const args = parseOcrArguments(trimmedInput);
  if (!args.url && !args.file) {
    args.url = String(trimmedInput).startsWith("http") ? trimmedInput : undefined;
    args.file = !args.url ? trimmedInput : undefined;
  }
  if (!args.url && !args.file) {
    ctx.ui.notify("Please provide URL or file path", "error");
    return;
  }

  try {
    ctx.ui.notify(`Processing: ${args.url || args.file}...`, "info");
    const apiKey = getApiKey();
    const startTime = Date.now();
    
    const result = args.url 
      ? await processDocumentUrl(args.url, { model: args.model, table_format: args.tableFormat }, apiKey)
      : await processDocumentFile(args.file, { model: args.model, table_format: args.tableFormat }, apiKey);
    
    const displayText = String(result.text).length > 5000 
      ? String(result.text).substring(0, 5000) + "\n\n... (truncated)"
      : String(result.text);
    
    ctx.ui.notify(`Completed in ${Math.round((Date.now() - startTime) / 1000)}s`, "success");
    ctx.ui.addToChat({
      type: "text",
      text: `=== OCR Result ===\n\n${displayText}\n\n=== End ===`,
    });
  } catch (error) {
    ctx.ui.notify(`OCR failed: ${error.message}`, "error");
  }
}

function parseOcrArguments(input) {
  const args = {};
  const tokens = input.match(/(?:[^\s"]|"(?:\\.|[^\"])*")+/g) || [];
  for (let i = 0; i < tokens.length; i++) {
    const token = String(tokens[i]);
    if (token.startsWith("--")) {
      const argName = token.substring(2).toLowerCase();
      const nextToken = tokens[i + 1];
      if (argName === "model") { args.model = nextToken; i++; }
      else if (argName === "table-format" || argName === "tableformat") { args.tableFormat = nextToken?.toLowerCase(); i++; }
      else if (argName === "url") { args.url = nextToken; i++; }
      else if (argName === "file") { args.file = nextToken; i++; }
    } else if (token.startsWith("http")) { args.url = token; }
    else if (token.startsWith("/") || token.includes(".")) { args.file = token; }
  }
  return args;
}

async function handleCacheClear(_input: string, ctx: ExtensionCommandContext) {
  try {
    const before = getOcrCacheStats().size;
    clearOcrCache();
    ctx.ui.notify(`OCR cache cleared: ${before} -> 0 entries`, "success");
  } catch (error) {
    ctx.ui.notify(`Cache clear failed: ${error.message}`, "error");
  }
}

async function handleCacheStats(_input: string, ctx: ExtensionCommandContext) {
  try {
    const stats = getOcrCacheStats();
    ctx.ui.notify(`OCR Cache: ${stats.size} entries`, "info");
  } catch (error) {
    ctx.ui.notify(`Cache stats failed: ${error.message}`, "error");
  }
}

async function handleTypes(_input: string, ctx: ExtensionCommandContext) {
  try {
    ctx.ui.notify(`Supported types: ${getSupportedDocumentTypes().join(", ")}`, "info");
  } catch (error) {
    ctx.ui.notify(`Types failed: ${error.message}`, "error");
  }
}

export function registerOcrCommands(pi: ExtensionAPI): void {
  pi.registerCommand({
    name: "mistral-ocr",
    prompt: "Process document with Mistral OCR",
    description: "Process document with Mistral OCR",
    getArgumentCompletions: (prefix: string) => {
      // No completions for query
      return null;
    },
    handler: (input, ctx) => handleOcrCommand(input, ctx, pi),
  });

  pi.registerCommand({
    name: "mistral-ocr-cache-clear",
    prompt: "Clear OCR cache",
    description: "Clear OCR cache",
    getArgumentCompletions: (prefix: string) => {
      // No completions for query
      return null;
    },
    handler: handleCacheClear,
  });

  pi.registerCommand({
    name: "mistral-ocr-cache-stats",
    prompt: "Show OCR cache stats",
    description: "Show OCR cache stats",
    getArgumentCompletions: (prefix: string) => {
      // No completions for query
      return null;
    },
    handler: handleCacheStats,
  });

  pi.registerCommand({
    name: "mistral-ocr-types",
    prompt: "Show supported document types",
    description: "Show supported document types",
    getArgumentCompletions: (prefix: string) => {
      // No completions for query
      return null;
    },
    handler: handleTypes,
  });
}
