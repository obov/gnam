### multirun (같은 plan 변형 실행 · 비교)

```text
흐름      gnam run multirun start <plan> -n N → Gnam: multirun.<topic>.start → 변형 세션 (clone 마다) → sync → 요약 → Gnam: multirun.<topic>.report → 사용자 결정 (Multirun: 필드) → close
스킬      .agents/skills/gnam-multirun (조정자 절차 · roles/variant.md · roles/summarizer.md). 세션 실행 harness-execute
보존      tag multirun/<run-id>/vN/… 는 지우지 않는다. close 는 보존 확인 통과 clone 만 지운다
상태      npx gnam run multirun status [<run-id>]
```
