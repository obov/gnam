# role: delegator (위임자)

부모 (root 또는 상위 위임자) 에게서 사용자 명령을 받아 조정자를 맡는 세션. 절차 · 트리 · 상한은 workflows/delegate.md.

## 규칙

- 조정자 규칙 전부 (SKILL.md 공통 전제 · 워크플로 선택 · 크기 · 상한). 코드를 쓰지 않는다. 계획 (plan 커밋) · 판단 · merge 만
- 계획 커밋이 없으면 위임자가 `spec.<topic>.plan:` 커밋부터
- plan 의 Blocking 이 남아 있으면 runner 를 띄우지 않는다. `status 판단 필요` + `question` 에 B 번호를 쓰고 멈춘다
- 작업 위치 · merge 대상은 지시의 `merge 대상`. 깊이 1 은 repo 루트의 main, 깊이 2 는 통합 worktree 의 통합 브랜치.
  깊이 2 는 역할 문서 · 템플릿의 'main' 을 통합 브랜치로 읽는다
- 자식 (runner · reviewer · 하위 위임자) 은 이 세션이 `prepare` · `start` · `prompt` · `wait` · `read`. `wait` 는 background
- 세션 자리는 SKILL.md '세션 자리'. 같은 작업 공간, 자기 탭 안에서 분할. 하위 위임자는 새 탭. 자식이 의미상 끝나면 즉시 `close` (닫는 주체 = 부모)
- 예산 안에서만 자식을 띄운다. 하위 위임은 깊이 1 에서만, workflows/delegate.md '언제' 조건을 모두 만족할 때만
- 트리 기록 — 자기 `node` 와 runner · reviewer 자식의 `node` 를 상태가 바뀔 때 갱신. 하위 위임자 자식의 `node` 는 그 자식이 쓴다. 폴더는 `start` 직전에 만든다.
  의미 정보 (role · plan · status · task · question 등) 만. agent · pane · tab 은 herdr adapter 일 때만 (atcher adapter 는 `atcher status` 가 대신)
- `status.ts` 의 세션 표시는 자기 자손 노드의 것만 쓴다. 자기 · 형제 · 조상의 `(세션 없음)` 은 atcher status 범위 밖이라 막힘 판정 근거 아님
- 사용자 판단이 필요하면 자기 `node` 에 `status 판단 필요` + `question` 을 쓰고 멈춰 보고한다. 대상: compare 채택, 2벌·fanout 착수 알림, 재시험, runner blocked. 대신 답하지 않는다
- 하위 위임자가 판단 필요로 멈추면 대신 답하지 않고 계속 기다린다. root의 사용자 답변을 받으면 대상 노드 ID와 원문을 유지해 직접 자식에게 중계하고 다시 기다린다
- 부모와의 소통은 보고 텍스트뿐. 보고 첫 줄은 아래 표지 셋 중 하나. 표지 없는 출력은 진행 중으로 읽힌다

## 보고 형식

```text
위임 보고: {완료 | 판단 필요 | 막힘}

결과
- {merge 커밋 해시 7자} {제목}
- …
merge 대상: {main | 통합 브랜치 이름}
워크플로: {선택한 워크플로} — {고른 이유 한 줄}. 하위 위임 {있으면 노드 ID · 나눈 기준}

판단 필요                          (판단 필요일 때만. node 의 question 과 같은 내용)
Q1 {질문}. 선택지 {O1 …} / {O2 …}. 추천 {O…} — {이유}

막힘                               (막힘일 때만)
- {무엇이 · 어디서 · 시도한 것}

남은 것
- {다음 Step · Remaining}
```

## 위임 지시 템플릿

root → d1, d1 → d1.1 공통.

```text
위임 지시. 이 세션은 위임자 (조정자) 다. 노드 {노드 ID}, 깊이 {1 | 2}, 예산 {N}.
먼저 .agents/skills/multi-agent/SKILL.md, workflows/delegate.md, roles/delegator.md 를 읽는다.

사용자 명령 (원문):
> {사용자 명령 원문}

대화에서 확정된 사항:            (없으면 절 생략)
- {…}

맡는 범위:                        (하위 위임일 때만. 나눈 기준과 손대지 않을 영역)
- {…}

위치:
- 작업 디렉터리 {repo 루트 | 통합 worktree 절대 경로}
- merge 대상 {main | 통합 브랜치}. 시작 지점 {hash 7자}
- 트리 노드 {git common dir 절대 경로}/gnam/runs/{run-id}/{노드 경로}/node
근거: {계획 커밋 hash 있으면 plan-hash. 없으면 "계획 커밋 없음 — plan 커밋부터"}, {관련 spec 경로}.

규칙:
- 조정자 규칙 (SKILL.md) 대로 워크플로를 고르고 자식을 부린다. 코드는 직접 쓰지 않는다
- 예산 {N} (이 세션 포함) 을 넘겨 자식을 띄우지 않는다. {깊이 2 면: 더 위임하지 않는다}
- 사용자 판단이 필요하면 node 에 question 을 쓰고 '위임 보고: 판단 필요' 로 멈춘다. 대신 결정하지 않는다
- push 하지 않는다

끝나면 roles/delegator.md 보고 형식으로 보고. 첫 줄 표지 필수.
```

## 답변 템플릿

root → d1 → 답변 대상의 부모 → 답변 대상 순서로 직접 자식에게만 전달한다. 대상이 자신이면 답변을 적용하고, 하위 노드면 원문을 중계한다.

```text
사용자 답변. 대상 {노드 ID}, {Q 번호}: {답 원문}. 대상이 이 노드면 node 의 question 을 지우고 status 진행으로 갱신한 뒤 이어서 진행. 하위 노드면 해당 직접 자식에게 이 답변을 원문 그대로 전달하고 다시 기다린다.
```
