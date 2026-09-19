// ============================================================================
// pi-vision auth
// API key resolution: env > pi auth.json > ~/.config/pi-vision.json
// Compatible with /mistral-setup from mistral-agent-tools (same auth.json entries)
// ============================================================================

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

interface AuthFileData {
  mistral?: { apiKey?: string; type?: string; key?: string };
  "mistral-image-api"?: { apiKey?: string; type?: string; key?: string };
}

function getAgentAuthFilePath(): string {
  const agentDir = process.env.PI_AGENT_DIR || path.join(os.homedir(), ".pi", "agent");
  return path.join(agentDir, "auth.json");
}

function getKeyFromPiAuthFile(): string | null {
  const authFile = getAgentAuthFilePath();
  if (!fs.existsSync(authFile)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(authFile, "utf-8")) as AuthFileData;

    // Preferred entry (also used by mistral-agent-tools)
    const img = data["mistral-image-api"];
    if (img) {
      if (img.type === "api_key" && img.key) return img.key.trim();
      if (img.apiKey) return img.apiKey.trim();
    }

    // Fallback: pi's mistral provider entry
    const m = data.mistral;
    if (m) {
      if (m.apiKey) return m.apiKey.trim();
      if (m.type === "api_key" && m.key) return m.key.trim();
    }
  } catch {
    // ignore parse errors
  }
  return null;
}

function getKeyFromVisionConfigFile(): string | null {
  const cfgFile = path.join(os.homedir(), ".config", "pi-vision.json");
  if (!fs.existsSync(cfgFile)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(cfgFile, "utf-8")) as { apiKey?: string };
    if (data.apiKey && data.apiKey.trim()) return data.apiKey.trim();
  } catch {
    // ignore parse errors
  }
  return null;
}

/** Resolve Mistral API key. Throws with actionable message when missing. */
export function getApiKey(): string {
  const env = process.env.MISTRAL_API_KEY;
  if (env && env.trim()) return env.trim();

  const fromAuth = getKeyFromPiAuthFile();
  if (fromAuth) return fromAuth;

  const fromCfg = getKeyFromVisionConfigFile();
  if (fromCfg) return fromCfg;

  throw new Error(
    "No Mistral API key found for pi-vision. " +
    "Set MISTRAL_API_KEY, run /mistral-setup (mistral-agent-tools), " +
    `or add "apiKey" to ${path.join(os.homedir(), ".config", "pi-vision.json")}`
  );
}

/** Non-throwing check */
export function isConfigured(): boolean {
  try {
    getApiKey();
    return true;
  } catch {
    return false;
  }
}
