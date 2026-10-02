/**
 * multi-agent: 에이전트 병렬 구현 · 검토 · 통합 · 위임 · 실험 workflow.
 * 스킬 3개 (multi-agent · harness-execute · agent-routing) 를 링크한다. 배정 · 실측 기록은 run, 통합 커밋은 merge plugin.
 */
import { definePlugin } from "../../core/plugin.ts"
import { agentsFrom, atcherStatus, runsDir, show } from "./status.ts"

export default definePlugin({
  id: "multi-agent",
  version: "0.1.0",
  requires: ["run", "merge"],
  commands: {
    status: {
      describe: "[<run-id>]  위임 상태 트리 (<git common dir>/gnam/runs)",
      run(args, cwd) {
        console.log(show(runsDir(cwd), args[0], Date.now(), agentsFrom(atcherStatus())))
        return 0
      },
    },
  },
  skills: ["skills/multi-agent", "skills/harness-execute", "skills/agent-routing"],
  agentsMd: "agents.md",
})
