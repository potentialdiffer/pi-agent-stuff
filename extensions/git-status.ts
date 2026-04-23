/**
 * Git Status Extension
 *
 * Displays git branch and working tree status in footer.
 * Shows uncommitted changes, staged files, and ahead/behind remote.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

export default function (pi: ExtensionAPI) {
  let enabled = false;

  pi.registerCommand("git-status", {
    description: "Toggle git status in footer",
    handler: async (_args, ctx) => {
      enabled = !enabled;

      if (enabled) {
        ctx.ui.setFooter((tui, theme, footerData) => {
          const unsub = footerData.onBranchChange(() => tui.requestRender());

          return {
            dispose: unsub,
            invalidate() {},
            render(width: number): string[] {
              const branch = footerData.getGitBranch();
              if (!branch) {
                return [""];
              }

              // Build status indicators
              const parts: string[] = [];

              // Branch name
              parts.push(theme.fg("accent", ` ${branch}`));

              // Git status summary
              const statusParts: string[] = [];

              // Check for staged/modified/deleted files
              const [stagedCount, unstagedCount, untrackedCount, { ahead, behind }] = await Promise.all([
                getStagedCount(),
                getUnstagedCount(),
                getUntrackedCount(),
                getAheadBehind(),
              ]);

              if (stagedCount > 0) {
                statusParts.push(theme.fg("success", `+${stagedCount}`));
              }
              if (unstagedCount > 0) {
                statusParts.push(theme.fg("warning", `~${unstagedCount}`));
              }
              if (untrackedCount > 0) {
                statusParts.push(theme.fg("dim", `?${untrackedCount}`));
              }
              if (ahead > 0) {
                statusParts.push(theme.fg("accent", `↑${ahead}`));
              }
              if (behind > 0) {
                statusParts.push(theme.fg("warning", `↓${behind}`));
              }

              if (statusParts.length > 0) {
                parts.push(statusParts.join(" "));
              } else {
                parts.push(theme.fg("dim", "clean"));
              }

              const left = parts.join("  ");
              const right = theme.fg("dim", `${ctx.model?.id || "no-model"}`);

              const pad = " ".repeat(Math.max(1, width - visibleWidth(left) - visibleWidth(right)));
              return [truncateToWidth(left + pad + right, width)];
            },
          };

          async function getStagedCount(): Promise<number> {
            try {
              const result = await pi.exec("git", ["diff", "--cached", "--name-only"]);
              return result.stdout ? result.stdout.trim().split("\n").filter(Boolean).length : 0;
            } catch {
              return 0;
            }
          }

          async function getUnstagedCount(): Promise<number> {
            try {
              const result = await pi.exec("git", ["diff", "--name-only"]);
              return result.stdout ? result.stdout.trim().split("\n").filter(Boolean).length : 0;
            } catch {
              return 0;
            }
          }

          async function getUntrackedCount(): Promise<number> {
            try {
              const result = await pi.exec("git", ["ls-files", "--others", "--exclude-standard"]);
              return result.stdout ? result.stdout.trim().split("\n").filter(Boolean).length : 0;
            } catch {
              return 0;
            }
          }

          async function getAheadBehind(): Promise<{ ahead: number; behind: number }> {
            try {
              const result = await pi.exec("git", ["rev-list", "--left-right", "--count", `HEAD...@{upstream}`]);
              const [ahead, behind] = result.stdout?.trim().split(/\s+/).map(Number) || [0, 0];
              return { ahead, behind };
            } catch {
              return { ahead: 0, behind: 0 };
            }
          }
        });
        ctx.ui.notify("Git status footer enabled", "info");
      } else {
        ctx.ui.setFooter(undefined);
        ctx.ui.notify("Git status footer disabled", "info");
      }
    },
  });

  // Refresh footer when branch changes
  pi.on("resources_discover", async (_event, ctx) => {
    // Force footer re-render on reload
    if (enabled) {
      ctx.ui.setFooter(undefined);
      setTimeout(() => {
        if (enabled) {
          ctx.ui.setFooter((tui, theme, footerData) => {
            const unsub = footerData.onBranchChange(() => tui.requestRender());
            return {
              dispose: unsub,
              invalidate() {},
              render(width: number): string[] {
                const branch = footerData.getGitBranch();
                if (!branch) return [""];
                const left = theme.fg("accent", ` ${branch}`);
                const right = theme.fg("dim", `${ctx.model?.id || "no-model"}`);
                const pad = " ".repeat(Math.max(1, width - visibleWidth(left) - visibleWidth(right)));
                return [truncateToWidth(left + pad + right, width)];
              },
            };
          });
        }
      }, 100);
    }
  });
}
