# Pi Agent Stuff

Custom extensions, skills, themes, and prompts for the [Pi Coding Agent](https://github.com/mariozechner/pi-coding-agent).

## Contents

### Extensions (`extensions/`)
- **index.ts** - Custom toolkit extension
  - Shows notification on session start
  - Registers `toolkit` command for status check

### Skills (`skills/`)
- **git-info/** - Git information skill (see `SKILL.md` for details)

### Themes (`themes/`)
- **caveman-dark.json** - Dark theme with orange accent
  - Background: `#1a1a1a`
  - Foreground: `#cccccc`
  - Accent: `#ffaa00`

### Prompts (`prompts/`)
- **review.md** - Code review prompt template
  - Checks for performance, security, and readability issues
  - Pedantic review style

## Installation

```bash
git clone https://github.com/potentialdiffer/pi-agent-stuff.git
cd pi-agent-stuff
```

Add to your Pi config to load extensions, skills, and themes.

## License

MIT
