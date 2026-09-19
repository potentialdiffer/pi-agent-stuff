// ============================================================================
// pi-vision configuration
// ~/.config/pi-vision.json + environment variable overrides
// ============================================================================

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export interface VisionConfig {
  /** Master switch for the automatic context bridge (tool stays available) */
  enabled: boolean;
  /** Pixtral (or other Mistral vision) model used for descriptions */
  model: string;
  /** Mistral API base URL */
  baseUrl: string;
  /** Max output tokens per description */
  maxTokens: number;
  /** Per-request timeout */
  timeoutMs: number;
  /** Reject images larger than this (bytes, decoded) */
  maxImageBytes: number;
  /** Cache TTL for image descriptions */
  cacheTtlHours: number;
  /** Max cached descriptions before oldest entries evicted */
  cacheMaxEntries: number;
  /** System-style prompt used to describe images */
  describePrompt: string;
}

export const DEFAULT_CONFIG: VisionConfig = {
  enabled: true,
  model: "pixtral-12b-latest",
  baseUrl: "https://api.mistral.ai",
  maxTokens: 2048,
  timeoutMs: 120_000,
  maxImageBytes: 10 * 1024 * 1024,
  cacheTtlHours: 24,
  cacheMaxEntries: 100,
  describePrompt:
    "You are a vision bridge for a coding agent that cannot see images. " +
    "Describe this image precisely and completely so the agent can work with it. " +
    "Include: (1) overall type (screenshot, photo, diagram, chart, plot, error message, UI, document scan), " +
    "(2) ALL visible text verbatim, " +
    "(3) layout and structure; colors only when relevant, " +
    "(4) for code or terminal screenshots, transcribe exactly, " +
    "(5) for charts/plots, describe axes, data trends, and key values. " +
    "Be factual and terse. Do not speculate beyond what is visible.",
};

const CONFIG_PATH = path.join(os.homedir(), ".config", "pi-vision.json");

let cachedConfig: VisionConfig | null = null;

export function getConfig(): VisionConfig {
  if (cachedConfig) return cachedConfig;

  const cfg: VisionConfig = { ...DEFAULT_CONFIG };

  // Layer 1: config file
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const fileConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")) as Partial<VisionConfig>;
      Object.assign(cfg, fileConfig);
    } catch (e) {
      console.warn(`[pi-vision] Failed to parse ${CONFIG_PATH}: ${e}`);
    }
  }

  // Layer 2: environment overrides
  if (process.env.PI_VISION_MODEL) cfg.model = process.env.PI_VISION_MODEL;
  if (process.env.PI_VISION_BASE_URL) cfg.baseUrl = process.env.PI_VISION_BASE_URL;
  else if (process.env.MISTRAL_BASE_URL) cfg.baseUrl = process.env.MISTRAL_BASE_URL;
  if (process.env.PI_VISION_MAX_TOKENS) cfg.maxTokens = Number(process.env.PI_VISION_MAX_TOKENS);
  if (process.env.PI_VISION_TIMEOUT_MS) cfg.timeoutMs = Number(process.env.PI_VISION_TIMEOUT_MS);
  if (process.env.PI_VISION_ENABLED === "0" || process.env.PI_VISION_ENABLED === "false")
    cfg.enabled = false;

  cachedConfig = cfg;
  return cfg;
}

/** Invalidate cached config (used on /reload) */
export function invalidateConfig(): void {
  cachedConfig = null;
}

/** Config file path (for /vision status display) */
export function getConfigPath(): string {
  return CONFIG_PATH;
}
