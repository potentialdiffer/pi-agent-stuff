// ============================================================================
// Websearch Display
// Formats websearch results for pi TUI display
// ============================================================================

import type { WebsearchReference, WebsearchResult } from "./websearch-manager.ts";

// ============================================================================
// Display Formatting
// ============================================================================

/**
 * Format websearch result for display
 */
export function formatWebsearchResult(result: WebsearchResult, maxWidth: number = 80): string {
  const lines: string[] = [];

  // Add the main text content
  const wrappedText = wrapText(result.text, maxWidth);
  lines.push(...wrappedText.split("\n"));

  // Add references if any
  if (result.references.length > 0) {
    lines.push("");
    lines.push("─".repeat(Math.min(maxWidth, 80)));
    lines.push("References:");
    lines.push("─".repeat(Math.min(maxWidth, 80)));
    
    for (let i = 0; i < result.references.length; i++) {
      const ref = result.references[i];
      const refLine = formatReference(i + 1, ref, maxWidth);
      lines.push(refLine);
    }
  }

  return lines.join("\n");
}

/**
 * Format a single reference
 */
function formatReference(index: number, ref: WebsearchReference, maxWidth: number): string {
  const prefix = `[${index}]`;
  const title = ref.title || "Untitled";
  const url = ref.url || "";
  const source = ref.source || "";

  // Build reference string
  let refStr = `${prefix} ${title}`;
  
  if (url) {
    refStr += ` - ${url}`;
  }
  
  if (source && source !== url) {
    refStr += ` (${source})`;
  }

  // Truncate if too long
  if (refStr.length > maxWidth) {
    refStr = refStr.substring(0, maxWidth - 3) + "...";
  }

  return refStr;
}

/**
 * Wrap text to specified width
 */
function wrapText(text: string, maxWidth: number): string {
  const words = text.split(/(\s+)/);
  const lines: string[] = [];
  let currentLine = "";
  let currentLength = 0;

  for (const word of words) {
    // Check if adding this word would exceed max width
    // Note: words includes whitespace, so we need to handle it properly
    if (currentLength + word.length > maxWidth) {
      // Push current line and start new one
      if (currentLine.length > 0) {
        lines.push(currentLine);
        currentLine = "";
        currentLength = 0;
      }
    }

    currentLine += word;
    currentLength += word.length;
  }

  // Don't forget the last line
  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  return lines.join("\n");
}

// ============================================================================
// Simple Display (for chat output)
// ============================================================================

/**
 * Format websearch result as simple text with inline citations
 */
export function formatWebsearchSimple(result: WebsearchResult): string {
  return result.text;
}

/**
 * Format references as a simple list
 */
export function formatReferencesSimple(references: WebsearchReference[]): string {
  if (references.length === 0) {
    return "";
  }

  return references
    .map((ref, i) => `[${i + 1}] ${ref.title} - ${ref.url}`)
    .join("\n");
}

// ============================================================================
// Rich Display Components
// ============================================================================

/**
 * Create a display-ready websearch result object
 */
export interface DisplayWebsearchResult {
  content: string;
  references: WebsearchReference[];
  referenceCount: number;
}

export function createDisplayResult(result: WebsearchResult): DisplayWebsearchResult {
  return {
    content: result.text,
    references: result.references,
    referenceCount: result.references.length,
  };
}

/**
 * Format websearch result with markdown-style citations
 */
export function formatWithMarkdown(result: WebsearchResult): string {
  const lines: string[] = [];
  
  lines.push(result.text);
  
  if (result.references.length > 0) {
    lines.push("");
    lines.push("---");
    lines.push("### References");
    lines.push("");
    
    for (let i = 0; i < result.references.length; i++) {
      const ref = result.references[i];
      lines.push(`[${i + 1}]: ${ref.title} - ${ref.url}`);
      if (ref.source && ref.source !== ref.url) {
        lines.push(`    Source: ${ref.source}`);
      }
    }
  }
  
  return lines.join("\n");
}
