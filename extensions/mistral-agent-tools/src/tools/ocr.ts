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
    description: "Extract text from PDFs and images using Mistral OCR",
    promptSnippet: "Extract text from documents and images using OCR",
    promptGuidelines: [
      "Use mistral_ocr when user provides a document (PDF, image) and asks for text extraction.",
      "Specify the document as URL, file path, or base64-encoded string.",
      "Prefix base64 strings with 'base64:'.",
    ],
    parameters: Type.Object({
      document: Type.String({
        description: "Document: URL, file path, or base64 string (prefix with 'base64:')",
        minLength: 1,
        maxLength: 10000,
      }),
      model: Type.Optional(
        Type.String({
          description: "Mistral model to use for OCR",
          default: "mistral-ocr-latest",
        })
      ),
    }),

    async execute(toolCallId: string, params: any, signal: AbortSignal | undefined, onUpdate: any, ctx: any) {
      try {
        debugLog(`OCR tool called with toolCallId: ${String(toolCallId || "")}`);
        const doc = String(params?.document || "");
        if (!doc) throw new Error("Document parameter is required");
        const apiKey = getApiKey();
        const parsedDoc = parseDocumentInput(doc);
        const model = params?.model || "mistral-ocr-latest";
        const result = await processDocument({
          document: { type: parsedDoc.type, document_url: parsedDoc.type === "document_url" ? parsedDoc.value : undefined, base64: parsedDoc.type === "base64" ? parsedDoc.value : undefined, file_path: parsedDoc.type === "file" ? parsedDoc.value : undefined },
          model: String(model),
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

export function registerOcrTool(pi: ExtensionAPI): void {
  pi.registerTool(createOcrTool(pi));
}
