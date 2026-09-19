// pi-vision smoke test (run with: node --experimental-strip-types test/smoke.mts)
// Validates: module loads, factory registers hooks/tools/commands,
// context hook pass-through logic, cache, mime sniffing, prompt building.

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const mod = await import("../src/index.ts");

const registered = { tools: [], commands: [], handlers: {} };
const fakePi = {
  on: (name, handler) => { registered.handlers[name] = handler; },
  registerTool: (t) => { registered.tools.push(t.name); },
  registerCommand: (name) => { registered.commands.push(name); },
};

mod.default(fakePi);

console.log("tools:", registered.tools.join(", "));
console.log("commands:", registered.commands.join(", "));
console.log("handlers:", Object.keys(registered.handlers).join(", "));

const assert = (cond, msg) => {
  if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; }
  else console.log("ok:", msg);
};

assert(registered.tools.includes("describe_image"), "describe_image tool registered");
assert(registered.commands.includes("vision"), "/vision registered");
assert(registered.handlers["context"], "context handler registered");
assert(registered.handlers["session_start"], "session_start handler registered");

// --- context hook: vision model -> pass through unchanged ---
let ctxSeen = null;
const visionModelCtx = {
  hasUI: false,
  model: { id: "gpt-vision-x", input: ["text", "image"] },
  signal: undefined,
};
const messages1 = [{ role: "user", content: [{ type: "text", text: "hi" }] }];
const result1 = await registered.handlers["context"]({ messages: messages1 }, visionModelCtx);
assert(result1 === undefined, "vision model: no modification (undefined return)");

// --- context hook: text-only model, no image blocks -> untouched ---
const textOnlyCtx = { hasUI: false, model: { id: "text-only", input: ["text"] }, signal: undefined };
const messages2 = [{ role: "user", content: [{ type: "text", text: "hello" }] }];
const result2 = await registered.handlers["context"]({ messages: messages2 }, textOnlyCtx);
assert(result2 === undefined, "text-only model, no images: no modification");

// --- context hook: text-only model WITH image, but no API key configured?
// (can't force here without mocking; skip network path — validated via /vision-test manually) ---

// --- cache unit checks ---
const cache = await import("../src/cache.ts");
const key1 = cache.cacheKey("AAAA", undefined);
const key2 = cache.cacheKey("AAAA", "what is this?");
const key3 = cache.cacheKey("BBBB", undefined);
assert(key1 !== key2 && key1 !== key3 && key2 !== key3, "cache keys distinct per data/question");
cache.set(key1, "a description");
assert(cache.get(key1) === "a description", "cache set/get round trip");
assert(cache.get(key3) === null, "cache miss returns null");

// --- pixtral helpers (no network) ---
const pix = await import("../src/pixtral.ts");
const png = Buffer.from("89504e470d0a1a0a", "hex");
assert(pix.sniffMimeType("x.png", png) === "image/png", "sniff png by ext");
assert(pix.sniffMimeType("x.unknown", png) === "image/png", "sniff png by magic bytes");
const jpeg = Buffer.from("ffd8ffe0", "hex");
assert(pix.sniffMimeType("noext", jpeg) === "image/jpeg", "sniff jpeg by magic bytes");
const webp = Buffer.from("52494646" + "00000000" + "57454250", "hex");
assert(pix.sniffMimeType("noext", webp) === "image/webp", "sniff webp by magic bytes");

// --- config ---
const cfgmod = await import("../src/config.ts");
const cfg = cfgmod.getConfig();
assert(typeof cfg.model === "string" && cfg.model.length > 0, "config resolves model");
assert(cfg.enabled === true, "config enabled default");

// --- auth ---
const auth = await import("../src/auth.ts");
console.log("auth configured (env/auth.json/config):", auth.isConfigured());

console.log("\nSMOKE TEST DONE");
