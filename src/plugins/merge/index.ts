import { definePlugin } from "../../core/plugin.ts"

/** spec.<topic>.merge: 브랜치 통합. 본문 형식은 강제하지 않는다 (merge.md) */
export default definePlugin({
  id: "merge",
  version: "0.1.0",
  kinds: [{ label: "spec.<topic>.merge: …", subject: /^spec\.[A-Za-z0-9_-]+\.merge: \S/, validate: () => [] }],
  skills: ["skills/gnam-merge"],
  agentsMd: "agents.md",
})
