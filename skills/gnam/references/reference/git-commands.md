---
type: Reference
title: 추적 명령
description: 왜 지금 이렇게 되어 있는가를 git 에서 읽는 명령. 질문 → 명령 · 양방향 추적 · 끊기는 지점
tags: [gnam, git, reference]
generated: { by: claude-code/claude-opus-5-5, at: 2026-09-26T00:00:00Z }
sources:
  - id: original
    resource: 5dda4f8:.claude/skills/gnam/references/git-native-agent-memory-git-commands.md
    title: 이동 전 원본
    author: human:mark
---

# Git-Native Agent Memory — 추적 명령

> Spec은 현재를 설명하고, Git은 현재가 만들어진 이유를 기억한다. 이 문서는 그 이유를 꺼내는 명령이다.

규칙·커밋 형식은 [gnam 목록](../index.md). 여기서는 "왜 지금 이렇게 되어 있는가"를 git 에서 읽는 방법만 다룬다.

```text
Spec  →  Plan 커밋 (spec.<topic>.plan:)  →  Impl 커밋들 (Plan: <hash>)  →  Code / Tests
```

연결 고리는 두 개뿐이다. 제목 접두 `spec.<topic>.` 과 impl 본문의 `Plan: <hash>`.
Git 은 이 관계를 모른다 — 추적 품질은 커밋 메시지 규칙을 지킨 만큼이다.

---

## 1. 질문 → 명령

| 질문 | 명령 |
|---|---|
| 지금 합의된 요구사항 | `cat specs/<topic>.md` |
| 이 spec 은 어떻게 바뀌어 왔나 | `git log --reverse -p --follow -- specs/<topic>.md` |
| 이 topic 의 checkpoint 전부 | `git log --oneline --all --grep='^spec\.<topic>\.'` |
| 계획만 / 실행만 / 정리만 / 통합만 | `--grep='^spec\.<topic>\.plan:'` · `.impl:` · `.chore:` · `.merge:` |
| 이 계획을 실행한 커밋은 | `git log --all --oneline --grep='<plan-hash>'` |
| 이 계획을 대체한 plan 은 | `git log --all --oneline --grep='Supersedes: <plan-hash>'` |
| 구현 · 합의가 남은 요구사항 | `git grep -n -E '미구현:\|미결:' -- specs/` |
| 이 결정의 이유 + diff | `git show <hash>` |
| 이 개념은 언제 생겼나 | `git log -S'<string>' -p -- specs/<topic>.md` |
| 이 패턴이 바뀐 커밋은 | `git log -G'<regex>' -p -- specs/<topic>.md` |
| 현재 이 줄은 어디서 왔나 | `git blame -L <start>,<end> specs/<topic>.md` → `git show <hash>` |
| multi-agent 배정 기록 (run plugin) | `git log --oneline --grep='^run\.<topic>\.'` |
| 조합별 첫 시도 성공률 · 소요 (run plugin) | `npx gnam run run stats table --by model,effort --where size=M` |
| 최신 배정 정책 | `git show -s $(git log -1 --grep '^run\.[^.]*\.policy:' --format=%h)` |
| 구조 변경 (refactor 커밋) | `git log --oneline --grep='^refactor: '` |
| 계획 당시 spec 은 | `git show <plan-hash>:specs/<topic>.md` |
| 그때와 지금 spec 의 차이 | `git diff <plan-hash>..HEAD -- specs/<topic>.md` |
| 두 계획 사이 spec 의 차이 | `git diff <old-plan>..<new-plan> -- specs/<topic>.md` |
| 커밋 본문 전체를 한 번에 | `git log --format='%h %ad%n%B%n---' --date=short --all --grep='^spec\.<topic>\.'` |
| 분기 흐름 | `git log --graph --decorate --oneline --all` |

`-S` 는 문자열 등장 횟수가 변한 커밋, `-G` 는 diff 줄이 정규식에 맞는 커밋.
`--grep` 은 접두를 `^` 로 고정한다 — `spec.workspace` 만 쓰면 본문 언급까지 걸린다.

---

## 2. 양방향 추적

```text
Spec → Plan → Impl → Code
  cat specs/<topic>.md
  git log --oneline --all --grep='^spec\.<topic>\.plan:'
  git log --all --grep='<plan-hash>'
  git show <impl-hash>

Code → Impl → Plan → Spec
  git blame -L <start>,<end> <소스 파일>
  git show <impl-hash>            # 본문 Plan: <plan-hash> <단계>
  git show <plan-hash>            # Goal · Plan · Blocking · Decisions expected · Risks · Open · Supersedes
  git show <plan-hash>:specs/<topic>.md
```

---

## 3. 조사 순서

시작 절차의 원본은 [Agent 프로토콜](../agent-protocol.md). topic 하나를 깊이 파야 할 때 그 뒤에 이어서 쓴다.

```bash
git log --oneline --all --grep='^spec\.<topic>\.'          # 1. checkpoint 목록
git show <plan-hash>                                       # 2. 관심 계획의 이유 · 단계 · Blocking · 열린 질문
git log --all --oneline --grep='<plan-hash>'               # 3. 그 계획을 실행한 impl · 대체한 plan (Supersedes)
git show <impl-hash>                                       # 4. 판단 · Deviation · Remaining
git log --reverse -p --follow -- specs/<topic>.md           # 5. 필요할 때만 — spec 전체 변천
```

---

## 4. 추적이 끊기는 지점

```text
topic 이름 변경     spec 파일명 = topic. 파일 history 는 --follow 가 따라가지만
                    커밋 접두 spec.<old>. → spec.<new>. 는 자동으로 이어지지 않는다. 바꾸지 않는다
Plan: 필드 누락     impl 이 어느 계획을 실행했는지 찾을 길이 없다. 필수
Supersedes 누락     같은 topic 에 plan 이 여럿일 때 어느 계획이 유효한지 알 수 없다. 대체할 때 필수
hash 길이           7자리 (--abbrev=7, 예: 350d603). 겹치면 git 이 자동으로 늘린 값을 그대로 쓴다
squash              checkpoint 삭제. 금지 (commits/commit-unit.md)
규약 판 경계        gnam.json "format" 을 바꾼 커밋 이전 기록은 그 시점 판의 형식이다.
                    판별 형식 변경은 gnam 패키지 CHANGELOG.md. 이전 plan 에 없는 필드는 누락이 아니다
                    git log --oneline -G '"format"' -- gnam.json
```

---

## 5. 별칭

자주 쓰면 두 개만 건다.

```bash
git config alias.spec-history "log --reverse -p --follow --"
git config alias.topic-log "log --format='%h %ad %s' --date=short --all --grep"

git spec-history specs/render.md
git topic-log '^spec\.render\.'
```

---

## 6. 다섯 개만 남긴다면

```bash
git log -p --follow -- specs/<topic>.md     # spec 변천
git show <hash>                            # 결정 + diff
git log --all --grep='<plan-hash>'         # 계획 → 실행
git log -S'<string>' -p -- specs/<topic>.md # 개념의 등장
git blame specs/<topic>.md                  # 줄의 출처
```
