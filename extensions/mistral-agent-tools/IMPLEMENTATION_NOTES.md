# Implementation Notes

## Overview

This document describes the improved Mistral image generation extension for pi, refactored into a modular TypeScript architecture.

## Directory Structure

```
ai-mensa-menu/
├── src/
│   ├── index.ts                    # Main extension entry point
│   ├── config/
│   │   ├── constants.ts            # Default configuration values
│   │   ├── types.ts                # Shared TypeScript interfaces and types
│   │   └── index.ts                # Config exports
│   ├── modules/
│   │   ├── auth.ts                 # API key management
│   │   ├── agent-manager.ts        # Agent lifecycle and caching
│   │   ├── conversation-manager.ts # Conversation handling
│   │   ├── image-downloader.ts     # File download and streaming
│   │   ├── image-display.ts        # Image formatting for pi TUI
│   │   └── index.ts                # Module exports
│   ├── tools/
│   │   ├── image-generation.ts     # mistral_generate_image tool
│   │   └── index.ts                # Tool exports
│   └── commands/
│       ├── setup.ts                # /mistral-setup command
│       ├── status.ts               # /mistral-status command
│       ├── generate.ts             # /mistral-image command
│       └── index.ts                # Command exports
├── package.json
├── README.md
└── api-documetation.md
```

## Key Design Decisions

### 1. Modular Architecture

Each major functionality area is separated into its own module:
- **auth.ts**: Handles API key retrieval, validation, and persistence
- **agent-manager.ts**: Manages Mistral agent lifecycle with caching
- **conversation-manager.ts**: Handles conversation creation and polling
- **image-downloader.ts**: Manages file downloads and streaming
- **image-display.ts**: Formats images for pi's TUI

This separation improves:
- Code maintainability
- Testability (each module can be tested independently)
- Reusability (modules can be used by other extensions)
- Error isolation (issues in one module don't affect others)

### 2. Type Safety

Extensive use of TypeScript types:
- Custom interfaces for all module inputs/outputs
- Re-exported Mistral SDK types for clarity
- Custom error classes for different failure modes
- Shared type definitions in `config/types.ts`

### 3. Error Handling

Comprehensive error handling with:
- Custom error classes (`MistralAuthError`, `ImageGenerationError`, etc.)
- Error phases tracked (agent_creation, conversation_start, file_extraction, download)
- Retryable vs non-retryable error distinction
- User-friendly error messages

### 4. Caching Strategy

**Agent Cache:**
- In-memory cache using Map
- TTL: 1 hour
- Max entries: 10
- Auto-cleanup on access

**Conversation Handling:**
- Polling with exponential backoff
- Max 30 attempts (60 seconds total)
- Graceful timeout handling

### 5. API Integration

Based on `api-documetation.md`, the extension uses:

```typescript
// 1. Create agent with image_generation tool
const agent = await client.beta.agents.create({
  model: "mistral-medium-latest",
  name: "Image Generation Agent",
  description: "Agent used to generate images.",
  instructions: "Use the image generation tool when you have to create images.",
  tools: [{ type: "image_generation" }],
  completionArgs: { temperature: 0.3, topP: 0.95 },
});

// 2. Start conversation
const conversation = await client.beta.conversations.start({
  agentId: agent.id,
  inputs: "Generate an orange cat in an office.",
});

// 3. Extract tool_file chunks
const messageOutputEntry = conversation.outputs[conversation.outputs.length - 1] as MessageOutputEntry;
const chunk = messageOutputEntry.content[1] as ToolFileChunk;
// chunk.fileId contains the generated image

// 4. Download file
const fileStream = await client.files.download({ fileId: chunk.fileId });
```

## Configuration Flow

1. **API Key Resolution:**
   - Environment variable: `MISTRAL_API_KEY`
   - Auth file: `~/.pi/agent/auth.json`
   - Priority: Environment > Auth file

2. **Base URL Resolution:**
   - Environment variable: `MISTRAL_BASE_URL`
   - Auth file: `~/.pi/agent/auth.json` (mistral.baseUrl)
   - Default: `https://api.mistral.ai`

3. **Setup Command:** `/mistral-setup`
   - Prompts for API key
   - Optional custom base URL
   - Validates key with test API call
   - Saves to auth.json

## Image Generation Flow

1. **Tool Call:** LLM or user calls `mistral_generate_image`
2. **Authentication:** Get API key from config
3. **Agent:** Get or create image generation agent
4. **Conversation:** Start conversation with prompt
5. **Polling:** Wait for file IDs (if not immediate)
6. **Download:** Download all image files
7. **Format:** Convert to base64 for display
8. **Display:** Return formatted content to pi

## Commands

| Command | Description | Usage |
|---------|-------------|-------|
| `/mistral-setup` | Configure API key | Interactive prompt |
| `/mistral-remove-key` | Remove API key | Confirmation dialog |
| `/mistral-status` | Show status | No args |
| `/mistral-cache-clear` | Clear agent cache | No args |
| `/mistral-image <prompt>` | Generate image | `/mistral-image a sunset` |
| `/mistral-image-direct <prompt>` | Direct tool call | `/mistral-image-direct a sunset` |

## Tools

### mistral_generate_image

**Parameters:**
- `prompt` (required, string): Image description
- `model` (optional, string): Mistral model (default: mistral-medium-latest)
- `temperature` (optional, number): Sampling temperature (0-1, default: 0.3)
- `topP` (optional, number): Top-p sampling (0-1, default: 0.95)

**Returns:**
```typescript
{
  content: [
    { type: "text", text: "Generation complete..." },
    { 
      type: "image", 
      source: { 
        type: "base64", 
        mediaType: "image/png", 
        data: "..." 
      } 
    }
  ],
  details: {
    model: "mistral-medium-latest",
    prompt: "user prompt",
    conversationId: "...",
    fileIds: ["..."],
    generationTimeMs: 1234,
    timestamp: 1234567890
  }
}
```

## Best Practices Implemented

### TypeScript
- ✅ Strict typing throughout
- ✅ Custom error classes
- ✅ Shared interfaces
- ✅ Type guards where appropriate
- ✅ Module-level type exports

### Code Organization
- ✅ Separation of concerns
- ✅ Single responsibility principle
- ✅ Clear module boundaries
- ✅ Dependency injection pattern
- ✅ Centralized configuration

### Error Handling
- ✅ Custom error types per domain
- ✅ Retry logic with exponential backoff
- ✅ Non-retryable error detection
- ✅ User-friendly error messages
- ✅ Comprehensive logging

### Performance
- ✅ Agent caching
- ✅ Efficient polling
- ✅ Stream processing for downloads
- ✅ Memory-efficient buffer handling

### User Experience
- ✅ Progress updates during generation
- ✅ Clear error messages
- ✅ Configuration validation
- ✅ Helpful command descriptions

## Testing Notes

To test the extension:

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run pi with the extension:
   ```bash
   pi --extension ./src/index.ts
   ```

3. Configure API key:
   ```
   /mistral-setup
   ```

4. Generate an image:
   ```
   /mistral-image A beautiful landscape
   ```

5. Check status:
   ```
   /mistral-status
   ```

## Known Issues & TODOs

### TODOs
- [ ] Add unit tests for modules
- [ ] Add integration tests
- [ ] Implement image resizing (requires image processing library)
- [ ] Add support for custom image dimensions
- [ ] Implement conversation history tracking
- [ ] Add rate limiting
- [ ] Add telemetry/analytics (optional)

### Known Issues
- Mistral Beta API endpoints may change
- Image generation may have latency
- Large images may hit API limits

## Migration from v1

The v1 implementation (`mistral-image.ts`) has been replaced with this modular structure. The main changes are:

1. **File Structure:** Single file → Multiple modules
2. **Configuration:** Hardcoded → Centralized constants
3. **Error Handling:** Basic → Comprehensive
4. **Caching:** Simple → Managed with cleanup
5. **Types:** Implicit → Explicit TypeScript

To migrate existing configurations:
- API keys in `auth.json` are automatically compatible
- Environment variables work the same way
- Commands have the same names and behavior

## Performance Considerations

- **Agent Cache:** Reduces API calls for agent creation
- **Polling:** Exponential backoff prevents server overload
- **Streaming:** Downloads are streamed to minimize memory usage
- **Cleanup:** Automatic cleanup of old temp files and cache entries

## Security Considerations

- **API Keys:** Stored in `auth.json` with file system permissions
- **No Logging:** API keys are never logged (masked in status output)
- **Validation:** API keys are validated before use
- **Isolation:** Each module has minimal permissions

## Future Enhancements

1. **Multi-Model Support:** Allow switching between different Mistral models
2. **Image History:** Track generated images in session
3. **Image Editing:** Support for image-to-image generation
4. **Batch Generation:** Generate multiple images from one prompt
5. **Style Presets:** Predefined styles for common use cases
6. **Custom Models:** Support for fine-tuned models
7. **RPC Mode:** Better support for pi's RPC mode
