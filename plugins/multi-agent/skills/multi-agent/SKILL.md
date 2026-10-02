---
name: multi-agent
description: 일반 작업의 병렬 구현·검토·통합과 ept 에이전트 workflow 실험을 구분하여 진행한다. "runner / reviewer 로 나눠서", "worktree 로 병렬 작업", "다른 pane 에 에이전트 띄워서", "같은 작업 두 벌 시켜 비교", "위임자 세워서 맡겨" 같은 요청에 쓴다. 세션 실행 (멀티플렉서, 에이전트 CLI) 은 harness-execute 스킬, 역할은 roles/, 절차는 workflows/ 로 분리되어 각각 따로 늘린다.
---

# multi-agent

조정자 (이 세션) 가 여러 에이전트 세션을 부려 계획 (`spec.<topic>.plan` 커밋) 하나를 구현·검토·merge 한다.
위임자 패턴 (workflows/delegate.md) 에서는 이 세션 (root) 이 위임자 세션을 띄우고, 조정자는 위임자가 맡는다. 위임자는 하위 위임자를 둘 수 있고, 트리는 `runs/` 에 기록된다.
세 층으로 나뉜다. 한 층이 늘어나도 다른 층은 안 바뀐다.

```text
workflows/        절차. 역할을 조합한 순서와 규칙            새 흐름 → 파일 하나 추가
roles/            역할. 규칙 + 지시 템플릿. 도구 이름 없음     새 역할 → 파일 하나 추가
harness-execute   세션 실행. 원시 동작 6개의 실제 명령        도구 교체 → 그 스킬 adapters/ 에 파일 하나
                  별도 스킬 .agents/skills/harness-execute/
```

## 요청 모드 — 작업 / ept

사용자의 현재 요청에 `ept` 또는 `experiment`가 모드 표지로 붙거나 에이전트 workflow 실험을 명시하면 **실험**. 코드·파일명·인용문 속 문자열만으로 모드를 바꾸지 않는다. 그 외는 **일반 작업**.

- 일반 작업: 아래 기존 workflow와 run 기록. 완료·효율 우선. 비교 실험을 임의로 추가하지 않는다.
- ept: 먼저 [workflows/experiment.md](workflows/experiment.md). 사용자 조건을 보존하고, 조건이 부족하면 다양한 설계안을 제안한다. runner/reviewer 구성·크기별 리뷰 수·조정자 구현 금지·기본 세션 유지·모델 하향 탐색은 실험의 고정 기본값이 아니다. 역할·권한·검토·세션 정책을 설계에서 명시한다.
- 완료한 작업도 GNAM의 과거 Git 상태를 복원해 사후 실험 가능. 당시 구현 전 코드·요구·완료 기준에서 다른 전략으로 재수행한다 ([replay-experiment](workflows/replay-experiment.md)). 일반 작업을 완료한 뒤 연구를 별도로 진행할 수 있다.
- ept는 단일 agent 기준군도 허용한다. 실험 모드 선택만으로 별도 분석 agent나 여러 세션을 즉시 띄우지 않는다.
- 저장소 규칙·완료 검사·사용자 권한·하네스 제한은 모드와 무관하다. 실험군의 검토 구성과 제품 반영 전 검증을 구별한다.

예: `multiagent로 구현해줘` → 작업. `multiagent ept 같은 작업을 단일/병렬로 비교해줘` → 실험. `multiagent ept 이 요청에 맞는 구조를 제안해줘` → 설계 제안.

## 원시 동작 6개

workflows 와 roles 는 이 여섯 이름만 쓴다. harness-execute 의 adapter 가 명령으로 번역하고, multi-agent 전용 보충 (start 인자 · reviewer 자리 · 위임 트리 기록 · fanout / delegate prepare) 은 harness.md.

```text
prepare   worktree + 브랜치 만들고 의존성 설치. 세션 자리 (pane) 를 그 디렉터리로
start     세션 자리에서 에이전트 시작. 이름 = 역할 이름. harness-execute/system-prompt.md 를 붙인다
prompt    지시 텍스트 전달
wait      끝날 때까지 background 로 대기. 전경 블로킹 금지
read      보고 읽기
close     세션 자리 종료. 의미상 끝난 세션만 (아래 '세션 자리')
```

merge 는 원시 동작이 아니라 git 이다 (adapter 무관): runner 가 `git rebase main` → 검사, 조정자가 그 worktree 에서 검사 통과 확인 → `git merge --no-ff` 로 제품 말 요약 merge 커밋 (형식은 workflows/runner-reviewer.md) → main 에서 검사 한 번 더.

## 세션 자리

작업 공간 (workspace) 은 하나. 조정자가 있는 작업 공간에 모든 세션을 둔다. 새 작업 공간 금지.

```text
기본        조정자 탭을 분할
새 탭       구분이 필요할 때만. 위임자 노드마다 탭 1 (그 자식은 그 탭에) · fanout runner 마다 탭 1 · 한 탭 세션 4 초과
```

`close` 시점 — 의미상 끝난 즉시:

```text
reviewer   보고 read 직후
runner     맡은 마지막 Step merge 후 · compare 탈락 · fanout 분산 runner 는 비교표 확정 후
위임자     깊이 1 은 root 확인 후, 깊이 2 는 부모가 통합 브랜치 merge 후. 탭째
탭         안의 세션이 모두 끝나면
```

```text
닫지 않음   blocked · 막힘 (사용자 확인용) · 후속 지시가 예정된 세션
            사용자가 미리 만든 자리 · 탭 (에이전트만 종료, 자리는 유지)
순서        close → worktree 삭제 (자리의 cwd 가 worktree)
닫는 주체   그 자리를 만든 세션 (부모)
```

## 공통 전제

아래는 일반 작업 기준. 템플릿 저장소 (spec · plan 커밋 없음) 는 workflows/clone.md, ept는 workflows/experiment.md를 따른다.

- 계획은 `spec.<topic>.plan` 커밋 본문에 있다. 별도 계획 파일 없음 (읽기: `git show <plan-hash>`). 형식은 `.agents/skills/gnam/references/commits/plan.md`: Step 마다 `완료:` 조건 (검증할 테스트 포함), 범위는 Scope, 결정 (D) 과 위험 (R) 에 번호. 지시와 리뷰는 그 번호를 쓴다. 착수 가능 조건 (commits/plan.md) 을 만족하지 않는 plan (Blocking 남음 등) 은 runner 에게 넘기지 않고 사용자에게 묻는다. runner 가 계획과 다르게 내린 결정은 V 번호
- 한 명령으로 도는 검사 (`lint + typecheck + test`). merge 기준 = 그 검사 + 계획의 완료 조건
- worktree 는 `.worktrees/<세션 이름>`. `.gitignore` 에 `.worktrees/`
- 세션끼리 컨텍스트를 공유하지 않는다. 독립이 필요한 역할 (reviewer) 은 매번 새 세션
- 지시에는 plan hash 와 문서 경로를 준다. 내용을 베끼지 않는다
- 진행 기록은 impl 커밋 본문 (`Plan: <plan-hash> <Step>` · `Deviation` · `Remaining`). 계획이 바뀌면 새 plan 커밋
- 조정자는 코드를 쓰지 않는다. 판단 (막음 여부, merge, 다음 Step) 만
- 배정 · 실측은 run 커밋 (아래 'run 기록'). 일반 작업 워크플로 공통. ept 기록은 ../gnam-ept/references/experiments.md

## 워크플로 선택

아래는 일반 작업 모드. ept는 workflows/experiment.md에서 비교군을 설계한다.

```text
Step 을 나눠 구현하고 검토받는다           workflows/runner-reviewer.md   (기본)
결과를 눈으로 골라야 한다 (UI, 설계 판단)   workflows/same-task-compare.md
설계가 갈리는 계획을 N벌 받아 하나로 합친다  workflows/fanout-synthesize.md (버린 설계는 종합 커밋에 기록)
구현 없이 검토만                          roles/reviewer.md 단독 (worktree 는 대상 브랜치)
조정자를 다른 세션에 맡긴다 (상위 패턴)    workflows/delegate.md          (위임자가 위 넷 중 하나를 고른다)
템플릿 저장소 (plan 커밋 없음)              workflows/clone.md             템플릿 전용. 분신에게 사용자 말투로 지시 · 실측은 항상
```

clone 은 템플릿 저장소에서만 쓴다. 가져간 저장소는 위 넷. clone 을 쓰는 저장소가 늘면 방식을 다시 정한다 (미결:).

Step 하나를 어느 쪽으로 보낼지는 계획 커밋에 적힌 정보량으로 가른다.

```text
같은 작업 2벌 (compare)   계획이 정한 것: 목적·완료 조건·테스트.  정하지 않은 것: 배치, 문구, 상호작용, 상태 표현
                         → 두 runner 가 다르게 만들 여지가 있고, 고르려면 화면을 봐야 한다. 크기 L
단일 runner + 리뷰        계획이 인터페이스·파일·테스트 단언까지 정함 → 둘이 해도 같은 결과. 비용만 2배
                         S / M 은 전부 여기. 리뷰 2벌은 L 일 때만 (크기 기준은 아래 '크기')
```

판단 근거는 "구현이 어려운가" 가 아니라 "결과가 갈릴 수 있는가". 어려워도 계획이 답을 정해 두면 단일.
2벌로 보낼 때는 착수 전에 사용자에게 한 줄 알린다 (비용 2배).
compare의 L Step은 [배정 정책](../agent-routing/references/allocation-policy.md)의 크기 상한 예외를 만족해야 한다. 분할하면 비교 기준을 잃는 이유와 비교 기준을 plan에 적는다.

```text
N벌 종합 (fanout)        계획에 열린 결정 2개 이상 + 코드베이스가 선택지마다 다른 비용. 고르지 않고 합친다
                         순서: 계획 커밋 → 분산. Step 이 먼저 구현돼 있으면 runner 가 그걸 찾아 쓴다 (실측 3/3)
                         worktree 는 현재 main 에서. 계획 hash 는 Step 출처. 이미 구현된 Step 은 유지, 남은 Step 만 분산
                         분산 · 종합 runner 모두 agent-routing 배정 모델과 effort
                         종합 구현은 runner 하나 (agent-routing 배정), 조정자는 비교·채택만
```

## 크기

분류 원본: ../agent-routing/references/allocation-policy.md.

리뷰 수 판단은 runner 브랜치의 실측 diff 로. 착수 전 (compare 판단) 은 같은 기준의 예상치.

```sh
git diff --numstat main...<branch> -- . ':(exclude)bun.lock' \
  | awk '{n += $1 + $2; f++} END {print f " files, " n " lines"}'
```

S/M/L 기준은 agent-routing의 배정 정책을 참조한다. 예상과 실측 모두 같은 분류를 사용한다. L이면 reviewer 2, 그 외는 1. 다른 수를 배정하면 run 기록에 이유를 남긴다.

## 상한

ept도 이 상한과 하네스 실제 한도를 넘지 않는다. 더 작은 예산은 실험 설계에서 정한다.

runner 3, reviewer 2 (조정자마다). 위임은 깊이 2 · run 당 동시 세션 6 (workflows/delegate.md '상한'). 조정자가 직렬 (보고 읽기 → 지시 → merge) 이라 그 이상은 여기서 막힌다.

## 스킬 조합 (HOS)

ept는 모드 선택 → workflows/experiment.md의 설계 → gnam 실험 기록 검사 → harness-execute 실행 → 실험 판정. 아래 흐름은 일반 작업이다.

작업 분류 → ../agent-routing/SKILL.md로 배정 → ../gnam-run/SKILL.md로 run.start → ../harness-execute/SKILL.md로 실행 → 역할별 구현·리뷰·통합 → gnam run.end. 하위 스킬의 규칙·명령을 복사하지 않고 경로와 입출력만 연결한다.

## run 기록

일반 작업 모드에서 에이전트를 하나라도 띄우는 실행 은 main 에 `run.<topic>.start` · `run.<topic>.end` 빈 커밋 한 쌍을 남긴다.
clone (plan 커밋 없는 작업) 은 `run.<영역>.*` · `Plan: 없음`.
형식 · 분류 · 판정 기준은 `.agents/skills/gnam-run/references/run.md`. 작업 기록 (impl · merge) 은 그대로.

```text
1. 배정     정책 커밋 확인: git show -s $(git log -1 --grep '^run\.[^.]*\.policy:' --format=%h)
            없으면 ../agent-routing/references/allocation-policy.md 출발점. 비슷한 칸의 실측: npx gnam run run stats table --where size=<S|M|L>,difficulty=<K>
            정책이 있으면 runner 10 번 중 1 번은 한 단계 낮게 + explore=yes
            adapter 의 기본 모델은 배정이 없을 때만
2. start    첫 prepare 전. 에이전트마다 session id 를 정해 (uuidgen) Agent 줄과 adapter start 에 같은 값
            clone 은 예외: prepare 가 session id 를 생성하므로 prepare 후, 첫 start 전에 기록 (workflows/clone.md)
3. 실행     워크플로 절차 그대로. 상향 (모델 교체) = 새 세션 → end 에 from= 줄
4. end      마지막 merge 뒤, 또는 중단 즉시 (Outcome: aborted)
            npx gnam run run stats end <run.start>   초안 (측정 키 채움, 판정 키 '?') + 추정 대비표 (over 후보)
            npx gnam run run stats lines <merge> …   lines · size · area
            firstpass · retries · blocked · cause · noise · verdict 는 조정자가 보고 · 리뷰로 판정, Why 줄에 근거
            reviewer 는 평가하지 않는다. 비용 (model · effort · noise · active_min · out) 만, Why 는 '크기' 표와 다를 때만
```

위임자 (delegate) 는 자기 하위 실행의 start · end 를 자기가 쓴다. 통합 브랜치에 쓰고 부모 merge 로 main 에 들어온다.

## 파일

```text
SKILL.md                     이 문서
harness.md                   harness-execute 위에 더하는 것. start 인자 · reviewer 자리 · 위임 트리 자리 기록 · 위임자 대기 · fanout / delegate prepare
roles/runner.md              구현 역할. 규칙 + 작업 지시 템플릿 + 리뷰 반영 지시 템플릿
roles/reviewer.md            검토 역할. 규칙 + 리뷰 지시 템플릿 (체크 6항목, 심각도, merge 결론)
roles/delegator.md           위임자 역할. 조정자 규칙 + 보고 형식 (첫 줄 표지) + 위임 지시 · 답변 템플릿
workflows/runner-reviewer.md 구현 → 리뷰 → 반영 → merge
workflows/same-task-compare.md 같은 지시를 둘에게 → 비교 → 하나 채택
workflows/fanout-synthesize.md 같은 계획을 worktree N 에 → 비교표 → 한 벌로 종합 + 버린 설계 기록
workflows/delegate.md        위임자에게 조정자를 맡긴다 → 판단 중계 → main 에서 확인
workflows/experiment.md      ept 설계·비교 실행·판정 (기록은 gnam)
workflows/replay-experiment.md 완료 작업의 과거 Git 상태 복원·전략 재실험
workflows/clone.md           plan 커밋 없는 작업 전용. 분신 runner · reviewer, 공유 파일은 조정자, 보고는 파일, 실측 항상
clone.sh                     clone 의 원시 동작 (Herdr + Claude Code, harness-execute herdr-claude 고정). prepare · start · review · prompt · wait · report · close · sessions
npx gnam run multi-agent status  위임 트리 (runs/) 를 사용자용 트리로 출력
runs/                        위임 트리 = <git common dir>/gnam/runs. 커밋 안 됨. run 하나 = 폴더 하나, 노드 = 하위 폴더 + node 파일
```
