---
type: Protocol
title: export — 배포 저장소 내보내기
description: 하위 폴더를 배포 전용 저장소로 내보내는 설정 · 명령 · 버전 · CI 절차와 원본 ↔ 배포 추적
tags: [gnam, export, release]
---

# export — 배포 저장소 내보내기

개발은 원본 저장소에서만. 배포 저장소 (예: `<name>-swift`) 는 원본 폴더 하나의 복사본이고 사람이 직접 커밋하지 않는다.
요구사항 원본: `specs/export.md` (gnam 저장소).

## 설정

```json
{
  "export": {
    "targets": {
      "swift": {
        "path": "swift",
        "repo": "https://github.com/acme/gentizer-swift.git",
        "include": { "conformance": "Tests/Conformance" },
        "tag": "{version}",
        "version": "swift/VERSION"
      }
    }
  }
}
```

```text
path       배포 저장소의 루트가 될 폴더
repo       https · ssh (· file). URL 에 자격 금지. 자격 = git 자격 도우미 · ssh key
branch     기본 main
include    path 밖 파일 → 배포 저장소 안 경로 (공통 테스트 케이스 등)
tag        {version} 치환 태그. SwiftPM 은 v 없는 MAJOR.MINOR.PATCH
version    저장소 루트 기준 한 줄 파일. 값 = MAJOR.MINOR.PATCH
```

## 명령

```text
npx gnam run export build <id>     원본 HEAD (커밋된 것만) → 로컬 브랜치 gnam/export/<id> 에 배포 커밋. 변경 없으면 생략
npx gnam run export push <id>      배포 저장소로 push (force 없음) · 새 버전이면 태그
npx gnam run export status [<id>]  마지막 내보낸 원본 커밋 · 미반영 커밋 수 · 버전 (네트워크 없음)
```

배포 커밋 trailer:

```text
Export-Source: <원본 저장소 URL> <원본 커밋 hash>
Export-Target: <id>
```

배포 저장소 커밋 → 원본: `git log -1 --format=%B <배포 커밋>` 의 Export-Source hash 로 원본에서 `git show <hash>`.

## 버전

- version 파일 값이 바뀌면 push 가 그 태그를 만든다. 같은 이름 태그가 배포 history 밖 커밋에 있으면 exit 1 (덮지 않음)
- release plugin 을 켠 저장소: version 파일은 `release: export:<id> <version>` 커밋에서만 바꾼다. 본문 `Package: export:<id> <version>` 절 = 배포 저장소 주석 태그 메시지
- `gnam run release bump` 는 version 파일을 바꾸지 않는다. 직접 고쳐 release 커밋에 넣는다

## CI (원본 저장소 main push)

```yaml
- uses: actions/checkout@v4
  with: { fetch-depth: 0 }          # 배포 저장소의 원본 커밋을 찾는다
- run: npx gnam run export build swift && npx gnam run export push swift
```

배포 저장소 쓰기 권한은 원본 저장소 토큰과 따로 준다 (deploy key · 자격 도우미).
새 clone 에서는 로컬 배포 브랜치가 없어도 된다: push 가 배포 저장소 끝 위에 같은 원본으로 다시 build 한다.

## 실패

```text
Export-Source 없음 (직접 커밋)     배포 저장소에 사람이 커밋함. 그 변경을 원본으로 옮기고 배포 저장소에서 되돌린다
원본 커밋이 이 저장소에 없음       shallow clone. fetch-depth: 0
더 새 원본이거나 다른 갈래          배포 저장소가 이미 더 새 원본에서 나갔다. 최신 원본에서 다시 build
export/target-missing             path · include 원본을 옮겼다. gnam.json export.targets 를 함께 고친다
export/version-format             version 파일 = MAJOR.MINOR.PATCH 한 줄
```
