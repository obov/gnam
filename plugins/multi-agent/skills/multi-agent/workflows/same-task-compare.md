# workflow: same-task-compare

같은 지시를 runner 둘에게 주고 결과를 비교해 하나를 채택한다.

언제: 결과를 눈으로 골라야 하는 Step 만 — UI 배치, 설계 판단이 갈리는 인터페이스. 기계적 Step (계획이 인터페이스와 테스트를 정해 둔 것) 은 결과가 같아 비용만 2배.

## 판단 기준 (SKILL.md 와 같은 것. 실측 포함)

```text
보낸다      계획에 목적·완료 조건·테스트는 있는데 배치·문구·상호작용·상태 표현은 비어 있음. 크기 L
보내지 않음 계획이 인터페이스 (타입, 함수 시그니처), 파일 위치, 테스트 단언까지 정함. S / M
```

L Step 유지 조건은 [배정 정책](../../agent-routing/references/allocation-policy.md)의 크기 상한 예외를 따른다. 분할하면 비교 기준을 잃는 이유와 비교 기준이 plan에 있어야 하며, K2 이하와 실행 가능한 완료: 조건은 유지한다.

실측 (2026-09-18, PoC 4):

```text
Step 1 RepoFs 주입        인터페이스가 계획에 있음 (read/exists/glob/write)           → 단일 + 리뷰 2벌
Step 2.5 Spec title       스키마·fallback·테스트 단언까지 있음                        → 단일
Step 3 /try 진입          화면 문구가 계획에 예시로 있음, 라우트 구조 정함             → 단일
Step 4 Tour               단계 표·판정 규칙은 있으나 패널 위치·단계 표현·문구 없음. L → 2벌
                          결과: 사이드 패널 vs 상단 띠, 완료 판정 규칙, 6단계 버튼 보호가 갈림. 비교 가치 확인
```

## 절차

1. `prepare` 둘 (worktree 둘, 같은 main 지점). `start` → 같은 지시 `prompt` → `wait`
2. 비교 기준을 **지시 전에** 정한다. 둘 다 검사를 통과한다는 전제에서 남는 기준:
   ```text
   UI        화면 (dev 서버 둘을 다른 포트로 띄워 나란히), 컴포넌트 수, 상태 속성 (data-*) 설계
   인터페이스 API 모양, 호출부 변경량, 테스트 단언의 읽기 쉬움
   공통      diff 크기, 새 의존, 계획과 달라진 결정의 수와 근거
   ```
3. `read` 둘. 조정자가 기준표로 채점. 사용자에게 두 결과와 채점을 보이고 고르게 한다 (UI 는 사용자 판단)
4. 채택한 쪽만 runner-reviewer 의 4단계 (리뷰) 부터 진행. 탈락한 쪽은 `close` → `git tag compare/<plan-hash 7자>/<runner>` 로 커밋 보존 → worktree·브랜치 삭제.
   merge 커밋 `발견` 절에 탈락 이유와 tag 이름 (squash 금지 원칙: `.agents/skills/gnam/references/commits/commit-unit.md`)
5. 섞지 않는다 — cherry-pick 은 거의 충돌. 탈락 쪽의 좋은 점은 채택 쪽 반영 지시에 한 줄로

## 더 싼 대안 (먼저 고려)

```text
설계만 갈리는 경우   둘에게 인터페이스 초안 + 근거만 (코드 없음) 받고 하나 고른 뒤 구현은 하나가
결함 찾기가 목적    runner 하나 + reviewer 둘 (runner-reviewer 4단계)
```
