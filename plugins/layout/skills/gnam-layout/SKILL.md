---
name: gnam-layout
description: 폴더 구조 선언 (.gnam/layout.json) 의 작성 · 조회 · 위반 처리. 새 파일 · 폴더를 만들기 전 위치를 확인할 때, 작업 중 폴더 구조를 정해 두고 싶을 때, 커밋 출력에 GNAM/layout/* 가 나왔을 때 사용한다.
---

# gnam-layout

- 형식 · 검사 · 위반 처리: [layout](references/layout.md)
- 명령: `npx gnam run layout where <경로>` · `check [<경로>…]` · `show` · `capture <폴더>`
- 검사: commit-msg hook (부모 대비 새 위반) · `npx gnam verify` (layout/unlisted · existence · recursion · schema, commit/layout-files · layout-goal)
