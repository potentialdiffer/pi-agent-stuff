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
