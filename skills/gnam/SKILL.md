---
name: gnam
description: Git 기반 작업 기록 규약 (Git-Native Agent Memory). spec · plan · impl · chore · refactor 커밋 작성, 세션 시작 · 인계 메모, history 추적 시 사용한다.
---

# gnam

파일에는 현재 상태, 커밋에는 상태가 변한 이유. 필수 규칙은 스킬 선택 여부와 무관하게 AGENTS.md 와 commit-msg hook · CI (`npx gnam verify`) 로 적용한다.

- 시작 · 인계: [agent-protocol](references/agent-protocol.md)
- 규약 목록: [index](references/index.md), [commits](references/commits/index.md)
- 추적 명령: [git-commands](references/reference/git-commands.md)
- 검사: `npx gnam commit-msg <file>` (hook) · `npx gnam verify` (history + plugin 파일 검사)
- 구성: `gnam.json` plugins. `npx gnam plugin list` 가 활성 plugin 과 추가 가능한 내장을 보여 준다. plugin 스킬은 `gnam-<id>` 또는 plugin 이 정한 이름
