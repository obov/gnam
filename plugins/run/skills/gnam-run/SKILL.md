---
name: gnam-run
description: run 커밋 (run.<topic>.start · end · policy) 으로 에이전트 배정 · 실측 · 판정을 기록하고 집계한다. 에이전트 작업 배정을 남기거나, model · effort 조합의 실측 성과를 조회할 때 사용한다.
---

# gnam-run

- 형식 · 판정 기준: [run 커밋](references/run.md)
- 측정: `npx gnam run run usage <session-id> …` (Claude Code transcript)
- 집계: `npx gnam run run stats table | adopted | health | lines <merge> … | end <run.start>`
- 실제 값이 없으면 na. 추정치로 채우지 않는다
