# Changelog

## Unreleased

- trace 단계 (specs/info.md): plan Plan: 절의 단계 줄 `S1 제목` · `S1. 제목` 과 impl `Plan: <hash>` 의 단계 참조 `S3` · `S1-S3` · `S1-3` · `S3a` (단계 3) 를 숫자 단계와 같게 읽는다. S 번호로 기록한 저장소의 plan 이 0/0 대신 실제 진행 n/m · status 를 낸다
- spec 문제 줄 (specs/human-summary.md): spec 첫 줄 (`# <topic> — <해결하는 기능>`) 다음 문단 첫 줄 `문제: <사람이 겪는 문제>`. 검사 없음. `templates/specs-README.md` · plan 규약 문서에 형식
- `gnam status` trace: `topics.<topic>.problem` (문제 줄 값, 없으면 null). `--schema` 에 키 추가 (schema 판 그대로)

## 0.8.0

- 커밋 형식 format 2 (specs/commit-format.md): 제목 Conventional Commits (`<type>(<topic>)[!]: …`), gnam 종류 · 한 줄 필드는 메시지 끝 trailer (`Gnam: spec.<topic>.<plan|impl|chore>` · `Summary` · `Blocking` · `Plan` …). release-please · semantic-release · commitlint 같은 표준 도구가 history 를 그대로 읽는다. `gnam init` 기본값 format 2, 기존 format 1 저장소는 그대로 동작
- format 2 검사: `commit/gnam-scope` · `gnam-type` · `impl-type` (plan Breaking = `!`, 릴리스 전 새 spec 합의 = `feat`) · `feat-plan` · `chore-scope` · `chore-spec` · `trailer-field` · `body-markup`
- 판이 섞인 history: status · trace · plugin 조회가 두 판을 모두 읽는다. trace 는 판 올림 이전 기록도 읽는다
- status `kinds[].trailer` (format 2 Gnam: 정규식)
- `gnam outdated` · link 이전 안내가 release-please 형식 CHANGELOG (`## [<version>](…)`, BREAKING CHANGES 절의 `이전:` 줄) 를 읽는다
- format 2 + release plugin = 설정 오류 (format 2 는 release-please)

## 0.7.0

- 내장 plugin `export` (specs/export.md): gnam.json `export.targets` 의 하위 폴더 (+ `include` 파일) 를 배포 전용 저장소로 내보낸다. `gnam run export build` = 로컬 `gnam/export/<id>` 에 `Export-Source` · `Export-Target` trailer 배포 커밋 (변경 없으면 생략), `push` = force 없이 push · version 파일 값 태그, `status` = 마지막 내보낸 원본 · 미반영 커밋 수. 검사 `export/target-missing` · `export/version-format`, status `plugins.export.sections.targets`
- release: export 를 함께 켜면 export version 파일 변경은 `release: export:<id> <version>` 커밋에서만 (`commit/version-outside`). `Package: export:<id>` 절 = 배포 저장소 주석 태그 메시지. `release publish` 는 export 항목을 건너뛴다

## 0.6.0

- 내장 plugin `layout` (specs/layout.md): `.gnam/layout.json` 에 폴더 구조를 선언 (eslint-plugin-project-structure folder-structure 호환 부분 집합: structure · rules · ruleId · enforceExistence · 재귀 · regexParameters · ignorePatterns · structureRoot). commit-msg 는 부모 대비 새 위반만 경고, gnam.json `layout.enforce: "block"` 이면 거부. `layout:` 커밋 (layout.json 만 · 본문 Goal). `gnam run layout where · check · show · capture`, status `plugins.layout.sections.rules` (탭) · `violations`
- 위반 등급: plugin 위반 `level: "warn"` 은 출력만 하고 commit-msg · verify 를 실패시키지 않는다 (`GNAM/<rule> (warn)`)
- plugin 계약: `GnamPlugin.layout` (layout 규칙 · 파라미터 제공), `CommitContext.active` (활성 plugin 객체), `verify` 4번째 인자 plugins

## 0.5.0

- plan 커밋 본문 `Summary:` 필수 (사람용 한 줄, 120자 이하, 규칙 `commit/plan-summary`). commit-msg · `verify --range` · `--push` 는 항상, 전체 `verify` 는 첫 Summary plan 이후만 검사 (도입 전 plan 면제)
- `gnam status` trace: `topics.<topic>.summary` (spec 첫 줄 `# <topic> — <설명>`) · `plans[].summary`
- 탭 정의 (specs/view.md): gnam.json `view.tabs` · plugin 섹션 `view` → `gnam status` 최상위 `views`. 잘못된 정의는 `problems` (커밋 검사 영향 없음). 내장 lore `entries` · multi-agent `runs` 탭
- 이전: 새 plan 커밋에 'Summary: <이 계획이 끝나면 사용하는 사람에게 무엇이 달라지는가>' 한 줄을 쓴다. 기존 plan 은 고치지 않는다. npx gnam sync 로 AGENTS.md 블록 갱신

## 0.4.0

- 내장 plugin `multirun`: 착수 가능한 plan 하나를 N 개 clone 에서 변형 agent 가 각자 구현. 변형 커밋은 원본 tag `multirun/<run-id>/vN/…` 로 보존, 요약 세션이 `multirun.<topic>.report` 로 비교, 결정 커밋 `Multirun: <report> <vN|combine|discard>`. `gnam run multirun start · sync · status · collect · open · close · abort`
- 내장 plugin `harness`: harness-execute 스킬을 multi-agent 에서 분리. multi-agent 는 harness 를 요구
- plugin 스킬 의존 (`skillDeps`): GitHub 스킬을 commit · 내용 해시로 잠가 `.gnam/skills/<name>/` 에 받아 링크 (`gnam.json` `skills`). `gnam skill list · update · verify`
- `gnam outdated`: npm 최신 버전 · 업그레이드 명령 · 그 사이 이전 항목. 업그레이드 후 `gnam link` 가 건너온 버전의 이전 항목을 한 번 출력. CHANGELOG.md 를 패키지에 포함
- 이전: multi-agent 를 쓰는 저장소는 npx gnam plugin add harness

## 0.3.2

- multi-agent: claude 시작 인자를 파일로 변경. 프로젝트 `.gnam/claude-args` > 전역 `~/.config/gnam/claude-args` > 기본값. 평소 쓰는 `claude …` 명령을 붙여넣을 수 있음. `harness-execute/claude-args.sh init|source|--json`. 파일이 없으면 동작 동일

## 0.3.1

- 0.3.0 과 같은 기능. 0.3.0 태그는 CI 환경에서 테스트 하나가 실패해 배포되지 않음 (테스트만 수정)

## 0.3.0

- `gnam status`: 인자 없이 세션 시작 요약 (설치 · 문제 · 인계 메모 · 요청 · plan 진행 · Blocking · 미결 · plugin 상태). 경로 · `--json` 이면 JSON 트리 (schema · gnam · config · plugins · kinds · rules · install · problems · handoff · env · trace)
- 출력 계층: 경로 선택 · `--where` · `--fields` · `--keys` · `--schema` · 형식 json · compact · ndjson · raw · env · text · `-C` 여러 저장소 · `--check` (exit 3)
- trace: 요청 → plan → 단계별 impl → spec 연결, plan 상태, 미해결 후보, 결정 필요 (Blocking · 미결: 도입 커밋), `--since <rev>` 바뀐 부분만
- plugin 확장점: status 섹션 · 요약 줄 · 출력 형식 · 명령 구조화 결과 (`gnam run … --json`) · 설정 기본값 · 규칙 메타
- 내장 plugin `request`: 사용자 요청 원문 · 첨부를 `request:` 빈 커밋으로, 작업 커밋 `Request:` 검사, `open` · `show`
- 내장 plugin `s3`: 첨부를 S3 호환 저장소에 sha256 key 로 보관 (`put` · `get` · `url` · `check`), 런타임 의존성 없는 SigV4
- 프로그래밍 API `@obov/gnam/status`. 시작 절차 = `git status` + `npx gnam status`. 기록 분석 절차 문서 (analysis.md)
- doctor: plugin 로드 실패를 오류 종료 대신 문제 줄로

## 0.2.1

- 에이전트 자율 진행: 커밋 · 다음 plan 착수는 사용자 확인 없이 진행. 질문은 요구사항 판단 · git 예외만 (AGENTS.md 블록 · agent-protocol '사용자 소통')
- 반복 예외 → 규칙 개선: 같은 원인 chore 3회 이상이면 plugin 개선 · 신규 검토

## 0.2.0

- 내장 plugin `recall`: `gnam run recall search <query…> [--limit N]`. 커밋 · `specs/` 절 · `lore/` 항목 BM25 검색, 한글은 문자 bigram (형태소 분석기 · 모델 없음)

## 0.1.0

- template 저장소 `.claude/skills/gnam` 에서 독립 패키지로 분리
- 코어: chore · refactor · spec.<topic>.plan|impl|chore, commit-msg hook, verify, init · sync · link · doctor
- plugin 체계 (내장 · 로컬 · npm). 내장 lore · merge · run · release · ept · multi-agent
- 검사 경계: template lock.json → gnam.json "format" 변경 커밋
- multi-agent 위임 트리: .claude/skills/multi-agent/runs → <git common dir>/gnam/runs
