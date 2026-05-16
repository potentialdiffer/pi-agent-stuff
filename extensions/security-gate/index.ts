import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

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

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    const { toolName, input } = event;

    // Check bash commands
    if (toolName === "bash" && input.command) {
      const cmd = input.command.trim();

      // Check critical patterns
      for (const pattern of CRITICAL_PATTERNS) {
        if (pattern.test(cmd)) {
          const ok = await ctx.ui.confirm(
            "WARNING",
            `This command matches a dangerous pattern:\n\`${cmd}\`\n\nThis could: destroy data, remove system packages, or break your system.\n\nProceed?`,
          );
          if (!ok) {
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
            const ok = await ctx.ui.confirm(
              "WARNING",
              `Write command on protected system path:\n\`${cmd}\`\n\nAffected path: ${sysPath}\n\nProceed?`,
            );
            if (!ok) {
              return { block: true, reason: `Blocked by security gate: write to protected path ${sysPath}` };
            }
            return;
          }
          
          // For other commands, ask for confirmation
          const ok = await ctx.ui.confirm(
            "WARNING",
            `This command accesses a protected system path:\n\`${cmd}\`\n\nAffected path: ${sysPath}\n\nProceed?`,
          );
          if (!ok) {
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
          const ok = await ctx.ui.confirm(
            "WARNING",
            `This command uses wildcards or recursive flags:\n\`${cmd}\`\n\nThis may affect many files. Proceed?`,
          );
          if (!ok) {
            return { block: true, reason: "Blocked by security gate: wildcard/recursive write operation" };
          }
          return;
        }
      }
    }

    // Check write operations
    if (toolName === "write" && input.path) {
      const path = input.path as string;

      // Check system paths - always block writes
      for (const sysPath of SYSTEM_PATHS) {
        if (path.startsWith(sysPath)) {
          const ok = await ctx.ui.confirm(
            "WARNING",
            `Attempting to write to protected system path:\n\`${path}\`\n\nThis could overwrite critical system files.\n\nProceed?`,
          );
          if (!ok) {
            return { block: true, reason: `Blocked by security gate: protected path ${sysPath}` };
          }
          return;
        }
      }

      // Check critical config files
      const criticalFiles = [".env", ".env.local", "config.json", "settings.json"];
      if (criticalFiles.some((f) => path.endsWith(f))) {
        const ok = await ctx.ui.confirm(
          "WARNING",
          `Overwriting potentially critical config file:\n\`${path}\`\n\nProceed?`,
        );
        if (!ok) {
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
          const ok = await ctx.ui.confirm(
            "WARNING",
            `Attempting to edit protected system file:\n\`${path}\`\n\nProceed?`,
          );
          if (!ok) {
            return { block: true, reason: `Blocked by security gate: protected path ${sysPath}` };
          }
          return;
        }
      }
    }

    // Check file deletion via bash - confirm all rm commands
    if (toolName === "bash" && input.command) {
      const cmd = input.command.trim();
      if (/^rm\s+/.test(cmd)) {
        // Allow rm in /tmp/ without confirmation
        if (cmd.includes("/tmp/") || cmd.includes(" /tmp")) {
          return;
        }
        const ok = await ctx.ui.confirm(
          "WARNING",
          `File deletion detected:\n\`${cmd}\`\n\nThis will permanently remove files.\n\nProceed?`,
        );
        if (!ok) {
          return { block: true, reason: "Blocked by security gate: file deletion" };
        }
      }
    }
  });

  // Add status indicator
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.setStatus("security-gate", "Security gate active");
  });
}
