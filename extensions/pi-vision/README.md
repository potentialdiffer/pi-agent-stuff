# pi-vision

Image vision bridge for the pi coding agent. Describes images via **Mistral's vision models** (default: Ministral 3 14B, official successor of Pixtral 12B) when the active model cannot process images itself.

## Why

pi drops image content for models registered with `input: ["text"]` only — the model just sees `(image omitted: model does not support images)`. This extension fills that gap: before every LLM call, image blocks are swapped (in the request copy only) with a vision-model-generated text description.

## How it works

```
user attaches image / read(image file) / tool returns image
        │
        ▼
pi `context` event (before each LLM call)
        │
        ├─ active model supports images? ──► pass through, zero overhead
        ├─ no Mistral API key? ──► pass through (provider placeholder remains)
        └─ else: describe each image block via the configured vision model, replace with text
                │
                ▼
        cache (sha256 image hash, TTL 24h) → repeat calls are free
```

Key properties:

- **Session history stays intact.** The `context` event receives a deep copy; original session entries still contain the images. TUI keeps rendering them, and switching to a vision model (`/model`) restores native image input with no bridge interference.
- **Cached.** One vision-model call per image; subsequent turns and even sessions (same process) reuse the description.
- **Retries.** 429/5xx retried with backoff; failures are retried on the next LLM call (errors are not cached).

## Features

| Component | Purpose |
|---|---|
| `context` hook | Automatic bridge for user-attached images, `read` tool image results, and any tool returning image blocks |
| `describe_image` tool | Explicit, question-driven image analysis for the agent |
| `/vision` | Status (bridge, key, model, cache) |
| `/vision-test <path> [question]` | Manual end-to-end test |
| `/vision-cache-clear` | Drop cached descriptions |

## Vision model choice

| Model | API ID | Price (in/out per M) | Notes |
|---|---|---|---|
| **Ministral 3 14B** (default) | `ministral-14b-latest` | $0.20 / $0.20 | Official Pixtral 12B replacement (Pixtral deprecated 12/2025). Edge-class, fast, 256K ctx. Best bridge default: dense captioning/transcription is not a reasoning task. |
| Mistral Small 4 | `mistral-small-latest` | ~$0.15 in | Unified Magistral + Pixtral + Devstral; `reasoning_effort` |
| Mistral Medium 3.5 | `mistral-medium-3-5` | $1.50 / $7.50 | Frontier multimodal. Overkill for automatic bridging (cost + latency), but a good choice for deep, question-driven `describe_image` analysis |
| ~~Pixtral 12B~~ | `pixtral-12b-2409` | $0.15 / $0.15 | **Deprecated 12/2025** — still served, but migrate |
| ~~Magistral~~ | — | — | Text-only reasoning model: **cannot accept images**. Never valid here |

Switch via `PI_VISION_MODEL` or the config file.

## Setup

Requires a Mistral API key. Resolution order:

1. `MISTRAL_API_KEY` environment variable
2. pi `auth.json` entries written by `/mistral-setup` (mistral-agent-tools): `mistral-image-api` or `mistral`
3. `"apiKey"` in `~/.config/pi-vision.json`

```bash
# quick check
pi -e extensions/pi-vision/src/index.ts
# then in pi:
/vision-test path/to/image.png what is in this screenshot?
```

## Configuration

`~/.config/pi-vision.json` (all fields optional, see `config.example.json`):

```json
{
  "enabled": true,
  "model": "ministral-14b-latest",
  "maxTokens": 2048,
  "timeoutMs": 120000,
  "maxImageBytes": 10485760,
  "cacheTtlHours": 24,
  "cacheMaxEntries": 100,
  "describePrompt": "..."
}
```

Environment overrides: `PI_VISION_MODEL`, `PI_VISION_BASE_URL` (or `MISTRAL_BASE_URL`), `PI_VISION_MAX_TOKENS`, `PI_VISION_TIMEOUT_MS`, `PI_VISION_ENABLED=0`.

## Notes

- Each description injects up to `maxTokens` tokens into the conversation context, where it persists like any message. For many-image sessions consider lowering `maxTokens`.
- The bridge only fires for models whose pi registration lacks `image` in `input`. Verify a model with `/model` or check `/vision` output.
- Node >= 20 (uses global `fetch`, `AbortController`).
