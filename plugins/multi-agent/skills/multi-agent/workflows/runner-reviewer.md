# workflow: runner-reviewer

계획의 Step 을 runner 가 구현하고, 독립 reviewer 가 검토하고, 조정자가 merge 한다. 기본 워크플로.

역할: roles/runner.md, roles/reviewer.md. 원시 동작 이름은 SKILL.md.

## 절차

1. 쪼개기 — 파일 영역이 겹치지 않고 서로 의존하지 않는 Step 만 병렬 (runner 상한은 SKILL.md '상한'). 의존이 직렬인 Step 은 runner 하나가 순서대로. 각 runner 에게 "손대지 않을 파일" (다른 runner 의 영역) 을 명시
2. 배정 · `run.<topic>.start` 커밋 (SKILL.md 'run 기록') → `prepare` runner 마다 → `start` → `prompt` (roles/runner.md 작업 지시) → `wait`
3. `read` 보고. 조정자가 검사 명령을 그 worktree 에서 직접 한 번 더
4. reviewer 를 그 worktree 에서 **새 세션, 별도 pane** 으로 `prepare` (worktree 생성 없음) → `start`. runner 세션은 유지 (5·7단계에 재사용) → `prompt` (roles/reviewer.md). runner 가 보고한 "달라진 결정" 을 그대로 넘겨 타당성 판단을 받는다 → `wait` → `read` → `close` reviewer
   - 크기 L (SKILL.md '크기', `git diff --numstat` 실측) 이면 reviewer 둘에게 같은 지시. 실측: 각자 상대가 놓친 실질 결함 1개씩
5. 반영 — 심각도 `막음` 만 조정자가 판단. `고침 권장` 이하는 roles/runner.md 의 반영 지시 템플릿으로 runner 에게 그대로 (reviewer 둘이면 합집합, 같은 항목은 하나로). 후속으로 미룰 것은 반영 커밋 본문 `Remaining` 에 한 줄
6. merge — main 이 앞서 있으면 runner 가 rebase → 검사. 조정자가 그 worktree 에서 검사 통과 확인 (AGENTS.md 커밋 전 검사) → `--no-ff` merge 커밋 (아래 메시지 형식) → main 에서 검사 한 번 더 (확인용)
7. 다음 Step — 같은 runner 에 이어서. 브랜치는 main 과 같은 지점에서. 이 runner 에 남은 Step 이 없으면 `close` runner
8. 마지막 merge 뒤 (또는 중단 즉시) `run.<topic>.end` 커밋. reviewer · 상향된 runner 포함 에이전트 전부

## merge 커밋 메시지

runner 의 커밋 묶음 하나 = merge 커밋 하나. 독자는 "개발 지식은 적지만 제품을 잘 아는 사람". 세부는 커밋 해시 7자로 가리키고 설명하지 않는다. 짧게.

```text
spec.<topic>.merge: {무엇을 했나, 제품 말로} ({Step 번호})

진행 현황
- 계획 {plan hash 7자} 의 {Step} 완료. 남은 것: {다음 Step 들}
- {runner} 구현 → {reviewer 들} 리뷰 → 반영 {N}건

주요 기능과의 연관
- {이 변경이 제품의 어느 화면·약속·원칙에 닿는지 1–3줄}

발견
- {워크플로 비효율, 제품 문제, 좋은 아이디어. 없으면 절 생략}

커밋
{해시 7자} {제목}
…
```

`git merge --no-ff <runner> -F <메시지 파일>`. 해시는 `git log --format='%h %s' --abbrev=7 main..<runner>`.

## 규칙

- 커밋 메시지는 repo 관례. 공동 작성자 줄 없음. push 없음
- 계획 파일 없음. Step 완료·달라진 결정은 runner 의 impl 커밋 본문 (`Plan:` · `Deviation`) 에만
- reviewer 는 파일 수정·커밋 없음. 발견은 참조 코드 (F1…) + 심각도 3단계 + merge 결론
- 같은 작업을 runner 둘에게 시키지 않는다 (그건 same-task-compare)

## 이 흐름이 잡은 것 (2026-09-18, PoC 4 Step 0–2.5)

- runner 자기 보고로는 안 나오는 결함: cli 표 정렬 (실측), "빌드 통과가 R1 근거 아님" (dist grep), glob 의미 차이 (picomatch vs Bun.Glob), 기본값 대체가 실제 파일에 write 하는 경로
- 비용: Step 당 리뷰 5–7분, 반영 2–3분. 구현 (10–15분) 보다 싸다
