### multi-agent (병렬 에이전트 작업)

```text
흐름      작업 분류 → agent-routing 배정 → Gnam: run.<topic>.start → harness-execute 실행 → 구현 · 리뷰 · 통합 (Gnam: spec.<topic>.merge) → Gnam: run.<topic>.end
스킬      .agents/skills/multi-agent · agent-routing. 세션 실행 harness-execute 는 harness plugin
상태      npx gnam run multi-agent status [<run-id>]
```
