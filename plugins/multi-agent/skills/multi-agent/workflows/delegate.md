# workflow: delegate (위임자)

상위 세션이 조정자를 직접 맡지 않고 위임자 세션에게 맡긴다. 다른 워크플로를 감싸는 상위 패턴.
위임자는 다시 하위 위임자를 둘 수 있다 (깊이 2 까지). 위임 트리는 `runs/` 폴더 트리로 기록한다.

```text
기본     사용자 → 조정자 (이 세션) → runner / reviewer
위임     사용자 → root (이 세션) → d1 위임자 → runner / reviewer
계층     사용자 → root → d1 → d1.1 하위 위임자 → runner / reviewer
                          └→ runner / reviewer
```

위임자는 SKILL.md 의 조정자 규칙을 그대로 따른다. 워크플로 선택도 위임자가 한다.
root 는 사용자 명령 전달, 전체 구조 파악, 사용자 판단 중계, 최종 확인만.

역할: roles/delegator.md. 원시 동작 이름은 SKILL.md.

## 언제

```text
적합     Step 여러 개 · fanout 처럼 오래 도는 작업. root 를 사용자 대화에 비워 둬야 할 때
         runner 보고 · diff · 리뷰가 root 컨텍스트에 쌓이면 안 될 때
부적합   Step 하나, 크기 S. 세션 하나 추가 비용뿐
         사용자 판단이 잦은 작업 (UI compare). 판단마다 왕복 한 단계 추가
```

하위 위임 (d1 → d1.1) 은 셋 다 만족할 때만:

```text
독립     spec topic 이 다르거나 파일 영역이 겹치지 않는다
규모     나눈 쪽마다 Step 여러 개
예산     자식에게 줄 예산 3 이상 (위임자 + runner + reviewer)
```

실측 없음. 첫 사용 후 이 절에 기록.

## 위임 트리 (runs/)

```text
<git common dir>/gnam/runs/            커밋 안 됨. 현재 상태만. 이력은 git
  <run-id>/                             run-id = MMDD-HHMM. 위임 한 번 = run 하나
    node                                root
    d1/node                             위임자
    d1/d1.1/node                        하위 위임자
    d1/d1.1/r1/node                     runner
    d1/v1/node                          reviewer
```

- 경로가 노드 ID. 세션 이름 = 경로를 `-` 로 이은 것 (`d1-d1.1-r1`). worktree · 브랜치 이름도 같다
- 접두: `d` 위임자 · `r` runner · `v` reviewer. 번호는 부모 안에서만 유일
- 위치는 항상 `$(git rev-parse --path-format=absolute --git-common-dir)/gnam/runs`. worktree 마다 같은 경로다. 경로는 위임 지시로 받고 같은 명령으로 확인
- 작성자는 파일마다 하나. root · 위임자는 자기 `node`. runner · reviewer 의 `node` 는 부모 위임자가 쓴다 (runner 는 트리를 모른다)
- 자식 폴더는 부모가 만든다. `start` 직전

### node 파일

한 줄에 `키  값`. 상태가 바뀔 때만 갱신. atcher adapter 는 의미 정보만 적는다 (자리 · 런타임 상태는 atcher 가 안다). herdr adapter 는 아래 자리 정보 추가 (adapter = harness-execute, 기록 규칙 = harness.md).

```text
role      delegator                 root | delegator | runner | reviewer
branch    d1-d1.1                   위임자: merge 대상 브랜치 (최상위는 main)
worktree  /abs/.worktrees/d1-d1.1
plan      a1b2c3d
workflow  runner-reviewer
budget    3                         이 노드 + 동시에 살아 있는 자손 수 상한
status    판단 필요                  진행 | 판단 필요 | 막힘 | 완료
task      Step 2 리뷰 반영 대기       한 줄
question  Q1 Tour 패널 위치. O1 사이드 / O2 상단 띠. 추천 O1      판단 필요일 때만. 여러 줄 가능
updated   2026-09-24T14:02Z
```

`question` 은 위임자 노드에만 적는다. runner 가 막히면 부모 위임자가 자기 노드에 옮겨 적는다.

adapter 별 자리 정보:

```text
atcher   적지 않는다. 세션 이름 = 노드 경로 (자리 · 상태는 atcher status)
herdr    agent (세션 이름) · pane (close 대상 확인용) · 위임자는 tab (자기 탭) 추가
         agent     d1-d1.1
         tab       w1:t3
         pane      w1:p7
```

### 보기

```sh
npx gnam run multi-agent status [run-id]
```

```text
run 0924-1402  예산 6 (사용 3)
root  root  진행  Tour 구현 위임
└─ d1  delegator  진행  Step 3/5
   ├─ d1.1  delegator  판단 필요  Tour UI  (갱신 181분 전)
   │  │  ? Q1 Tour 패널 위치. O1 사이드 / O2 상단 띠
   │  └─ r1  runner  완료
   └─ r2  runner  진행  Step 3 구현
```

`(갱신 N분 전)`: 미완료인데 30분 넘게 갱신 없음.
`(세션 <status>)` · `(세션 없음)`: `atcher status` 가 성공하면 미완료 노드마다 세션 이름으로 대조한 런타임 상태.
세션 대조는 실행한 세션의 자손 노드만 의미 (`atcher status` 범위 = 실행한 세션의 하위 트리). root 에서 실행하면 트리 전체.
위임자는 자기 자손의 세션 표시만 쓴다. 자손의 `(세션 없음)` = 막힘으로 판정. 자손 밖 (자기 · 형제 · 조상) 의 `(세션 없음)` 은 막힘 판정 근거 아님.
atcher 가 없거나 실패하거나 3초 안에 끝나지 않으면 이 표시 없이 출력. agent · pane · tab 중 하나라도 기록된 노드 (herdr adapter) 는 대조하지 않는다. `herdr agent list` 와 직접 대조.
사용자가 구조를 물으면 root 는 이 출력을 그대로 보인다.

## 절차 (root)

1. run 생성 — `runs/<run-id>/node` 에 `role root` · `budget 6` · `status 진행` · `task` (사용자 명령 한 줄)
2. `prepare` d1 — worktree 없음. 같은 작업 공간에 d1 탭 하나, cwd **repo 루트 (main)**. `runs/<run-id>/d1/` 생성
3. `start` d1 → `prompt` (roles/delegator.md 위임 지시. 깊이 1, 예산 6, merge 대상 main) → `wait` (background)
4. wait 가 돌아오면 `read` 첫 줄 + `status.ts` 로 분기:
   ```text
   d1 '위임 보고: 완료'          5단계
   트리에 question 있음           사용자에게 묻고, 대상 노드와 답 원문을 d1에 prompt (roles/delegator.md 답변 템플릿). 부모 → 자식으로 대상까지 중계 → wait
   트리에 막힘 · 멈춤 의심         사용자에게 그대로 전달. root 가 대신 풀지 않는다
   그 외 (표지 없음)              위임자가 자식을 기다리는 중 idle. 다시 wait
   ```
5. 확인 — main 에서 검사 명령 한 번 + `git log --oneline <시작 hash>..main` 으로 보고한 merge 커밋 대조 (위임자 자기 보고 불신)
6. 사용자에게 보고 — 결과 · 남은 것. merge 커밋 해시로 가리키고 runner 세부는 옮기지 않는다
7. 정리 — 트리 전체가 완료면 `close` d1 (탭째) → `runs/<run-id>` 삭제

## 계층 merge

```text
깊이 1 (d1)     repo 루트에서. 자식 결과를 main 에 merge
깊이 2 (d1.1)   부모가 만든 통합 worktree (.worktrees/d1-d1.1, 브랜치 d1-d1.1, 현재 main 에서) 에서.
                자식 결과를 통합 브랜치에 merge. 이 위임자에게 역할 문서 · 템플릿의 'main' = 통합 브랜치
                끝나면 통합 브랜치 이름을 보고
부모 (d1)       통합 브랜치를 runner 브랜치처럼 받는다: rebase main 지시 → 검사 → 계획 완료 조건 확인 → merge
                자식 단계에서 리뷰를 거쳤으므로 재리뷰는 크기 L 일 때 reviewer 1 만
                merge 후 `close` d1.1 (탭째) → 통합 worktree 삭제
```

merge 커밋 형식은 workflows/runner-reviewer.md 그대로. 통합 브랜치 merge 는 `진행 현황` 에 하위 merge 커밋 해시를 적는다.

## 규칙

- root 는 사용자 명령을 **원문 그대로** 넘긴다. 요약·재해석 금지. 대화에서 확정된 사항은 별도 절로
- 작업 지시와 사용자 답변은 부모 → 자식만. 사용자 답변은 대상 노드 ID와 원문을 유지해 대상까지 중계한다 (atcher의 자식 제어 제한 포함)
- 부모는 자식의 판단 필요를 대신 답하지 않는다. 사용자 답변을 중계한 뒤 그 자식을 계속 기다린다. question은 답변 대상 노드만 지운다
- 위임 중 root 는 main 작업 트리를 수정하지 않는다. 커밋·merge 는 위임자만
- 사용자 판단 (compare 채택, 2벌·fanout 착수, 재시험, runner blocked) 을 어느 노드도 대신 내리지 않는다
- 같은 topic 의 후속 명령은 같은 run · 같은 d1 에. 다른 topic 은 이전 run 완료 뒤 새 run

## 상한

```text
깊이      위임자 2단계 (d1 → d1.1). 깊이 2 위임자는 더 위임하지 않는다
예산      run 당 동시 세션 6 (root 제외). 부모는 자기 예산 안에서 자식에게 나눠 준다
run       동시 1. d1 이 main 에 직접 merge 하므로 둘이면 main 에서 충돌
조정자별   runner 3 · reviewer 2 (SKILL.md) 는 위임자마다 그대로. 예산이 더 작으면 예산이 우선
```
