# Changelog

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
