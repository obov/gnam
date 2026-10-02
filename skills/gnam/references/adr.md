---
type: Principle
title: ADR와의 관계
description: ADR · plan · impl · spec 의 결정 기록 범위 구분
tags: [gnam, adr]
generated: { by: claude-code/claude-opus-5-5, at: 2026-09-26T00:00:00Z }
sources:
  - id: gnam
    resource: 5dda4f8:.claude/skills/gnam/references/git-native-agent-memory.md
    title: Git-Native Agent Memory (분할 전 단일 문서) §5
    author: human:mark
---

# ADR와의 관계

```text
ADR         장기 architecture 결정 (왜 PostgreSQL, 왜 event-driven)
plan 커밋   요구사항 변경 + 구현 계획
impl 커밋   구현 단위의 결정 (왜 retry 를 service 가 담당하는가)
Spec        합의된 요구사항 (미구현 · 미결 표기 포함)
```

모든 구현 결정을 ADR로 만들지 않는다. 커밋 메시지가 구현 단위의 결정 기록이다.
