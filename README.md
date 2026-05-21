# Pi Agent Stuff

Custom extensions, skills, and prompts for the [Pi Coding Agent](https://github.com/mariozechner/pi-coding-agent). Focused on research and engineering workflows.

## Contents

### Extensions (`extensions/`)
- **pdf-reader/** - PDF processing with poppler
  - `pdf_extract_text` - Extract text with layout preservation
  - `pdf_get_info` - Get PDF metadata (title, author, pages)
  - `pdf_extract_pages` - Extract specific page ranges
  - Requires: poppler-utils (pdftotext, pdfinfo)
- **pi-status/** - Git status in footer
  - Shows branch, clean status, changes, staged, untracked counts
- **security-gate/** - Security protection
  - Blocks dangerous commands (rm -rf, dd, mkfs, etc.)
  - Protects system paths (/etc, /usr, /bin, etc.)
  - Confirms wildcard and recursive operations
- **pi-zotero/** - Zotero integration
  - Better BibTeX parsing and export
  - Zotero API for citation management
  - Paper search and metadata retrieval
- **pi-rtk-optimizer/** - RTK query optimization configuration
- **mistral-agent-tools/** - Mistral AI tools
  - `mistral_generate_image` - Image generation from text prompts
  - `mistral_websearch` - Websearch with citations
  - `/mistral-setup` - Configure API key
  - `/mistral-image` - Generate images
  - `/mistral-websearch` - Search the web
  - `/explore-images` - Browse generated images
  - Requires: Mistral API key

### Skills (`skills/`)
- **git-info/** - Git repository analysis (see `SKILL.md` for details)
- **review/** - Document and PDF review
  - Structured analysis for academic papers, code docs, general documents
  - Auto-extracts PDF text using pdf-reader tools
  - Provides strengths, weaknesses, questions, suggestions
  - Includes rating system (1-10 scale)

### Prompts (`prompts/`)
- **review.md** - Code review prompt template
  - Checks for performance, security, and readability issues
  - Pedantic review style

## Installation

```bash
git clone https://github.com/potentialdiffer/pi-agent-stuff.git
cd pi-agent-stuff
```

Add to your Pi config to load extensions, skills, and prompts.

## Configuration

For **pi-zotero**, create a `config.json` in the extension directory with your Zotero API credentials:
```json
{
  "apiKey": "your-api-key",
  "libraryId": "your-library-id",
  "libraryType": "user",
  "betterBibtex": {
    "enabled": true,
    "port": 23119
  }
}
```

## License

MIT
