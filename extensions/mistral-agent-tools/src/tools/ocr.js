// ============================================================================
// OCR Tool for Mistral OCR document processing
// ============================================================================

import { Type } from "typebox";
import { getApiKey } from "../modules/auth.js";
import { debugLog } from "../config/constants.js";
import { processDocument } from "../modules/ocr-manager.js";

function parseDocumentInput(document) {
  if (!document) throw new Error("Document input required");
  const docStr = String(document);
  if (docStr.startsWith("base64:")) return { type: "base64", value: docStr.substring(7) };
  if (docStr.startsWith("http")) return { type: "document_url", value: docStr };
  return { type: "file", value: docStr };
}

export function createOcrTool(pi) {
  return {
    name: "ocr",
    label: "OCR",
    description: "Extract text from PDFs and images using Mistral OCR",
    parameters: Type.Object({
      document: Type.String({ description: "Document: URL, file path, or base64 string (prefix with 'base64:')" }),
    }),

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      try {
        const doc = String(params.document);
        const apiKey = getApiKey();
        const parsedDoc = parseDocumentInput(doc);
        const result = await processDocument({
          document: { type: parsedDoc.type, document_url: parsedDoc.type === "document_url" ? parsedDoc.value : undefined, base64: parsedDoc.type === "base64" ? parsedDoc.value : undefined, file_path: parsedDoc.type === "file" ? parsedDoc.value : undefined },
          model: "mistral-ocr-latest",
          table_format: "html",
          include_image_base64: false,
        }, apiKey);
        return { content: [{ type: "text", text: result.text }] };
      } catch (error) {
        return { content: [{ type: "text", text: `OCR failed: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    },
  };
}

export function registerOcrTool(pi) {
  pi.registerTool(createOcrTool(pi));
}
