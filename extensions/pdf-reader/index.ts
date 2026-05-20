/**
 * PDF Reader Extension
 * Provides tools for extracting text and metadata from PDF files using poppler-utils
 * Required: pdftotext, pdfinfo (from poppler-utils package)
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
const execAsync = promisify(exec);

export default function (pi: ExtensionAPI) {
  // Extract plain text from PDF with layout preservation
  pi.registerTool({
    name: "pdf_extract_text",
    label: "PDF Extract Text",
    description: "Extract plain text from a PDF file, optionally preserving layout",
    promptSnippet: "Extract text from PDF files for analysis",
    promptGuidelines: [
      "Use pdf_extract_text when user provides a PDF file for review or analysis",
      "Always extract text before analyzing PDF content",
      "Use layout=true for preserving document structure"
    ],
    parameters: Type.Object({
      path: Type.String({ description: "Path to the PDF file" }),
      layout: Type.Optional(Type.Boolean({
        default: true,
        description: "Preserve physical layout (default: true)"
      }))
    }),
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      onUpdate?.({ content: [{ type: "text", text: `Extracting text from ${params.path}...` }] });
      
      const cmd = `pdftotext ${params.layout ? '-layout ' : ''}"${params.path}" -`;
      
      try {
        const { stdout, stderr } = await execAsync(cmd, { signal });
        
        if (stderr && !stdout) {
          throw new Error(`pdftotext error: ${stderr}`);
        }
        
        onUpdate?.({ content: [{ type: "text", text: `Extracted ${stdout.length} characters` }] });
        
        return {
          content: [{ type: "text", text: stdout }],
          details: {
            path: params.path,
            layoutPreserved: params.layout,
            characterCount: stdout.length
          }
        };
      } catch (error) {
        if (signal?.aborted) {
          throw new Error("PDF extraction cancelled");
        }
        throw new Error(`Failed to extract text: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  });

  // Get PDF document metadata
  pi.registerTool({
    name: "pdf_get_info",
    label: "PDF Get Info",
    description: "Get metadata from a PDF file (title, author, pages, creation date, etc.)",
    promptSnippet: "Get PDF metadata for context",
    promptGuidelines: [
      "Use pdf_get_info to get document metadata before reviewing",
      "Check page count to estimate review time"
    ],
    parameters: Type.Object({
      path: Type.String({ description: "Path to the PDF file" })
    }),
    async execute(_toolCallId, params, signal) {
      const cmd = `pdfinfo "${params.path}"`;
      
      try {
        const { stdout, stderr } = await execAsync(cmd, { signal });
        
        if (stderr && !stdout) {
          throw new Error(`pdfinfo error: ${stderr}`);
        }
        
        return {
          content: [{ type: "text", text: stdout }],
          details: {
            path: params.path,
            rawOutput: stdout
          }
        };
      } catch (error) {
        if (signal?.aborted) {
          throw new Error("PDF info retrieval cancelled");
        }
        throw new Error(`Failed to get PDF info: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  });

  // Extract specific page range from PDF
  pi.registerTool({
    name: "pdf_extract_pages",
    label: "PDF Extract Pages",
    description: "Extract text from specific pages or page range in a PDF",
    promptSnippet: "Extract specific pages from PDF",
    promptGuidelines: [
      "Use pdf_extract_pages to focus on specific sections",
      "Combine with pdf_get_info to know total pages"
    ],
    parameters: Type.Object({
      path: Type.String({ description: "Path to the PDF file" }),
      firstPage: Type.Optional(Type.Number({
        default: 1,
        minimum: 1,
        description: "First page to extract (1-indexed)"
      })),
      lastPage: Type.Optional(Type.Number({
        minimum: 1,
        description: "Last page to extract (1-indexed, inclusive)"
      }))
    }),
    async execute(_toolCallId, params, signal, onUpdate) {
      let range = '';
      if (params.firstPage !== undefined) {
        if (params.lastPage !== undefined) {
          range = `-f ${params.firstPage} -l ${params.lastPage}`;
        } else {
          range = `-f ${params.firstPage}`;
        }
      }
      
      const cmd = `pdftotext -layout ${range} "${params.path}" -`;
      
      try {
        const { stdout, stderr } = await execAsync(cmd, { signal });
        
        if (stderr && !stdout) {
          throw new Error(`pdftotext error: ${stderr}`);
        }
        
        onUpdate?.({ content: [{ type: "text", text: `Extracted pages ${params.firstPage}${params.lastPage ? '-' + params.lastPage : ''}` }] });
        
        return {
          content: [{ type: "text", text: stdout }],
          details: {
            path: params.path,
            firstPage: params.firstPage,
            lastPage: params.lastPage,
            characterCount: stdout.length
          }
        };
      } catch (error) {
        if (signal?.aborted) {
          throw new Error("PDF page extraction cancelled");
        }
        throw new Error(`Failed to extract pages: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  });

  // Check if poppler tools are available
  pi.on("session_start", async (_event, ctx) => {
    try {
      await execAsync("pdftotext -v");
      await execAsync("pdfinfo -v");
      ctx.ui.notify("PDF tools (poppler) available", "info");
    } catch {
      ctx.ui.notify("Warning: poppler-utils not found. Install with: sudo apt-get install poppler-utils", "warning");
    }
  });
}
