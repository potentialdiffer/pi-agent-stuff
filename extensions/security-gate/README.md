# Security Gate Extension

A security extension for pi that blocks dangerous commands and protects system paths, with the ability to **remember your decisions**.

## Features

### Core Security Checks
- Blocks dangerous command patterns (rm -rf, dd, mkfs, fork bombs, etc.)
- Protects system paths (/etc, /usr, /bin, /sbin, etc.)
- Blocks write operations on protected paths
- Confirms wildcard and recursive operations
- Protects critical config files (.env, config.json, etc.)

### Remember Decisions
The extension now remembers your allow/deny choices for specific commands, paths, or files. When you encounter a security prompt, you have four options:

1. **Allow once** - Allows just this instance
2. **Always allow** - Remembers to allow this pattern
3. **Deny once** - Blocks just this instance  
4. **Always deny** - Remembers to block this pattern

Remembered decisions persist across session restarts.

## Usage

### Managing Remembered Decisions

Use the `/security-gate` command to manage your remembered decisions:

| Command | Description |
|---------|-------------|
| `/security-gate list` | List all remembered decisions with indices |
| `/security-gate add <allow\|deny> <pattern> [type]` | Add a new remembered decision |
| `/security-gate remove <index>` | Remove a remembered decision by index |
| `/security-gate clear` | Remove all remembered decisions |
| `/security-gate export` | Export decisions as JSON |
| `/security-gate import <json>` | Import decisions from JSON |

### Examples

```
# List all remembered decisions
/security-gate list

# Always allow a specific command
/security-gate add allow "docker system prune" command

# Always deny writes to a specific path
/security-gate add deny "/etc/nginx" path

# Remove decision #2 from the list
/security-gate remove 2

# Clear all remembered decisions
/security-gate clear

# Export decisions (copy the JSON output)
/security-gate export

# Import decisions
/security-gate import [{"pattern":"docker system prune","allowed":true,"type":"command","timestamp":1234567890}]
```

### Decision Types

Each remembered decision has a type that determines what it matches against:

- **command** - Matches against bash commands
- **path** - Matches against file paths (for write/edit operations)
- **file** - Matches against specific filenames

When adding a decision manually, you can specify the type:
```
/security-gate add allow "rm -rf /tmp/*" command
/security-gate add deny "/etc/" path
```

If no type is specified, it defaults to "command".

## Customization

### Adding Custom Patterns

To add custom dangerous patterns, edit the `CRITICAL_PATTERNS` array in `index.ts`:

```typescript
const CRITICAL_PATTERNS = [
  // Existing patterns...
  /my-custom-pattern/i,
];
```

### Protected Paths

Edit the `SYSTEM_PATHS` array to add or remove protected system paths:

```typescript
const SYSTEM_PATHS = [
  "/etc/",
  "/usr/",
  // Add your custom paths here
  "/custom/protected/path/",
];
```

### Read-Only and Write Commands

The extension categorizes commands as read-only or write operations. You can modify these lists:

- `READ_ONLY_COMMANDS` - Commands that are safe with wildcards
- `WRITE_COMMANDS` - Commands that modify files and require confirmation

## How It Works

### Decision Storage

Remembered decisions are stored in the pi session using `pi.appendEntry()`. This means:

- Decisions persist across pi restarts
- Decisions are specific to each session
- Decisions are stored as custom entries in the session file

### Pattern Matching

When checking if a command or path matches a remembered decision:

1. The extension checks decisions of the same type (command, path, or file)
2. Patterns starting and ending with `/` are treated as regex patterns
3. Other patterns are treated as literal strings (with regex special characters escaped)
4. The first matching decision determines the outcome

### Example Matching

```typescript
// This will match any command containing "docker system prune"
{ pattern: "docker system prune", allowed: true, type: "command" }

// This will match using regex
{ pattern: "/^rm .*\\.log$/", allowed: false, type: "command" }

// This will match any path starting with /etc/
{ pattern: "/etc/", allowed: false, type: "path" }
```

## Security Notes

- In non-interactive mode (e.g., when using `-p` flag), all dangerous commands are **blocked by default**
- Remembered decisions only apply within the same session
- The extension cannot override system-level permissions
- Always review commands carefully before allowing them

## License

This extension is part of the pi-agent-stuff repository.
