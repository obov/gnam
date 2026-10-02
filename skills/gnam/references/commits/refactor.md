---
type: Commit Type
title: refactor 커밋
description: spec 과 무관하게 동작은 그대로 두고 구조만 바꾸는 변경. Goal · Scope · Invariant, specs/ 변경 금지
tags: [gnam, commit, refactor]
generated: { by: claude-code/claude-opus-5-5, at: 2026-09-26T00:00:00Z }
---

# refactor 커밋 — 구조 변경

동작은 그대로 두고 구조만 바꾸는 변경. 모듈 분리 · 이름 변경 · 중복 제거 · 의존 방향 정리.
동작이 바뀌면 refactor 가 아니다. spec 에 정의된 동작이면 impl, 그 밖이면 chore.

```text
제목 접두   refactor:
파일        specs/ 변경 금지 (spec 을 바꾸면 동작이 바뀐 것)
본문        Goal · Scope · Invariant. Invariant = 유지하는 동작 + 그것을 보증하는 테스트 · 검사
merge       refactor: 제목 merge 금지. 브랜치의 refactor 커밋을 두고 merge 제목은 chore:
```

```text
refactor: 주문 조회를 repository 모듈로 분리

Goal:
주문 조회 로직을 handler 에서 분리해 다른 API 가 재사용하게 한다.

Scope:
apps/api/src/orders/handler.ts · apps/api/src/orders/repository.ts (신규)

Invariant:
주문 조회 응답 (필드 · 정렬 · 404) 동일. apps/api/src/orders/handler.test.ts 변경 없이 통과
```

## 조회

```bash
git log --oneline --grep '^refactor: '                  # 구조 변경 이력
git log --oneline --grep '^refactor: ' -- <경로>        # 한 경로의 구조 변경
```
