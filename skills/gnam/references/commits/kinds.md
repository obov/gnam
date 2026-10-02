---
type: Reference
title: 커밋 종류
description: 제목 접두 spec.<topic>.<kind> · chore · refactor 목록과 조회 명령. plugin 종류는 각 plugin 스킬
tags: [gnam, commit]
generated: { by: claude-code/claude-opus-5-5, at: 2026-09-26T00:00:00Z }
sources:
  - id: gnam
    resource: 5dda4f8:.claude/skills/gnam/references/git-native-agent-memory.md
    title: Git-Native Agent Memory (분할 전 단일 문서) §2
    author: human:mark
---

# 커밋 종류

제목 접두는 `spec.<topic>.<kind>:`. `<topic>` 은 spec 파일 이름(확장자 제외), 코어 `<kind>` 는 `plan` · `impl` · `chore`.
plugin 이 종류를 더한다 (gnam.json plugins): `spec.<topic>.merge:` (merge) · `run.<topic>.<start|end|policy>:` (run) · `release:` (release).
활성 종류 목록은 규칙 위반 메시지 (commit/subject) 가 보여 준다.
동작을 유지하는 구조 변경은 `refactor:` ([refactor 커밋](refactor.md)). spec 과 무관.

```text
spec.workspace.plan: ...    계획 — spec 변경 + 구현 계획
spec.workspace.impl: ...    구현 — 계획 실행
spec.workspace.chore: ...   spec 정리 — 인덱스 · 상태표 · 표현. 계획 없음
chore: ...                  spec 과 무관한 변경 (의존성 · 설정 · 도구 · spec 에 없는 동작의 버그)
refactor: ...               동작 유지 · 구조만 변경 (commits/refactor.md). 동작이 바뀌면 chore · impl
```

```bash
git log --oneline --grep '^spec\.workspace\.'         # topic 전체
git log --oneline --grep '^spec\.workspace\.plan:'    # 계획 이력
git log --oneline --grep '^spec\.workspace\.impl:'    # 실행 이력
git log --oneline --grep '^spec\.workspace\.chore:'   # 정리 이력
git log --oneline --grep '^refactor: '                # 구조 변경 이력
```
