import { definePlugin } from "../../core/plugin.ts"
import { loreViolations } from "./lore.ts"

export default definePlugin({
  id: "lore",
  version: "0.1.0",
  verify: (cwd, files) => loreViolations(cwd, files),
  rules: [
    { id: "lore/location", why: "lore 파일은 lore/<주제>.md, 하위 디렉터리 금지" },
    { id: "lore/entry-fields", why: "항목마다 When · Basis · Evidence" },
    { id: "lore/index", why: "lore/README.md 인덱스와 파일 일치" },
  ],
  skills: ["skills/gnam-lore"],
  agentsMd: "agents.md",
  scaffold: { "lore/README.md": "files/README.md" },
})
