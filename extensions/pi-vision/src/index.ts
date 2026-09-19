// ============================================================================
// pi-vision
// Image vision bridge for pi: describes images via Mistral Pixtral when the
// active model has no image input support.
//
// How it works:
// - pi normally drops image content for non-vision models at the provider
//   layer, leaving only "(image omitted: model does not support images)".
// - This extension hooks the `context` event (fires before every LLM call)
//   and, when ctx.model lacks "image" input, replaces every image content
//   block in the (deep-copied) messages with a Pixtral text description.
// - Session entries are NOT modified: the TUI keeps showing images, and
//   switching to a vision model later restores native image input.
// - Descriptions are cached per image hash, so Pixtral is called once per
//   image (per question), not once per turn.
//
// Tool: describe_image(path, question?) — explicit, question-driven analysis.
// Commands: /vision (status), /vision-test <path> [question]
// ============================================================================

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as fs from "node:fs";
import * as path from "node:path";
import { getConfig, getConfigPath, invalidateConfig, DEFAULT_CONFIG } from "./config.ts";
import { isConfigured } from "./auth.ts";
import * as cache from "./cache.ts";
import { describeImage, sniffMimeType } from "./pixtral.ts";

/** Session-scoped flags */
let notifiedNotConfigured = false;

export default function piVisionExtension(pi: ExtensionAPI) {
  // ========================================================================
  // Core: context bridge
  // ========================================================================

  pi.on("context", async (event, ctx) => {
    const cfg = getConfig();
    if (!cfg.enabled) return;

    // Model with native vision: pass through untouched, zero overhead
    const model = ctx.model as { input?: string[] } | undefined;
    if (model?.input?.includes("image")) return;

    // No API key: leave messages alone (provider inserts its own placeholder)
    if (!isConfigured()) return;

    let described = 0;
    let failed = 0;

    for (const msg of event.messages as any[]) {
      if (!Array.isArray(msg?.content)) continue;
      if (!msg.content.some((b: any) => b?.type === "image")) continue;

      const newContent: any[] = [];
      for (const block of msg.content) {
        if (block?.type !== "image" || typeof block.data !== "string") {
          newContent.push(block);
          continue;
        }
        try {
          const description = await describeImage(block.data, block.mimeType || "image/png", {
            signal: ctx.signal,
          });
          described++;
          newContent.push({
            type: "text",
            text: `[image: described by pi-vision (${cfg.model})]\n${description}`,
          });
        } catch (err) {
          // Keep original block; provider drops it with a placeholder.
          // No error caching -> retried on the next LLM call.
          failed++;
          newContent.push(block);
        }
      }
      msg.content = newContent;
    }

    if (described > 0 && ctx.hasUI) {
      ctx.ui.notify(`pi-vision: described ${described} image(s) via ${cfg.model}`, "info");
    }
    if (failed > 0 && ctx.hasUI) {
      ctx.ui.notify(`pi-vision: ${failed} image(s) could not be described (will retry)`, "warning");
    }

    if (described > 0 || failed > 0) return { messages: event.messages };
  });

  // ========================================================================
  // Tool: describe_image
  // ========================================================================

  pi.registerTool({
    name: "describe_image",
    label: "Describe image",
    description:
      "Analyze an image file with a vision model (Mistral Pixtral). " +
      "Use when the current model cannot see images (attached images or `read` on image files " +
      "are dropped for text-only models), or when you need a focused answer to a specific " +
      "question about an image (screenshot, plot, diagram, photo). Returns text.",
    promptSnippet: "Analyze image files with a vision model when you cannot see images yourself",
    parameters: Type.Object({
      path: Type.String({ description: "Path to the image file" }),
      question: Type.Optional(
        Type.String({ description: "Specific question to answer about the image" })
      ),
    }),

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const p = path.resolve(ctx.cwd, String(params?.path || ""));
      if (!fs.existsSync(p)) {
        return {
          content: [{ type: "text", text: `Image not found: ${p}` }],
          isError: true,
          details: {},
        };
      }
      const buffer = fs.readFileSync(p);
      if (buffer.length === 0) {
        return {
          content: [{ type: "text", text: `Image file is empty: ${p}` }],
          isError: true,
          details: {},
        };
      }
      const mimeType = sniffMimeType(p, buffer);
      if (mimeType === "application/octet-stream") {
        return {
          content: [{ type: "text", text: `Not a recognized image type: ${p}` }],
          isError: true,
          details: {},
        };
      }
      try {
        onUpdate?.({
          content: [{ type: "text", text: `Analyzing ${path.basename(p)} with Pixtral...` }],
        });
        const description = await describeImage(buffer.toString("base64"), mimeType, {
          question: params?.question ? String(params.question) : undefined,
          signal,
        });
        return {
          content: [{ type: "text", text: description }],
          details: { model: getConfig().model, mimeType },
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `describe_image failed: ${String(error)}` }],
          isError: true,
          details: {},
        };
      }
    },
  });

  // ========================================================================
  // Commands
  // ========================================================================

  pi.registerCommand("vision", {
    description: "pi-vision status (Pixtral vision bridge)",
    handler: async (_args, ctx) => {
      const cfg = getConfig();
      const configured = isConfigured();
      const model = ctx.model as { input?: string[]; id?: string } | undefined;
      const activeModelSeesImages = model?.input?.includes("image") ?? false;

      const lines = [
        `pi-vision status:`,
        `  Bridge:      ${cfg.enabled ? "enabled" : "disabled"}`,
        `  API key:     ${configured ? "configured" : "MISSING (set MISTRAL_API_KEY or run /mistral-setup)"}`,
        `  Vision model: ${cfg.model}`,
        `  Active model: ${model?.id ?? "unknown"} ${activeModelSeesImages ? "(native vision — bridge inactive)" : "(text-only — bridge active)"}`,
        `  Cache:       ${cache.stats().size} description(s)`,
        `  Config file: ${getConfigPath()}`,
      ];
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });

  pi.registerCommand("vision-test", {
    description: "Test pi-vision: describe an image file (/vision-test <path> [question])",
    handler: async (args, ctx) => {
      const parts = String(args || "").trim().split(/\s+/).filter(Boolean);
      if (parts.length === 0) {
        ctx.ui.notify("Usage: /vision-test <image-path> [question]", "warning");
        return;
      }
      const p = path.resolve(ctx.cwd, parts[0]);
      if (!fs.existsSync(p)) {
        ctx.ui.notify(`Image not found: ${p}`, "error");
        return;
      }
      const question = parts.length > 1 ? parts.slice(1).join(" ") : undefined;
      const buffer = fs.readFileSync(p);
      try {
        const description = await describeImage(buffer.toString("base64"), sniffMimeType(p, buffer), {
          question,
        });
        ctx.ui.notify(`Pixtral says:\n\n${description}`, "info");
      } catch (error) {
        ctx.ui.notify(`pi-vision test failed: ${String(error)}`, "error");
      }
    },
  });

  pi.registerCommand("vision-cache-clear", {
    description: "Clear pi-vision image description cache",
    handler: async (_args, ctx) => {
      cache.clear();
      ctx.ui.notify("pi-vision cache cleared", "info");
    },
  });

  // ========================================================================
  // Session lifecycle
  // ========================================================================

  pi.on("session_start", async (_event, ctx) => {
    notifiedNotConfigured = false;
    invalidateConfig(); // pick up config changes across sessions
    const cfg = getConfig();
    if (!cfg.enabled) return;
    if (!isConfigured()) {
      if (!notifiedNotConfigured && ctx.hasUI) {
        notifiedNotConfigured = true;
        ctx.ui.notify(
          "pi-vision: no Mistral API key. Set MISTRAL_API_KEY or run /mistral-setup. " +
          "Images for text-only models will be omitted.",
          "warning"
        );
      }
      return;
    }
    if (ctx.hasUI) ctx.ui.notify(`pi-vision ready (${cfg.model})`, "info");
  });

  pi.on("session_shutdown", async (_event, _ctx) => {
    // Keep description cache across sessions in the same process; it expires by TTL.
  });
}
