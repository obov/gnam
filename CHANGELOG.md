# Changelog

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
