---
name: gnam-export
description: 저장소의 하위 폴더를 배포 전용 외부 저장소 (SwiftPM 패키지 저장소 등) 로 내보내고 원본 커밋과 이어 둔다. 배포 대상 폴더 · include 파일을 바꿀 때, 배포 버전을 올릴 때, CI 에서 배포 저장소로 push 할 때, 배포 저장소 커밋이 어느 원본에서 왔는지 찾을 때 사용한다.
---

# gnam-export

- 설정 · 내보내기 · 버전 · CI: [export](references/export.md)
- 명령: `npx gnam run export build <id> [--json]` · `push <id>` · `status [<id>] [--json]`
- 검사: commit-msg hook · `npx gnam verify` (export/target-missing · export/version-format, release 를 켜면 commit/version-outside)
