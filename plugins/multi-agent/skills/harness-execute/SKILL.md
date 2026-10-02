---
name: harness-execute
description: 이 세션이 다른 에이전트 세션 (Claude Code · Codex CLI) 을 멀티플렉서 pane 에 띄우거나 단발 (`claude -p`, structured output) 로 돌려 지시 · 대기 · 보고 읽기 · 종료하는 방법. 원시 동작 6개 (prepare · start · prompt · wait · read · close) 와 도구 조합별 실제 명령 (adapters/). "다른 pane 에 claude 띄워서", "에이전트 세션 하나 더 열어서 시켜", "codex 세션 띄워", "herdr 로 에이전트 실행", "atcher 로 띄워", "claude -p 로 돌려", "결과를 JSON 으로 받아" 같은 요청이나, 다른 스킬 (multi-agent 등) 이 세션 실행을 맡길 때 쓴다. 역할 · 절차 (runner / reviewer, merge) 는 호출하는 쪽 몫.
---

# harness-execute

다른 에이전트 세션을 띄우고 부리는 층. 무엇을 시킬지 (역할 · 절차) 는 호출하는 쪽이 정한다. 이 스킬은 어떻게 띄우고 주고받는지만.

```text
adapters/        도구 조합별 원시 동작 6개의 실제 명령     도구 교체 → 파일 하나 추가
system-prompt.md 모든 세션에 붙이는 커뮤니케이션 규칙 (start)
```

사용처: multi-agent (runner · reviewer · 위임자). 그 스킬이 이 위에 더하는 것은 multi-agent/harness.md.

## 원시 동작 6개

호출하는 쪽은 이 여섯 이름만 쓴다. adapter 가 명령으로 번역한다.

```text
prepare   작업 디렉터리 준비 (필요하면 git worktree + 브랜치 + 의존성 설치). 세션 자리 (pane) 를 그 디렉터리로
start     세션 자리에서 에이전트 시작. 이름 = 호출자가 정한 세션 이름. system-prompt.md 를 붙인다
prompt    지시 텍스트 전달. pane 방식은 항상 한 줄, 단발은 stdin
wait      끝날 때까지 background 로 대기. 전경 블로킹 금지
read      보고 읽기
close     세션 자리 종료
```

## 공통 규칙

```text
작업 공간     하나. 호출한 세션이 있는 workspace 에 모든 세션을 둔다. 새 workspace 금지
자리          (pane 방식) 기본 = 호출한 세션의 탭 분할. 새 탭은 구분이 필요할 때만 (한 탭 세션 4 초과 등)
전달          (pane 방식) 한 줄. 긴 지시는 파일 (/tmp 또는 scratchpad) 에 쓰고 경로만 (이유: atcher-claude.md prompt 절)
blocked       read 로 화면을 보고 사용자에게 묻는다. 대신 답하지 않는다 (권한 · 폴더 신뢰 대화상자 포함)
컨텍스트      세션끼리 공유하지 않는다. 지시문이 유일한 맥락
session id    호출자가 정해 (uuidgen) start 에 넘긴다. transcript 측정 (npx gnam run run usage <session>) 의 키
모델          호출자 지정. 없으면 해당 CLI 사용자 config 기본값. multi-agent 호출은 agent-routing 배정을 먼저 완료 (Claude 모델 ID 를 Codex 에 넘기지 않는다)
```

```text
닫지 않음     blocked · 막힘 (사용자 확인용) · 후속 지시가 예정된 세션
              사용자가 미리 만든 자리 · 탭 (에이전트만 종료, 자리는 유지)
순서          close → worktree 삭제 (자리의 cwd 가 worktree)
닫는 주체     그 자리를 만든 세션
```

## adapter 선택

```text
adapters/claude-print.md    Claude Code 단발 (-p). pane 없음. 결과 JSON · structured output (--json-schema). 사용자 확인 불필요한 일회성
adapters/herdr-claude.md    Herdr + Claude Code. 대화형 기본
adapters/herdr-codex.md     Herdr + Codex CLI. herdr-claude 와 다른 부분 (start · hook trust)
adapters/atcher-claude.md   atcher 명령만 (런타임 직접 호출 없음, 자식만 조작). atcher 설치 시
```

```text
단발 (claude-print)   지시 한 번 → 결과 한 번. 결과를 코드로 분기 (판정 · 분류 · 추출). 중간 확인 없음
대화형 (herdr · atcher) 후속 지시 · 반영이 잦음. blocked 를 사용자가 봐야 함. 화면을 같이 봄
```

호출자 · 사용자 지정이 없으면 현재 하네스에 맞춰 Claude Code 는 herdr-claude, Codex 는 herdr-codex. 전제 (각 파일 머리) 를 못 맞추면 사용자에게 알린다.
