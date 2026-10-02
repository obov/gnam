---
type: Commit Type
title: 수집 plan
description: 흩어진 Remaining · Deferred · 남은 단계를 plan 하나로 모아 실행. Topics · From · Spec
tags: [gnam, commit, plan]
generated: { by: claude-code/claude-opus-5-5, at: 2026-09-26T00:00:00Z }
sources:
  - id: gnam
    resource: 5dda4f8:.claude/skills/gnam/references/git-native-agent-memory.md
    title: Git-Native Agent Memory (분할 전 단일 문서) §2.1.1
    author: human:mark
---

# 수집 plan — 흩어진 남은 일 모으기

여러 plan · impl 에 일부만 남은 단계 · Remaining · Deferred 를 새 plan 하나로 모아 실행한다.
수집 plan 도 plan 이다. 일반 plan 본문 규칙에 아래를 더한다.

```text
제목        spec.<대표 topic>.plan:   대표 topic = 가장 가까운 spec. 하나로 정하기 어려우면 README
파일 수     0 (빈 커밋). spec 변경이 필요하면 그 topic 의 plan 을 먼저 커밋하고 Spec: 으로 가리킨다
Topics      'Topics: a, b' 한 줄. 쉼표 구분, 대표 topic 포함, 각각 specs/<t>.md 파일 이름
            Topics · From · Spec 중 하나라도 있으면 수집 plan. 이때 Topics 필수
단계        수집한 항목만. 단계마다 From: <hash> <단계|Remaining|Deferred> (완료: 와 같은 들여쓰기)
            Spec: <plan hash> (선택) — 단계가 의존하는 spec 규칙. Topics 안 topic 의 plan
            새 작업은 넣지 않는다. 일반 plan 으로 나눈다
Dropped     (선택) 버린 항목. <hash> <단계|필드> <이유> 한 줄씩 (계획 교체의 Dropped 와 같은 형식)
원 커밋     고치지 않는다. 옮겨진 항목은 From: 역참조로 찾는다
재수집      새 수집 plan 에서 From: <이전 수집 hash> <단계>. 끝난 단계는 impl 기록, 버린 단계는 Dropped
            수집 plan 에는 Supersedes 를 쓰지 않는다 (Supersedes 는 일반 plan 교체 전용)
impl        spec.<항목의 실제 topic>.impl:  Plan: <수집 plan hash> <단계>. 그 topic 이 Topics 안에 있어야 한다
```

From: · Spec: 이 가리키는 커밋은 수집 plan 보다 먼저 커밋된 조상이어야 한다.

[마일스톤 종료](milestone-close.md)와의 차이: 종료 커밋은 남은 일의 기록 (chore), 수집 plan 은 실행 (plan).
종료 커밋의 Remaining 도 `From: <종료 hash> Remaining` 으로 가져올 수 있다.

```text
spec.workspace.plan: 남은 작업 수집 — 충돌 정책 · 청구 중단

Goal:
a1b2c3d · 9f8e7d6 에 남은 항목을 한 plan 에서 마무리.

Topics: workspace, billing

Plan:
1. 기존 데이터 normalized 충돌 처리 정책
   From: a1b2c3d 3
   완료: 충돌 데이터 마이그레이션 테스트 통과
2. workspace 삭제 시 청구 중단
   From: 9f8e7d6 Remaining
   Spec: 5e6f7a8
   완료: 삭제 후 청구 이벤트 없음

Scope:
packages/workspace/src/ · packages/billing/src/

Dropped:
a1b2c3d Open 표시용 casing 옵션화. D1 결정으로 불필요
```

```text
spec.billing.impl: workspace 삭제 시 청구 중단

Plan: <수집 plan hash> 2
```

```bash
git log -E --grep '^Topics:' --oneline                      # 수집 plan 목록
git log -E --grep '^Topics:(.*[ ,])?<topic>([ ,]|$)' --oneline         # <topic> 을 포함한 수집 plan
git log --grep 'From: a1b2c3d' --format='%h %s'             # a1b2c3d 의 항목이 옮겨진 곳. hash 는 7자로 검색 (앞부분 일치)
```
