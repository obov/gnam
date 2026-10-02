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
제목 접두   spec.<topic>.plan:
파일 수     spec 파일 하나 또는 0 (빈 커밋). 여러 spec 파일 동시 커밋 금지
본문        Goal · Plan · Scope · Blocking · Decisions expected · Risks · Open · Supersedes (대체할 때) · Breaking (해당할 때)
```

본문 필드:

```text
Goal                이 계획이 끝나면 무엇이 참이 되는가
Plan                단계 목록. 단계마다 완료: 조건
Scope               바꿀 실제 경로. 범위 밖은 명시
Blocking            착수 전에 사람이 확정해야 하는 결정 (B1…). 없으면 'Blocking: 없음' 한 줄
Decisions expected  구현자가 정해도 되는 결정 (D1…). 결과는 impl 커밋 Decisions 에 번호와 함께
Risks               구현이 잘못될 수 있는 지점 (R1…)
Open                이 계획 범위 밖의 미결. 이 계획의 착수를 막지 않는다
Supersedes          이 계획이 대체하는 이전 plan hash (아래 계획 교체)
Breaking            쓰는 쪽이 코드 · 설정 · 절차를 바꿔야 하는 변경. 무엇이 깨지는지 · 쓰는 쪽이 할 일. 릴리스 major 근거 (release plugin)
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
Supersedes   이전 plan hash. 같은 topic 의 plan
Dropped      (선택) 이전 plan 에서 버린 단계. <hash> <단계> <이유> 한 줄씩
             끝난 단계는 적지 않는다 (impl 의 Plan: 기록이 있음)
impl         새 impl 은 새 plan 을 가리킨다. 이미 들어간 impl 은 이전 plan 을 가리킨 채로 둔다
```

```bash
git log --grep 'Supersedes: <plan-hash>' --oneline   # 이 plan 을 대체한 plan
```

```text
spec.workspace.plan: 이름을 대소문자 구분 없이 유일하게 만든다

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

Blocking: 없음

Risks:
R1. 기존 데이터의 normalized 충돌로 마이그레이션 실패

Open:
삭제된 workspace 이름의 재사용 허용 여부 (삭제 lifecycle 범위)
```
