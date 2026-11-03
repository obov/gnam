# multirun — 같은 plan 을 N 개 변형으로 실행해 고른다

착수 가능한 plan 하나를 N 개 clone 에서 변형 agent 가 각자 끝까지 구현한다. 독립 요약 세션이 원본 저장소에 비교 기록 (report) 을 남기고,
사용자가 채택 · 조합 · 폐기를 정한다. 변형이 남긴 커밋은 원본 저장소의 tag 로 hash 그대로 보존된다.

```text
spec.<topic>.plan
  multirun.<topic>.start      main. 변형 v1..vN 배정
    (clone vN) spec.<topic>.impl … · multirun.<topic>.variant
    gnam run multirun sync    clone 의 브랜치 · tag → 원본 tag multirun/<id>/vN/…
  multirun.<topic>.report     main. 비교 · 측정 · 추천. Decision: 대기
  결정 커밋                    Multirun: <report hash> <선택>
  gnam run multirun close     보존 확인 (G1) 후 clone 삭제
```

미구현: 내장 plugin `@gnam/multirun`. requires `harness` (세션 실행). multi-agent 는 의존하지 않는다. 설치돼 있으면 변형이 쓰도록 권장한다.

## 식별

```text
run-id     <plan 7자>-<k>. k = 같은 plan 의 multirun 순번 (1부터, 상태 디렉터리 기준)
변형       v1 … vN. N ≥ 2
clone      ${XDG_CACHE_HOME:-~/.cache}/gnam/multirun/<repo 이름>-<run-id>/vN
상태       <git common dir>/gnam/multirun/<run-id>/state.json. 커밋 안 됨
보존 tag   multirun/<run-id>/vN/heads/<branch>   clone 의 브랜치 tip
           multirun/<run-id>/vN/tags/<tag>       clone 에서 만든 tag
```

## 커밋 종류

모두 빈 커밋. 에이전트 줄 형식 (`Agent: <이름> key=value …`, 본문 마지막 문단, `na` = 측정 못 함) 은 run 커밋과 같고 키 집합만 다르다.

### multirun.\<topic\>.start (main)

```text
multirun.workspace.start: 이름 정규화 3 변형

Plan: a1b2c3d
Id: a1b2c3d-1
Base: 9f8e7d6

Agent: v1 role=variant model=claude-opus-5-5 effort=high agent=claude session=6f1e…
Agent: v2 role=variant model=claude-sonnet-5 effort=high agent=claude session=0a2b…
Agent: v3 role=variant model=gpt-5.5-codex effort=high agent=codex session=na
```

```text
Plan     같은 topic 의 plan hash (또는 Topics 에 topic 을 포함한 수집 plan). 조상 · Blocking: 없음
Id       run-id
Base     clone 시작 commit (start 시점 HEAD)
Agent    v1..vN 전부. role=variant. 키 role model effort agent session (이 순서)
```

### multirun.\<topic\>.variant (clone 의 변형 브랜치 끝)

```text
Id          run-id
Approach    고른 작업 방식 (단일 · runner-reviewer · fanout …) 과 이유
Plugins     사용한 gnam plugin. 없으면 없음
Checks      실행한 검사 명령과 결과
Decisions   plan 의 Decisions expected 번호별 선택 (D1: …)
Deviation   plan 과 다른 부분. 없으면 없음
Remaining   남은 일. 없으면 없음
```

### multirun.\<topic\>.report (main)

```text
Start           multirun.<topic>.start hash (조상)
Outcome         done · partial · aborted
Variants        줄마다 'vN <tip hash> <tag>'. 변형 브랜치 tip. variant 커밋이 없는 변형도 적는다
Comparison      비교 축 (아래) 표
Combinable      Step · D 번호별 출처 변형
Recommendation  추천 하나와 이유. 결정 권한 없음
Decision        대기
Agent           start 의 v1..vN 전부 + summarizer (role=summarizer)
```

비교 축: plan 의 D 번호별 선택 · 완료 조건 통과 여부 · diff 크기 · 새 의존성 · Deviation 수 · 측정값 · 사용한 workflow.
검사 명령은 요약 세션이 각 변형에서 다시 실행한다 (자기 보고 불신).

report Agent 키 (이 순서. 적는 키만):

```text
role model effort agent session workflow wall_min active_min out input cache_write cache_read requests api_errors
sub_sessions sub_active_min sub_out lines checks
```

```text
role            variant · summarizer
agent           claude · codex
workflow        변형이 고른 방식 (variant 커밋 Approach 첫 단어)
wall_min        start 커밋 시각부터 variant 커밋 (없으면 마지막 커밋) 시각까지 분
active_min ~ api_errors   변형 세션 transcript 측정 (gnam run run usage). codex = na
sub_*           변형 브랜치의 run.*.end Agent 줄 합계 (변형이 띄운 하위 세션). run 기록이 없으면 sub_sessions=0
lines           Base..tip 변경 줄 수 (추가 + 삭제)
checks          pass · fail · na (요약 세션 재실행 결과)
필수            variant: role model effort agent session wall_min active_min out lines checks
                summarizer: role model effort agent session active_min out
```

### 결정 커밋

```text
Multirun: <report hash> <v<N> | combine | discard>
```

- 미구현: 채택 (vN) = `spec.<topic>.merge:` (merge plugin) 또는 merge 커밋. 변형 tag 를 rebase 후 `merge --no-ff`. 원래 hash 는 tag 에 남는다
- 미구현: 조합 · 폐기 = 새 `spec.<topic>.plan:` (Supersedes: 원래 plan, `Sources: multirun/<run-id>/v2 Step 1` 처럼 출처)
- 검사: report hash 가 조상이고 제목이 `multirun.<topic>.report:` (같은 topic), 선택이 report Variants 에 있는 변형 · combine · discard

## 명령

```text
gnam run multirun start <plan> -n <N> [--model vN=<id> …] [--agent vN=codex …]
gnam run multirun sync [<run-id>]
gnam run multirun status [<run-id>] [--json]
gnam run multirun collect <run-id>                 JSON (요약 세션 입력)
gnam run multirun open <run-id> <vN>
gnam run multirun close <run-id> [--push <remote>]
gnam run multirun abort <run-id>
```

CLI 는 기계적인 부분만. 세션 실행 · 지시 · 요약은 스킬 (gnam-multirun) + harness-execute.

### start

- 미구현: plan 검사: 제목 `spec.<topic>.plan:` · HEAD 의 조상 · 본문 `Blocking: 없음`. 실패 = exit 1, 아무것도 만들지 않음
- 미구현: 변형마다 `git clone --no-tags --single-branch --branch <현재 브랜치> <원본> <clone>` → remote origin 제거 → 브랜치 `vN` 생성 · checkout
- 미구현: 준비: `multirun.copy` 파일 복사 (원본 작업 트리 기준, 없으면 건너뜀) → `multirun.setup` 명령 → `gnam link` (clone 에 hook · 스킬)
- 미구현: session id 를 변형마다 만든다 (claude). codex = na
- 미구현: 상태 파일 기록 후 start 커밋 초안을 출력. 커밋은 조정자가 한다 (모델 · effort 배정이 조정자 몫)
- 미구현: 중간 실패 = 만든 clone 삭제 · 상태 삭제 · exit 1

```text
gnam.json multirun 설정 (기본값)
setup   null = lock 파일로 판정 (package-lock.json → npm ci · bun.lock/bun.lockb → bun install · pnpm-lock.yaml → pnpm install --frozen-lockfile · yarn.lock → yarn install --frozen-lockfile · 없음 → 건너뜀). 문자열 = 그 셸 명령
copy    [".env"]. 원본 작업 트리 기준 상대 경로
```

### sync

- 미구현: clone 마다 원본에서 `git fetch <clone> +refs/heads/*:refs/tags/multirun/<id>/vN/heads/* +refs/tags/*:refs/tags/multirun/<id>/vN/tags/*`
- 미구현: clone 에서 사라진 브랜치의 tag 는 지우지 않는다 (보존 우선)
- 미구현: 출력: 변형마다 갱신된 ref 수. clone 이 없는 변형 = 건너뜀 표시

### status

```text
a1b2c3d-1  spec.workspace.plan · start 3f2a1b0 · report 없음
  v1  claude-opus-5-5  variant 있음  tip 8c7d6e5  synced    clean
  v2  claude-sonnet-5  진행          tip 1d2e3f4  미sync    dirty
  v3  -                clone 없음    tip 5a6b7c8  synced    -
```

- 미구현: run-id 생략 = 닫히지 않은 run 전부
- 미구현: `--json` = `{ runs: [{ id · plan · topic · start · report · closed · variants: [{ name · clone · tip · variant · synced · dirty }] }] }`
- 미구현: gnam status 요약 줄 (plugin summary): `multirun <id> 미sync clone vN …` · `multirun <id> report 없음` (G3)

### collect

요약 세션 입력. 원본 tag 기준 (clone 이 없어도 동작). sync 를 먼저 한다.

```text
{ id · plan · topic · base · start
  variants: [{ name · tip · tag · commits: [{ hash · subject · body }] · variant: { 필드 } | null
               numstat: [{ path · added · deleted }] · lines · wall_min
               usage: { model · effort · active_min · out · … } | null
               sub: { sessions · active_min · out } }] }
```

### open

- 미구현: 원본 저장소에 tag `multirun/<id>/vN/heads/vN` 기준 detached worktree: `<clone 상위>/open-vN`. 경로 출력
- 미구현: clone 삭제 뒤 결과 검토용. close 가 함께 지운다

### close

보존 확인 (G1) 을 모두 통과해야 clone 을 지운다. 하나라도 어긋나면 그 변형 clone 을 남기고 이유 출력 · exit 1.

```text
G1   sync 후 clone 의 모든 브랜치 · tag tip = 원본 보존 tag. 미커밋 · untracked (ignore 제외) · stash 없음
G2   보존 tag 이름이 clone 의 모든 ref 를 hash 그대로 담는다 (변형 내부 탈락 브랜치 포함)
G3   상태가 남은 run = gnam status 요약 줄 (미sync clone · report 없음)
G4   abort: 커밋된 것만 sync. report 초안 (Outcome: aborted) 출력
G5   clone 에도 gnam link → 변형 커밋이 같은 commit-msg 검사를 거친다
```

- 미구현: report 커밋 (Start 가 이 run 의 start) 이 없으면 거부. abort 경로도 report 를 먼저 쓴다
- 미구현: 통과 = clone · open worktree 삭제, 상태 `closed` 기록. tag 는 지우지 않는다
- 미구현: `--push <remote>` = `git push <remote> refs/tags/multirun/<id>/*` (삭제 전). 기본은 push 안 함

### abort

- 미구현: sync 후 report 초안 출력 (Outcome: aborted, 측정값은 collect 와 같은 방식). clone 은 지우지 않는다 (close 가 지움)

## harness plugin

harness-execute 스킬 (adapter · system-prompt · claude-args.sh) 을 내장 plugin `@gnam/harness` 로 분리한다.

- multi-agent `requires: [run, merge, harness]`. multirun `requires: [harness]`
- 스킬 경로 · 이름 그대로 (`.agents/skills/harness-execute`). 기존 문서 참조 변경 없음
- 이전 항목 (CHANGELOG): multi-agent 를 쓰는 저장소는 `npx gnam plugin add harness`

## 변형 · 요약 세션 규칙

```text
변형      시작 시 npx gnam status 로 plugin · 규약 확인 후 방식 직접 선택. multi-agent 가 있으면 사용 권장
          clone 밖 · 원본 저장소 접근 금지. push 금지 (remote 없음)
          끝: 검사 통과 → variant 커밋 → 대기. merge 금지
          예산 무제한. 대신 측정은 정확히 (session id · run 기록)
요약      변형과 무관한 새 세션 (harness 세션 또는 Claude Code subagent)
          collect JSON + 변형마다 open worktree 에서 검사 재실행
          비교 축은 start 시점 고정. 결정 없이 추천만
Codex     허용. transcript 측정이 Claude 전용이라 토큰 · 활동 시간 = na
```

## 범위 밖

- Deferred: Codex transcript 측정 (run usage 의 Claude 전용 한계)
- Deferred: harness-execute 의 GitHub 스킬 저장소 분리 배포 (skillDeps)
- Deferred: 원격 머신 clone
