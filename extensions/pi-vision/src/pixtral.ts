// ============================================================================
// Pixtral API client
// Raw fetch against Mistral /v1/chat/completions (no SDK dependency)
// ============================================================================

import { getConfig } from "./config.ts";
import { getApiKey } from "./auth.ts";
import * as cache from "./cache.ts";

const RETRY_DELAYS_MS = [1000, 3000];

export interface DescribeOptions {
  /** Specific question; description becomes question-aware */
  question?: string;
  /** Abort signal (agent turn cancellation) */
  signal?: AbortSignal;
}

function buildPrompt(question?: string): string {
  const cfg = getConfig();
  return question
    ? `${cfg.describePrompt}\n\nQuestion: ${question}`
    : cfg.describePrompt;
}

async function fetchChatCompletion(
  payload: Record<string, unknown>,
  signal: AbortSignal | undefined
): Promise<{ choices?: Array<{ message?: { content?: unknown } }> }> {
  const cfg = getConfig();
  const apiKey = getApiKey();

  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    // Combined timeout + caller abort
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });

    try {
      const res = await fetch(`${cfg.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (res.ok) {
        return (await res.json()) as { choices?: Array<{ message?: { content?: unknown } }> };
      }

      const body = await res.text().catch(() => "");
      const err = new Error(`Pixtral API ${res.status}: ${body.slice(0, 300)}`);

      // Retry only on rate limit and server errors
      if (res.status === 429 || res.status >= 500) {
        lastError = err;
        if (attempt < RETRY_DELAYS_MS.length) {
          await sleep(RETRY_DELAYS_MS[attempt], signal);
          continue;
        }
      }
      throw err;
    } catch (e) {
      // Re-throw aborts from the caller immediately (no retry)
      if (signal?.aborted) throw e;
      lastError = e instanceof Error ? e : new Error(String(e));
      if (attempt < RETRY_DELAYS_MS.length && !(e instanceof Error && e.name === "AbortError")) {
        await sleep(RETRY_DELAYS_MS[attempt], signal);
        continue;
      }
      throw lastError;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }
  throw lastError ?? new Error("Pixtral request failed");
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new Error("aborted"));
      },
      { once: true }
    );
  });
}

/**
 * Describe one image via Pixtral.
 * Cached: same image (+ same question) returns instantly across turns.
 */
export async function describeImage(
  base64Data: string,
  mimeType: string,
  options: DescribeOptions = {}
): Promise<string> {
  const key = cache.cacheKey(base64Data, options.question);
  const hit = cache.get(key);
  if (hit) return hit;

  const cfg = getConfig();

  // Size guard (decoded bytes)
  const bytes = Buffer.byteLength(base64Data, "base64");
  if (bytes > cfg.maxImageBytes) {
    throw new Error(
      `Image too large for Pixtral bridge: ${bytes} bytes (max ${cfg.maxImageBytes}). ` +
      "Downscale the image or raise maxImageBytes in config."
    );
  }

  const payload = {
    model: cfg.model,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: buildPrompt(options.question) },
          { type: "image_url", image_url: `data:${mimeType};base64,${base64Data}` },
        ],
      },
    ],
    max_tokens: cfg.maxTokens,
    temperature: 0.2,
  };

  const json = await fetchChatCompletion(payload, options.signal);
  const text = json?.choices?.[0]?.message?.content;
  const description =
    typeof text === "string"
      ? text.trim()
      : Array.isArray(text)
        ? text.filter((p: any) => p?.type === "text").map((p: any) => p.text).join("\n").trim()
        : "";

  if (!description) throw new Error("Pixtral returned empty content");
  cache.set(key, description);
  return description;
}

/** Sniff MIME type from extension or magic bytes */
export function sniffMimeType(filePath: string, buffer: Buffer): string {
  const ext = filePath.toLowerCase().split(".").pop() ?? "";
  const byExt: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    bmp: "image/bmp",
    tiff: "image/tiff",
    tif: "image/tiff",
  };
  if (byExt[ext]) return byExt[ext];

  if (buffer.length >= 4) {
    const header = buffer.subarray(0, 4).toString("hex");
    if (header.startsWith("89504e47")) return "image/png";
    if (header.startsWith("ffd8ff")) return "image/jpeg";
    if (header === "47494638") return "image/gif";
    if (header.startsWith("424d")) return "image/bmp";
    // RIFF....WEBP
    if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP")
      return "image/webp";
  }
  return "application/octet-stream";
}
