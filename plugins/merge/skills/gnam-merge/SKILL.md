---
name: gnam-merge
description: merge 커밋 (Gnam: spec.<topic>.merge, 브랜치 통합) 작성 규약. 작업 브랜치를 main 에 merge 커밋으로 통합할 때 사용한다.
---

# gnam-merge

- 형식: [merge 커밋](references/merge.md)
- 검사: merge 커밋은 `chore(<topic>): …` + `Gnam: spec.<topic>.merge` 또는 `chore: …` (commit-msg hook). format 1 제목은 `spec.<topic>.merge:`
