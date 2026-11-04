# human-summary — 사람이 한 줄로 읽는 plan · spec 설명

문제: 에이전트 기록은 길고 전문 용어가 많아, 사람이 계획 · 기능마다 무엇을 하려는지 한눈에 알 수 없다

에이전트용 기록 (Goal · Plan · 단계) 은 정확하지만 길고 구현 용어가 많다. 사람이 한눈에 "이 계획이 무엇을 하려는지" 를 읽도록
plan 커밋마다 사람용 한 줄 `Summary:` 를 남기고, spec 파일 첫 줄에 사람용 한 줄 설명, 그 다음 줄에 해결하는 문제를 둔다. `gnam status` 는 셋을 그대로 낸다.

## plan 커밋 Summary

```text
Summary:   plan 본문 필드. 한 줄 (같은 줄에 값, 다음 필드 전까지 줄바꿈 없음). 120자 이하
대상       spec.<topic>.plan (수집 plan 포함)
내용       이 계획이 끝나면 사용자 · 사용하는 사람에게 무엇이 달라지는가. 파일 · 함수 · 내부 용어 대신 결과를 쓴다
```

```text
나쁨  Summary: packages/concierge 에 agent-loader WebSocket 클라이언트 추가, migration v7
좋음  Summary: 앱 대화 상대를 맥미니의 격리된 agent 로 바꾸고, 대화마다 현재 상태를 함께 보여 준다
```

Goal 은 그대로 남는다 (구현자가 읽는 완료 조건의 근거). Summary 는 Goal 을 대신하지 않는다.

## 검사

규칙 `commit/plan-summary`. 도입 전 history 는 면제한다.

```text
gnam commit-msg              항상 검사
gnam verify --range · --push 항상 검사 (새 커밋 범위)
gnam verify (전체 history)   조상 중 Summary: 가 있는 plan 커밋이 있을 때만 검사. 그보다 앞선 plan 은 면제
```

위반:

```text
Summary: 없음
Summary: 값이 빈 줄
Summary: 다음 줄에 이어지는 내용 (한 줄 아님)
120자 초과
```

## spec 첫 줄

```text
# <topic> — <사람용 한 줄 설명>
```

- 구분자 `—` (권장) · `:` · `-` 를 읽는다. 구분자 뒤가 설명. 제목이 topic 이름뿐이면 설명 없음
- 검사하지 않는다 (spec 파일 형식 검사 없음). `specs/README.md` 템플릿과 plan 규약 문서에 적는다

## spec 문제 줄

```text
문제:   spec 첫 줄 바로 다음 문단의 첫 줄. 한 줄 (같은 줄에 값). 120자 이하
내용    이 topic 이 없으면 사람이 겪는 문제. 해결 방법 · 구현 용어 대신 겪는 불편을 쓴다
```

```text
나쁨  문제: trace.ts 가 format 2 trailer 를 읽지 못함
좋음  문제: 표준 릴리스 도구가 gnam 커밋을 읽지 못해 버전 · 변경 기록을 손으로 만든다
```

- 첫 줄 설명 (해결하는 기능) 과 짝. 사람용 화면은 '문제 → 첫 줄 설명' 순서로 읽는다
- 검사하지 않는다 (첫 줄과 같음). `specs/README.md` 템플릿과 plan 규약 문서에 적는다

## gnam status

```text
trace.topics.<topic>.summary          spec 첫 줄 설명 (없으면 null)
trace.topics.<topic>.problem          spec 문제 줄 값 (없으면 null)
trace.topics.<topic>.plans[].summary  plan 의 Summary: 값 (없으면 null)
```

- `--since` 와 무관하게 현재 spec 파일 · 해당 plan 본문에서 읽는다
- 스키마 (`--schema`) 에 세 키 추가. schema 판은 그대로 (키 추가)

## 이전

CHANGELOG 이전 항목: 업그레이드 뒤 새 plan 커밋은 `Summary:` 필수. 기존 plan 은 고치지 않는다 (면제).
