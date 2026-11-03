# adapter: Herdr + awake + Claude Code

harness-execute SKILL.md 의 원시 동작 6개를 Herdr + awake 로 실행한다. `herdr-claude.md` 와 다른 부분만 적는다. 같은 부분 (prepare, prompt · read · close) 은 그 파일을 따른다.
차이: 자식 세션이 끝나면 awake report 로 호출한 세션을 깨운다. 호출한 세션은 `wait` 대신 턴을 끝내고 기다린다.

전제:

```sh
test "${HERDR_ENV:-}" = 1                  # Herdr pane 안
test -n "${AWAKE_SESSION_ID:-}"            # 호출한 세션이 awake claude 로 실행됨 (부모 id)
test -S ~/.local/state/awake/awake.sock    # awake daemon 실행 중
command -v awake                           # awake CLI (없으면 아래 awake 를 node <awake 저장소>/packages/cli/src/bin.ts 로)
```

하나라도 아니면 `herdr-claude.md` 를 쓴다.
확인한 버전: Claude Code 2.1.317, herdr 의 claude 인식 · `--session-id` 유지 · report → 부모 channel 수신 실측.

## start

`herdr agent start` 는 claude 실행 파일만 띄운다. awake 래퍼는 `pane run` 으로 띄운다. herdr 는 그 claude 를 agent 로 인식한다 (`agent list` 의 session = `--session-id`).

```sh
args=(); while IFS= read -r a; do args+=("$a"); done < <(bash <repo>/.agents/skills/harness-execute/claude-args.sh [--file <세션별 인자 파일>])
herdr pane run <pane> "awake claude --parent $AWAKE_SESSION_ID -- $(printf "'%s' " "${args[@]}") \
  --session-id <session id> --model <모델 ID> --effort <effort>"
herdr agent rename <pane> <name>
```

대화상자 두 개가 차례로 뜬다 (blocked). `read` 로 화면을 확인하고 넘긴다.

```text
폴더 trust          처음 여는 디렉터리만. 사용자에게 묻는다 (herdr-claude 와 같음). 확인되면 send-keys <pane> down enter
개발 채널 경고      --dangerously-load-development-channels server:awake (awake claude 가 붙임). 매 세션. 1 번이 기본 선택 → send-keys <pane> enter
```

- 기본 인자는 claude-args.sh 그대로 (`--tools` · `--strict-mcp-config` 포함 실측. awake MCP 는 `--mcp-config` 로 들어가 strict 에서도 로드된다)
- `--session-id` 는 awake 가 그대로 쓴다. 측정 키 유지
- 화면에 `server:awake · no MCP server configured with that name` 이 보여도 channel 은 동작한다 (실측)

## prompt

`herdr-claude.md` 와 같다. 지시 끝에 보고를 넣는다:

```text
끝나면 awake MCP execute 도구로 command=report, args={status:"done", summary:"<결과 위치 · 한 줄 요약>"} 를 한 번 호출한다.
막히면 status 를 blocked (진행 불가) 또는 needs_input (사용자 판단 필요) 로 보고하고 멈춘다.
```

## wait

`herdr agent wait` 를 쓰지 않는다. 호출한 세션은 턴을 끝낸다. 자식 report 가 channel 로 들어와 새 턴이 된다:

```text
← awake: Report from <session id> (claude-code) …
```

- 구독 불필요 (`--parent` 자식의 report 는 부모에게 바로 전달)
- 멈춘 자식 대비: 턴을 끝내기 전 awake MCP execute command=wake.after, args={delay:"<예상 시간>", note:"<무엇을 확인할지>"}. 최소 60초
- 깨어나면 보고 표지 · `herdr agent list` 로 상태를 확인한다. report 없이 idle 이면 `read` 로 화면 확인

## read · close

`herdr-claude.md` 와 같다.
