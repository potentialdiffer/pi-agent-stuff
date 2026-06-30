// ============================================================================
// OCR Tool for Mistral OCR document processing
// ============================================================================

import { Type } from "typebox";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text, Container, Spacer } from "@earendil-works/pi-tui";
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
      "Use ocr when user provides a document (PDF, image) and asks for text extraction.",
      "Specify the document as URL, file path, or base64-encoded string.",
      "Prefix base64 strings with 'base64:'.",
    ],
    parameters: Type.Object({
      document: Type.String({ description: "Document: URL, file path, or base64 string (prefix with 'base64:')" }),
    }),

    async execute(toolCallId: string, params: any, signal: AbortSignal | undefined, onUpdate: any, ctx: any) {
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

    renderResult(result: any, _options: any, theme: any, _ctx: ExtensionContext) {
      const container = new Container();
      
      // Handle error case
      if (result.isError) {
        return new Text(theme.fg("error", "❌ " + (result.content[0]?.text || "OCR failed")), 1, 1);
      }
      
      // Add the main text content
      const textContent = result.content.find((c: any) => c.type === "text");
      if (textContent && textContent.text) {
        container.addChild(new Text(textContent.text, 1, 0));
        container.addChild(new Spacer(1));
      }
      
      return container;
    },
  };
}

export function registerOcrTool(pi: ExtensionAPI): void {
  pi.registerTool(createOcrTool(pi));
}
