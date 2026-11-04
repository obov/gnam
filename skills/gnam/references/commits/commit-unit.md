---
type: Principle
title: 커밋 단위
description: 결정 하나 또는 상태 전환 하나 = 커밋 하나. squash 금지
tags: [gnam, commit, principle]
generated: { by: claude-code/claude-opus-5-5, at: 2026-09-26T00:00:00Z }
sources:
  - id: gnam
    resource: 5dda4f8:.claude/skills/gnam/references/git-native-agent-memory.md
    title: Git-Native Agent Memory (분할 전 단일 문서) §3
    author: human:mark
---

# 커밋 단위

기준은 코드 변경량이 아니라 **결정 하나 또는 상태 전환 하나**.

```text
나쁨   feat(workspace): implement entire feature
좋음   feat(workspace): domain behavior
       feat(workspace): persistence
       feat(workspace): API integration
       fix(workspace): creation race
       feat(workspace): lifecycle tests
       (모두 Gnam: spec.workspace.impl)
```

squash 금지. 커밋 하나가 memory checkpoint 다. 깔끔한 history 보다 원인과 결과의 추적 보존이 우선.
