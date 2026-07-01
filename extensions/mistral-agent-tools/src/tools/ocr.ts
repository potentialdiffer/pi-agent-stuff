// ============================================================================
// OCR Tool for Mistral OCR document processing
// ============================================================================

import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getApiKey } from "../modules/auth.ts";
import { debugLog } from "../config/constants.ts";
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

    async execute(toolCallId: string, params: any, signal: AbortSignal | undefined, onUpdate: any, ctx: any) {
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
  pi.registerTool(createOcrTool(pi));
}
