# adapter: Herdr + Codex CLI

harness-execute SKILL.md 의 원시 동작 6개를 Herdr + Codex 로 실행한다. `herdr-claude.md` 와 다른 부분만 적는다. 같은 부분 (prepare 의 worktree · pane · 탭 준비, prompt · wait · read · close) 은 그 파일을 따른다.

전제: `test "${HERDR_ENV:-}" = 1`. 명령 문법은 `herdr --skill`, Codex 옵션은 `codex --help` 가 권위. 확인한 버전: codex-cli 0.155.1.

## prepare 차이

Codex Stop hook 은 전역 hook 하나다 (설치는 저장소 절차. 예: template 저장소 `bun run setup:codex`, 머신당 1회 · `/hooks` trust).
worktree 는 prepare 의 `bun install` 이 등록 목록에 추가하므로 따로 trust 할 필요가 없다. 확인:

```sh
(cd <worktree> && bun run doctor)    # template 저장소 기준. Codex 전역 Stop hook · trust · 등록 (이 checkout) 줄
```

전역 hook 이 없거나 trust 전이면 그 세션의 검사 강제는 git hooks · CI 뿐이다. 사용자에게 알린다.

## start

```sh
herdr agent start <name> --kind codex --pane <pane> --timeout 60000 -- \
  --dangerously-bypass-approvals-and-sandbox \
  -c developer_instructions="$(cat <repo>/.agents/skills/harness-execute/system-prompt.md)"
  # 배정값이 있으면 -m <model-id> -c model_reasoning_effort="<effort>" 추가
  # 배정이 없으면 모델 · effort 모두 사용자 config 기본값
```

- `developer_instructions`: system-prompt.md 를 developer 지시로 덧붙인다. `model_instructions_file` 은 Codex 기본 지시를 대체하므로 쓰지 않는다.
  주입 확인: `codex debug prompt-input -c developer_instructions="$(cat …)"` 출력의 developer 메시지
- `--dangerously-bypass-approvals-and-sandbox`: herdr-claude 의 `--dangerously-skip-permissions` 와 같은 자리. 세션이 무인으로 돈다. 빼면 사용자 config 의 승인 · 샌드박스 설정을 따르고, 승인 요청은 `wait` 에서 blocked 로 보인다
- 선택 `--dangerously-bypass-hook-trust`: 기본 start 에 넣지 않는다. 전역 hook 을 trust 했으면 필요 없다. 로드된 enabled hook 전체의 trust 요구를 이 세션에서 건너뛴다.
  사용자가 모든 hook 출처 (사용자 · 프로젝트 · 시스템) 를 미리 검토한 자동화에서만 명시적으로 추가한다. 프로젝트 trust · disabled hook 을 우회하거나 실행을 보장하지는 않는다
- 검증 범위: 플래그 파싱 · developer 지시 주입까지. Herdr pane 에서 codex 세션을 실제 기동해 Stop hook 까지 도는지는 미검증
- 측정: gnam run run usage 는 Claude Code transcript 만 읽는다. codex 세션의 session · active_min · out 등 측정 키는 `na` (multi-agent run 기록). model · effort 는 실행 요청값과 실제 적용값을 구분. 확인 못 한 실제값은 `na`
- `agent start` 가 `agent_not_ready` 면 폴더 trust 대화상자. `read` 로 확인 후 사용자에게 묻는다

사용자가 미리 만든 pane 을 다시 쓸 때만: `herdr agent send-keys <name> ctrl+c` 두 번 → 셸 프롬프트 확인 → `pane run cd` → `agent start`.

## prompt · wait · read · close

`herdr-claude.md` 와 같다. 대상은 이름 또는 pane ID.
