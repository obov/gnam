## gnam (Git-Native Agent Memory)

파일에는 현재 상태, 커밋에는 상태가 변한 이유. 규약 원본 `.agents/skills/gnam/references/index.md`

```sh
git status
cat "$(git rev-parse --git-path gnam/handoff.md)" 2>/dev/null   # 인계 메모 (.agents/skills/gnam/references/agent-protocol.md)
git log --oneline --decorate -20 && cat specs/README.md
```

```text
커밋 종류   chore: · refactor: · spec.<topic>.plan: · spec.<topic>.impl: · spec.<topic>.chore:  (<topic> = specs/<topic>.md)
작업 순서   spec 확인 → plan 커밋 → 한 단위 구현 → 검증 → impl 커밋 (본문 첫 줄 Plan: <plan hash> <단계>)
금지        공동 작성자 줄 · squash · plan.md 같은 별도 계획 파일
강제        commit-msg hook (.githooks) · CI 는 npx gnam verify
```
