# Fixes Applied

## Issue: "Value error, One of 'model' or 'agent_id' needs to be set"

### Root Cause

The Mistral API requires either `model` or `agent_id` to be set in the conversation start request. The error occurred because:

1. We were passing `agent_id` (snake_case) directly to the SDK, but the SDK expects `agentId` (camelCase)
2. The SDK converts camelCase to snake_case for the API, but we were bypassing this by using snake_case directly
3. When neither `model` nor `agent_id` were present in the final API request, the error was thrown

### Solution

Fixed in two files:

#### 1. `src/modules/conversation-manager.ts`

**Before:**
```typescript
const response = await client.beta.conversations.start({
  agent_id: agentId,  // Wrong: snake_case
  inputs: params.prompt,
  tools: [{ type: "image_generation" }],
  stream: false,
}, { signal });
```

**After:**
```typescript
const model = params.model || DEFAULT_CONFIG.DEFAULT_MODEL;

const response = await client.beta.conversations.start({
  agentId: agentId,  // Correct: camelCase (SDK converts to snake_case)
  model: model,       // Also provide model as fallback
  inputs: params.prompt,
  tools: [{ type: "image_generation" }],
  stream: false,
}, { signal });
```

**Changes:**
- Changed `agent_id` to `agentId` (camelCase)
- Added explicit `model` parameter with fallback to default
- SDK automatically converts `agentId` → `agent_id` and `model` → `model` for API

#### 2. `src/tools/image-generation.ts`

**Before:**
```typescript
const { agentId } = await getOrCreateImageAgent(params.model, apiKey);

const conversationParams: ImageGenerationParams = {
  prompt: params.prompt,
  model: params.model,  // Could be undefined
  temperature: params.temperature,
  topP: params.topP,
};
```

**After:**
```typescript
const model = params.model || DEFAULT_CONFIG.DEFAULT_MODEL;

const { agentId } = await getOrCreateImageAgent(model, apiKey);

const conversationParams: ImageGenerationParams = {
  prompt: params.prompt,
  model: model,  // Always has a value
  temperature: params.temperature,
  topP: params.topP,
};
```

**Changes:**
- Ensure `model` always has a value (defaults to `mistral-medium-latest`)
- Pass the resolved model to agent creation and conversation

### Technical Details

The Mistral SDK uses TypeScript interfaces with camelCase property names:

```typescript
// SDK Interface (camelCase)
interface ConversationRequest {
  agentId?: string;
  model?: string;
  inputs: ConversationInputs;
  // ...
}

// Outbound type (snake_case for API)
interface ConversationRequest$Outbound {
  agent_id?: string;
  model?: string;
  inputs: ConversationInputs$Outbound;
  // ...
}
```

The SDK automatically converts between camelCase and snake_case when making API calls. By using camelCase (`agentId`, `model`), we allow the SDK to handle the conversion properly.

### Verification

The fix ensures that:
1. `agentId` is passed as camelCase → SDK converts to `agent_id` for API
2. `model` is always provided (never undefined)
3. Both parameters are included in the API request
4. The Mistral API receives the required parameters

### API Reference

From Mistral API documentation:
- `agent_id` (string): The ID of the agent to use
- `model` (string): The model to use for the conversation
- At least one of these must be provided

Our fix provides both, ensuring compatibility.

---

## Issue: mistral_websearch hangs indefinitely on queries that trigger server-side search

### Symptoms

- Queries the model answers without searching (trivial questions) return in ~1s, but with no citations.
- General web-search queries (e.g. "population of Toulouse") return in ~4s with citations.
- News-type queries (e.g. "latest news September 30 2026") hang forever with no error.

### Root Cause (two layers)

**1. Mistral server-side regression (2026-09-30, not fixable client-side):**
- News-type queries are routed to the `web_search_premium`/`news_search` tool function.
- That tool execution never completes server-side: the conversation stays at a
  pending `message.input` entry indefinitely (verified 15+ minutes), no
  `tool.execution` or `message.output` entry ever appears.
- Non-streaming `conversations.start` returns immediately with `outputs: []`
  for these queries, so the extension enters the polling path.
- Additionally, Mistral stopped populating `completedAt` on history entries:
  `GET /v1/conversations/{id}/history` returns `completed_at: null` on ALL
  entries even minutes after a fully successful search (verified). The answer
  text and citations ARE present in `message.output.content` while the
  timestamps stay null. So waiting for `completedAt != null` never succeeds.

**2. Extension bug (fixed here):**
- The poll loop used exponential backoff:
  `delay = WEBSEARCH_POLL_INTERVAL_MS * Math.pow(2, attempt)` with up to 30
  attempts. The constants comment claimed "150 seconds total polling", but the
  cumulative delay grows to ~57 days. A stuck conversation therefore hung the
  tool forever instead of failing.
- Completion detection relied solely on `completedAt != null`, which Mistral no
  longer populates - so even successful searches would hang forever if the
  initial response returned early-empty.

### Solution

**`src/config/constants.ts`:**
- `WEBSEARCH_MAX_POLL_ATTEMPTS: 30 -> 24` with fixed interval 5s:
  hard deadline of 120 seconds total (matches the original documented intent).

**`src/modules/websearch-manager.ts`:**
- Poll loop delay is now the fixed `WEBSEARCH_POLL_INTERVAL_MS` (no exponential
  backoff). The attempt count is the hard deadline.
- Timeout error message now states the actual wait time and the likely cause
  (news-type queries hang server-side), instead of a bare "max attempts reached".
- New `hasMeaningfulContent()`: a message output counts as complete when it has
  at least one non-empty text chunk.
- `isConversationComplete()` and `isConversationHistoryComplete()` accept
  either `completedAt != null` OR answer text already present.
- New exported `hasCompletedConversationOutput()` used by the tool and the
  continue path instead of duplicated inline `completedAt` checks.

**`src/tools/websearch.ts`:**
- Uses `hasCompletedConversationOutput()` (completedAt OR answer text).

### Verification (live API tests, 2026-09-30)

- Successful search via SDK `conversations.start` (stream:false) returns in ~4s
  with complete outputs; `completedAt` is set on the START response entries.
- `getHistory` for the same conversation shows `completed_at: null` on all
  entries 6+ minutes later, while `message.output.content` holds the full
  answer + citations -> content-based completion detection is required.
- Stuck news conversation stayed at a single pending `message.input` entry for
  15+ minutes -> poll deadline now fails at 120s with a clear error instead of
  hanging for days.

### Remaining known issue (Mistral-side)

News-type queries routed to `news_search` never execute server-side. The
extension now fails after 120 seconds with an actionable error message; full
functionality returns when Mistral fixes the `web_search_premium` backend.

---

## Review round 1 (opus-reviewer): two P1s found and fixed

### P1-1: hasMeaningfulContent threw on plain-string content

SDK 2.7.0 declares `MessageOutputEntry.content` as `string | MessageOutputContentChunks[]`
(the whole field can be a plain string; array chunks are never strings). The first
implementation called `.some()` unconditionally, so a string-content answer threw
`content.some is not a function`. In the poll loop that TypeError was caught and
turned into 24 rapid-fire getHistory calls followed by a bogus "Failed to poll"
error - a successful answer got reported as a failure. In the start/append paths
the same throw surfaced as "Failed to start/append websearch conversation".

Fixed: guard the string case first; inside the array, only non-empty `text` chunks
count (a message with only `tool_reference` chunks is not a usable answer).

### P1-2: polling a follow-up returned the previous turn's answer

`getHistory` returns the WHOLE conversation. For a follow-up whose append returns
early-empty (exactly what the stuck news-query bug does), the history contains the
previous turn's `message.output` - which always has answer text. The content-based
completion check scanned backwards over the full history, found the OLD output,
declared the conversation complete, and `conversationHistoryToResponse` then
extracted the previous turn's answer as the result of the new query (silent stale
answer instead of the 120s timeout).

Fixed: new `getCurrentTurnEntries()` helper - only entries AFTER the last
`message.input` count. Used by both `isConversationHistoryComplete()` and
`conversationHistoryToResponse()`.

### P2-1: poll error path ignored the deadline

A transient getHistory failure was retried with no delay, so 24 attempts could burn
in seconds; a single hung getHistory request could also outlive the deadline
(client has no timeoutMs and no per-call signal timeout).

Fixed: wall-clock deadline (`24 * 5000ms` budget) as a backstop; the sleep moved
before each poll (never after the last one); each getHistory call is bounded with
`AbortSignal.any([AbortSignal.timeout(remaining), signal-if-provided])` - note
Node's AbortSignal.any throws on nullish entries, so the caller's signal is only
included when defined (found during live testing); transient failures keep
waiting out the deadline and finally surface the clear timeout error.
User aborts rethrow immediately: the SDK throws RequestAbortedError (name is not
"AbortError"), so the catch keys off `signal.aborted` first, which also covers
an abort during the final attempt.

### P2-2: one inline completedAt check was missed

`src/commands/websearch.ts` (the /mistral-websearch command) still had the old
inline `completedAt`-only check. Replaced with `hasCompletedConversationOutput()`.

### P3 notes (accepted as-is)

- Total worst-case wait is 23 sleeps + 24 calls ~= 115-125s (measured 124s) - message says 120s.
- setTimeout does not observe the abort signal; abort can take up to 5s to take effect (pre-existing).
- tool_reference-only or whitespace-only messages count as incomplete by design - extraction would otherwise yield bare `[1]` markers.

---

## Review round 2 (opus-reviewer): CLEAN - no P0/P1

All round-1 fixes confirmed correct, including: string-first content guard,
turn-slice logic (SDK fills a default type so lastIndexOf is safe; stuck turn
-> empty slice -> incomplete), synchronous-complete path never polls, signal
reaches fetch and replaces the SDK's 300s default, deadline math bounded, and
per-call RequestTimeoutError is swallowed into the deadline as intended.

Two small P3 polish items applied post-review:

1. Abort detection keyed off `signal.aborted` in the poll catch (SDK aborts
   throw RequestAbortedError, not AbortError; also fixes an abort during the
   final attempt being misreported as the 120s timeout).
2. History completion now requires a message.output with content/completedAt
   in the current turn; a bare completed tool.execution no longer counts
   (extraction would throw "No content found" with no answer present).

P3 accepted as-is: if a turn somehow carried multiple message.output entries,
completion checks "any has text" while extraction reads the last - not seen in
practice (turns carry a single final message.output).
