# specs — 현재 상태

이 디렉터리는 **합의된 요구사항**만 설명한다. 미구현은 `미구현:`, 합의 전은 `미결:` 로 표기한다.
왜 이렇게 됐는지는 git history 가 답한다 (`.agents/skills/gnam/references/index.md`).

```text
<파일명>.md  <한 줄 설명>
```

## 커밋

제목 접두 `spec.<topic>.<kind>:` 의 `<topic>` = 이 디렉터리의 파일 이름 (확장자 제외).

```text
spec.<topic>.plan:    spec 파일 하나 변경 (없으면 --allow-empty) + 본문 Goal · Plan · Blocking (· Scope · Decisions expected · Risks · Open)
spec.<topic>.impl:    본문 첫 줄 Plan: <plan 커밋 hash> <단계>
spec.<topic>.chore:   계획 없는 spec 정리. 본문 Goal · Scope
chore:                spec 과 무관한 변경 (의존성 · 설정 · 도구)
refactor:             동작 유지 · 구조만 변경. 본문 Goal · Scope · Invariant. specs/ 변경 금지
```

상세: `.agents/skills/gnam/references/commits/`
