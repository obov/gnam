---
name: gnam-multirun
description: 착수 가능한 plan 하나를 N 개 clone 에서 서로 다른 변형 agent 가 각자 끝까지 구현하게 하고, 독립 요약 세션이 비교 report 를 남긴 뒤 사용자가 채택 · 조합 · 폐기를 고르게 한다. "multirun 돌려", "같은 plan 을 N 개로 구현해서 비교", "여러 버전 구현해보고 고르자", "변형 N 개 띄워" 같은 요청에 쓴다. 한 작업을 Step 단위로 나눠 병렬 구현하는 것은 multi-agent.
---

# gnam-multirun

규칙 원본: `specs/multirun.md` (gnam 패키지). 이 문서는 조정자 (이 세션) 절차.
세션 실행은 `.agents/skills/harness-execute` (원시 동작 prepare · start · prompt · wait · read · close). 변형 · 요약 세션 지시는 roles/.

```text
조정자     이 세션. clone 준비 · 세션 실행 · start / report 커밋 · 사용자와 결정. 구현하지 않는다
변형 vN    clone 하나에서 plan 전체를 구현 (roles/variant.md). 방식은 스스로 고른다
요약       변형과 무관한 새 세션. collect + 검사 재실행 → report 본문 (roles/summarizer.md)
```

## 절차

`<plan>` = 착수 가능한 `spec.<topic>.plan:` hash. `<id>` = start 가 출력하는 run-id.

1. 배정 — 변형 수 N (사용자 지정) · 변형마다 모델 · effort · agent (claude · codex). 정하지 않았으면 사용자에게 묻는다
2. `npx gnam run multirun start <plan> -n <N> --model v1=<id> --model v2=<id> --effort high [--agent v3=codex]`
   → clone 경로 · session id · start 커밋 초안 (`.git/gnam/multirun/<id>/start-message.txt`)
3. start 커밋 (main) — 초안의 `?` 를 채워 `git commit --allow-empty -F <초안>`
4. 변형 세션 — 변형마다 harness-execute: prepare (cwd = clone 경로) → start (start 출력의 session id · 모델 · effort) → 지시 파일 (roles/variant.md 템플릿) → prompt → wait (background)
   blocked 는 사용자에게 묻는다. 대신 답하지 않는다
5. 진행 확인 — `npx gnam run multirun status <id>` · 주기적으로 `npx gnam run multirun sync <id>` (중간 기록 보존)
6. 변형 전부 variant 커밋 (또는 중단) → 변형 세션 close (clone 은 남긴다)
7. 요약 — `npx gnam run multirun open <id> vN` (변형마다) → 요약 세션 (harness 세션 또는 Claude Code subagent) 에 roles/summarizer.md 지시
   → report 본문 받기 → 조정자가 측정 키 확인 후 `multirun.<topic>.report:` 빈 커밋 (main)
8. 사용자와 결정 — report 의 Comparison · Recommendation 을 보이고 고른다. 결정 커밋에 `Multirun: <report hash> <vN | combine | discard>`
   - 채택 vN: `git checkout -b adopt-vN multirun/<id>/vN/heads/vN` → `git rebase main` → main 에서 `git merge --no-ff adopt-vN` (제목 `spec.<topic>.merge:`, merge plugin 없으면 저장소 관례)
   - 조합: 새 `spec.<topic>.plan:` (Supersedes: 원래 plan, `Sources: multirun/<id>/v2 Step 1` 처럼 단계별 출처) → 단일 실행 또는 다시 multirun
   - 폐기: 새 `spec.<topic>.plan:` (Supersedes) 또는 사유를 남긴 chore
9. `npx gnam run multirun close <id> [--push origin]` — 보존 확인 (G1) 통과 시 clone · open worktree 삭제. 실패 이유가 나오면 그 clone 에서 커밋 · 정리 후 다시

중단: `npx gnam run multirun abort <id>` → report 초안 (Outcome: aborted, `report-message.txt`) 의 `?` 채워 커밋 → close.

## 규칙

```text
보존       tag multirun/<id>/vN/heads/* · tags/* 는 지우지 않는다. 변형 내부 탈락 브랜치도 hash 그대로 남는다
격리       변형은 자기 clone 안에서만. clone 에는 remote 가 없다 (push 불가)
예산       무제한. 대신 측정은 정확히: session id 는 start 출력값, 변형이 띄운 하위 세션은 변형 쪽 run 기록
측정       report Agent 줄은 collect 의 usage · wall_min · lines · sub 그대로. 없으면 na. 추정치 금지
multi-agent 설치돼 있으면 변형 지시에 사용 권장 (의존은 아님)
Codex      허용. transcript 측정이 Claude 전용이라 active_min · out 등 = na
결정       report 는 추천만 (Decision: 대기). 고르는 것은 사용자
```

## 상태 · 정리

```bash
npx gnam run multirun status [<id>] [--json]   # 변형별 clone · tip · variant 커밋 · sync · dirty
npx gnam status                                # 요약 줄: multirun <id> 미sync clone … · report 없음
```
