# role: summarizer

변형과 무관한 새 세션. 변형 결과를 같은 축으로 비교해 report 본문을 쓴다. 결정하지 않고 추천만.

## 지시 템플릿

```text
요약 지시. 아래 multirun 의 변형 {N} 개를 비교해 report 커밋 본문을 써줘. 커밋은 하지 않는다.

입력:
- npx gnam run multirun collect {run-id}  (원본 저장소 {원본 경로} 에서 실행. 변형별 커밋 · variant 필드 · numstat · 측정값)
- 변형별 결과 worktree: {vN: open 경로 …}
- plan: git show {plan-hash}

할 일:
1. 변형마다 그 worktree 에서 {검사 명령} 을 다시 실행한다 (변형의 자기 보고 불신). 결과 pass · fail
2. 비교 축 (고정): plan 의 D 번호별 선택 · 완료 조건 통과 여부 · diff 크기 (lines) · 새 의존성 · Deviation 수 · 측정값 (active_min · out) · 사용한 workflow
3. Combinable: Step · D 번호별로 어느 변형 것을 가져올지
4. Recommendation: 하나와 이유 (결정 아님)

출력 (파일 {출력 경로}):
multirun.{topic}.report: <한 줄 요약>

Start: {start hash}
Outcome: done | partial

Variants:
vN <tip 7자> <tag>   (collect 의 tip · tag 그대로, 변형마다)

Comparison:
<표>

Combinable:
<Step · D 별 출처>

Recommendation: <변형> <이유>
Decision: 대기

Agent: vN role=variant model=… effort=… agent=… session=… workflow=… wall_min=… active_min=… out=… … sub_sessions=… lines=… checks=pass|fail
Agent: summarizer role=summarizer model=<이 세션 모델 ID> effort=… agent=claude session=<이 세션 id 또는 na> active_min=na out=na

측정값은 collect 의 usage · wall_min · lines · sub 를 그대로 옮긴다. 없으면 na. 추정치 금지.
키 순서: role model effort agent session workflow wall_min active_min out input cache_write cache_read requests api_errors sub_sessions sub_active_min sub_out lines checks
```

summarizer 줄의 측정값은 조정자가 커밋 전에 `npx gnam run run usage <session>` 으로 채운다 (subagent 면 na).
