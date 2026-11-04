---
type: Commit Type
title: plan 커밋
description: spec 변경 + 구현 계획. 본문 필드 · 결정 위치 · 착수 가능 조건 · 계획 교체
tags: [gnam, commit, plan]
generated: { by: claude-code/claude-opus-5-5, at: 2026-09-26T00:00:00Z }
sources:
  - id: gnam
    resource: 5dda4f8:.claude/skills/gnam/references/git-native-agent-memory.md
    title: Git-Native Agent Memory (분할 전 단일 문서) §2.1
    author: human:mark
---

# plan 커밋 — 계획

spec 파일을 추가하거나 수정하는 커밋. 본문에 **그 spec을 구현하기 위한 계획**을 상세히 적는다.

모든 기능 구현은 plan 커밋이 먼저다. spec 변경이 없으면 spec 파일 변경 없이 빈 커밋 (`git commit --allow-empty`) 으로 계획만 남긴다.
이때 `<topic>` 은 가장 가까운 spec 파일 이름.

규칙:

```text
제목        docs(<topic>): …
trailer     Gnam: spec.<topic>.plan · Summary · Blocking · Supersedes (대체할 때) · Breaking (해당할 때)
파일 수     spec 파일 하나 또는 0 (빈 커밋). 여러 spec 파일 동시 커밋 금지
본문        Goal · Plan · Scope · Decisions expected · Risks · Open · Dropped
```

본문 필드:

```text
Summary             (trailer) 사람용 한 줄 (120자 이하). 이 계획이 끝나면 사용하는 사람에게 무엇이 달라지는가. 필수 (commit/plan-summary)
Goal                이 계획이 끝나면 무엇이 참이 되는가
Plan                단계 목록. 단계마다 완료: 조건. 단계 줄은 들여쓰기 없이 `1. 제목` 또는 `S1 제목` · `S1. 제목` (마일스톤 S 번호)
                    하위 단계 줄 `S4a. 제목` (a-z 한 글자) = 단계 4 의 parts. parts 마다 impl 이 있어야 단계 4 완료 (부모 줄 없으면 단계 4 생성)
Scope               바꿀 실제 경로. 범위 밖은 명시
Blocking            (trailer) 착수 전에 사람이 확정해야 하는 결정. 'Blocking: 없음' 또는 항목마다 'Blocking: B<n> <내용>' 반복
Decisions expected  구현자가 정해도 되는 결정 (D1…). 결과는 impl 커밋 Decisions 에 번호와 함께
Risks               구현이 잘못될 수 있는 지점 (R1…)
Open                이 계획 범위 밖의 미결. 이 계획의 착수를 막지 않는다
Supersedes          (trailer) 이 계획이 대체하는 이전 plan hash (아래 계획 교체)
Breaking            (trailer) 쓰는 쪽이 코드 · 설정 · 절차를 바꿔야 하는 변경. 쓰는 쪽이 할 일 한 줄. 이 plan 을 따르는 impl 은 ! + BREAKING CHANGE (major 근거). plan 자체는 릴리스를 만들지 않는다
```

Summary 는 진행 상황을 보는 사람이 읽는다 (specs/human-summary.md). 파일 · 함수 · 내부 용어 대신 결과를 한 줄로.
Goal 은 구현자용 완료 근거로 그대로 쓴다. Summary 가 Goal 을 대신하지 않는다.

```text
나쁨  Summary: normalized_name 컬럼 추가, 조회를 normalized 기준으로 전환
좋음  Summary: 대소문자만 다른 이름으로 workspace 가 둘 생기지 않는다
```

spec 파일을 새로 만들거나 첫 부분을 고칠 때 사람용 두 줄을 둔다 (specs/human-summary.md, 검사 없음).

```text
# <topic> — <사람용 한 줄 설명>     해결하는 기능 (gnam status trace.topics.<topic>.summary)

문제: <사람이 겪는 불편>            첫 줄 다음 첫 줄. 이 기능이 없으면 겪는 문제 (trace.topics.<topic>.problem). 뒤는 빈 줄
```

```text
나쁨  문제: WorkspaceService 에 이름 정규화가 없음
좋음  문제: 대소문자만 다른 이름으로 workspace 가 둘 생겨 어느 쪽이 맞는지 헷갈린다
```

결정의 위치:

```text
착수 전 사람 확정 필요, 이 계획에 영향     Blocking
구현자가 정해도 됨                        Decisions expected
이 계획과 무관하게 미결                    Open
확정된 요구사항                           spec 본문 (plan 커밋의 spec 변경. 미구현이면 미구현: 표기)
```

착수 가능 조건 — 모두 만족하는 plan 만 구현을 시작한다. 하나라도 빠지면 설계 plan 이며 구현자에게 넘기지 않는다.

```text
1. Blocking: 없음
2. 단계마다 완료: 가 실행 가능한 검증 (테스트 단언 또는 명령과 기대 결과)
   나쁨  완료: 인수 조건 통과
   좋음  완료: 대소문자 변형 조회가 같은 workspace 를 반환 (tests/workspace.test.ts)
3. Scope 가 실제 경로. "향후 구현 범위" 같은 표현 금지
4. 단계가 참조하는 spec 규칙에 미결: 이 없다
```

1 은 G5 가 검사한다 (Blocking 이 남은 plan 을 가리키는 impl 커밋 거부). 2 ~ 4 는 조정자 판단.

계획 교체 — 이전 plan 커밋은 고치지 않고 새 plan 커밋을 쓴다. 설계 plan 의 Blocking 이 풀린 경우도 같다
(확정 내용은 그 커밋에서 spec 에 반영, 본문 `Blocking: 없음`).

```text
Supersedes   (trailer) 이전 plan hash. 같은 topic 의 plan
Dropped      (선택, 본문) 이전 plan 에서 버린 단계. <hash> <단계> <이유> 한 줄씩
             끝난 단계는 적지 않는다 (impl 의 Plan: 기록이 있음)
impl         새 impl 은 새 plan 을 가리킨다. 이미 들어간 impl 은 이전 plan 을 가리킨 채로 둔다
```

```bash
git log --grep 'Supersedes: <plan-hash>' --oneline   # 이 plan 을 대체한 plan
```

```text
docs(workspace): 이름을 대소문자 구분 없이 유일하게 만든다

Goal:
동일 이름의 대소문자 변형이 서로 다른 workspace로 생성되는 문제 제거.

Plan:
1. normalized_name 컬럼 추가, 조회를 normalized 기준으로 전환
   완료: 대소문자 변형 조회가 같은 workspace 를 반환
2. 생성 검증을 HTTP handler 에서 domain service 로 이동
   완료: handler 에 검증 코드 없음, service 테스트 통과
3. DB unique 제약 추가, 충돌 마이그레이션 정책 결정
   완료: 중복 insert 가 domain error 로 변환
4. 생성·조회·충돌 테스트
   완료: 저장소 검사 통과

Scope:
packages/workspace/src/service.ts · repository.ts · migrations/ · tests/workspace.test.ts

Decisions expected:
D1. 표시용 원본 casing 유지 여부
D2. check-then-insert vs DB 제약 의존

Risks:
R1. 기존 데이터의 normalized 충돌로 마이그레이션 실패

Open:
삭제된 workspace 이름의 재사용 허용 여부 (삭제 lifecycle 범위)

Gnam: spec.workspace.plan
Summary: 대소문자만 다른 이름으로 workspace 가 둘 생기지 않는다
Blocking: 없음
```

format 1 제목: `spec.<topic>.plan: …`, Summary · Blocking · Supersedes · Breaking 은 본문 필드.
