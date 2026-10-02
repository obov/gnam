# adapter: Claude Code 단발 (`claude -p`)

pane 없이 명령 한 번으로 세션을 돌리고 결과를 stdout 으로 받는다. 멀티플렉서 불필요.
플래그는 `claude --help`, settings 키는 https://code.claude.com/docs/en/settings-reference.md 가 권위. 확인한 버전: Claude Code 2.1.283.

```text
쓸 때       지시 한 번 → 결과 한 번. 결과를 코드로 받아 분기 (structured output). 사용자가 화면을 볼 필요 없음
안 쓸 때    도중에 사용자 확인이 필요 · 화면을 같이 봐야 함 · 긴 대화형 반영 → herdr-claude / atcher-claude
blocked     없다. 답할 사람이 없으니 권한은 미리 정한다 (아래 권한). 거부된 호출은 결과의 .permission_denials 에 남는다
```

## prepare

작업 디렉터리만. 세션 자리 (pane) 없음.

```sh
git worktree add -q .worktrees/<name> -b <name> && (cd .worktrees/<name> && bun install --silent)   # 쓰기 작업일 때만
```

## start + prompt

한 명령. 지시는 stdin 으로 (여러 줄 가능. 대화형의 한 줄 제약 없음).

```sh
cd <worktree> && claude -p \
  --system-prompt-file <repo>/.agents/skills/harness-execute/system-prompt.md \
  --session-id <session id> \
  --model <모델 ID> [--effort <effort>] \
  --settings <세션 settings 파일 또는 JSON> \
  --output-format json \
  --max-budget-usd <상한> \
  < <지시 파일> > <결과 파일>
```

```text
--output-format json      결과 JSON 하나. text = 답만, stream-json = 진행 이벤트 (--verbose 필요)
--json-schema '<schema>'  structured output. 결과의 .structured_output 이 schema 를 만족하는 객체
--max-budget-usd          비용 상한. 단발은 멈출 사람이 없으니 항상 준다
--settings                이 세션에만 적용할 settings.json 키 (파일 경로 또는 JSON 문자열). 아래 권한
                          -p 는 폴더 신뢰 대화상자를 건너뛴다. 신뢰하는 디렉터리에서만
--no-session-persistence  transcript 를 남기지 않는다. gnam run run usage 측정 · --resume 이 불가해지므로 기본은 빼 둔다
```

## 권한 (--settings)

세션 설정은 settings.json 키를 `--settings` 로 넘긴다. 저장소 · 사용자 settings 를 바꾸지 않는다.
우선순위: CLI 플래그 (`--model` · `--effort` · `--permission-mode`) > `--settings` > 사용자 settings. `permissions.deny` 는 모든 모드에서 막는다 (bypassPermissions 포함).

```text
읽기 · 판정만    {"permissions": {"defaultMode": "dontAsk", "allow": ["Read", "Grep", "Glob", "Bash(git log *)"]}}
                 dontAsk = 묻게 될 호출은 자동 거부, allow 목록 · 승인 불필요 동작만 실행
쓰기 (worktree)  {"permissions": {"defaultMode": "acceptEdits", "allow": ["Bash(bun run *)", "Bash(git commit *)"], "deny": ["Bash(git push *)"]}}
                 목록 밖 호출의 처리 (-p 에서 거부 · 대기) 는 미검증. 결과의 .permission_denials 로 확인. 전부 허용 = --dangerously-skip-permissions
```

규칙 문법 (`Tool(pattern)`) 은 settings-reference 의 `permissions.allow` 절.
`auto` · `bypassPermissions` 는 project · local settings 파일에서 무시된다. `--settings` 또는 플래그로 준다.

실측 (haiku, `dontAsk` + allow Read, 파일 쓰기 지시): 파일 미생성, `.permission_denials` 에 Write · Bash 2건, subtype 은 `success`. 거부 여부는 `.permission_denials` 로 판정한다.

## structured output

schema 는 파일로 두고 `--json-schema "$(cat <schema.json>)"`.

```json
{ "type": "object",
  "properties": {
    "verdict":  { "enum": ["merge", "block"] },
    "findings": { "type": "array", "items": { "type": "object",
      "properties": { "id": {"type":"string"}, "file": {"type":"string"}, "severity": {"enum":["막음","고침 권장","사소"]}, "fix": {"type":"string"} },
      "required": ["id", "file", "severity"] } }
  },
  "required": ["verdict", "findings"] }
```

실측 (haiku, `{"answer": integer}`): `.structured_output = {"answer": 5}`, `.result` 는 같은 내용의 문자열. schema 강제를 위해 내부 턴이 늘어난다 (num_turns 3).

## wait

```sh
# Bash run_in_background 로 위 명령 자체를 실행. 끝나면 알림. 전경 블로킹 금지
```

여러 개는 각각 background. 동시 실행 수 상한은 호출자 규칙.

## read

```sh
jq -e '.is_error == false and .subtype == "success"' <결과 파일> > /dev/null || jq '{subtype, is_error, result}' <결과 파일>
jq '.structured_output' <결과 파일>      # --json-schema 를 준 경우
jq -r '.result' <결과 파일>              # 그 외
jq '{session_id, num_turns, total_cost_usd, duration_ms}' <결과 파일>
jq '.permission_denials | length' <결과 파일>   # 0 이 아니면 권한 부족으로 일부를 못 했다
```

실패 (`is_error` true · subtype 이 success 아님) 면 `.result` 를 사용자에게 보인다. 대신 재시도하지 않는다.

## 후속 지시 · close

```sh
claude -p --resume <session id> --output-format json [--json-schema …] < <후속 지시 파일>   # 같은 맥락에 이어서
```

close 없음 (프로세스가 끝나면 끝). 남는 것은 worktree 뿐. 순서 · 삭제는 호출자 규칙.
측정: `npx gnam run run usage <session>` (transcript 는 대화형과 같은 위치에 저장된다).
