---
type: Protocol
title: request — 사용자 요청 기록
description: 요청 원문 · 첨부를 request 빈 커밋으로 남기고 작업 커밋이 Request 로 가리키는 절차
tags: [gnam, request]
---

# request — 사용자 요청 기록

요청 원문은 의도 대조의 기준이다. plan Goal 은 에이전트의 해석이므로 원문과 분리해 남긴다.
요구사항 원본: `specs/request.md` (gnam 저장소).

## 언제 기록하나

```text
기록    새 요구 · 요구 변경 · 사람 판단이 필요했던 질문의 답 (선택지 선택 등)
제외    진행 지시 ("진행해줘") · git 관련 대화 · 잡담
시점    그 요청으로 첫 작업 커밋 (plan · chore) 을 쓰기 전
확인    사용자에게 묻지 않는다 (agent-protocol '사용자 소통')
```

한 메시지에 요구가 여럿이면 request 하나에 원문 전체를 남기고 작업 커밋들이 같은 hash 를 가리킨다.
같은 요구를 바꾸거나 보충하는 메시지는 새 request 에 `Refines: <이전 request>`.

## 형식

```text
request: <요청 요약 한 줄>

Text:
> 원문 그대로. 원문 안 빈 줄은 '>' 한 글자
> 비밀값 (토큰 · 비밀번호 · 키) 만 [REDACTED]

Described:
<경로 없는 첨부의 내용 묘사>

Attachments:
<이름>  sha256:<hex>  <위치>  [← <원래 경로>]

Refines: <이전 request hash>
```

```bash
git commit --allow-empty -F <메시지 파일>
```

## 첨부

```text
저장소 안 추적 파일     <경로>@<현재 HEAD 짧은 hash>. sha256 = shasum -a 256 <파일>
저장소 밖 파일          s3 plugin 활성이면 npx gnam run s3 put <파일> 출력 줄을 그대로
                       비활성 · 실패면 위치 '없음' + ← <원래 경로>, 사용자에게 한 줄 알림
웹 자료                <이름>  <URL>
붙여넣은 이미지 (파일 없음)  첨부 줄 대신 Described: 에 보이는 내용 (화면 · 문구 · 수치)
```

이름에 공백이 있으면 큰따옴표. 구분은 공백 두 칸 이상.

## 연결

```text
plan · spec chore · chore · refactor   Request: <hash>[, <hash>]
에이전트 발의                           Request: 없음 (<근거>)   예: 반복 chore 3회 → 규칙 개선
impl                                   적지 않는다 (Plan: 으로 이어짐)
```

## 조회

```bash
npx gnam run request open            # 미착수 요청. 후속 작업 제안의 입력
npx gnam run request show <hash>     # 요청 · Refines 체인 · 가리키는 커밋
git log --oneline --grep '^request: '
git log --oneline --grep '^Request: .*<hash>'
```
