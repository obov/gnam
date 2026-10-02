# workflow: clone

**plan 커밋 없는 작업 전용.** spec · plan 커밋을 쓰지 않는 저장소 · 작업 (chore: · refactor: 만) 에서 조정자가 자기 분신 (같은 모델의 새 세션) 에게 작업을 나눠 맡긴다.
plan 커밋이 있는 작업은 runner-reviewer.md 를 쓴다.

역할: roles/runner.md · roles/reviewer.md 의 규칙 중 plan · impl 커밋 관련을 뺀 나머지. 명령: `clone.sh` (Herdr + Claude Code).

## 원칙

```text
분신      대화 맥락이 없는 새 세션. 지시문이 유일한 맥락 → 배경 (원인 · 재현 · 보고 원문) 을 지시에 직접 적는다
말투      사용자가 직접 시키는 것처럼 쓴다 ("~해줘"). 조정자 · 워크플로 · 역할 이름은 지시에 쓰지 않는다
gnam      plan · impl · merge 커밋 형식을 요구하지 않는다. 커밋은 chore: · refactor: (AGENTS.md 저장소 관례가 있으면 그것)
공유 파일  판 올림 (CHANGELOG · version) · lock 파일 · 병렬 runner 둘 다 필요한 파일은 조정자만
           runner 는 lock 재생성처럼 검사 통과에 필요한 갱신만 (판 번호는 건드리지 않는다)
검사      {검사 명령} = AGENTS.md 의 커밋 전 검사 (예: npm test · bun run check). 지시문에 그대로 적는다
실측      항상. run.<영역>.start · run.<영역>.end 빈 커밋 한 쌍 (Plan: 없음). <영역> = 저장소 이름 또는 작업 영역. 형식은 .agents/skills/gnam-run/references/run.md
보고      파일로 받는다 (clone.sh report-path). 화면 읽기 (herdr agent read) 는 막혔을 때만
```

## 절차

`<run>` = 이번 실행 이름 (예: 0, 1 …). worktree 는 `<repo 부모>/<repo>-<run>/<name>`.

1. 쪼개기 — 파일 영역이 겹치지 않는 작업만 병렬 (runner 상한 SKILL.md '상한'). 공유 파일은 위 '공유 파일' 로 조정자에게
2. `clone.sh prepare <run> <name>` runner 마다 → 출력의 session id
3. `run.<영역>.start` 빈 커밋 (main). `Plan: 없음`, Agent 줄에 runner session. 예정 reviewer 는 `session=na` 로
4. `clone.sh start <run> <name> <model-id> [effort]` → 지시 파일 (scratchpad) 작성 → `clone.sh prompt <run> <name> <파일>` → `clone.sh wait <name>` (background)
5. `clone.sh report <run> <name>` → 조정자가 그 worktree 에서 `{검사 명령}` 한 번 더
6. `clone.sh review <run> <runner> rv-<name> <model-id> [effort]` → 리뷰 지시 → wait → report → `clone.sh close <run> rv-<name>`
7. 반영 — `막음` 은 조정자 판단. 공유 파일 관련 지적 (판 올림 등) 은 조정자 몫으로 빼고 나머지를 runner 에게. 반영이 지적 항목만 고쳤으면 재리뷰 없이 조정자가 핵심을 직접 확인 (막음 항목은 재현 명령으로)
8. merge — `git merge --no-ff <name>` (제목 chore:, 본문 = 무엇 · 왜 · 리뷰 결과 한두 줄). 공유 파일 충돌 (lock 등) 은 main 쪽을 두고 마지막에 한 번 재생성. 마지막 merge 에 CHANGELOG 절 · 판 올림을 함께 → `{검사 명령}` → `clone.sh close <run> <name>`
9. `run.<영역>.end` 빈 커밋. `clone.sh sessions <run>` → `npx gnam run run usage <session>…` · `npx gnam run run stats lines <merge>` → firstpass · retries · blocked · cause · verdict 판정 (.agents/skills/gnam-run/references/run.md)

닫는 순서: pane → worktree → 브랜치 (clone.sh close 가 한다). 사용자가 미리 만든 pane · 탭은 닫지 않는다.

## runner 지시 템플릿

```text
작업 지시. 이 폴더 {worktree} (git worktree, 브랜치 {name}) 안에서만 작업해줘.
{main 경로} (main) 이랑 다른 worktree 는 건드리지 말고, push 도 하지 마.
먼저 {읽을 문서 · 소스 경로} 읽어줘.

문제
{배경. 보고 원문이 있으면 그대로 인용. 원인을 알면 파일:줄까지}

해줘
- {할 일. 원하는 동작 · 폴백 · 테스트 단언까지}

하지 말 것
- {공유 파일} 은 건드리지 마. 판 올림은 내가 합칠 때 한다.
  대신 검사 통과에 필요한 갱신 ({lock 재생성 명령 등}) 은 돌려
- {다른 runner 영역} 은 다른 사람이 작업 중이니 손대지 마
- 요청 밖 정리 · 리팩터링 금지

커밋
- 커밋 전 {검사 명령} 통과. 메시지는 {chore: | refactor:} (공동 작성자 줄 없음). 결정 하나 = 커밋 하나

끝나면 보고를 {report-path} 에 써줘: git log --oneline main..HEAD, 테스트 수, {검사 명령} 결과,
내가 말한 거랑 다르게 한 결정 (D1…), 남은 것. 화면에는 한 줄 요약만.
```

## reviewer 지시 템플릿

```text
코드 리뷰 부탁해. {worktree} (브랜치 {name}) 에서 읽기랑 실행만 하고, 파일 수정 · 커밋은 하지 마. main 이랑 다른 worktree 도 건드리지 마.

대상: main..HEAD 커밋 {N}개
- {해시} {제목}
배경: {문제 한 단락}
내가 요청한 것: {runner 지시의 '해줘' 요약}

작업자가 스스로 판단한 것 (각각 타당한지 봐줘):
V1 {runner 보고의 D1}
…

확인할 것
1. 정확성: {이 작업 특유의 경계 · 오인 가능 입력}
2. 회귀: 기존 동작 · 기존 테스트 수정 내역 (git diff main...HEAD -- '*.test.ts')
3. 문서 정합: 같은 사실을 적은 다른 문서 전수 grep
4. 규칙: AGENTS.md · {저장소 규칙 문서} 해당 절
5. 테스트: 새 단언이 회귀를 잡는지 (roles/reviewer.md 절차의 임시 복사본에서 구현 일부를 되돌려 실패 확인)
6. 실제 실행: {커밋 시도 · hook 실행 등 실물 확인}은 임시 복사본에서. 끝나면 복사본 삭제 · 원본 git status 불변 확인

판 올림 (CHANGELOG · version) 누락은 지적하지 마. 합칠 때 한다.
{검사 명령} 직접 돌려서 결과를 근거로.
보고를 {report-path} 에 써줘: F1, F2 … 발견 사항, 파일:줄 · 문제 · 고칠 방법 · 심각도 (막음 / 고침 권장 / 사소).
없으면 '문제 없음' + 근거. 마지막 줄 merge 가능 여부. 화면에는 한 줄 요약만.
```

## 반영 지시

```text
리뷰 결과 반영 지시. 같은 worktree, push 없음. 결정 단위로 {chore:} 커밋, 각 커밋 전 {검사 명령} 통과.
F{n} ({심각도}) {파일:줄} — {문제}. → {고칠 방법}. 테스트: {단언}
…
판 올림은 하지 마. 검사 통과에 필요한 갱신은 돌려. 끝나면 보고를 {report-path} 에 다시 써줘.
```

## 이 흐름이 잡은 것 (2026-09-26, template 저장소 run 0)

- reviewer 가 runner 자기 보고로 안 나온 결함을 잡음: `--preload ./setup.ts` 의 값을 테스트 경로로 오인 (막음). 문서 3곳 누락
- 병렬 runner 둘이 모두 lock.json 을 바꿔 merge 충돌 → '공유 파일' 규칙 (판 올림은 조정자만, 충돌은 main 쪽 + 마지막 lock)
- herdr pane 화면 읽기는 줄바꿈이 깨져 grep 으로 다시 찾아야 했음 → 보고 파일
- zsh 에서 `set -- $x` 단어 분리 안 됨, `agent start --timeout` 없음 → clone.sh 로 명령 고정
