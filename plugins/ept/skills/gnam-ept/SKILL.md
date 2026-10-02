---
name: gnam-ept
description: 에이전트 workflow 실험 (ept) 의 설계 · 시도 · 판정 기록과 검사. 같은 작업을 여러 workflow 로 시도해 비교하는 실험을 기록할 때 사용한다.
---

# gnam-ept

- 기록 형식: [experiments](references/experiments.md)
- 검사: `npx gnam run ept check experiments/agent-workflows/<id>/record.json` · `npx gnam verify` (전체)
- 일반 작업 run 의 fit/under/over 판정으로 변환하지 않는다
