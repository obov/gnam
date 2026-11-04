# specs — 현재 상태

이 디렉터리는 **합의된 요구사항**만 설명한다. 미구현은 `미구현:`, 합의 전은 `미결:` 로 표기한다.
왜 이렇게 됐는지는 git history 가 답한다 (`.agents/skills/gnam/references/index.md`).

```text
<파일명>.md  <한 줄 설명>
```

spec 파일 첫 줄은 해결하는 기능, 다음 문단 첫 줄은 해결하는 문제 (사람용, 각 한 줄. 구현 용어 대신 사람이 겪는 일을 쓴다).

```text
# <topic> — <사람용 한 줄 설명>              gnam status 의 trace.topics.<topic>.summary

문제: <이 기능이 없으면 사람이 겪는 불편>     trace.topics.<topic>.problem (문제 줄 뒤는 빈 줄, 본문은 그 다음 문단부터)
```

## 커밋

제목 scope · trailer `Gnam: spec.<topic>.<kind>` 의 `<topic>` = 이 디렉터리의 파일 이름 (확장자 제외).

```text
docs(<topic>)        Gnam: spec.<topic>.plan   spec 파일 하나 변경 (없으면 --allow-empty). 본문 Goal · Plan (· Scope · Decisions expected · Risks · Open), trailer Summary · Blocking
feat|fix(<topic>)    Gnam: spec.<topic>.impl   trailer Plan: <plan 커밋 hash> <단계>
docs(<topic>)        Gnam: spec.<topic>.chore  계획 없는 spec 정리. 본문 Goal · Scope
fix · chore · …      (Gnam 없음)               spec 과 무관한 변경 (의존성 · 설정 · 도구 · spec 에 없는 동작의 버그). specs/ 변경 금지
refactor:            (Gnam 없음)               동작 유지 · 구조만 변경. 본문 Goal · Scope · Invariant. specs/ 변경 금지
```

format 1 저장소: 제목 접두 `spec.<topic>.<kind>:` · `chore:` · `refactor:`.

상세: `.agents/skills/gnam/references/commits/`
