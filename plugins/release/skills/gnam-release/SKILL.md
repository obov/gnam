---
name: gnam-release
description: release 커밋으로 package 버전을 올리고 태그 · GitHub Release 를 만든다. 버전 올리기, 릴리스 수준 계산, 릴리스 노트 작성 시 사용한다.
---

# gnam-release

- 형식 · 수준 계산: [release 커밋](references/release.md)
- 설정: gnam.json `"release": { "targets": { "<dir>": "semver|calver|openapi" } }`
- 명령: `npx gnam run release status | bump [<name>[@<level|X.Y.Z>]]… | publish <before> <sha>`
- 검사: release 커밋 형식 · 버전, release 밖 version 변경 (commit-msg hook)
