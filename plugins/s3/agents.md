### s3 (첨부 보관)

```text
올리기      npx gnam run s3 put <file…> → 출력 줄을 request 커밋 Attachments: 에 그대로
꺼내기      npx gnam run s3 get sha256:<hex> [-o <path>] · url <ref> [--expires <초>] (사용자에게 보여줄 임시 링크)
확인        npx gnam run s3 check [<rev 범위>]
설정        gnam.json s3 { endpoint · bucket · region · prefix · pathStyle · maxBytes }. 자격은 환경 변수 GNAM_S3_ACCESS_KEY_ID · GNAM_S3_SECRET_ACCESS_KEY
규약        .agents/skills/gnam-s3/references/s3.md
```
