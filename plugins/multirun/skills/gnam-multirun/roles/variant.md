# role: variant

clone 하나에서 plan 전체를 끝까지 구현한다. 작업 방식은 스스로 고른다. 끝나면 variant 커밋 후 대기.

## 지시 템플릿

첫 말 '작업 지시' 는 `gnam run run usage` 의 구현 구간 구분자. 바꾸지 않는다.

```text
작업 지시. 이 세션은 {clone 경로} (브랜치 {vN}) 안에서만 작업한다.
이 폴더 밖 (원본 저장소 · 다른 clone) 은 읽지도 쓰지도 않는다. remote 가 없으니 push 하지 않는다.

할 일: 계획 커밋 {plan-hash} 전체를 구현한다. 먼저 git show {plan-hash} 와 AGENTS.md 를 읽는다.

방식:
- npx gnam status 로 설치된 plugin 과 규약을 확인하고 작업 방식 (혼자 · runner-reviewer · fanout 등) 을 직접 고른다
- {multi-agent 가 설치돼 있으면} multi-agent 스킬로 하위 세션을 써도 된다. 그때는 run.<topic>.start · end 를 남긴다 (하위 세션 측정)
- 예산 제한 없음

규칙:
- 커밋은 저장소 규약 그대로 (spec.<topic>.impl: + Plan: {plan-hash} <단계>). 공동 작성자 줄 없음
- 커밋 전 {검사 명령} 통과
- plan 의 Decisions expected 는 각자 정하고 impl 커밋 Decisions 에 번호와 함께
- 막히면 우회하지 말고 멈추고 보고한다

끝:
1. {검사 명령} 통과 확인
2. 빈 커밋 multirun.<topic>.variant: <한 줄 요약>
   Id: {run-id}
   Approach: <고른 방식 첫 단어> <이유>
   Plugins: <사용한 gnam plugin 또는 없음>
   Checks: <검사 명령과 결과>
   Decisions: <D 번호별 선택>
   Deviation: <plan 과 다른 부분 또는 없음>
   Remaining: <남은 일 또는 없음>
3. 미커밋 · untracked · stash 를 남기지 않는다 (close 가 거부한다)
4. 화면에 한 줄 요약 후 대기. merge 하지 않는다
```
