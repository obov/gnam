---
name: gnam-request
description: 사용자 요청 원문 · 첨부를 request 커밋으로 기록하고 작업 커밋에 연결한다. 사용자가 새 요구 · 요구 변경 · 판단 답변을 줄 때, 이미지 · 파일을 첨부해 요청할 때, 미착수 요청이나 요청의 반영 상태를 볼 때 사용한다.
---

# gnam-request

- 기록 대상 · 형식 · 첨부 · 연결: [request](references/request.md)
- 명령: `npx gnam run request open` · `npx gnam run request show <hash>`
- 검사: commit-msg hook · `npx gnam verify` (commit/request-text · request-files · request-attachment · request-refines · request-link)
