# adapter: atcher + Claude Code

harness-execute SKILL.md 의 원시 동작 6개를 atcher 명령으로 실행한다. 런타임 (멀티플렉서) 을 직접 부르지 않는다.
명령 · 출력 · 오류 코드는 atcher 저장소의 `specs/watcher.md` 가 권위. 모든 출력은 stdout JSON 1개, 실패 = `{ "error", "message" }` + exit 1.

전제: `atcher --help` 가 exit 0 (없으면 atcher 저장소의 `apps/cli/watcher` 에서 `bun link`). 런타임 판정은 atcher 가 한다 (`unavailable`).

## 관계

atcher 는 호출한 세션 (pane) 을 스스로 알아낸다. 전달할 ID 없음.

```text
자식        이 세션이 up 한 에이전트. send · keys · read · next · down 은 자식만 (그 외 not_child)
트리        자식이 자기 안에서 up 하면 그 자식의 자식. 상태 파일은 main repo 의 .atcher/ 하나 (worktree 안에서도 같음)
status      이 세션의 하위 트리 전체 (손자 포함, parent = 부모 이름). 관찰만
```

손자에게 직접 지시하지 않는다. 그 부모에게 전달한다.

## prepare

```sh
cd <repo>
mkdir -p .worktrees
git worktree add -q .worktrees/<name> -b <name>
(cd .worktrees/<name> && bun install --silent)          # repo 의 설치 명령
```

자리 (pane · 탭) 는 start 의 `atcher up` 이 만든다. 따로 만들지 않는다.
예외: 사용자가 미리 만든 빈 자리 (slot). 아래 start 의 slot.
worktree 가 필요 없으면 (읽기 · 검토만) 생략, cwd = 기존 디렉터리.

## start

layout 파일을 쓰고 up. 여러 세션을 한 파일에 넣으면 한 번에 뜬다.

```sh
cat > /tmp/<run>-layout.json <<'JSON'
{ "agents": [
  { "name": "<name>", "kind": "claude", "cwd": ".worktrees/<name>", "model": "<모델 ID>",
    "args": ["--dangerously-skip-permissions",
             "--system-prompt-file", "<repo>/.agents/skills/harness-execute/system-prompt.md",
             "--session-id", "<session id>",
             "--effort", "<effort>"] }
]}
JSON
atcher up /tmp/<run>-layout.json
```

```text
cwd        호출 위치 기준 상대 경로 또는 절대 경로. 없는 경로면 invalid_layout (아무것도 만들지 않음)
group      새 탭이 필요할 때만 (SKILL.md '공통 규칙' 자리). 같은 group 은 같은 탭
slot       사용자가 미리 만든 빈 자리에서 시작할 때만. 값 = 사용자가 붙인 자리 라벨 (herdr: pane rename <pane> <라벨>)
           자리를 만들지 않고 그 자리에서 cwd 로 옮긴 뒤 시작. group 과 함께 쓰지 않는다. 라벨 붙이기는 사용자 몫
model      호출자가 정한 모델 ID. 없으면 CLI 사용자 config 기본값
args       --session-id · --effort 는 호출자가 정한 값. effort 지정이 없으면 --effort 생략
codex      kind codex, args = herdr-codex.md 의 start 인자 (-- 뒤 부분)
```

측정은 herdr-claude.md start 절과 같다 (`npx gnam run run usage <session> …`).

결과는 status 형식 (slot 으로 시작한 세션은 `slot` 필드). `failed` 가 있으면 그 항목의 error 로 판단한다.
`invalid_slot` = 그 라벨의 자리가 없거나 이미 에이전트가 있음. 사용자에게 자리 확인을 요청한다.
`status: blocked` 로 뜬 세션 = 시작 대화상자 (폴더 신뢰 등). 화면을 보고 사용자에게 묻는다:

```sh
atcher read <name> --screen
atcher keys <name> down enter       # 사용자가 신뢰를 확인한 경우만
```

## prompt

지시 파일 첫 줄과 실제 전달 프롬프트의 구간 표지를 일치시킨다. 최초·후속 구현은 `작업 지시`, 리뷰 반영·rebase는 `리뷰 결과 반영 지시`로 시작한다. reviewer 지시는 `코드 리뷰 지시`로 전달한다. gnam 실측기는 파일 내용이 아니라 실제 사용자 프롬프트로 구간을 구분한다.

전달은 항상 한 줄. 여러 줄 텍스트는 받는 Claude Code 가 붙여넣기로 받아 실행 확인을 요청하며 멈춘다
(system-prompt.md 의 붙여넣기 규칙. 지시 안에 "확인 없이 실행" 을 적어도 효과 없음).

```sh
# roles/*.md 템플릿을 채운 지시는 /tmp/<run>-<name>-<n>.md 에 쓰고 경로만 한 줄로
atcher send <name> "작업 지시 /tmp/<run>-<name>-<n>.md 를 읽고 그대로 실행해라."
# 리뷰 반영 파일을 전달할 때
atcher send <name> "리뷰 결과 반영 지시 /tmp/<run>-<name>-<n>.md 를 읽고 그대로 실행해라."
atcher send <name> "<짧은 지시 한 줄>"
```

받은 쪽이 그래도 확인을 요청하면 `atcher send <name> "실행해라."`.

```text
not_ready     아직 작업 중 · blocked. status 확인 후 판단 (대기열 없음)
not_started   제출됐지만 작업이 시작되지 않음 (입력 유실). 화면 확인 후 다시 send
```

## wait

```sh
atcher next <name>... --timeout 1800        # Bash run_in_background 로. 전경 블로킹 금지
```

`{ "changes": [...] }` 가 오면 깨어난다. change 마다 `to` 로 분기:

```text
idle | done   끝남. read 로 보고 확인
blocked       read --screen 으로 화면을 보고 사용자에게 묻는다. 대신 답하지 않는다
gone          세션이 사라짐. 사용자에게 알린다
changes []    timeout. status 로 확인 후 다시 wait
```

send 직후의 working 은 보고되지 않는다. 이름을 생략하면 자식 전체.
자식을 다시 부리는 세션 (위임자 등) 은 자식을 기다리는 동안 idle 로 보여 wait 가 일찍 돌아올 수 있다. 끝남 판정은 호출자의 보고 표지로.

## read

```sh
atcher read <name> --lines 200              # 최근 출력 (줄바꿈 해제)
atcher read <name> --screen                 # 지금 화면. blocked 대화상자는 이쪽
```

## close

```sh
atcher down <name>                          # 그 자식과 하위 트리 (손자까지). 탭은 비면 함께 닫힘
atcher down                                 # 이 세션의 자식 전체
atcher status                               # 확인
```

결과 `{ "closed": [...], "stopped": [...], "forgotten": [...] }`.

```text
closed      atcher 가 만든 자리째 닫음
stopped     slot 세션. 에이전트만 종료 ("/exit"), 사용자의 자리는 남음 (SKILL.md '공통 규칙')
forgotten   이미 있던 에이전트를 이름으로 기록한 경우 · slot 자리에 그 세션이 없거나 다른 에이전트가 있는 경우. 기록만 지움
not_owned   그 경우를 이름으로 down. 닫지 않는다
순서        close → worktree 삭제
```

slot 세션은 idle · done 확인 후 down 한다. working · blocked 면 atcher 가 입력하지 않고 `not_ready` (그 기록은 남음).
blocked 는 read --screen 으로 보고 keys 로 답한 뒤 (사용자 확인이 필요하면 묻는다), idle 확인 후 다시 down.
