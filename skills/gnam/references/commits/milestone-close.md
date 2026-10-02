---
type: Commit Type
title: 마일스톤 종료 커밋
description: 마일스톤 전체의 남은 일을 한 커밋에 회수
tags: [gnam, commit, milestone]
generated: { by: claude-code/claude-opus-5-5, at: 2026-09-26T00:00:00Z }
sources:
  - id: gnam
    resource: 5dda4f8:.claude/skills/gnam/references/git-native-agent-memory.md
    title: Git-Native Agent Memory (분할 전 단일 문서) §2.5
    author: human:mark
---

# 마일스톤 종료 커밋 — 회수

마일스톤 = 여러 plan 을 묶는 번호 붙은 목표 (`M1`, `M2` …). plan 단계는 `S1`, `S2` … 로 그 아래에 둔다.
마일스톤을 닫는 커밋은 그 마일스톤 전체의 미룬 항목을 한곳에 모은다.
다음 세션은 이 커밋과 README 구현 상태만 보고 남은 일 전체를 알 수 있어야 한다.

```text
제목        spec.<topic>.chore: <마일스톤> 완료 — ...   ("<마일스톤> 완료" 는 grep 기준, 고정)
Remaining   마일스톤 안 모든 커밋의 Remaining · Deferred 와 spec 의 Deferred: · 미구현: · 미결: 을 빠짐없이 옮긴다
            해소된 항목은 빼고, 남은 항목은 한 줄씩
README      specs/README.md 구현 상태의 남은 것을 같은 목록으로 맞춘다
```

회수 명령:

```bash
git log <직전 마일스톤 종료>..HEAD --grep 'spec.<topic>' --format='%h %s%n%b' | grep -A5 -E '^(Remaining|Deferred):'
git grep -n -E 'Deferred:|미구현:|미결:' -- specs/<topic>.md
```
