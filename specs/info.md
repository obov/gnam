# info — gnam status: 작업 기록 상태 요약 · 데이터 조회

`gnam status` 는 gnam 이 저장소에 세팅한 정보 (설치 · gnam.json · plugin · 커밋 종류 · 검사 규칙 · 설치 상태) 와 기록의 연결 (요청 → plan → impl → spec) 을 낸다.
인자 없이는 세션 시작용 요약, 경로 · 출력 옵션을 주면 같은 정보를 JSON 트리에서 골라 원하는 형식으로 stdout 에 낸다.
`git status` 는 작업 트리 상태, `gnam status` 는 작업 기록 상태. 세션 시작은 둘을 함께 실행한다. plugin 은 자기 데이터 · 검색 결과 · 출력 형식을 같은 트리와 출력 계층에 더한다.

git 과 나눠 쓴다. status 는 git 한 번으로 안 되는 것 (커밋 간 연결 · 본문 필드 추출 · 상태 계산) 만 맡고 커밋은 hash 로 가리킨다.
원문 · diff · 줄 출처는 git (`git show <sha>` · `git log -p -- <경로>` · `git blame`) 으로 읽는다.

## 명령

```text
gnam status                                         요약 (사람 · 에이전트용 텍스트)
gnam status [<경로>…] [-C <dir>]… [--json] [--deep] [--check] [--since <rev>] [--where <조건>]… [--fields <a,b>] [--format <이름>] [--keys] [--schema]
gnam doctor                                         설치 문제 점검 (기존 출력 · exit code 유지)
gnam run <plugin> <command> [args…] --json | --format <이름> [출력 옵션]
```

- 인자 · 옵션 없으면 요약 (아래 '요약'). `--json` 이면 트리 전체 (deep 섹션 제외), 경로를 주면 그 값 (형식 기본 json)
- `--check` 만 주면 요약 출력 + problems 가 있으면 exit 3
- gnam doctor 는 status 의 problems 수집을 쓴다. 출력 · exit code 는 지금과 같다
- stdout = 결과만. 진단 · 경고는 stderr
- 키 순서 고정 (이 문서 순서, plugin 은 gnam.json plugins 순서). 같은 저장소 상태면 같은 출력

## 요약

```text
gnam 0.2.1 · plugins recall, request, s3 · 문제 없음
인계 메모  있음 · Next: request 2단계
요청       미착수 1 · 진행 2
plan       info ec9000a 3/9 · s3 3425cd1 0/6
Blocking   request 9f1c2ab B1 첨부 보관 정책
미결       specs/request.md:42
release    다음 release minor (release plugin)
```

- 첫 줄 = gnam 버전 · 활성 plugin id · `문제 없음` 또는 `문제 N` (아래에 문제 줄 `- <message>`)
- 인계 메모 줄 = 있음이면 Next: 필드 값, 없으면 `없음`
- 요청 줄 = request: 커밋이 하나라도 있을 때만. open · started 개수
- plan 줄 = 대체되지 않은 plan 중 status partial · not-started. `<topic> <sha> <impl 있는 단계>/<단계 수>`, 최근 plan 부터 최대 5개 (넘으면 `외 N`)
- Blocking 줄 = Blocking 이 남은 최신 plan 마다 항목 번호 · 내용 첫 줄
- 미결 줄 = specs/ 의 `미결:` 위치 (최대 5개, 넘으면 `외 N`)
- 미구현: plugin 줄 = plugin 이 낸 summary 줄 (아래 'plugin 확장'). 그 plugin 순서대로
- 해당 내용이 없는 줄은 생략 (첫 줄 · 인계 메모 줄 제외)

## 트리

```text
schema     출력 구조 판 (정수). 키 제거 · 의미 변경 때만 올린다. 키 추가는 그대로
gnam       version · root (설치 위치) · source (package | checkout) · format (지원 판)
project    저장소 루트 절대 경로
config     path · raw (gnam.json 원문, 없거나 깨지면 null) · effective (plugin 기본값을 합친 값)
plugins    id → plugin 객체 (아래)
builtins   내장 plugin 전부. id · active · requires
kinds      활성 커밋 종류. label · subject (정규식 원문) · owner (core | plugin id)
rules      검사 규칙. id · owner · why
install    hooks (hooksPath · expected · commitMsg 파일 유무) · skills (dir · name · target · ok)
           · agentsMd (exists · inSync) · claudeMd (exists · importsAgents)
problems   source (config | install | plugin:<id>) · message. doctor 와 같은 내용을 구조화
handoff    path · exists · content (없으면 null) · modifiedAt (파일 변경 시각 ISO 8601, 없으면 null)
env        node · bun · git 버전 (없으면 null) · ci · gitDir · commonDir · worktree · branch
trace      기록의 연결. 아래 'trace'
```

plugin 객체:

```text
spec · kind (builtin | local | package) · version · root · requires
kinds        이 plugin 의 커밋 종류 (label · subject)
commands     name · describe · json (구조화 결과 제공 여부)
formats      이 plugin 이 더한 출력 형식 이름
skills       스킬 이름
agentsMd     AGENTS.md 조각 유무
scaffold     만드는 파일 경로
configProblems  gnam.json 의 이 plugin 설정 문제
error        로드 실패 메시지. 실패하면 이 키와 spec · kind 만
sections     plugin 이 더한 섹션 (아래 'plugin 확장')
```

- gnam.json 이 없거나 깨져도 exit 0. config.raw = null, 원인은 problems
- plugin 로드 실패 · requires 누락도 exit 0. 해당 plugin 객체의 error 와 problems
- 미구현: deep 으로 표시한 plugin 섹션은 `--deep` 이거나 경로로 직접 고를 때만 계산
- 고른 경로에 필요한 섹션만 계산한다 (`gnam status gnam.version` 은 trace · plugin 섹션을 읽지 않는다)

## trace

에이전트가 요청 의도 · 반영 여부를 분석하고 개선안 · 후속 작업을 제안할 때 쓰는 입력. gnam.json 검사 경계 이후 HEAD 에서 도달 가능한 커밋 기준.

```text
trace.head        HEAD sha (없으면 null). 다음 --since 에 넘길 값
trace.since       --since 로 준 rev 의 sha (없으면 null)
trace.boundary    검사 경계 커밋 sha · subject (없으면 null)
trace.requests    request: 커밋. sha · subject · refines · refinedBy · by (Request: 로 가리킨 커밋 sha) · status (open | started | refined)
trace.topics      topic → { path · exists · unimplemented · open (각 line · text) · plans · chores }
trace.agent       Request: 없음 (<근거>) 커밋. sha · subject · reason
trace.items       미해결 후보. kind (remaining | deferred | open | risk | blocking) · text · sha (출처 커밋)
trace.decisions   사람 결정이 필요한 것. 근거별로 나눈다
  blocking        대체되지 않은 plan 의 Blocking 항목. topic · plan (sha) · id (B1 …, 번호 없으면 null) · text
  open            specs/ 의 미결:. path · line · text · introducedBy (그 줄을 넣은 커밋 sha, 미커밋이면 null)
```

plan 객체 (trace.topics.<topic>.plans, 오래된 것부터):

```text
sha · subject · requests (Request: hash 목록, 없음이면 [])
supersedes · supersededBy · dropped (Dropped: 줄)
blocking    Blocking 항목 (없음이면 [])
decisionsExpected · risks · open   본문 필드의 항목 (D · R 번호 유지)
steps       n · title · done (완료: 줄) · impls (그 단계를 Plan: 으로 가리킨 impl sha 목록)
status      superseded | done (모든 단계에 impl) | partial | not-started
impls       sha · subject · step · deviation · decisions · remaining · deferred (본문 필드 원문, 없으면 null)
```

- chores = 그 topic 의 spec.<topic>.chore 커밋 sha · subject · requests. topic 없는 chore · refactor 는 trace.topics."" 아래
- Topics: 로 여러 topic 을 묶은 수집 plan 은 각 topic 의 plans 에 모두 나타난다
- 본문 필드 = 줄 머리 `<이름>:` 부터 다음 필드 머리 전까지. 값은 앞뒤 공백을 뺀 원문
- items 의 해결 여부는 판정하지 않는다 (연결 필드가 없음). 출처 sha 만 준다
- request plugin 이 꺼져 있어도 request: 커밋 · Request: 필드가 있으면 읽는다
- items 는 모든 plan · impl 본문의 출처 기록, decisions 는 지금 결정이 필요한 것만 (대체된 plan 의 Blocking 제외 · spec 의 미결: 포함)
- decisions.open 의 introducedBy = 그 줄의 git blame 커밋

### --since

HEAD 가 바뀔 때마다 바뀐 부분만 읽는 호출자용 (`trace.head` 를 저장했다가 다음 호출에 넘긴다).

- `--since <rev>` = rev..HEAD 에 생긴 것만 trace 에 남긴다. requests · plans · impls · chores · agent · items 는 sha 가 범위 안인 것, 범위 안 impl 이 가리키는 plan 은 함께
- plan status · steps · supersededBy 는 범위와 무관하게 전체 history 로 계산
- decisions.blocking 은 범위 안 plan, decisions.open 은 introducedBy 가 범위 안이거나 null (미커밋)
- topics 는 범위 안 항목이 있는 topic 만. unimplemented · open 은 그대로 (현재 상태)
- rev 가 없거나 HEAD 의 조상이 아니면 (history 재작성) stderr 에 이유 · exit 1. 호출자는 --since 없이 다시 읽는다
- --since 는 trace 를 고를 때만 의미. 요약 · 다른 섹션에는 영향 없음

## 세션 시작

- 미구현: AGENTS.md 템플릿 · agent-protocol 시작 절차 = `git status` + `npx gnam status`. 인계 메모 · 최근 커밋 · specs 목록 개별 명령은 필요할 때만

## 고르기

```text
경로         점 구분. 배열은 숫자 인덱스. 예: gnam.version · plugins.recall.commands · kinds.0.label
경로 하나     그 값
경로 여럿     { "<경로>": 값, … }
--where      배열 원소 · 객체 값 거르기. key=value · key!=value. 여러 개 = AND. key 는 점 경로. 값은 JSON 스칼라의 문자열 표현과 비교
--fields     배열 원소 · 객체 값에서 고른 키만. 점 경로 허용
-C <dir>     그 저장소를 조회. 여러 번 = { "<루트 절대 경로>": 결과, … }
```

- 처리 순서 = 수집 → 경로 → --where → --fields → 형식
- 없는 경로 = stderr 에 경로 · exit 2

## 형식

```text
json      (--json · 경로 지정 시 기본) 2칸 들여쓰기 + 줄바꿈 끝
compact   한 줄 JSON
ndjson    배열이면 원소마다 한 줄, 객체면 { "key": …, "value": … } 한 줄씩, 스칼라는 한 줄
raw       문자열은 따옴표 없이, 숫자 · 불리언은 그대로, null 은 빈 줄, 배열 · 객체는 compact. 셸 변수용
env       스칼라 잎마다 GNAM_<경로 대문자, 구분자 _>=<셸 인용 값>. eval 용
text      사람용 들여쓰기 트리 (key: value)
<plugin>  plugin 이 더한 형식
```

- `--keys` = 고른 값 아래 모든 잎 경로 목록 (배열 형식 출력)
- 미구현: `--schema` = 고른 값의 JSON Schema (core + plugin 이 낸 schema 합성)
- `--check` = problems 가 비어 있지 않으면 exit 3 (출력은 그대로)

## exit code

```text
0   정상
1   사용 오류 (모르는 옵션 · 형식 · 잘못된 조건)
2   없는 경로
3   --check 에서 problems 있음
```

## plugin 확장

plugin 은 `definePlugin` 에 아래를 더해 자기 상태 · 데이터 · 검색 · 출력 형식을 함께 세팅한다. plugin 을 추가하면 요약 · 트리 · `--keys` · `--schema` · `--format` 에 그대로 나타난다.

```text
status.sections  섹션 이름 → { describe · deep? · schema? · collect(ctx) }   → plugins.<id>.sections.<섹션>
status.summary   (ctx) → 요약에 넣을 줄 목록 (빈 목록이면 생략)
commands.data  명령의 구조화 결과 (args, ctx) → JSON 값. 있으면 gnam run … --json · --format 이 이 값을 출력 계층에 넘긴다
commands.schema  data 결과의 JSON Schema
formats        이름 → { describe · render(value, ctx) → 문자열 }. status · run 공통 --format <이름>
configDefaults gnam.json 의 이 plugin 설정 기본값 → config.effective.<id>
rules          이 plugin 의 검사 규칙 id · why → rules
```

- 미구현: ctx = cwd · config · 활성 plugin 목록
- 미구현: 형식 이름이 core 형식 · 다른 plugin 형식과 겹치면 plugin 로드 오류 (problems)
- 미구현: collect · summary · data 가 던진 오류는 그 섹션 값 null + problems (트리 전체는 계속)
- 미구현: data 없는 명령에 --json · --format = 사용 오류 (exit 1)

내장 plugin:

```text
recall        search 명령 data = [{ ref · kind · title · score · supersededBy }]
lore          sections.entries = lore/README.md 인덱스의 [{ file · summary }]
release       summary = 대상별 다음 release 수준 (release status 와 같은 계산)
multi-agent   summary = 진행 중 run 수 · 판단 필요 노드 수. sections.runs = 위임 상태 트리 (multi-agent status 와 같은 데이터)
```

## 프로그래밍 API

- 미구현: `import { status } from "@obov/gnam/status"`. `status({ cwd, paths?, deep? })` → CLI 와 같은 트리 (형식 적용 전 값)

## 범위 밖

- Deferred: jq 수준 식 (계산 · 변환 · 정렬). 필요하면 `| jq`
- Deferred: 원격 조회 (npm 최신 버전 비교). 네트워크 없이 같은 출력 유지
- Deferred: 기존 명령 (`plugin list` · `doctor` · `verify`) 의 --json. 같은 데이터는 status 경로로 꺼낸다
- Deferred: 미해결 항목 번호 · Resolves 연결과 해결 여부 판정
- Deferred: 커밋 diff · 전체 본문 포함. git 으로 읽는다
