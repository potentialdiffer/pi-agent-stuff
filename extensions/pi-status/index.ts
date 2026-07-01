/**
 * pi-status Extension
 * 
 * Displays status information of current directory, starting with git information.
 * Shows branch, status, and other git details in the footer.
 * For Mistral models, shows Vibe monthly usage percentage instead of costs.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import fetch from "node-fetch";
import { readFileSync } from "fs";
import { join } from "path";

interface MistralVibeUsageResponse {
	data?: Array<{
		date: string;
		workspace_id: string;
		sessions: number;
		active_users: number;
		consumed_tokens: {
			input: number;
			output: number;
			cached: number;
			total: number;
		};
		tool_calls: number;
		avg_session_duration: number;
	}>;
	total?: {
		consumed_tokens: {
			input: number;
			output: number;
			cached: number;
			total: number;
		};
	};
}

interface MistralUsageResponse {
	data?: {
		used_tokens?: number;
		total_tokens?: number;
		used_amount?: number;
		total_amount?: number;
	};
}

interface Config {
	mistralApiKey?: string;
}

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
	let mistralUsage: number | null = null;
	let lastUsageFetch = 0;
	let config: Config = {};

	// Load config
	function loadConfig(): Config {
		try {
			const configPath = join(__dirname, "config.json");
			const configContent = readFileSync(configPath, "utf-8");
			return JSON.parse(configContent);
		} catch {
			return {};
		}
	}

	// Fetch Mistral Vibe usage percentage from Admin API
	async function fetchMistralVibeUsage(): Promise<number | null> {
		if (!config.mistralApiKey) return null;

		try {
			// Get current month timestamps
			const now = new Date();
			const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
			const startTime = Math.floor(startOfMonth.getTime() / 1000);
			const endTime = Math.floor(now.getTime() / 1000);

			const response = await fetch(
				`https://console.mistral.ai/api/admin/analytics/vibe/usage/by_workspace?start_time=${startTime}&end_time=${endTime}`,
				{
					method: "GET",
					headers: {
						"x-api-key": config.mistralApiKey,
						"Content-Type": "application/json"
					}
				}
			);

			if (!response.ok) {
				console.error("Failed to fetch Mistral Vibe usage:", response.status, response.statusText);
				return null;
			}

			const data: MistralVibeUsageResponse = await response.json();
			
			// Calculate total consumed tokens from all workspaces
			let totalConsumed = 0;
			let totalLimit = 0;

			if (data.data) {
				for (const entry of data.data) {
					totalConsumed += entry.consumed_tokens?.total || 0;
				}
			}

			// If we have total consumed tokens in the response
			if (data.total?.consumed_tokens?.total) {
				totalConsumed = data.total.consumed_tokens.total;
			}

			// For Vibe, we need to know the limit. Default Vibe limit is 1M tokens/month
			// This might need to be configured or fetched from another endpoint
			const vibeLimit = 1000000; // Default Vibe limit: 1M tokens
			
			if (totalConsumed > 0) {
				const percentage = (totalConsumed / vibeLimit) * 100;
				return Math.round(percentage * 100) / 100; // Round to 2 decimal places
			}
			
			return 0;
		} catch (error) {
			console.error("Error fetching Mistral Vibe usage:", error);
			return null;
		}
	}

	// Fetch Mistral usage percentage from Vibe API
	async function fetchMistralUsage(): Promise<number | null> {
		return fetchMistralVibeUsage();
	}

	// Get cached or fresh Mistral usage
	async function getMistralUsage(): Promise<number | null> {
		const now = Date.now();
		// Cache for 5 minutes (300000 ms)
		if (mistralUsage !== null && now - lastUsageFetch < 300000) {
			return mistralUsage;
		}
		
		const usage = await fetchMistralUsage();
		if (usage !== null) {
			mistralUsage = usage;
			lastUsageFetch = now;
		}
		return usage;
	}

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
		updateTimeout = setTimeout(() => {
			updateGitInfo(currentCwd);
			// Also update Mistral usage periodically if Mistral model is active
			if (config.mistralApiKey) {
				getMistralUsage().catch(() => {});
			}
		}, 5000);
	}

	pi.on("session_start", async (_event, ctx) => {
		config = loadConfig();
		currentCwd = ctx.cwd;
		await updateGitInfo(ctx.cwd);
		scheduleUpdate();
		
		// Pre-fetch Mistral usage if Mistral model is active
		if (ctx.model?.provider === "mistral" && config.mistralApiKey) {
			getMistralUsage().catch(() => {});
		}

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
					
					// Check if using Mistral model and show Vibe usage percentage
					const isMistralModel = ctx.model?.provider === "mistral";
					if (isMistralModel && config.mistralApiKey) {
						// Use cached usage value (updated in session_start and periodically)
						// We can't await here as render must be synchronous
						if (mistralUsage !== null) {
							parts.push(`${tokenStats} ${mistralUsage}%`);
						} else {
							// Fallback to cost display if usage not available
							parts.push(`${tokenStats}${cost > 0 ? ` $${cost.toFixed(3)}` : ''}`);
						}
					} else {
						// Non-Mistral model or no API key: show cost as before
						parts.push(`${tokenStats}${cost > 0 ? ` $${cost.toFixed(3)}` : ''}`);
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
