# commit-format — 제목은 Conventional Commits, gnam 종류는 trailer

문제: 표준 릴리스 도구가 gnam 커밋을 읽지 못해 버전 · 변경 기록 · 배포를 손으로 만든다

커밋 제목을 Conventional Commits 1.0.0 으로 쓰고, gnam 종류 · 연결 필드는 메시지 끝 trailer 로 옮긴다.
release-please · semantic-release · git-cliff · commitlint 같은 표준 도구가 gnam 저장소의 history 를 그대로 읽는다.
spec → plan → impl 흐름과 본문 필드의 의미는 바꾸지 않는다. 바뀌는 것은 표기 위치뿐이다.

미구현: release-please 연동 (이 저장소) 의 config · manifest · workflow

## 판

```text
format 1   제목 접두 spec.<topic>.<kind>: · chore: · refactor: (기존)
format 2   이 문서. gnam init 의 기본값
```

- 판 = gnam.json `format`. 판을 바꾼 커밋이 검사 경계 (기존 boundaryOf). 경계 이전 커밋은 검사하지 않는다
- status · trace 는 gnam.json `format` 을 처음 넣은 커밋 (init) 부터 읽는다. 판 올림이 이전 기록을 가리지 않는다
- 읽기 (status · trace · history · plugin 조회) 는 커밋마다 두 판을 모두 읽는다. 판이 섞인 history 에서 plan ↔ impl 연결이 이어진다
- format 1 저장소는 그대로 동작한다. 판 올림은 사용자가 gnam.json 을 바꿔서 한다

## 메시지 구조

```text
<type>(<scope>)[!]: <설명>

<본문. 마크다운 목록 · 번호 · 코드 블록. 여러 줄 필드 (Goal: · Plan: 단계 · Scope: …)>

<trailer 단락. Key: value 줄만. 메시지의 마지막 단락>
```

- 제목: `type` = 소문자 영문. `scope` = topic (spec 종류) · 생략 (그 밖). `!` = 호환성 깨짐
- trailer: git 이 trailer 로 읽는 마지막 단락 (`git interpret-trailers --parse` 와 같은 결과). 같은 key 반복 허용
- 한 줄 값 필드는 trailer, 여러 줄 필드는 본문. 본문의 `Name:` 머리 절 형식은 format 1 과 같다
- 본문에 `#` 로 시작하는 줄 · `---` 한 줄 금지 (에디터 커밋 · amend 가 `#` 줄을 지우고, `git am` 이 `---` 에서 메시지를 자른다). commit-msg 에서만 검사

## 종류 대응

```text
gnam 종류      format 1 제목            format 2 제목                       format 2 trailer
plan           spec.<topic>.plan: …     docs(<topic>): …                    Gnam: spec.<topic>.plan
impl           spec.<topic>.impl: …     feat|fix(<topic>)[!]: …             Gnam: spec.<topic>.impl
spec chore     spec.<topic>.chore: …    docs(<topic>): …                    Gnam: spec.<topic>.chore
chore          chore: …                 fix · perf · revert · chore ·       없음
                                        build · ci · docs · test · style
refactor       refactor: …              refactor: … · refactor(<scope>): …  없음
plugin 종류    plugin 접두              plugin 이 정한 type                  Gnam: <plugin 종류> (예: run.<topic>.start · layout · request)
```

- `Gnam:` 값은 format 1 제목 접두와 같은 문자열. history 검색 키: `git log --grep '^Gnam: spec\.<topic>\.'`
- `Gnam: spec.<topic>.*` 의 topic 과 제목 scope 가 다르면 위반
- `feat` 는 `Gnam: spec.<topic>.impl` 에서만. 기능은 plan 을 먼저 쓴다 (format 1 규칙 유지)
- plugin 의 종류 등록 (plugin.ts CommitKind) 은 제목 정규식 대신 Gnam 값 정규식 · 허용 type 으로 판정한다

## chore 구분

format 1 의 `chore` 는 gnam 종류 이름이고, Conventional Commits 의 `chore` 는 type 이름이다. 둘은 범위가 다르다.

```text
이름                       판      뜻                                         릴리스 (release-please)
gnam chore                 1 · 2   spec 과 무관한 변경. Gnam: 없음             type 에 따름
spec chore                 1 · 2   spec 정리 (인덱스 · 상태표 · 표현)          없음 (docs)
CC type chore              2       gnam chore 중 릴리스와 무관한 잡일          없음
```

format 1 `chore:` 하나가 format 2 에서 type 으로 나뉜다. type 은 쓰는 사람에게 미치는 영향으로 고른다.

```text
spec 에 없는 동작의 버그 수정      fix
성능 개선 (동작 유지)              perf
되돌림                            revert
의존성 · 설정 · 도구               chore · build · ci
문서 · 테스트 · 서식               docs · test · style
```

- gnam chore 판정 (format 2) = `Gnam:` trailer 없음 · type 이 refactor 아님. status · trace 의 chores (topic "") 에 format 1 `chore:` 와 함께 모인다
- gnam chore 의 scope 는 spec topic 이름이 아니어야 한다 (`commit/chore-scope`). spec 에 정의된 동작을 고치면 impl (format 1 규칙: 그 동작을 도입한 plan 을 Plan: 으로)
- gnam chore · refactor 는 specs/ 를 바꾸지 않는다 (`commit/chore-spec`). spec 정리는 spec chore, 의미 변경은 plan
- spec chore 는 type `docs` 고정. CC type `chore` 를 쓰지 않는다 (CC chore = gnam chore 의 한 갈래로만)
- merge 커밋 제목 `chore: …` 는 format 2 에서도 그대로 (gnam chore)
- release PR 커밋 `chore: release <version>` 은 gnam chore
- request plugin 의 Request 필드 대상 (plan · spec chore · chore · refactor) 은 format 2 에서 "impl · plugin 종류가 아닌 커밋"

## trailer 필드

```text
Gnam         위 표
Summary      plan. 사람용 한 줄 (specs/human-summary.md 규칙 그대로)
Blocking     plan. 'Blocking: 없음' 또는 항목마다 'Blocking: B<n> <내용>' 반복
Plan         impl. '<plan hash> <단계>'
Topics       수집 plan. 'a, b'
Supersedes   plan. 대체하는 plan hash
Breaking     plan. 쓰는 쪽이 할 일 한 줄. release 수준 근거이고 그 자체로 릴리스를 만들지 않는다
```

- impl 의 호환성 깨짐은 표준 표기: 제목 `!` + `BREAKING CHANGE: <쓰는 쪽이 할 일>` trailer
- 수집 plan 의 `Spec:` · `From:` 은 단계 아래 들여쓴 줄 (본문, format 1 과 같음). 값이 단계마다 붙는다
- run 의 `Agent:` · `Why:` 줄은 trailer 단락에 함께 둔다 (줄 단위로 읽음)
- 그 밖의 본문 필드 (Goal · Plan 단계 · Scope · Decisions expected · Risks · Open · Intent · Implementation · Decisions · Invariant · Deferred …) 는 본문

## impl 의 type

impl 제목 type 은 gnam 이 계산한 수준 이상이어야 한다 (`commit/impl-type`). 올리는 것은 된다.

```text
major  ! + BREAKING CHANGE:   impl 이 따르는 plan 에 Breaking: 이 있음
minor  feat                   plan 이 spec 파일을 바꿨고, 그 plan 을 포함한 릴리스 태그가 아직 없음 (새 합의)
patch  fix                    그 밖 (이미 나간 동작의 수정 · 빈 plan 의 impl)
```

- 수집 plan 이면 Spec: 으로 가리킨 plan 중 가장 높은 수준
- 릴리스 태그 = `v<semver>` · `<component>-v<semver>` (release-please 기본 형식)
- 수준은 커밋 시점에 정해진다. 이후 계산 결과가 달라져도 history 를 고치지 않는다

## release-please 연동 (이 저장소)

```text
release-please-config.json      release-type node · bump-minor-pre-major true
                                pull-request-title-pattern "chore: release${component} ${version}"
.release-please-manifest.json   현재 버전
.github/workflows/release.yml   main push → release-please-action. release_created 이면 같은 job 흐름에서 npm publish (trusted publishing)
```

- `publish.yml` (태그 push 트리거) 제거. GITHUB_TOKEN 이 만든 태그는 다른 workflow 를 실행하지 않는다
- release PR 은 squash merge. 커밋 제목 `chore: release <version>` 은 gnam chore 로 검사를 통과한다
- CHANGELOG.md 는 release-please 가 갱신한다. 기존 절은 그대로 둔다

## CHANGELOG 이전 항목 (specs/upgrade.md)

- 버전 절 머리 `## <version>` 과 `## [<version>](<link>) (<date>)` 를 모두 읽는다
- 이전 항목 = 기존 `- 이전: <할 일>` 줄 · release-please 가 BREAKING CHANGES 절에 쓴 줄 중 `이전:` 을 포함한 줄 (`이전:` 뒤가 할 일)
- impl 의 `BREAKING CHANGE:` 값에 `이전: <할 일>` 을 쓰면 다음 릴리스의 CHANGELOG 에 그대로 실린다

## gnam status

- `kinds` (status.ts CORE_KINDS) 에 판별 `trailer` 키 추가. format 2 종류는 `{ label · type · trailer }`, format 1 은 `{ label · subject }` 그대로
- schema 판 그대로 (키 추가)

## 범위 밖

- format 2 에서 release plugin (`release:` 커밋) · export 의 release 절 연동. format 2 + release plugin 은 설정 오류
- 기존 history 다시 쓰기
