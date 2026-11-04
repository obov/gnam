---
type: Commit Type
title: impl 커밋
description: plan 실행 기록. Plan 필드 · 버그 수정 종류 · 본문 필드 · Deferred 고정 표기
tags: [gnam, commit, impl]
generated: { by: claude-code/claude-opus-5-5, at: 2026-09-26T00:00:00Z }
sources:
  - id: gnam
    resource: 5dda4f8:.claude/skills/gnam/references/git-native-agent-memory.md
    title: Git-Native Agent Memory (분할 전 단일 문서) §2.2
    author: human:mark
---

# impl 커밋 — 구현

plan 커밋의 계획을 실제로 실행한 커밋. 어느 계획을 따르는지 제목 scope 와 trailer 가 가리킨다.

규칙:

```text
제목          feat|fix(<topic>)[!]: …   type = 수준 (아래 '제목 type')
trailer       Gnam: spec.<topic>.impl
              Plan: <plan 커밋 hash> <단계> (한 줄). 같은 spec 에 계획이 여러 번 쌓여도 어느 것인지 고정
              Plan 은 같은 topic 의 plan, 또는 Topics 에 이 topic 을 포함한 수집 plan (commits/collect-plan.md)
              그 plan 은 Blocking: 없음 (착수 가능 조건 1)
spec          반영한 요구사항의 미구현: 표기를 같은 커밋에서 지운다
```

제목 type — gnam 이 계산한 수준 이상 (commit/impl-type). 올리는 것은 된다.

```text
major  ! + BREAKING CHANGE: <쓰는 쪽이 할 일>   따르는 plan 에 Breaking: 이 있음
minor  feat                                      plan 이 spec 파일을 바꿨고, 그 plan 을 포함한 릴리스 태그가 아직 없음 (새 합의)
patch  fix                                       그 밖 (이미 나간 동작의 수정 · 빈 plan 의 impl)
```

구현 중 Blocking 에 해당하는 결정 (사람 확정 필요) 을 만나면 우회하지 않고 멈춘다. 확정 후 새 plan (Supersedes).

버그 수정의 종류:

```text
spec 에 정의된 동작의 버그        fix(<topic>) + Gnam: spec.<topic>.impl  Plan = 그 동작을 도입한 plan (git log --grep '^Gnam: spec\.<topic>\.plan$'). 새 plan 불필요
수정이 spec 변경을 요구            새 plan (Gnam: spec.<topic>.plan) 먼저
spec 에 없는 동작 (도구 · 설정)    gnam chore (fix · chore · build …, Gnam 없음. commits/kinds.md 'chore 구분')
```

필드는 아래 중 필요한 것만. Plan 은 trailer, 나머지는 본문.

```text
Plan            따르는 plan 커밋 hash + 계획 단계
Intent          이번 변경이 해결하려는 문제
Context         작업 전에 존재했던 상황
Implementation  실제로 적용한 방식
Decisions       구현 중 내린 판단. plan 의 Decisions expected 번호가 있으면 표기 (D1: …)
Alternatives    검토했지만 버린 접근
Deviation       plan 에서 달라진 부분
Invariant       반드시 유지되어야 하는 기존 동작
Remaining       아직 하지 않은 관련 작업
Deferred        의도적으로 미룬 것 — 범위 밖 · 남는 위험 · 실물 미관찰
BREAKING CHANGE 구현 중 드러난 호환성 깨짐 (plan 에 없던 것). 제목 ! + trailer 'BREAKING CHANGE: <쓰는 쪽이 할 일>'
```

`Deferred:` 는 고정 표기다. 커밋 본문 필드와 spec 본문 (단계 줄의 "범위 밖" · "남는 위험" 문장 포함) 어디서든
미룬 항목에는 `Deferred:` 를 붙여 한 번의 grep 으로 전부 찾게 한다.

```bash
git log --grep 'Deferred:' --format='%h %s%n%b'   # 커밋에 남은 미룬 항목
git grep -n 'Deferred:' -- specs/                 # spec 에 남은 미룬 항목
```

```text
feat(workspace): 생성 도메인 동작

Intent:
specs/workspace.md 의 workspace 생성 규칙 구현.

Context:
생성 로직을 HTTP · CLI · 이후 에이전트 인터페이스에서 재사용해야 함.

Implementation:
- WorkspaceService.create() 추가
- 유일성 검사 전 이름 정규화
- 저장 관심사는 WorkspaceRepository 안에 유지
- 생성 검증을 HTTP handler 밖으로 이동

Decisions:
- 도메인 생성 규칙은 WorkspaceService 소유
- 표시용 원본 casing 유지
- 동일성 비교는 normalized name 기준
- 동시성 최종 방어선은 DB unique 제약

Alternatives:
route 단 검증. 인터페이스마다 동작이 중복되어 기각.

Remaining:
삭제 lifecycle 은 이 커밋 범위 밖.

Gnam: spec.workspace.impl
Plan: a1b2c3d 1-2
```

format 1 제목: `spec.<topic>.impl: …`, Plan: 은 본문 첫 필드.

계획과 실행의 차이는 Deviation에만 남긴다. 실패한 시도는 구현에 영향을 줬거나
반복될 가능성이 있는 것만 적는다.

```text
Deviation:
처음엔 repository.existsByName() 뒤 insert. 검사와 insert 사이 race 발생.
DB unique 제약에 의존하고 duplicate-key 오류를 도메인 오류로 변환하는 방식으로 변경.
```
