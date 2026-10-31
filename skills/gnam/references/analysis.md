---
type: Protocol
title: 기록 분석
description: gnam status trace 와 git 으로 요청 의도 · 반영 여부를 분석하고 개선안 · 후속 작업을 제안하는 절차
tags: [gnam, analysis, status]
---

# 기록 분석

gnam 기록으로 "사용자가 원한 것이 제대로 반영됐는가" 를 확인하고, 개선안 · 후속 작업을 제안한다.
역할 분담: `gnam status trace` 는 커밋 간 연결 · 본문 필드 · 상태 (sha 로 가리킴), git 은 원문 · diff · 줄 출처.

## 절차

```text
1. 연결 파악     npx gnam status trace --format text   (범위를 좁히면 trace.topics.<topic> · trace.requests)
2. 원문 확인     요청 원문 git show <request sha> · plan 의도 git show <plan sha>
3. 대조          요청 Text ↔ plan Goal · 단계 ↔ impl Deviation · spec 미구현: · 코드 · 테스트
4. 판단 필요     trace.decisions (Blocking · 미결:) 은 사람에게 묻는 항목
5. 제안          아래 '제안 입력' 에서 근거 sha 와 함께
```

git 으로 넘어가는 기준: trace 값이 요약 (필드 원문 · 단계 제목) 이라 판단이 서지 않을 때, diff · 테스트로 실제 동작을 확인해야 할 때, 경계 (trace.boundary) 이전 기록이 필요할 때.

## 확인할 것

```text
의도 누락       요청 Text 에 있는데 어느 plan Goal · 단계에도 없음
해석 차이       plan Goal 이 요청과 다른 범위 · 다른 우선순위
계획 이탈       impl deviation 이 요청 의도와 충돌
미완료          plan status partial · not-started, spec 미구현:
대체 누락       request status refined 인데 보충 요청 (refinedBy) 을 가리키는 작업 없음
근거 없는 작업   trace.agent (Request: 없음) 가 요청 범위를 넘음
```

## 제안 입력

```text
trace.requests  status open            미착수 요청 → 착수 제안
trace.items     remaining · deferred    미룬 일 → 후속 작업
trace.items     risk · open             남은 위험 · 범위 밖 미결 → 개선안
trace.decisions                         사람 결정 필요 → 질문 (선택지와 함께)
같은 원인의 chore · deviation 반복         규칙 · plugin 개선 (agent-protocol '반복 예외 → 규칙 개선')
```

제안은 근거 (sha · spec 위치) 와 함께, 요청 의도 기준으로 우선순위를 붙인다. 사용자에게는 무엇이 반영됐고 무엇이 남았는지를 요구사항 언어로 보고한다 (git 용어 · 커밋 목록은 요청 시만).

## 바뀐 부분만 (반복 호출)

```bash
npx gnam status trace.head --format raw              # 저장
npx gnam status trace --since <저장한 head>          # 다음 호출: 그 뒤 생긴 요청 · plan · impl · 미해결 · 결정
```

`--since` 가 exit 1 이면 (history 재작성) `--since` 없이 다시 읽는다.
