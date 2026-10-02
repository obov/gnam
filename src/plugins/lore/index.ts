import { definePlugin } from "../../core/plugin.ts"
import { loreViolations } from "./lore.ts"

export default definePlugin({
  id: "lore",
  version: "0.1.0",
  verify: (cwd, files) => loreViolations(cwd, files),
  skills: ["skills/gnam-lore"],
  agentsMd: "agents.md",
  scaffold: { "lore/README.md": "files/README.md" },
})
