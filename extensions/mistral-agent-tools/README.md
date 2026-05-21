# Mistral Agent Tools

A modular Pi extension for Mistral's agent tools, including image generation and websearch with citations. Part of the [pi-agent-stuff](https://github.com/potentialdiffer/pi-agent-stuff) monorepo.

## Features

### Image Generation
- **Image Generation**: Generate images from text prompts using Mistral's Beta API
- **API Key Management**: Secure storage via environment variables or `auth.json`
- **Agent Caching**: Reuse image generation agents for better performance (1-hour TTL)
- **Conversation Support**: Full conversation lifecycle with polling
- **Image Display**: Direct display in pi's TUI with base64 encoding
- **Multi-Image Support**: Handle multiple images in a single response
- **Progress Updates**: Real-time feedback during generation
- **Error Handling**: Comprehensive error handling with retry logic
- **Image Explorer**: Browse and preview saved images with `/explore-images`
- **Type Safety**: Full TypeScript support with custom error classes

### Websearch
- **Websearch**: Search the web using Mistral's websearch tool
- **Citations**: Automatic source citations with references
- **Agent Caching**: Separate cache for websearch agents
- **Conversation Support**: Full conversation lifecycle with polling
- **Reference Extraction**: Parse and format reference chunks from responses
- **Progress Updates**: Real-time feedback during search
- **Error Handling**: Comprehensive error handling with retry logic

## Architecture

The extension follows a modular TypeScript architecture with separate modules for image generation and websearch:

```
src/
├── index.ts                    # Main extension entry point
├── config/
│   ├── constants.ts            # Configuration defaults and validation
│   ├── types.ts                # Shared TypeScript types and error classes
│   └── index.ts                # Config exports
├── modules/
│   ├── auth.ts                 # API key management (shared)
│   ├── agent-manager.ts        # Image generation agent lifecycle
│   ├── conversation-manager.ts # Image generation conversation handling
│   ├── image-downloader.ts     # File download and streaming
│   ├── image-display.ts        # Image formatting for pi TUI
│   ├── image-explorer.ts       # Image browsing and preview
│   ├── websearch-manager.ts    # Websearch agent lifecycle
│   └── websearch-display.ts    # Websearch result formatting
├── tools/
│   ├── image-generation.ts     # mistral_generate_image tool
│   └── websearch.ts            # mistral_websearch tool
└── commands/
    ├── setup.ts                # /mistral-setup command (shared)
    ├── status.ts               # /mistral-status command (shared)
    ├── generate.ts             # /mistral-image command
    ├── explore-images.ts        # /explore-images command
    └── websearch.ts            # /mistral-websearch command
```

## Installation

### Prerequisites

- Node.js >= 18.0.0
- pi coding agent installed
- Mistral API key

### Setup

1. **Install dependencies:**
   ```bash
   cd pi-agent-stuff
   npm install
   ```

2. **Add extension to pi:**
   The extension is automatically loaded from the monorepo. Or add to your pi configuration:
   ```json
   {
     "extensions": ["./extensions/mistral-agent-tools/src/index.ts"]
   }
   ```

3. **Configure API key:**
   ```
   /mistral-setup
   ```

   Enter your Mistral API key when prompted.

4. **Verify configuration:**
   ```
   /mistral-status
   ```

## Usage

### Commands

| Command | Description |
|---------|-------------|
| `/mistral-setup` | Configure Mistral API key (interactive) |
| `/mistral-status` | Check configuration and status |
| `/mistral-image <prompt>` | Generate an image from text prompt |
| `/mistral-websearch <query>` | Search the web with citations |
| `/mistral-remove-key` | Remove stored API key |
| `/mistral-cache-clear` | Clear image agent cache |
| `/mistral-websearch-cache-clear` | Clear websearch agent cache |
| `/explore-images` | Browse and preview saved images in `.pi-images/` |

### Examples

**Image Generation:**
```
/mistral-image A beautiful sunset over mountains, digital art style, 4k
```

```
/mistral-image R2D2 and C3PO playing chess, Star Wars style, detailed
```

**Websearch:**
```
/mistral-websearch Who is Albert Einstein?
```

```
/mistral-websearch What is the latest news about AI in 2026?
```

**Image Explorer:**
```
/explore-images
```
Opens an interactive image browser showing all saved images in the `.pi-images/` directory with live previews.

### LLM Tool Usage

The extension registers two tools that the LLM can call automatically:

**Image Generation:**
- **Tool:** `mistral_generate_image`
- **User:** "Generate an image of a cyberpunk city at night"
- **LLM:** (automatically uses `mistral_generate_image` tool)
- **Result:** Image displayed directly in the chat and saved to `.pi-images/`

**Websearch:**
- **Tool:** `mistral_websearch`
- **User:** "What is the latest news about AI?"
- **LLM:** (automatically uses `mistral_websearch` tool)
- **Result:** Text response with numbered citations and reference list

### Direct Tool Calls

You can also trigger tools directly by asking the LLM:

```
Generate an image of a medieval castle on a hill
```
The LLM will use the `mistral_generate_image` tool.

```
What is the capital of France?
```
The LLM may use the `mistral_websearch` tool if it needs current information.

## Configuration

### API Key

The extension checks for API keys in the following order (highest to lowest priority):

1. **Environment variable**: `MISTRAL_API_KEY`
2. **Auth file**: `~/.pi/agent/auth.json`

**Environment variable:**
```bash
export MISTRAL_API_KEY=your-api-key
```

**Auth file** (`~/.pi/agent/auth.json`):
```json
{
  "mistral": {
    "apiKey": "your-api-key",
    "baseUrl": "https://api.mistral.ai"
  }
}
```

### Custom Base URL

To use a custom Mistral API endpoint:

```bash
export MISTRAL_BASE_URL=https://your-custom-endpoint.com
```

Or configure interactively via:
```
/mistral-setup
```

### Image Storage

Generated images are automatically saved to the `.pi-images/` directory in your current working directory. This allows you to:
- Browse images with `/explore-images`
- Keep a history of generated images
- Reference images by filename

**Storage location:** `./.pi-images/` (relative to pi session directory)

## API Integration

The extension uses Mistral's Beta API for both image generation and websearch with proper agent-based workflows:

### Image Generation Workflow

1. **Create Agent**: Creates an agent with `image_generation` tool
2. **Start Conversation**: Begins a conversation with the agent
3. **Poll for Results**: Waits for `tool_file` chunks containing file IDs
4. **Download Files**: Retrieves generated image files via `files.download`
5. **Display**: Shows images in pi's TUI with base64 encoding
6. **Save**: Stores images in `.pi-images/` for later exploration

### Websearch Workflow

1. **Create Agent**: Creates an agent with `web_search` tool
2. **Start Conversation**: Begins a conversation with the agent
3. **Poll for Results**: Waits for `tool_reference` chunks containing citations
4. **Extract Results**: Parses text and reference chunks from response
5. **Display**: Shows formatted text with numbered citations and reference list

### Agent Configuration

- **Model**: `mistral-medium-latest` (default, configurable)
- **Temperature**: 0.3 (default, configurable per-request)
- **Top-p**: 0.95 (default, configurable per-request)
- **Tools**: `image_generation` (required)

### Response Handling

The extension properly handles Mistral's Beta API response format:

```typescript
// Conversation response contains tool_file chunks
const messageOutputEntry = conversation.outputs[conversation.outputs.length - 1];
const toolFileChunk = messageOutputEntry.content[1] as ToolFileChunk;
// toolFileChunk.fileId contains the generated image file ID

// Download using files API
const fileStream = await client.files.download({ fileId: toolFileChunk.fileId });
```

### Supported Models

- `mistral-medium-latest` (default)
- `mistral-large-latest`
- `mistral-small-latest`

All models support both `image_generation` and `web_search` tools.

## Error Handling

The extension includes comprehensive error handling with custom error classes:

### Error Types

- **`MistralAuthError`**: Invalid or missing API key
- **`MistralApiError`**: API communication errors with status codes
- **`ImageGenerationError`**: Image generation failures with phase tracking
- **`WebsearchError`**: Websearch failures with phase tracking
- **`ConfigurationError`**: Missing or invalid configuration

### Handled Scenarios

- **Authentication errors**: Invalid or missing API key
- **Agent creation errors**: Issues creating image generation agents
- **Conversation errors**: Problems starting or polling conversations
- **Download errors**: Failed image downloads with automatic retry (3 attempts)
- **Display errors**: Invalid image data or size limits (10MB max)
- **Timeout errors**: Generation timeout after 2 minutes

### Error Phases

Each error is tagged with its phase for better debugging:

**Image Generation:**
- `agent_creation` - Failed to create the image generation agent
- `conversation_start` - Failed to start the conversation
- `file_extraction` - Failed to extract file IDs from response
- `download` - Failed to download the image file

**Websearch:**
- `agent_creation` - Failed to create the websearch agent
- `conversation_start` - Failed to start the conversation
- `polling` - Failed while polling for results
- `result_extraction` - Failed to extract references from response

All errors are logged and displayed to the user with actionable messages.

## Caching

### Image Agent Cache

- **TTL**: 1 hour (configurable via `AGENT_CACHE_TTL_MS`)
- **Max entries**: 10 agents (configurable via `MAX_CACHED_AGENTS`)
- **Auto-cleanup**: Old entries removed on access
- **Statistics**: Cache size tracking available

### Websearch Agent Cache

- **TTL**: 1 hour (configurable via `WEBSEARCH_AGENT_CACHE_TTL_MS`)
- **Max entries**: 10 agents (configurable via `MAX_CACHED_WEBSEARCH_AGENTS`)
- **Auto-cleanup**: Old entries removed on access
- **Statistics**: Cache size tracking available

### Conversation Cache

- **TTL**: 15 minutes (configurable via `CONVERSATION_CACHE_TTL_MS`)
- **Max entries**: 20 conversations (configurable via `MAX_CACHED_CONVERSATIONS`)
- **Polling**: Exponential backoff with max 15 attempts (30 seconds total)

## Image Processing

### Supported Formats

The extension supports multiple image formats with automatic detection:

- **PNG**: Magic bytes `\x89PNG`
- **JPEG**: Magic bytes `\xFF\xD8\xFF`
- **GIF**: Magic bytes `GIF87a` or `GIF89a`
- **WebP**: Magic bytes `RIFF....WEBP`

### Size Limits

- **Max file size**: 10MB (configurable via `MAX_IMAGE_SIZE_BYTES`)
- **Display limits**: 800x600 pixels (recommended)
- **Display cell limits**: 80x24 cells in explorer preview
- **Timeout**: 2 minutes per generation (configurable via `API_TIMEOUT_MS`)

### Dimension Extraction

Images dimensions are automatically extracted from file headers:
- PNG: Bytes 16-23 (width and height as 4-byte big-endian integers)
- JPEG: SOF0 marker parsing
- GIF: Bytes 6-10 (width and height as 2-byte little-endian integers)
- WebP: VP8 header parsing

### Display

Images are converted to base64 and embedded directly in the chat:

```typescript
{
  type: "image",
  source: {
    type: "base64",
    mediaType: "image/png",
    data: "...base64 data..."
  }
}
```

### Image Explorer

The `/explore-images` command provides:
- **List view**: All images in `.pi-images/` directory
- **Preview**: Live image preview (requires Kitty/iTerm2 terminal support)
- **Navigation**: Arrow keys to browse, Enter to select
- **Metadata**: Shows MIME type and file size for each image
- **Fallback**: Displays `[Image: filename [mime] WxH]` if terminal doesn't support images

## Development

### Project Structure

```
extensions/mistral-agent-tools/
├── src/
│   ├── index.ts                    # Main extension entry point
│   ├── config/
│   │   ├── constants.ts            # Default configuration values
│   │   ├── types.ts                # Shared TypeScript types and error classes
│   │   └── index.ts                # Config exports
│   ├── modules/
│   │   ├── auth.ts                 # API key management
│   │   ├── agent-manager.ts        # Agent lifecycle and caching
│   │   ├── conversation-manager.ts # Conversation handling with polling
│   │   ├── image-downloader.ts     # File download and streaming
│   │   ├── image-display.ts        # Image formatting for pi TUI
│   │   ├── image-explorer.ts       # Image browsing and preview
│   │   ├── websearch-manager.ts    # Websearch agent lifecycle
│   │   └── websearch-display.ts    # Websearch result formatting
│   ├── tools/
│   │   ├── image-generation.ts     # mistral_generate_image tool
│   │   └── websearch.ts            # mistral_websearch tool
│   └── commands/
│       ├── setup.ts                # /mistral-setup command
│       ├── status.ts               # /mistral-status command
│       ├── generate.ts             # /mistral-image command
│       ├── explore-images.ts        # /explore-images command
│       └── websearch.ts            # /mistral-websearch command
└── package.json
```

### Adding New Features

The extension is designed to be easily extensible. To add a new Mistral tool:

1. **New Module**:
   - Add to `src/modules/` (e.g., `newtool-manager.ts`)
   - Export from `src/modules/index.ts`
   - Implement agent lifecycle, conversation handling, and result extraction

2. **New Tool**:
   - Add to `src/tools/` (e.g., `newtool.ts`)
   - Export from `src/tools/index.ts`
   - Register in `src/index.ts` using `pi.registerTool()`
   - Follow the pattern in `image-generation.ts` or `websearch.ts`

3. **New Command**:
   - Add to `src/commands/` (e.g., `newtool.ts`)
   - Export from `src/commands/index.ts`
   - Register in `src/index.ts` using `pi.registerCommand()`
   - Follow the pattern in `generate.ts` or `websearch.ts`

4. **Update Types**:
   - Add new types to `src/config/types.ts`
   - Add new constants to `src/config/constants.ts`

### Configuration Constants

All defaults are defined in `src/config/constants.ts`:

```typescript
export const DEFAULT_CONFIG = {
  DEFAULT_MODEL: "mistral-medium-latest",
  BASE_URL: "https://api.mistral.ai",
  API_TIMEOUT_MS: 120_000,
  POLL_INTERVAL_MS: 2000,
  MAX_POLL_ATTEMPTS: 15,
  AGENT_CACHE_TTL_MS: 1000 * 60 * 60,
  // ... and more
} as const;
```

### Testing

```bash
# Run pi with the extension
pi --extension ./extensions/mistral-agent-tools/src/index.ts

# Test image generation
/mistral-image test prompt
```

## Troubleshooting

### "Mistral API key not found"

**Solution:** Configure your API key
```
/mistral-setup
```
Or set environment variable:
```bash
export MISTRAL_API_KEY=your-api-key
```

### "Failed to create agent"

**Causes:**
- Invalid API key
- No access to Beta API
- Network connectivity issues

**Solution:** Verify your API key with:
```
/mistral-status
```

### Image Generation Issues

#### "No file IDs found in response"
**Cause:** Image generation is still processing.

**Solution:** The extension automatically polls for results. Wait a few seconds. If it persists, the Beta API may be experiencing delays.

#### "Failed to download image"
**Causes:** Network connectivity issues, API rate limiting, or invalid file ID.

**Solution:** The extension retries up to 3 times automatically. Check your network connection and API key permissions.

#### "Image too large"
**Cause:** Generated image exceeds 10MB limit.

**Solution:** Try a simpler prompt or smaller dimensions.

#### "No images found in .pi-images directory"
**Cause:** No images have been generated yet.

**Solution:** Generate an image first with `/mistral-image`, then try `/explore-images`.

#### "Preview not showing in image explorer"
**Causes:** Terminal doesn't support Kitty or iTerm2 image protocols.

**Solution:** The extension shows fallback text `[Image: filename [mime] WxH]` if your terminal doesn't support inline images. Try Kitty, WezTerm, Ghostty, or iTerm2.

### Websearch Issues

#### "No references found in response"
**Cause:** The model may not have used the websearch tool, or the search is still processing.

**Solution:** Try rephrasing your query or wait a few seconds. Some queries may not require websearch.

#### "Websearch timed out"
**Cause:** The search took too long to complete.

**Solution:** Try a simpler query. The extension has a 2-minute timeout by default.

#### "No results returned"
**Cause:** The search may have failed or returned no results.

**Solution:** Check your API key and network connection. Try a different query.

## Contributing

1. Fork the [pi-agent-stuff](https://github.com/potentialdiffer/pi-agent-stuff) repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Test thoroughly:
   ```bash
   cd pi-agent-stuff
   npm install
   pi --extension ./extensions/mistral-agent-tools/src/index.ts
   /mistral-status
   /mistral-image test prompt
   /explore-images
   ```
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Submit a pull request

## License

MIT © Christian Spinnler

## Version History

- **v3.0.0** (Current): Rebranded to Mistral Agent Tools, added websearch functionality with citations
- **v2.1.0**: Added image explorer with preview, improved documentation
- **v2.0.0**: Complete refactor to modular architecture, improved error handling, better TypeScript types
- **v1.0.0**: Initial release with basic image generation

## Acknowledgments

- [Pi Coding Agent](https://github.com/earendil-works/pi-coding-agent) - The extensible coding agent framework
- [Mistral AI](https://mistral.ai/) - For providing the image generation and websearch APIs
- [@earendil-works/pi-tui](https://github.com/earendil-works/pi-tui) - Terminal UI components for pi

## Related Documentation

- [API Documentation](api-documetation.md) - Mistral Beta API usage details
- [Implementation Notes](IMPLEMENTATION_NOTES.md) - Technical design decisions
- [Changes from v1 to v2](CHANGES.md) - Migration guide and improvements
- [Fixes Applied](FIXES.md) - Bug fixes and their solutions
