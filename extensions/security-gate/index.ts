import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Storage key for remembered decisions
const STORAGE_KEY = "security-gate-decisions";

interface RememberedDecision {
  pattern: string;
  allowed: boolean;
  timestamp: number;
  type: "command" | "path" | "file";
}

// Protected system paths - write operations blocked, read operations allowed
const SYSTEM_PATHS = [
  "/etc/",
  "/usr/",
  "/bin/",
  "/sbin/",
  "/lib/",
  "/lib64/",
  "/boot/",
  "/proc/",
  "/sys/",
  "/dev/",
];

// Commands that are safe for read-only operations with wildcards
const READ_ONLY_COMMANDS = [
  "ls",
  "cat",
  "less",
  "more",
  "head",
  "tail",
  "grep",
  "rg",
  "find",
  "locate",
  "which",
  "whereis",
  "type",
  "stat",
  "file",
  "wc",
  "du",
  "df",
  "ps",
  "top",
  "htop",
  "netstat",
  "ss",
  "dig",
  "nslookup",
  "ping",
  "curl",
  "wget",
];

// Commands that modify files/directories - require explicit confirmation with wildcards
const WRITE_COMMANDS = [
  "rm",
  "mv",
  "cp",
  "chmod",
  "chown",
  "chgrp",
  "mkdir",
  "rmdir",
  "touch",
  "sed",
  "awk",
  "perl",
  "python",
  "node",
  "dd",
];

const CRITICAL_PATTERNS = [
  /^rm\s+(-[rf]+\s+)?(\/\w+|\*|\.\.)/, // rm on root, wildcard, or parent
  /^rm\s+-rf\s+\/\w/, // rm -rf on absolute path
  /^chmod\s+-R/, // recursive chmod
  /^chown\s+-R/, // recursive chown
  /^dd\s+/, // dd command
  /^mkfs/, // filesystem creation
  /^:()\s*\{.*\}\s*;/, // fork bomb pattern
  />\s*\/dev\/.*\/sd[a-z]/, // overwrite disk
  /apt\s+(remove|purge)\s+/, // apt remove
  /dnf\s+remove\s+/, // dnf remove
  /pacman\s+-R\s+/, // pacman remove
  /brew\s+uninstall\s+/, // brew uninstall
  /yum\s+remove\s+/, // yum remove
  /zypper\s+remove\s+/, // zypper remove
  /DROP\s+(DATABASE|TABLE)/i, // SQL drops
  /TRUNCATE\s+TABLE/i, // SQL truncate
  /kill\s+-9\s+\d+/, // kill -9
  /systemctl\s+(stop|disable)\s+/, // stop system services
];

// Helper functions for remembered decisions
function loadDecisions(ctx: any): RememberedDecision[] {
  const entries = ctx.sessionManager.getEntries();
  for (const entry of entries) {
    if (entry.type === "custom" && entry.customType === STORAGE_KEY) {
      return (entry.data as RememberedDecision[]) || [];
    }
  }
  return [];
}

function saveDecisions(decisions: RememberedDecision[], ctx: any) {
  pi.appendEntry(STORAGE_KEY, decisions);
}

function checkRememberedDecision(
  commandOrPath: string,
  decisions: RememberedDecision[],
  type: "command" | "path" | "file"
): boolean | null {
  for (const decision of decisions) {
    if (decision.type !== type) continue;
    try {
      // Handle both regex patterns and literal strings
      let pattern: RegExp;
      if (decision.pattern.startsWith("/") && decision.pattern.endsWith("/")) {
        // It's a regex pattern (stored with slashes)
        pattern = new RegExp(decision.pattern.slice(1, -1));
      } else {
        // Treat as literal string - escape special regex chars
        const escaped = decision.pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        pattern = new RegExp(escaped);
      }
      if (pattern.test(commandOrPath)) {
        return decision.allowed;
      }
    } catch (e) {
      console.warn(`Invalid pattern in security gate: ${decision.pattern}`, e);
    }
  }
  return null;
}

// Helper to create a regex pattern string from a command
function createPatternFromCommand(cmd: string): string {
  // Escape special regex characters but keep wildcards
  return cmd.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
           .replace(/\\\*/g, ".*")
           .replace(/\\\?/g, ".");
}

export default function (pi: ExtensionAPI) {
  // Load decisions at startup
  let cachedDecisions: RememberedDecision[] = [];

  // Reload decisions from session
  function reloadDecisions(ctx: any) {
    cachedDecisions = loadDecisions(ctx);
  }

  // Check if a command/path has a remembered decision
  async function checkAndPrompt(
    item: string,
    type: "command" | "path" | "file",
    message: string,
    ctx: any
  ): Promise<boolean> {
    // Reload decisions to get latest
    reloadDecisions(ctx);
    
    // Check if we have a remembered decision
    const remembered = checkRememberedDecision(item, cachedDecisions, type);
    if (remembered !== null) {
      return remembered; // Return the remembered decision
    }

    // No remembered decision - prompt user with remember options
    if (!ctx.hasUI) {
      return false; // Block in non-interactive mode
    }

    const choices = [
      { label: "Allow once", value: "once" },
      { label: "Always allow", value: "always" },
      { label: "Deny once", value: "deny" },
      { label: "Always deny", value: "always-deny" },
    ];

    const choice = await ctx.ui.select(message, choices);
    
    if (!choice) {
      return false; // Cancelled
    }

    switch (choice.value) {
      case "deny":
      case "always-deny":
        if (choice.value === "always-deny") {
          cachedDecisions.push({
            pattern: item,
            allowed: false,
            timestamp: Date.now(),
            type,
          });
          saveDecisions(cachedDecisions, ctx);
        }
        return false;

      case "once":
        return true;

      case "always":
        cachedDecisions.push({
          pattern: item,
          allowed: true,
          timestamp: Date.now(),
          type,
        });
        saveDecisions(cachedDecisions, ctx);
        return true;
    }

    return false;
  }

  pi.on("tool_call", async (event, ctx) => {
    const { toolName, input } = event;

    // Check bash commands
    if (toolName === "bash" && input.command) {
      const cmd = input.command.trim();

      // Allow piping to /dev/null (common noise suppression)
      if (cmd.includes("2>/dev/null") || cmd.includes(">/dev/null") || cmd.includes(" | /dev/null")) {
        return; // Allow commands that suppress output
      }

      // Check critical patterns
      for (const pattern of CRITICAL_PATTERNS) {
        if (pattern.test(cmd)) {
          const allowed = await checkAndPrompt(
            cmd,
            "command",
            `⚠️  This command matches a dangerous pattern:\n\n  \`${cmd}\`\n\nThis could: destroy data, remove system packages, or break your system.\n\nWhat would you like to do?`,
            ctx
          );
          if (!allowed) {
            return { block: true, reason: "Blocked by security gate: dangerous command pattern" };
          }
          return;
        }
      }

      // Check system paths - only block write operations
      for (const sysPath of SYSTEM_PATHS) {
        if (cmd.includes(sysPath)) {
          const baseCmd = cmd.split(/\s+/)[0];
          
          // Allow read-only commands on system paths
          if (READ_ONLY_COMMANDS.includes(baseCmd)) {
            return; // Allow read operations
          }
          
          // Block or confirm write operations on system paths
          if (WRITE_COMMANDS.includes(baseCmd)) {
            const allowed = await checkAndPrompt(
              cmd,
              "command",
              `⚠️  Write command on protected system path:\n\n  \`${cmd}\`\n\nAffected path: ${sysPath}\n\nWhat would you like to do?`,
              ctx
            );
            if (!allowed) {
              return { block: true, reason: `Blocked by security gate: write to protected path ${sysPath}` };
            }
            return;
          }
          
          // For other commands, ask for confirmation
          const allowed = await checkAndPrompt(
            cmd,
            "command",
            `⚠️  This command accesses a protected system path:\n\n  \`${cmd}\`\n\nAffected path: ${sysPath}\n\nWhat would you like to do?`,
            ctx
          );
          if (!allowed) {
            return { block: true, reason: `Blocked by security gate: protected path ${sysPath}` };
          }
          return;
        }
      }

      // Check for wildcard usage with write commands
      const baseCmd = cmd.split(/\s+/)[0];
      const hasWildcard = cmd.includes("*") || cmd.includes("?");
      const hasRecursiveFlag = cmd.includes(" -r ") || cmd.includes(" -R ") || cmd.includes(" -rf ") || cmd.includes(" -fr ");
      
      if (hasWildcard || hasRecursiveFlag) {
        // Allow read-only commands with wildcards (safe)
        if (READ_ONLY_COMMANDS.includes(baseCmd)) {
          return; // Allow read-only commands with wildcards
        }
        
        // Block or confirm write commands with wildcards
        if (WRITE_COMMANDS.includes(baseCmd)) {
          const allowed = await checkAndPrompt(
            cmd,
            "command",
            `⚠️  This command uses wildcards or recursive flags:\n\n  \`${cmd}\`\n\nThis may affect many files. What would you like to do?`,
            ctx
          );
          if (!allowed) {
            return { block: true, reason: "Blocked by security gate: wildcard/recursive write operation" };
          }
          return;
        }
      }

      // Check file deletion via bash - confirm all rm commands
      if (/^rm\s+/.test(cmd)) {
        // Allow rm in /tmp/ without confirmation
        if (cmd.includes("/tmp/") || cmd.includes(" /tmp")) {
          return;
        }
        const allowed = await checkAndPrompt(
          cmd,
          "command",
          `⚠️  File deletion detected:\n\n  \`${cmd}\`\n\nThis will permanently remove files.\n\nWhat would you like to do?`,
          ctx
        );
        if (!allowed) {
          return { block: true, reason: "Blocked by security gate: file deletion" };
        }
      }
    }

    // Check write operations
    if (toolName === "write" && input.path) {
      const path = input.path as string;

      // Check system paths - always block writes
      for (const sysPath of SYSTEM_PATHS) {
        if (path.startsWith(sysPath)) {
          const allowed = await checkAndPrompt(
            path,
            "path",
            `⚠️  Attempting to write to protected system path:\n\n  \`${path}\`\n\nThis could overwrite critical system files.\n\nWhat would you like to do?`,
            ctx
          );
          if (!allowed) {
            return { block: true, reason: `Blocked by security gate: protected path ${sysPath}` };
          }
          return;
        }
      }

      // Check critical config files
      const criticalFiles = [".env", ".env.local", "config.json", "settings.json"];
      if (criticalFiles.some((f) => path.endsWith(f))) {
        const allowed = await checkAndPrompt(
          path,
          "file",
          `⚠️  Overwriting potentially critical config file:\n\n  \`${path}\`\n\nWhat would you like to do?`,
          ctx
        );
        if (!allowed) {
          return { block: true, reason: "Blocked by security gate: critical config file" };
        }
      }
    }

    // Check read operations - allow reads from system paths
    if (toolName === "read" && input.path) {
      const path = input.path as string;
      // Read operations to system paths are allowed (no block)
      // This enables safe inspection of system files
    }

    // Check edit operations on system files - always block
    if (toolName === "edit" && input.path) {
      const path = input.path as string;
      for (const sysPath of SYSTEM_PATHS) {
        if (path.startsWith(sysPath)) {
          const allowed = await checkAndPrompt(
            path,
            "path",
            `⚠️  Attempting to edit protected system file:\n\n  \`${path}\`\n\nWhat would you like to do?`,
            ctx
          );
          if (!allowed) {
            return { block: true, reason: `Blocked by security gate: protected path ${sysPath}` };
          }
          return;
        }
      }
    }
  });

  // Register command to manage remembered decisions
  pi.registerCommand("security-gate", {
    description: "Manage remembered security gate decisions",
    getArgumentCompletions: (prefix: string) => {
      const completions = ["list", "add", "remove", "clear", "export", "import"];
      return completions
        .filter(c => c.startsWith(prefix))
        .map(c => ({ value: c, label: c }));
    },
    handler: async (args, ctx) => {
      if (!args) {
        ctx.ui.notify("Usage: /security-gate <list|add|remove|clear|export|import> [options]", "error");
        return;
      }

      reloadDecisions(ctx);
      const parts = args.trim().split(/\s+/);
      const command = parts[0].toLowerCase();

      switch (command) {
        case "list":
          if (cachedDecisions.length === 0) {
            ctx.ui.notify("No remembered decisions.", "info");
            return;
          }
          ctx.ui.notify("Remembered decisions:", "info");
          for (let i = 0; i < cachedDecisions.length; i++) {
            const decision = cachedDecisions[i];
            const action = decision.allowed ? "ALLOW" : "DENY";
            const typeLabel = decision.type.toUpperCase();
            ctx.ui.notify(
              `  [${i}] [${action}] [${typeLabel}] ${decision.pattern} (${new Date(decision.timestamp).toLocaleDateString()})`,
              "info"
            );
          }
          break;

        case "add":
          if (parts.length < 3) {
            ctx.ui.notify("Usage: /security-gate add <allow|deny> <pattern> [type]", "error");
            return;
          }
          const action = parts[1].toLowerCase();
          const pattern = parts.slice(2).join(" ");
          let type: "command" | "path" | "file" = "command";
          
          if (parts.length >= 4) {
            const typeArg = parts[3].toLowerCase();
            if (["command", "path", "file"].includes(typeArg)) {
              type = typeArg as "command" | "path" | "file";
            }
          }
          
          if (action !== "allow" && action !== "deny") {
            ctx.ui.notify("Action must be 'allow' or 'deny'", "error");
            return;
          }
          
          cachedDecisions.push({
            pattern,
            allowed: action === "allow",
            timestamp: Date.now(),
            type,
          });
          saveDecisions(cachedDecisions, ctx);
          ctx.ui.notify(`Added: [${action.toUpperCase()}] [${type.toUpperCase()}] ${pattern}`, "info");
          break;

        case "remove":
          if (parts.length < 2) {
            ctx.ui.notify("Usage: /security-gate remove <index>", "error");
            return;
          }
          const index = parseInt(parts[1]);
          if (isNaN(index) || index < 0 || index >= cachedDecisions.length) {
            ctx.ui.notify(`Invalid index. Use /security-gate list to see decisions.`, "error");
            return;
          }
          cachedDecisions.splice(index, 1);
          saveDecisions(cachedDecisions, ctx);
          ctx.ui.notify(`Removed decision at index ${index}`, "info");
          break;

        case "clear":
          cachedDecisions = [];
          saveDecisions(cachedDecisions, ctx);
          ctx.ui.notify("All remembered decisions cleared.", "info");
          break;

        case "export":
          if (cachedDecisions.length === 0) {
            ctx.ui.notify("No decisions to export.", "info");
            return;
          }
          const exportData = JSON.stringify(cachedDecisions, null, 2);
          ctx.ui.notify("Export the following and save to a file:", "info");
          ctx.ui.notify(exportData, "info");
          break;

        case "import":
          if (parts.length < 2) {
            ctx.ui.notify("Usage: /security-gate import <json-data>", "error");
            return;
          }
          try {
            const jsonData = parts.slice(1).join(" ");
            const imported = JSON.parse(jsonData) as RememberedDecision[];
            if (!Array.isArray(imported)) {
              throw new Error("Invalid format");
            }
            cachedDecisions = [...cachedDecisions, ...imported];
            saveDecisions(cachedDecisions, ctx);
            ctx.ui.notify(`Imported ${imported.length} decisions.`, "info");
          } catch (e) {
            ctx.ui.notify(`Failed to import: ${e.message}`, "error");
          }
          break;

        default:
          ctx.ui.notify(`Unknown command: ${command}`, "error");
      }
    },
  });

  // Reload decisions on session start
  pi.on("session_start", async (_event, ctx) => {
    reloadDecisions(ctx);
    ctx.ui.setStatus("security-gate", "Security gate active");
  });

  // Reload decisions on session reload
  pi.on("resources_discover", async (_event, ctx) => {
    reloadDecisions(ctx);
  });
}
