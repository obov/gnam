# request — 사용자 요청 원문 · 첨부 기록

opt-in 내장 plugin `request`. 사용자 요청 원문을 별도 빈 커밋으로 남기고, 작업 커밋이 그 요청을 가리킨다.
plan 의 Goal (에이전트 해석) 과 요청 원문 (기준) 을 분리해, 의도가 반영됐는지 대조할 수 있게 한다.

## request 커밋

```text
request: <요청 요약 한 줄>

Text:
> 사용자 원문 그대로. 줄마다 '> '

Described:
<경로 없는 첨부 (붙여넣은 이미지 등) 의 내용 묘사>

Attachments:
<첨부 줄>

Refines: <이전 request hash>
```

- Text 필수. 모든 줄이 `> ` 또는 `>` 로 시작
- Described · Attachments · Refines 선택. Refines 는 같은 요청을 바꾸거나 보충할 때 이전 request 커밋을 가리킨다
- 파일 변경 없음 (빈 커밋)
- 원문은 요약 · 수정하지 않는다. 비밀값 (토큰 · 비밀번호 · 키) 만 `[REDACTED]`

기록 대상:

```text
기록    새 요구 · 요구 변경 · 사람 판단이 필요했던 질문의 답 (선택지 선택 등)
제외    진행 지시 ("진행해줘") · git 관련 대화 · 잡담
주체    에이전트가 확인 없이 기록 (agent-protocol '사용자 소통')
```

## 첨부 줄

```text
<이름>  sha256:<hex>  <위치>  [← <원래 경로>]
```

```text
위치                    언제
s3://<bucket>/<key>     저장소 밖 파일. s3 plugin 으로 올린 결과 (specs/s3.md)
<경로>@<커밋 hash>       저장소 안 추적 파일. 복사하지 않는다
<URL>                   웹 자료. sha256 생략 가능
없음                    보관 실패 (s3 plugin 비활성 · 업로드 실패 · 경로 없음)
```

- URL 외의 줄은 sha256 (64자리 소문자 hex) 필수. 위치 `없음` 이면 `← <원래 경로>` 필수
- 이름에 공백이 있으면 큰따옴표로 감싼다
- 경로 없는 첨부 (붙여넣은 이미지에 파일이 없음) 는 첨부 줄 대신 Described 에 내용을 적는다
- 보관 실패는 사용자에게 한 줄 알린다 (agent-protocol 의 git 예외)

## 연결

작업을 시작하는 커밋이 요청을 가리킨다. impl 은 Plan 으로 이어지므로 적지 않는다.

```text
대상     spec.<topic>.plan · spec.<topic>.chore · chore · refactor
필드     Request: <hash>[, <hash>]           사용자 요청에서 시작
         Request: 없음 (<발의 근거>)          에이전트 발의 (반복 예외 → 규칙 개선 등)
```

- 미구현: 대상 커밋에 Request 필드 필수
- 미구현: hash 는 이 커밋보다 먼저 있는 request 커밋. 아니면 위반
- 미구현: request plugin 을 켠 커밋 (gnam.json plugins 에 추가한 커밋) 이후만 검사

## 명령

```text
gnam run request open     어느 커밋의 Request 도 가리키지 않는 request (미착수 요청). Refines 로 대체된 요청 제외
gnam run request show <hash>   요청 · Refines 체인 · 가리키는 커밋 목록
```

- 미구현: open 출력 한 줄 = `<hash>  <요약>`. 없으면 `미착수 요청 없음` · exit 0
- 미구현: show 출력 = 요청 제목 · Refines 체인 (오래된 것부터) · 가리키는 커밋 `<hash>  <제목>`

## 범위 밖

- Deferred: 요청 원문 자동 수집 (하네스 hook). 지금은 에이전트가 기록
- Deferred: 첨부 내용의 민감 정보 자동 검사 (이미지 OCR 등)
