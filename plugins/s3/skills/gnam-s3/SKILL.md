---
name: gnam-s3
description: 요청 첨부 (이미지 · 파일) 를 S3 호환 저장소 (S3 · R2 · MinIO 등) 에 올리고 꺼낸다. 사용자가 저장소 밖 파일을 첨부해 요청할 때, 기록된 첨부를 다시 보거나 공유 링크가 필요할 때, 첨부 보관 상태를 확인할 때 사용한다.
---

# gnam-s3

- 설정 · 자격 · 첨부 절차: [s3](references/s3.md)
- 명령: `npx gnam run s3 put <file…>` · `get <ref> [-o <path>]` · `url <ref> [--expires <초>]` · `check [<rev 범위>]`
- 첨부 줄 형식 · request 커밋: `gnam-request` 스킬
