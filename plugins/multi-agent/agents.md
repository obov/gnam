### multi-agent (병렬 에이전트 작업)

```text
흐름      작업 분류 → agent-routing 배정 → run.<topic>.start → harness-execute 실행 → 구현 · 리뷰 · 통합 (spec.<topic>.merge) → run.<topic>.end
스킬      .agents/skills/multi-agent · harness-execute · agent-routing
상태      npx gnam run multi-agent status [<run-id>]
```
