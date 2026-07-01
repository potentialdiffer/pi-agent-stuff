// ============================================================================
// OCR Tool for Mistral OCR document processing
// ============================================================================

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { getApiKey } from "../modules/auth.ts";
import { DEFAULT_CONFIG, debugLog, debugAutocomplete } from "../config/constants.ts";
import { processDocument } from "../modules/ocr-manager.ts";

function parseDocumentInput(document) {
  if (!document) throw new Error("Document input required");
  const docStr = String(document);
  if (docStr.startsWith("base64:")) return { type: "base64", value: docStr.substring(7) };
  if (docStr.startsWith("http")) return { type: "document_url", value: docStr };
  return { type: "file", value: docStr };
}

export function createOcrTool(pi: ExtensionAPI) {
  return {
    name: "ocr",
    label: "OCR",
    description: "Extract text from documents using Mistral OCR",
    promptSnippet: "Extract text from documents using OCR",
    promptGuidelines: [
      "Use ocr when user provides a document and asks for text extraction.",
    ],
    parameters: Type.Object({
      document: Type.String({
        description: "Document to process with OCR",
        minLength: 1,
        maxLength: 10000,
      }),
    }),

    async execute(
      toolCallId: string, 
      params: any, 
      signal: AbortSignal | undefined, 
      onUpdate: ((update: { content: Array<{ type: string; text?: string }> }) => void) | undefined,
      ctx: ExtensionContext) {
      try {
        const doc = String(params?.document || "");
        if (!doc) throw new Error("Document parameter is required");
        const apiKey = getApiKey();
        const parsedDoc = parseDocumentInput(doc);
        const result = await processDocument({
          document: { type: parsedDoc.type, document_url: parsedDoc.type === "document_url" ? parsedDoc.value : undefined, base64: parsedDoc.type === "base64" ? parsedDoc.value : undefined, file_path: parsedDoc.type === "file" ? parsedDoc.value : undefined },
          model: "mistral-ocr-latest",
          table_format: "html",
          include_image_base64: false,
        }, apiKey);
        return { content: [{ type: "text", text: String(result.text || "") }] };
      } catch (error) {
        return { content: [{ type: "text", text: `OCR failed: ${String(error || "")}` }], isError: true };
      }
    },
  };
}

export function registerOcrTool(pi: ExtensionAPI): void {
  debugAutocomplete("Creating OCR tool...");
  const tool = createOcrTool(pi);
  debugAutocomplete("OCR tool created:", {
    name: tool.name,
    label: tool.label,
    description: tool.description,
    parameters: tool.parameters,
  });
  debugAutocomplete("Registering OCR tool with pi.registerTool...");
  pi.registerTool(tool);
  debugAutocomplete("OCR tool registered");
}
