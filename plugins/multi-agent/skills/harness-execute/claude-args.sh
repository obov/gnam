#!/usr/bin/env bash
# 에이전트 세션의 claude 시작 인자 (기본 인자). adapter · clone.sh 가 start 때 이 출력 뒤에
# --session-id · --model · --effort 를 붙인다.
#
#   claude-args.sh               인자를 한 줄에 하나씩 출력
#   claude-args.sh --json        JSON 배열 (atcher layout 의 args)
#   claude-args.sh source        적용 중인 출처: "project|global|default <경로>"
#   claude-args.sh init [--global]   현재 기본값으로 설정 파일 생성 (있으면 거부). 이후 파일을 편집
#
# 우선순위 (첫 번째 존재하는 파일)
#   1. 프로젝트   <main 저장소>/.gnam/claude-args
#   2. 전역       ${XDG_CONFIG_HOME:-~/.config}/gnam/claude-args
#   3. 기본값     --dangerously-skip-permissions --system-prompt-file <이 스킬>/system-prompt.md
#
# 파일 형식: claude 명령 인자를 셸 단어 규칙 (따옴표 · 줄 끝 \ 이음 · # 주석 줄) 으로 적는다.
# 쓰던 `claude \ --tools … --settings …` 명령을 그대로 붙여 넣어도 된다 (맨 앞 claude 는 무시).
# 값 확장은 하지 않는다 (eval 없음). 경로는 절대 경로 또는 ~/ 로 시작.
# --session-id · --model · --effort 는 세션마다 호출자가 정하므로 파일에 있어도 버린다.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
bundled="$here/system-prompt.md"
common="$(git rev-parse --path-format=absolute --git-common-dir 2> /dev/null || true)"
project_file=""
[ -z "$common" ] || project_file="$(dirname "$common")/.gnam/claude-args"
global_file="${XDG_CONFIG_HOME:-$HOME/.config}/gnam/claude-args"

default_args() {
  printf '%s\n' --dangerously-skip-permissions --system-prompt-file "$bundled"
}

pick() { # → "<kind> <path>"
  if [ -n "$project_file" ] && [ -f "$project_file" ]; then
    printf 'project %s\n' "$project_file"
  elif [ -f "$global_file" ]; then
    printf 'global %s\n' "$global_file"
  else
    printf 'default %s\n' "$bundled"
  fi
}

file_args() { # <file> → 한 줄에 하나
  grep -v '^[[:space:]]*#' "$1" \
    | sed -e ':a' -e '/\\$/N; s/\\\n//; ta' \
    | xargs -n1 printf '%s\n' \
    | awk 'NR == 1 && $0 == "claude" { next } { print }'
}

strip_session_flags() { # stdin → stdout
  local skip=0 a
  while IFS= read -r a; do
    if [ "$skip" = 1 ]; then skip=0; continue; fi
    case "$a" in
      --session-id | --model | --effort) skip=1 ;;
      --session-id=* | --model=* | --effort=*) ;;
      "~/"*) printf '%s\n' "$HOME/${a#\~/}" ;;
      *) printf '%s\n' "$a" ;;
    esac
  done
}

emit() {
  local kind path
  read -r kind path < <(pick)
  if [ "$kind" = default ]; then default_args; else file_args "$path" | strip_session_flags; fi
}

case "${1:-}" in
  "") emit ;;
  --json) emit | jq -R . | jq -s . ;;
  source) pick ;;
  init)
    if [ "${2:-}" = --global ]; then target="$global_file"; else target="$project_file"; fi
    [ -n "$target" ] || { printf 'claude-args.sh: git 저장소 밖. --global 사용\n' >&2; exit 1; }
    [ ! -e "$target" ] || { printf 'claude-args.sh: 이미 있음: %s\n' "$target" >&2; exit 1; }
    mkdir -p "$(dirname "$target")"
    {
      printf '# claude 시작 인자. 셸 단어 규칙, 줄 끝 \\ 이음, # 주석. 경로는 절대 경로 또는 ~/\n'
      printf '# --session-id · --model · --effort 는 세션마다 정해지므로 쓰지 않는다\n'
      printf -- '--dangerously-skip-permissions \\\n--system-prompt-file %s\n' "$bundled"
    } > "$target"
    printf '%s\n' "$target"
    ;;
  *) printf 'claude-args.sh: 사용법은 파일 머리 주석 참고\n' >&2; exit 1 ;;
esac
