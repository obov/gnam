---
type: Principle
title: Git-Native Agent Memory 개요
description: 파일에는 현재 상태, 커밋에는 상태가 변한 이유. 현재 상태와 과거 맥락의 구분
tags: [gnam, principle]
generated: { by: claude-code/claude-opus-5-5, at: 2026-09-26T00:00:00Z }
sources:
  - id: gnam
    resource: 5dda4f8:.claude/skills/gnam/references/git-native-agent-memory.md
    title: Git-Native Agent Memory (분할 전 단일 문서) §1
    author: human:mark
---

# Git-Native Agent Memory

> 파일에는 현재 상태를, commit에는 상태가 변한 이유를 기록한다.

Agent는 세션이 끝나면 맥락을 잃는다. 별도 memory 시스템 대신 Git이 그 역할을 한다.
commit hash가 판단 근거와 코드 상태를 묶으므로 "이 결정이 어느 버전 얘기인가"가 항상 답이 된다.

```text
Spec           = 합의된 요구사항 (미구현 · 미결은 고정 표기)
Code           = 지금 어떻게 동작하는가
Tests          = 무엇이 계속 참이어야 하는가
Lore           = 일을 어떻게 하면 잘 되는가 (경험 · 실측 근거, lore plugin)
Commit Diff    = 무엇이 바뀌었는가
Commit Message = 왜 바뀌었는가 (계획 · 판단 · 대안 · 남은 일)
Git History    = 프로젝트가 지금 모습이 된 과정
```

## 두 종류의 정보

**현재 상태** — `specs/` · 소스 · `tests/`. 지금 유효한 내용만 적는다.
spec 은 합의된 요구사항이다. 아직 구현되지 않은 요구사항과 미결 사항도 담을 수 있다. 단 고정 표기로만.

```text
미구현: <요구사항>    합의됨, 코드 없음. 반영한 impl 커밋이 표기를 지운다
미결: <질문>          합의 안 됨. 여기에 의존하는 plan 은 같은 항목을 Blocking 에 적는다
```

```bash
git grep -n -E '미구현:|미결:' -- specs/     # 구현 · 합의가 남은 요구사항
```

"초기에는 case-sensitive였지만 나중에 바뀌었다" 같은 과거 서술 금지.
그 정보는 `git log -p -- specs/<topic>.md` 가 더 정확하게 보존한다.

**과거 맥락** — git history. 커밋 하나 = 상태 전환 하나 + 그 이유.

plan.md · tasks.md 같은 별도 계획 문서는 두지 않는다. 계획은 plan 커밋 메시지에 둔다.

---

> **Spec은 현재를 설명하고, Git은 현재가 만들어진 이유를 기억한다.**
