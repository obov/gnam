# adapter: Herdr + Claude Code

harness-execute SKILL.md 의 원시 동작 6개를 이 조합에서 실행하는 명령. 다른 멀티플렉서 / 에이전트 CLI 로 바꾸면 같은 여섯 절로 파일을 하나 더 만든다. 호출하는 스킬은 건드리지 않는다.

전제: `test "${HERDR_ENV:-}" = 1` (Herdr pane 안에서만). 명령 문법은 `herdr --skill` 이 권위.

## prepare

```sh
cd <repo>
mkdir -p .worktrees
git worktree add -q .worktrees/<name> -b <name>
(cd .worktrees/<name> && bun install --silent)          # repo 의 설치 명령
# worktree 가 필요 없으면 (읽기 · 검토만) 위 세 줄 생략, <worktree> = 기존 디렉터리

# 세션 자리. 사용자가 pane 을 미리 만들어 라벨을 붙여 두는 경우가 많다 — 먼저 읽는다
herdr pane list --workspace "$HERDR_WORKSPACE_ID"        # label, cwd, agent_status
herdr pane split --current --direction right --cwd <worktree> --no-focus   # 없을 때만. 기본 = 호출한 세션의 탭 분할
# 구분이 필요할 때만 (SKILL.md '공통 규칙' 자리) 새 탭. 항상 현재 workspace. workspace create 금지
herdr tab create --workspace "$HERDR_WORKSPACE_ID" --cwd <worktree> --label <name> --no-focus   # .result.root_pane.pane_id
herdr pane rename <pane> <name>

# pane 셸을 worktree 로 (에이전트 시작 전, 셸 프롬프트 상태여야 한다)
herdr pane run <pane> "cd <worktree> && clear"
herdr pane wait-output <pane> --match "<worktree 이름>" --timeout 10000
```

기존 세션 옆에 자리만 둘 때: `herdr pane split <그 pane> --direction down --cwd <그 세션 cwd> --no-focus`.
만든 pane · tab ID 는 기록해 둔다. `close` 는 이 세션이 만든 것만.
`agent start` 가 `agent_not_ready` 를 돌려주면 폴더 신뢰 대화상자. `read` 로 확인 후 사용자에게 묻는다 (확인되면 `send-keys <name> down enter`).

## start

```sh
herdr agent start <name> --kind claude --pane <pane> --timeout 60000 -- \
  --dangerously-skip-permissions \
  --system-prompt-file <repo>/.agents/skills/harness-execute/system-prompt.md \
  --session-id <session id> \
  --model <모델 ID> --effort <effort>   # 지정이 없으면 --model · --effort 생략 (사용자 설정)
```

측정: `npx gnam run run usage <session> …` 가 transcript (`${CLAUDE_CONFIG_DIR:-~/.claude}/projects/*/<session>.jsonl` + subagents) 를 읽는다.
Claude Code 설정 디렉터리가 다르면 `--root <projects 경로>`.

사용자가 미리 만든 pane 을 다시 쓸 때만 (작업 중인 다른 세션의 pane 금지): `herdr agent send-keys <name> ctrl+c` 두 번 → 프롬프트 확인 → `pane run cd` → `agent start`.

## prompt

지시 파일 첫 줄과 실제 전달 프롬프트의 구간 표지를 일치시킨다. 최초·후속 구현은 `작업 지시`, 리뷰 반영·rebase는 `리뷰 결과 반영 지시`로 시작한다. reviewer 지시는 `코드 리뷰 지시`로 전달한다. gnam 실측기는 파일 내용이 아니라 실제 사용자 프롬프트로 구간을 구분한다.

전달은 항상 한 줄 (이유는 atcher-claude.md prompt 절). 긴 지시는 /tmp/<run>-<name>-<n>.md (또는 scratchpad) 에 쓰고 경로만.

```sh
herdr agent prompt <name> "작업 지시 /tmp/<run>-<name>-<n>.md 를 읽고 그대로 실행해라."
# 리뷰 반영 파일을 전달할 때
herdr agent prompt <name> "리뷰 결과 반영 지시 /tmp/<run>-<name>-<n>.md 를 읽고 그대로 실행해라."
```

## wait

```sh
herdr agent wait <name> --timeout 1800000     # Bash run_in_background 로. 전경 블로킹 금지
herdr agent list                              # working / idle / blocked / done
```

`blocked` 면 read 로 화면을 보고 사용자에게 묻는다. 대신 답하지 않는다.

자식을 다시 부리는 세션 (위임자 등) 은 자식을 background 로 기다리는 동안 idle 로 보여 `wait` 가 일찍 돌아올 수 있다 (미검증). 끝남 판정은 호출자의 보고 표지로.

## read

```sh
herdr agent read <name> --source recent-unwrapped --lines 200
```

## close

```sh
herdr pane close <pane>        # 이 세션이 만든 pane. 에이전트 프로세스도 함께 종료
herdr tab close <tab>          # 이 세션이 만든 탭. 안의 pane 전부 종료
herdr tab list --workspace "$HERDR_WORKSPACE_ID"   # 확인
```

사용자가 미리 만든 pane · 탭: 닫지 않는다. `herdr agent send-keys <name> ctrl+c` 두 번으로 에이전트만 종료.
worktree 삭제는 close 뒤에.
