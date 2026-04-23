import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.notify("Custom Toolkit Loaded", "info");
  });

  pi.registerCommand("toolkit", {
    description: "Show toolkit status",
    handler: async (_args, ctx) => {
      ctx.ui.notify("All systems go!", "success");
    },
  });
}
