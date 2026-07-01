/**
 * pi-status Extension
 * 
 * Displays status information of current directory, starting with git information.
 * Shows branch, status, and other git details in the footer.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

export default function (pi: ExtensionAPI) {
	let enabled = true;
	let gitInfo: {
		branch: string;
		clean: boolean;
		changes: number;
		staged: number;
		untracked: number;
	} | null = null;
	let currentCwd = "";
	let updateTimeout: ReturnType<typeof setTimeout> | undefined;

	// Fetch git information
	async function fetchGitInfo(cwd: string): Promise<typeof gitInfo> {
		try {
			const branchResult = await pi.exec("git", ["branch", "--show-current"], { cwd });
			const branch = branchResult.stdout.trim() || "detached";

			const statusResult = await pi.exec("git", ["status", "--short", "--porcelain"], { cwd });
			const status = statusResult.stdout.trim();

			let changes = 0;
			let staged = 0;
			let untracked = 0;

			if (status) {
				const lines = status.split('\n');
				for (const line of lines) {
					if (!line) continue;
					const [x, y] = line.slice(0, 2);
					if (x === '?' && y === '?') {
						untracked++;
					} else if (x !== ' ' && x !== '?') {
						staged++;
					} else if (y !== ' ') {
						changes++;
					}
				}
			}

			return {
				branch,
				clean: status === "",
				changes,
				staged,
				untracked,
			};
		} catch {
			return null;
		}
	}

	async function updateGitInfo(cwd: string) {
		gitInfo = await fetchGitInfo(cwd);
	}

	function scheduleUpdate() {
		if (updateTimeout) clearTimeout(updateTimeout);
		updateTimeout = setTimeout(() => updateGitInfo(currentCwd), 5000);
	}

	pi.on("session_start", async (_event, ctx) => {
		currentCwd = ctx.cwd;
		await updateGitInfo(ctx.cwd);
		scheduleUpdate();

		ctx.ui.setFooter((tui, theme, footerData) => {
			const unsub = footerData.onBranchChange(() => {
				updateGitInfo(ctx.cwd).catch(() => {});
				tui.requestRender();
			});

			return {
				dispose: () => {
					unsub();
					if (updateTimeout) clearTimeout(updateTimeout);
				},
				invalidate() {},
				render(width: number): string[] {
					if (!enabled) return [];

					const parts: string[] = [];

					// Add current working directory at the beginning
					parts.push(theme.fg("dim", currentCwd || ""));

					if (gitInfo) {
						const { branch, clean, changes, staged, untracked } = gitInfo;
						let gitStatus = theme.fg("accent", `🌿 ${branch}`);

						if (!clean) {
							const statusParts: string[] = [];
							if (staged > 0) statusParts.push(theme.fg("success", `+${staged}`));
							if (changes > 0) statusParts.push(theme.fg("warning", `~${changes}`));
							if (untracked > 0) statusParts.push(theme.fg("dim", `?${untracked}`));
							if (statusParts.length > 0) {
								gitStatus += theme.fg("dim", ` (${statusParts.join(" ")})`);
							}
						} else {
							gitStatus += theme.fg("success", " ✓");
						}

						parts.push(gitStatus);
					}

					const extensionStatuses = footerData.getExtensionStatuses();
					for (const [id, text] of extensionStatuses) {
						if (id !== "pi-status") {
							parts.push(text);
						}
					}

					let input = 0, output = 0, cost = 0;
					for (const e of ctx.sessionManager.getBranch()) {
						if (e.type === "message" && e.message.role === "assistant") {
							const m = e.message as any;
							input += m.usage?.input || 0;
							output += m.usage?.output || 0;
							cost += m.usage?.cost?.total || 0;
						}
					}

					const fmt = (n: number) => (n < 1000 ? `${n}` : `${(n / 1000).toFixed(1)}k`);
					const tokenStats = theme.fg("dim", `↑${fmt(input)} ↓${fmt(output)}`);
					if (cost > 0) {
						parts.push(`${tokenStats} $${cost.toFixed(3)}`);
					} else {
						parts.push(tokenStats);
					}

					const modelStr = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "no-model";
					parts.push(theme.fg("dim", modelStr));

					const combined = parts.join(" | ");
					return [truncateToWidth(combined, width)];
				},
			};
		});
	});

	pi.on("session_shutdown", async () => {
		if (updateTimeout) {
			clearTimeout(updateTimeout);
			updateTimeout = undefined;
		}
	});

	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName === "bash" && event.input.command) {
			const cmd = event.input.command as string;
			if (cmd.includes("cd ") || cmd.includes("pushd") || cmd.includes("popd")) {
				currentCwd = ctx.cwd;
				setTimeout(() => updateGitInfo(ctx.cwd), 100);
			}
		}
	});

	pi.registerCommand("pi-status", {
		description: "Toggle pi-status extension",
		handler: async (_args, ctx) => {
			enabled = !enabled;
			ctx.ui.notify(`pi-status ${enabled ? "enabled" : "disabled"}`, "info");
			ctx.ui.setFooter(enabled ? undefined : null);
			if (enabled) {
				setTimeout(() => ctx.ui.setFooter(undefined), 10);
			}
		},
	});

	pi.registerTool({
		name: "get_git_status",
		label: "Get Git Status",
		description: "Get current git repository status information",
		parameters: Type.Object({}),
		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			const info = await fetchGitInfo(ctx.cwd);
			if (!info) {
				return {
					content: [{ type: "text", text: "Not in a git repository or git not available" }],
					details: {},
				};
			}

			return {
				content: [{
					type: "text",
					text: `Git Status:\nBranch: ${info.branch}\nClean: ${info.clean}\nChanges: ${info.changes}\nStaged: ${info.staged}\nUntracked: ${info.untracked}`
				}],
				details: info,
			};
		},
	});
}
