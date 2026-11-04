---
type: Reference
title: 커밋 종류
description: 제목 Conventional Commits · 종류 Gnam trailer (format 2). spec.<topic>.<kind> · chore · refactor 목록, chore 구분, format 1 대응, 조회 명령. plugin 종류는 각 plugin 스킬
tags: [gnam, commit]
generated: { by: claude-code/claude-opus-5-5, at: 2026-09-26T00:00:00Z }
sources:
  - id: gnam
    resource: 5dda4f8:.claude/skills/gnam/references/git-native-agent-memory.md
    title: Git-Native Agent Memory (분할 전 단일 문서) §2
    author: human:mark
  - id: commit-format
    resource: specs/commit-format.md
    title: commit-format — 제목은 Conventional Commits, gnam 종류는 trailer
    author: human:mark
---

# 커밋 종류

제목은 Conventional Commits 1.0.0 (`<type>(<scope>)[!]: <설명>`). gnam 종류 · 한 줄 필드는 메시지 끝 trailer 단락, 여러 줄 필드는 본문.
`<topic>` 은 spec 파일 이름(확장자 제외), 코어 종류는 `plan` · `impl` · `chore`. 규약 판 = gnam.json `format` (format 2 = gnam init 기본값).
plugin 이 종류를 더한다 (gnam.json plugins): `Gnam: spec.<topic>.merge` (merge) · `Gnam: run.<topic>.<start|end|policy>` (run) 등.
활성 종류 목록은 규칙 위반 메시지 (commit/subject) 가 보여 준다.
동작을 유지하는 구조 변경은 `refactor:` ([refactor 커밋](refactor.md)). spec 과 무관.

```text
<type>(<scope>)[!]: <설명>

<본문. 마크다운 목록 · 번호 · 코드 블록. 여러 줄 필드 (Goal: · Plan: 단계 · Scope: …)>

<trailer 단락. Key: value 줄만. 메시지의 마지막 단락>
```

- 본문에 `#` 로 시작하는 줄 · `---` 한 줄 금지 (에디터 커밋이 `#` 줄을 지우고, `git am` 이 `---` 에서 자른다)
- `feat` 는 `Gnam: spec.<topic>.impl` 에서만. `Gnam: spec.<topic>.*` 의 topic 과 제목 scope 는 같아야 한다

```text
docs(workspace): …       Gnam: spec.workspace.plan    계획 — spec 변경 + 구현 계획
feat|fix(workspace): …   Gnam: spec.workspace.impl    구현 — 계획 실행. type 은 수준 (feat · fix · !)
docs(workspace): …       Gnam: spec.workspace.chore   spec 정리 — 인덱스 · 상태표 · 표현. 계획 없음
fix · chore · build …    (Gnam 없음)                  gnam chore — spec 과 무관한 변경
refactor: …              (Gnam 없음)                  동작 유지 · 구조만 변경 (commits/refactor.md). 동작이 바뀌면 chore · impl
```

## chore 구분

`chore` 는 gnam 종류 이름이고, Conventional Commits 의 type 이름이기도 하다. 범위가 다르다.

```text
gnam chore      spec 과 무관한 변경. Gnam: 없음 · type 이 refactor 아님. 릴리스는 type 에 따름
spec chore      spec 정리. docs(<topic>) + Gnam: spec.<topic>.chore. CC type chore 를 쓰지 않는다
CC type chore   gnam chore 중 릴리스와 무관한 잡일
```

gnam chore 의 type 은 쓰는 사람에게 미치는 영향으로 고른다.

```text
spec 에 없는 동작의 버그 수정      fix
성능 개선 (동작 유지)              perf
되돌림                            revert
의존성 · 설정 · 도구               chore · build · ci
문서 · 테스트 · 서식               docs · test · style
```

- gnam chore 의 scope 는 spec topic 이름이 아니어야 한다 (commit/chore-scope). spec 에 정의된 동작을 고치면 impl
- gnam chore · refactor 는 specs/ 를 바꾸지 않는다 (commit/chore-spec)
- merge 커밋 제목 `chore: …` · release PR 커밋 `chore: release <version>` 은 gnam chore

## 조회

```bash
git log --oneline --grep '^Gnam: spec\.workspace\.'          # topic 전체
git log --oneline --grep '^Gnam: spec\.workspace\.plan$'     # 계획 이력
git log --oneline --grep '^Gnam: spec\.workspace\.impl$'     # 실행 이력
git log --oneline --grep '^Gnam: spec\.workspace\.chore$'    # 정리 이력
git log --oneline -E --grep '^refactor(\(.*\))?!?: '         # 구조 변경 이력
git log --format='%h %(trailers:key=Gnam,valueonly,separator=) %s'   # 커밋마다 종류
```

## format 1 대응

format 1 저장소 · 판이 섞인 history 는 제목 접두가 종류다. 읽기 (status · trace) 는 두 판을 모두 읽는다.

```text
format 1 제목            format 2
spec.<topic>.plan: …     docs(<topic>): …               + Gnam: spec.<topic>.plan
spec.<topic>.impl: …     feat|fix(<topic>)[!]: …        + Gnam: spec.<topic>.impl
spec.<topic>.chore: …    docs(<topic>): …               + Gnam: spec.<topic>.chore
chore: …                 fix · perf · chore · build …   (Gnam 없음)
refactor: …              refactor: …                    (Gnam 없음)
<plugin 접두>: …         plugin 이 정한 type            + Gnam: <plugin 종류>
```

```bash
git log --oneline -E --grep '^spec\.workspace\.plan: ' --grep '^Gnam: spec\.workspace\.plan$'   # 두 판의 계획 이력
```
