---
type: Commit Type
title: spec chore 커밋
description: 계획 없는 spec 정리 (인덱스 · 상태표 · 표현)
tags: [gnam, commit, chore]
generated: { by: claude-code/claude-opus-5-5, at: 2026-09-26T00:00:00Z }
sources:
  - id: gnam
    resource: 5dda4f8:.claude/skills/gnam/references/git-native-agent-memory.md
    title: Git-Native Agent Memory (분할 전 단일 문서) §2.3
    author: human:mark
---

# spec chore 커밋 — 정리

계획을 동반하지 않는 spec 파일 변경. 인덱스 · 상태표 · 오타 · 표현 · 다른 spec 을 가리키는 표시.
요구사항의 의미가 바뀌면 chore 가 아니라 plan 이다.

```text
제목        docs(<topic>): …   (CC type chore 를 쓰지 않는다)
trailer     Gnam: spec.<topic>.chore
파일 수     spec 파일 하나
본문        Goal · Scope 만. 계획 필드 없음
```

```text
docs(README): workspace.md 인덱스 행 추가

Goal:
spec 인덱스가 workspace.md 를 가리키게 한다.

Scope:
specs/README.md 인덱스 1행

Gnam: spec.README.chore
```

format 1 제목: `spec.<topic>.chore: …` (trailer 없음).
