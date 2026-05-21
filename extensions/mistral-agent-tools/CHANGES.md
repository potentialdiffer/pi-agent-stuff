# Changes from v1 to v2

## Summary

Complete refactor of the Mistral image generation extension from a monolithic single file into a modular, maintainable architecture.

## File Structure Changes

### v1 (Removed)
- `mistral-image.ts` - Single monolithic file (~1200 lines)

### v2 (New)
```
src/
├── index.ts                    # Main entry point
├── config/
│   ├── constants.ts            # Configuration defaults
│   ├── types.ts                # TypeScript types
│   └── index.ts                # Exports
├── modules/
│   ├── auth.ts                 # API key management
│   ├── agent-manager.ts        # Agent lifecycle
│   ├── conversation-manager.ts # Conversation handling
│   ├── image-downloader.ts     # File downloads
│   ├── image-display.ts        # Image formatting
│   └── index.ts                # Exports
├── tools/
│   ├── image-generation.ts     # LLM tool
│   └── index.ts                # Exports
└── commands/
    ├── setup.ts                # /mistral-setup
    ├── status.ts               # /mistral-status
    ├── generate.ts             # /mistral-image
    └── index.ts                # Exports
```

## Functional Improvements

### 1. Modular Architecture
- **Separation of Concerns**: Each module handles one specific responsibility
- **Better Maintainability**: Easier to understand, test, and modify
- **Reusability**: Modules can be used independently

### 2. Enhanced Type Safety
- Custom TypeScript interfaces for all module boundaries
- Re-exported Mistral SDK types for clarity
- Custom error classes with typed properties
- Shared type definitions

### 3. Improved Error Handling
- Custom error classes: `MistralAuthError`, `MistralApiError`, `ImageGenerationError`, `ConfigurationError`
- Error phases tracked: `agent_creation`, `conversation_start`, `file_extraction`, `download`
- Retryable vs non-retryable error distinction
- User-friendly error messages

### 4. Better Caching
- **Agent Cache**: In-memory with TTL (1 hour) and max size (10 entries)
- **Auto-cleanup**: Old entries removed on access
- **Statistics**: Cache size tracking

### 5. Robust Polling
- Exponential backoff for conversation polling
- Max 30 attempts (60 seconds total)
- Proper timeout handling
- Signal propagation for cancellation

### 6. Image Processing
- Support for multiple image formats (PNG, JPEG, WebP)
- Magic number validation for downloaded files
- MIME type detection from binary data
- Size limits (10MB max)

### 7. Display Formatting
- Base64 encoding for pi TUI
- Proper media type handling
- Dimension extraction from image headers
- Multi-image support

## API Integration Fixes

Based on `api-documetation.md`, the v2 implementation correctly uses:

```typescript
// Create agent with image_generation tool
const agent = await client.beta.agents.create({
  model: model,
  name: "Image Generation Agent",
  description: "Agent used to generate images.",
  instructions: "Use the image generation tool when you have to create images.",
  tools: [{ type: "image_generation" }],
  completionArgs: { temperature: 0.3, topP: 0.95 },
});

// Start conversation
const conversation = await client.beta.conversations.start({
  agent_id: agent.id,
  inputs: prompt,
});

// Extract file IDs from tool_file chunks
const messageOutput = conversation.outputs[conversation.outputs.length - 1] as MessageOutputEntry;
const fileChunk = messageOutput.content[1] as ToolFileChunk;
// fileChunk.fileId contains the image

// Download file
const fileStream = await client.files.download({ fileId: fileChunk.fileId });
```

## Configuration Improvements

### API Key Management
- **Priority**: Environment variable > auth file
- **Validation**: Test API call on setup
- **Security**: Masked display in status
- **Flexibility**: Support for custom base URLs

### Defaults
All configurable via `src/config/constants.ts`:
- Default model: `mistral-medium-latest`
- Temperature: 0.3
- Top-p: 0.95
- Timeout: 120 seconds
- Poll interval: 2 seconds
- Max poll attempts: 30
- Agent cache TTL: 1 hour
- Max cached agents: 10

## New Commands

| Command | Description |
|---------|-------------|
| `/mistral-setup` | Configure API key (interactive) |
| `/mistral-remove-key` | Remove API key |
| `/mistral-status` | Show configuration status |
| `/mistral-cache-clear` | Clear agent cache |
| `/mistral-image <prompt>` | Generate image |
| `/mistral-image-direct <prompt>` | Direct tool call |

## Tool Improvements

### mistral_generate_image

**Parameters:**
- `prompt` (required): Image description
- `model` (optional): Mistral model
- `temperature` (optional): Sampling temperature
- `topP` (optional): Top-p sampling

**Enhancements:**
- Progress updates during generation
- Better error messages
- Detailed result metadata
- Support for multiple images

**Result Format:**
```typescript
{
  content: [
    { type: "text", text: "Generation complete..." },
    { type: "image", source: { type: "base64", mediaType: "image/png", data: "..." } }
  ],
  details: {
    model: "mistral-medium-latest",
    prompt: "user prompt",
    conversationId: "...",
    fileIds: ["..."],
    generationTimeMs: 1234,
    timestamp: 1234567890,
    fileName: "mistral-image-12345678.png",
    fileType: "png"
  }
}
```

## Breaking Changes

None. The extension maintains backward compatibility:
- Same commands work the same way
- Same API key configuration
- Same tool name and basic functionality

## Migration Guide

No migration needed for users. The extension automatically:
- Reads existing API keys from `auth.json`
- Works with environment variables
- Maintains the same command interface

For developers:
- Import paths have changed (now use module structure)
- Type definitions are in `src/config/types.ts`
- Configuration is in `src/config/constants.ts`

## Performance Improvements

1. **Agent Caching**: Reduces agent creation API calls
2. **Efficient Polling**: Exponential backoff prevents server overload
3. **Stream Processing**: Downloads are streamed to minimize memory
4. **Cleanup**: Automatic cleanup of old temp files and cache

## Code Quality Improvements

- ✅ Consistent code style
- ✅ Comprehensive JSDoc comments
- ✅ TypeScript strict mode
- ✅ Proper error handling
- ✅ Module separation
- ✅ Clear naming conventions

## Testing

The extension has been structured for testability:

```typescript
// Example: Test auth module
import { validateApiKey, saveApiKey } from './src/modules/auth.js';

// Example: Test agent manager
import { getOrCreateImageAgent } from './src/modules/agent-manager.js';
```

Each module can be tested independently with mocked dependencies.

## Future Work

- Unit tests for each module
- Integration tests
- Image resizing support
- Custom dimension support
- Conversation history
- Rate limiting
- Better progress indicators
