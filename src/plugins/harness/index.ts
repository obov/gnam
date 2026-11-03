/**
 * harness: 다른 에이전트 세션 (Claude Code · Codex CLI) 을 띄우고 지시 · 대기 · 보고 읽기 · 종료하는 스킬 harness-execute.
 * 역할 · 절차는 쓰는 쪽 (multi-agent · multirun) 몫.
 */
import { definePlugin } from "../../core/plugin.ts"

export default definePlugin({
  id: "harness",
  version: "0.1.0",
  skills: ["skills/harness-execute"],
  agentsMd: "agents.md",
})
