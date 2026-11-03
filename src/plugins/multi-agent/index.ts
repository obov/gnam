/**
 * multi-agent: 에이전트 병렬 구현 · 검토 · 통합 · 위임 · 실험 workflow.
 * 스킬 2개 (multi-agent · agent-routing) 를 링크한다. 세션 실행은 harness, 배정 · 실측 기록은 run, 통합 커밋은 merge plugin.
 */
import { definePlugin } from "../../core/plugin.ts"
import { agentsFrom, atcherStatus, runsData, runsDir, runsSummary, show } from "./status.ts"

export default definePlugin({
  id: "multi-agent",
  version: "0.1.0",
  requires: ["run", "merge", "harness"],
  commands: {
    status: {
      describe: "[<run-id>]  위임 상태 트리 (<git common dir>/gnam/runs)",
      run(args, cwd) {
        console.log(show(runsDir(cwd), args[0], Date.now(), agentsFrom(atcherStatus())))
        return 0
      },
    },
  },
  status: {
    sections: {
      runs: { describe: "위임 상태 트리 (<git common dir>/gnam/runs, multi-agent status 와 같은 데이터)", collect: (ctx) => runsData(runsDir(ctx.cwd)) },
    },
    summary: (ctx) => runsSummary(runsDir(ctx.cwd)),
  },
  skills: ["skills/multi-agent", "skills/agent-routing"],
  agentsMd: "agents.md",
})
