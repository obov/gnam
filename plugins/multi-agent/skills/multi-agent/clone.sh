#!/usr/bin/env bash
# workflows/clone.md 의 원시 동작. Herdr + Claude Code. 조정자 pane 에서 실행한다 (HERDR_ENV=1).
#
#   clone.sh prepare <run> <name>                   worktree <repo>-<run>/<name> (브랜치 <name>, 분기 = main) + bun install + 조정자 탭 분할
#                                                   session id 를 미리 만든다 (run.<영역>.start 의 Agent 줄에 먼저 적는다). 출력: pane worktree session
#   clone.sh start <run> <name> <model-id> [effort]    에이전트 시작 (prepare 의 session id). agent-routing 배정 필요
#   clone.sh review <run> <runner> <name> <model-id> [effort]   runner worktree 에서 reviewer pane (runner 아래) + 시작
#   clone.sh prompt <run> <name> <지시 파일>        파일 첫 줄의 작업 · 반영 구간 표지를 포함해 한 줄 전달
#   clone.sh wait <name>                            끝날 때까지 대기. 호출하는 쪽이 background 로
#   clone.sh report <run> <name>                    보고 파일 출력 (report-path 에 에이전트가 쓴 것)
#   clone.sh report-path <run> <name>               보고 파일 경로. 지시문에 넣는다
#   clone.sh close <run> <name>                     pane 닫기. runner 면 worktree 삭제 · 브랜치 삭제 (merge 된 것만)
#   clone.sh sessions <run>                         기록된 에이전트 "이름 역할 session" (gnam run run usage 입력)
#
# 기록: <git common dir>/clone/<run>.tsv  이름 역할 pane session worktree. 저장소 밖에 커밋되지 않는다
set -euo pipefail

main_root="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
registry_dir="$(git rev-parse --path-format=absolute --git-common-dir)/clone"
system_prompt="$(cd "$(dirname "$0")/../harness-execute" && pwd)/system-prompt.md"

die() { printf 'clone.sh: %s\n' "$*" >&2; exit 1; }
need() { [ "$#" -ge "$1" ] || die "인자 부족. 파일 머리 주석의 사용법 참고"; }
registry() { printf '%s/%s.tsv' "$registry_dir" "$1"; }
field() { # <run> <name> <열 번호>
  [ -f "$(registry "$1")" ] || die "run $1 기록 없음"
  awk -F'\t' -v n="$2" -v c="$3" '$1 == n { v = $c } END { if (v == "") exit 1; print v }' "$(registry "$1")" \
    || die "$1 기록에 $2 없음"
}
record() { # <run> <name> <역할> <pane> <session> <worktree>
  mkdir -p "$registry_dir"
  local file; file="$(registry "$1")"
  [ -f "$file" ] && awk -F'\t' -v n="$2" '$1 != n' "$file" > "$file.tmp" && mv "$file.tmp" "$file"
  printf '%s\t%s\t%s\t%s\t%s\n' "$2" "$3" "$4" "$5" "$6" >> "$file"
}
pane_id() { jq -r '.result.pane.pane_id // .result.pane_id // .result.root_pane.pane_id // empty'; }
start_agent() { # <pane> <name> <model> <effort> <session>
  local args=(--dangerously-skip-permissions --system-prompt-file "$system_prompt" --session-id "$5" --model "$3")
  [ -n "$4" ] && args+=(--effort "$4")
  herdr agent start "$2" --kind claude --pane "$1" -- "${args[@]}" > /dev/null
}
cd_pane() { # <pane> <dir>
  herdr pane run "$1" "cd '$2' && clear" > /dev/null
  herdr pane wait-output "$1" --match "$(basename "$2")" --timeout 10000 > /dev/null || true
}

[ "${HERDR_ENV:-}" = 1 ] || die "Herdr pane 안에서만 실행한다"
command -v jq > /dev/null || die "jq 필요"
cmd="${1:-}"
shift || true

case "$cmd" in
  prepare)
    need 2 "$@"
    run="$1" name="$2"
    wt="$(dirname "$main_root")/$(basename "$main_root")-$run/$name"
    mkdir -p "$(dirname "$wt")"
    git -C "$main_root" worktree add -q "$wt" -b "$name" main
    (cd "$wt" && bun install --silent > /dev/null)
    pane="$(herdr pane split --current --direction right --cwd "$wt" --no-focus | pane_id)"
    [ -n "$pane" ] || die "pane 생성 실패"
    herdr pane rename "$pane" "$name" > /dev/null
    cd_pane "$pane" "$wt"
    session="$(uuidgen | tr '[:upper:]' '[:lower:]')"
    record "$run" "$name" runner "$pane" "$session" "$wt"
    printf '%s %s %s\n' "$pane" "$wt" "$session"
    ;;
  start)
    need 2 "$@"
    run="$1" name="$2" model="${3:?agent-routing 배정 모델 ID 필요}" effort="${4:-}"
    pane="$(field "$run" "$name" 3)"
    wt="$(field "$run" "$name" 5)"
    session="$(field "$run" "$name" 4)"
    start_agent "$pane" "$name" "$model" "$effort" "$session"
    ;;
  review)
    need 3 "$@"
    run="$1" runner="$2" name="$3" model="${4:?agent-routing 배정 모델 ID 필요}" effort="${5:-}"
    wt="$(field "$run" "$runner" 5)"
    runner_pane="$(field "$run" "$runner" 3)"
    pane="$(herdr pane split "$runner_pane" --direction down --cwd "$wt" --no-focus | pane_id)"
    [ -n "$pane" ] || die "pane 생성 실패"
    herdr pane rename "$pane" "$name" > /dev/null
    cd_pane "$pane" "$wt"
    session="$(uuidgen | tr '[:upper:]' '[:lower:]')"
    start_agent "$pane" "$name" "$model" "$effort" "$session"
    record "$run" "$name" reviewer "$pane" "$session" "$wt"
    printf '%s %s\n' "$pane" "$session"
    ;;
  prompt)
    need 3 "$@"
    [ -f "$3" ] || die "지시 파일 없음: $3"
    first_line="$(head -n 1 "$3")"
    case "$first_line" in
      "작업 지시"*) phase="작업 지시" ;;
      "리뷰 결과 반영 지시"*) phase="리뷰 결과 반영 지시" ;;
      "코드 리뷰"*) phase="코드 리뷰 지시" ;;
      *) die "지시 파일 첫 줄은 작업 지시, 리뷰 결과 반영 지시 또는 코드 리뷰로 시작해야 한다" ;;
    esac
    herdr agent prompt "$2" "$phase: $3 읽고 그대로 해줘." > /dev/null
    ;;
  wait)
    need 1 "$@"
    herdr agent wait "$1" --timeout 3600000 > /dev/null
    ;;
  report-path)
    need 2 "$@"
    wt="$(field "$1" "$2" 5)"
    git -C "$wt" rev-parse --path-format=absolute --git-path "clone/$2.md"
    ;;
  report)
    need 2 "$@"
    wt="$(field "$1" "$2" 5)"
    file="$(git -C "$wt" rev-parse --path-format=absolute --git-path "clone/$2.md")"
    [ -f "$file" ] || die "보고 파일 없음: $file. herdr agent read $2 --source recent-unwrapped 로 화면 확인"
    cat "$file"
    ;;
  close)
    need 2 "$@"
    run="$1" name="$2"
    pane="$(field "$run" "$name" 3)"
    role="$(field "$run" "$name" 2)"
    wt="$(field "$run" "$name" 5)"
    herdr pane close "$pane" > /dev/null || true
    if [ "$role" = runner ]; then
      git -C "$main_root" worktree remove "$wt"
      git -C "$main_root" branch -d "$name"
      rmdir "$(dirname "$wt")" 2> /dev/null || true
    fi
    ;;
  sessions)
    need 1 "$@"
    [ -f "$(registry "$1")" ] || die "run $1 기록 없음"
    awk -F'\t' '{ print $1, $2, $4 }' "$(registry "$1")"
    ;;
  *)
    die "명령: prepare · start · review · prompt · wait · report · report-path · close · sessions"
    ;;
esac
