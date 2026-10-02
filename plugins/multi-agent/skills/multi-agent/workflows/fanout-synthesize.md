# workflow: fanout-synthesize (분산 구현 → 종합)

계획 하나를 runner N 에게 같은 지시로 주고, 조정자가 N 개 결과를 비교해 채택할 설계를 고르면 runner 하나가 **한 벌로 다시 구현**한다.
same-task-compare 와 다른 점: 하나를 고르지 않는다. 버린 설계는 종합 커밋 메시지에 남긴다.

## 언제

계획에 **열린 결정이 2개 이상**이고, 코드베이스가 그 결정마다 **비용이 다른 선택지**를 갖고 있을 때.

```text
적합    통합 형태가 열린 Step. "어떻게" 가 갈릴수록 이득
부적합  기계적 Step (문서 문구 갱신, 인덱스 행). 열린 결정 0 → 같은 결과 N개, 비용만 N배
```

판정은 둘 다 본다 — 계획만으로는 열려 보여도 코드가 답을 강제하면 분산이 안 나오고, 계획이 닫혀 보여도 코드 제약 (테스트 시간 상한 등) 이 새 분기를 만든다.

실측 (2026-09-22, 렌더 엔진 교체 Step, sonnet 3):

```text
열린 결정   1단 호출 (in-process / 서브프로세스)  2단 오디오 체인 (문서 문구 / 기존 체인)  중간 산출물 보존  검증 의무
코드 제약   실행기 동기 (async 전환 = 테스트 10곳)  check 120초 상한 (실물 렌더 테스트 불가)
결과        in-process+실물검증 / 서브프로세스+동기유지 / DI+가짜1단 — 셋 다 다름. 결함 1 (실물 0회 쪽)
비용        runner 15·24·15분 (병렬). 조정자 비교 ≈ 구현의 1/4
```

## 절차

1. 계획 — 조정자가 plan 커밋 (`spec.<topic>.plan:`) 으로 쓴다. **결정 잠금과 검증 의무를 여기서 정한다**:
   갈리길 원하는 결정만 열어 두고, 나머지 (산출물 목록, 실물 검증 N회, 테스트 상한) 는 명시. 안 쓰면 runner 가 생략한다
2. `prepare` N — worktree N 개, 전부 **현재 main** 에서. 계획 hash 는 Step 목록의 출처일 뿐 분기점이 아니다.
   main 에 이미 들어간 Step 은 유지하고 **남은 Step 만** 지시한다. 구현을 되돌려 분산하지 않는다.
   분산할 Step 은 **아직 구현되지 않은 상태**여야 한다 — 같은 `.git` 이라 runner 는 `git log --all` 로 서로의 브랜치를 본다.
   (실측: 먼저 구현된 뒤 분산하자 3/3 이 main 의 커밋을 찾아 따라 씀. 순서 문제)
3. `start` N — 모델과 effort는 agent-routing 정책으로 배정하고 run.start에 기록한다. 기존 sonnet 실측은 참고 데이터이며 고정 기본값이 아니다.
   → 같은 `prompt` (plan-hash + Step. 커밋 내용을 베끼지 않는다) → `wait` N (background)
4. `read` N. 조정자가 각 worktree 에서 검사 명령을 직접 한 번 더 (runner 자기 보고 불신)
5. 비교표 — 지시 **전에** 정한 축으로:
   ```text
   규칙 준수    계획 읽기 · 커밋 관례 · 달라진 결정의 정직한 보고 · 금지 영역 무접촉
   계획 적합    열린 결정마다 선택 · 명시 항목 이행 (산출물, 검증 횟수)
   결함        조정자가 코드로 찾은 것. 검증을 생략한 쪽에서 나온다
   ```
6. 종합 — 조정자가 비교표로 채택 설계를 정하고 분산 runner N 을 `close`. 그 뒤 runner 하나 (agent-routing 배정) 에게 새 worktree (현재 main) 에서 한 벌로 다시 구현하게 한다
   (roles/runner.md 작업 지시 + 채택 설계 요약). cherry-pick 하지 않는다 (파일명·구조가 달라 충돌).
   종합 커밋은 `spec.<topic>.impl:` + 본문 `Plan: <plan-hash> <Step>` + `Alternatives` (채택 안 한 설계 N-1 개와 이유)
   이후 runner-reviewer 4단계 (리뷰) 부터 진행 → `spec.<topic>.merge:` 로 main 에 통합
7. 정리 — (분산 runner 는 6단계에서 close 됨) runner 브랜치마다 `git tag fanout/<plan-hash 7자>/<runner>` 로 커밋 보존 후 worktree·브랜치 삭제.
   종합 커밋 `Alternatives` 에 각 설계의 tag 이름을 적는다 (squash 금지 원칙: `.agents/skills/gnam/references/commits/commit-unit.md`)

## 순서 규칙

```text
계획 → 분산 → 종합              정상. worktree 로 충분
계획 → 일부 Step 구현 → 분산     구현된 Step 은 main 에 유지. 남은 Step 만 분산. worktree 는 현재 main 에서
계획 → 구현 → 같은 Step 분산        runner 가 구현을 찾아 재타이핑한다. 분산의 의미 없음
```

이미 구현된 Step 을 다시 분산하는 것 (재시험) 은 **사용자가 명시적으로 요청할 때만**. 그때만 별도 clone: 계획 지점으로 reset, 원격 제거, 보존 tag (`fanout/*` · `compare/*`) 삭제, reflog expire + gc, `git cat-file -t <지운 hash>` 가 fatal 인지 확인, gitignore 된 입력 (fixture 사본, .env) 복사. 명령은 harness.md (prepare 보충 fanout). 조정자가 "구현이 이미 있다" 는 이유만으로 이 경로를 고르지 않는다.

runner 가 실물 검증에 쓰는 gitignore 된 입력 (프로젝트 산출물 사본 등) 은 worktree 에도 복사한다.

## 상한

runner 3. 넷째부터는 설계가 겹치기 시작하고 (실측: 셋 중 둘이 in-process) 조정자 비교가 직렬이라 비용만 는다.

## 더 싼 대안 (먼저 고려)

```text
열린 결정이 1개       runner 둘에게 설계 초안 (코드 없음) 만 받고 하나 고른 뒤 단일 구현
결함 찾기가 목적      runner-reviewer
결과를 눈으로 골라야  same-task-compare
```
