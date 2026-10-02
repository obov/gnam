# multi-agent 가 harness-execute 위에 더하는 것

원시 동작 6개의 명령은 `.agents/skills/harness-execute/` (SKILL.md · adapters/). 이 파일은 multi-agent 역할 · 워크플로가 그 위에 얹는 규칙만.

## start 인자

```text
session id   run.start Agent 줄의 session (SKILL.md 'run 기록' 2단계). 같은 값을 adapter start 에
모델         run 기록의 배정 모델 ID · effort. 배정이 없으면 agent-routing 을 읽고 결정한 뒤 start. 역할별 모델 고정값 없음
adapter      대화형 (herdr-claude · herdr-codex · atcher-claude). 단발 (claude-print) 은 쓰지 않는다 (blocked 를 사용자가 봐야 하고 후속 지시가 잦음)
```

## reviewer 자리

reviewer 는 worktree 를 만들지 않는다. runner worktree 를 cwd 로 runner 옆에 **별도 pane** 만 만든다 (herdr: `pane split <runner pane>`, `<name>` = reviewer 이름. atcher: cwd = runner worktree).
runner pane 은 그대로 둔다 — 리뷰 반영·다음 Step 을 같은 runner 세션이 받는다.
reviewer 는 리뷰마다 새 pane (이전 reviewer pane 은 read 직후 close). 사용자가 미리 만든 reviewer pane 재사용 시 runner pane 금지.

## 자리 기록 (위임 트리)

```text
herdr    만든 pane · tab ID 를 위임 트리 node 의 `pane` · `tab` 에 (workflows/delegate.md 'node 파일')
atcher   `runs/` node 에 agent · pane · tab 을 적지 않는다. 세션 이름 = 노드 경로를 `-` 로 이은 것 (layout 의 name), 자리 · 상태 = `atcher status`
         `status.ts` 가 `atcher status` 와 대조해 노드마다 런타임 상태 · 세션 없음을 붙인다. 의미 있는 것은 실행한 세션의 자손 노드만 (root 에서 실행하면 전체)
         group: 위임자 노드 · fanout runner 마다 group = 이름
```

## 위임자 대기

위임자가 자식을 background 로 기다리는 동안 idle 로 보여 `wait` 가 일찍 돌아올 수 있다. `read` 의 첫 줄 표지 (`위임 보고:`) 가 없으면 `status.ts` 로 question · 막힘 확인 후 다시 `wait`.
위임자가 돌린 `status.ts` 는 자기 · 형제 · 조상 노드를 `(세션 없음)` 으로 보인다 (atcher status 범위 밖). 자기 자손의 세션 표시만 쓰고, 자손 밖의 `(세션 없음)` 은 막힘 판정 근거로 쓰지 않는다.

## prepare 보충 (fanout-synthesize, herdr)

worktree N 개를 전부 **현재 main** 에서 만든다. 인자로 받은 `<plan-hash>` 는 계획 커밋 (Step 목록·번호의 출처) 이지 분기점이 아니다 — main 에 이미 들어간 Step 은 그대로 두고 남은 Step 만 지시한다. reset·checkout 으로 구현을 되돌리지 않는다.
runner 가 실물 검증에 쓰는 gitignore 된 입력을 복사한다.

```sh
git worktree add -q .worktrees/<name> -b <name>          # 분기점 = 현재 main. <plan-hash> 를 여기 쓰지 않는다
(cd .worktrees/<name> && bun install --silent)
cp -R <gitignore 된 입력> .worktrees/<name>/ ; cp .env .worktrees/<name>/

herdr tab create --workspace "$HERDR_WORKSPACE_ID" --cwd .worktrees/<name> --label <name> --no-focus   # .result.root_pane.pane_id 를 start 에
```

runner 마다 탭: 한 탭에 N 개를 분할하면 폭이 좁아 read 가 어렵다. workspace 는 늘리지 않는다.
`agent start` 가 `agent_not_ready` 를 돌려주면 폴더 신뢰 대화상자 — `read` 로 확인 후 사용자에게 묻는다. 확인되면 `send-keys <name> down enter` (harness-execute 공통 규칙).

사용자가 **재시험을 명시적으로 요청한 경우에만** (이미 구현된 Step 을 다시 분산) 별도 clone. 조정자가 임의로 고르지 않는다:

```sh
git clone -q --no-hardlinks <repo> ~/Dev/<repo>-<name> && cd ~/Dev/<repo>-<name>
git reset -q --hard <plan-hash> && git remote remove origin
git tag -l 'fanout/*' 'compare/*' | xargs -r git tag -d   # 보존 tag 가 지운 커밋을 붙잡지 않게
git reflog expire --expire=now --all && git gc -q --prune=now
git cat-file -t <지운 커밋 hash>             # fatal 이어야 한다
```

## prepare 보충 (delegate, herdr)

트리 폴더를 먼저 만든다. 위치는 항상 main repo (worktree 안에서도 같은 곳):

```sh
runs="$(git rev-parse --path-format=absolute --git-common-dir)/gnam/runs"
mkdir -p "$runs/<run-id>/<노드 경로>"
```

위임자는 노드마다 탭 1. 그 위임자의 자식 pane 은 위임자 안에서 `pane split --current` 로 같은 탭에 생긴다.

깊이 1 위임자 (d1): worktree 없음. 탭 cwd 는 repo 루트.

```sh
herdr tab create --workspace "$HERDR_WORKSPACE_ID" --cwd <repo> --label d1 --no-focus   # .result.tab · .result.root_pane
herdr pane rename <root_pane> d1
```

깊이 2 위임자 (d1.1): 통합 worktree 를 부모가 만든다. 분기점 = 현재 main. 탭은 d1 과 같은 방식 (`--cwd .worktrees/d1-d1.1 --label d1-d1.1`).

```sh
git worktree add -q .worktrees/d1-d1.1 -b d1-d1.1 main
(cd .worktrees/d1-d1.1 && bun install --silent)
```

d1.1 의 runner worktree 는 통합 브랜치에서: `git worktree add -q .worktrees/<name> -b <name> d1-d1.1` (repo 루트에서).
같은 workspace 라 모든 위임자 안에서 `HERDR_ENV` · `HERDR_WORKSPACE_ID` 가 그대로다.
