# mirror — 하위 폴더를 배포용 외부 저장소로 내보내고 그 관계를 기록한다

opt-in 내장 plugin `mirror`. 개발 저장소 하나의 하위 폴더를 별도 저장소 (배포 전용, 읽기 전용) 로 내보낼 때,
어느 폴더가 어느 저장소로 가는지 · 함께 복사하는 파일 · 태그 형식을 gnam.json 에 선언하고, 내보낸 커밋을 원본 커밋과 이어 둔다.

쓰임: SwiftPM 처럼 저장소 루트 · 순수 semver 태그로만 설치되는 생태계 (예: 다언어 저장소의 `swift/` → `<name>-swift`).
경계: 외부 저장소 → 개발 저장소 방향 (가져오기 · submodule) 은 다루지 않는다. 배포 저장소에 직접 커밋하지 않는다.

## 설정

gnam.json (커밋됨):

```json
{
  "mirror": {
    "targets": {
      "swift": {
        "path": "swift",
        "repo": "https://github.com/acme/gentizer-swift.git",
        "branch": "main",
        "include": { "conformance": "Tests/Conformance" },
        "tag": "{version}",
        "version": "swift/VERSION"
      }
    }
  }
}
```

```text
targets.<id>   [a-z][a-z0-9-]*. 명령 · 커밋 trailer 에서 쓰는 이름
path           필수. 내보낼 하위 폴더 (저장소 루트 기준). 이 폴더가 배포 저장소의 루트가 된다
repo           필수. 배포 저장소 URL (https · ssh). 자격은 CI 비밀, gnam.json 에 금지
branch         기본 main
include        (선택) { <원본 경로>: <배포 저장소 안 경로> }. path 밖 파일을 함께 복사 (공통 테스트 케이스 등)
tag            (선택) 배포 저장소 태그 형식. {version} 치환. 없으면 태그를 만들지 않는다
version        tag 가 있으면 필수. 버전 한 줄 파일 (path 안 또는 저장소 루트 기준)
```

- 형식 문제 = configProblems (필수 키 · path 없음 · include 대상이 path 와 겹침 · repo 에 자격 포함 · tag 에 {version} 없음)
- 대상 id · path 가 다른 대상과 겹치면 configProblems

## 내보내기

```text
gnam run mirror build <id> [--json]    배포 트리 생성. 원본 HEAD 기준, 로컬 브랜치 gnam/mirror/<id> 에 커밋 하나 추가
gnam run mirror push <id>              build 결과를 repo · branch 로 push, 버전이 바뀌었으면 tag 도 push (CI 용)
gnam run mirror status [<id>]          대상별 마지막 내보낸 원본 커밋 · 그 뒤 path · include 변경 커밋 수 · 배포 버전
```

배포 트리 = path 의 내용 + include 복사본. 원본 기록 (path 밖) 은 배포 저장소에 넣지 않는다.
배포 커밋은 배포 브랜치의 이전 커밋 위에 쌓아 배포 저장소 history 가 앞으로만 진행한다 (force push 없음).

배포 커밋 메시지:

```text
mirror: <원본 커밋 제목>

Mirror-Source: <원본 저장소 URL> <원본 커밋 hash>
Mirror-Target: <id>
```

- 원본 → 배포 추적 = 배포 커밋 trailer. 배포 → 원본 추적은 `Mirror-Source` 로 원본 커밋을 찾는다
- 변경 없음 (배포 트리 동일) 이면 커밋 · push 생략, exit 0
- tag 는 version 파일 값이 배포 저장소에 없는 태그일 때만. 이미 있으면 다른 커밋을 가리켜도 덮지 않고 exit 1

## 원본 저장소 검사

```text
mirror/target-missing    path · include 원본이 HEAD 에 없음 (verify)
mirror/version-format    version 파일이 tag 형식에 맞지 않음 (semver 대상이면 MAJOR.MINOR.PATCH)
```

- commit-msg 는 위 규칙을 그 커밋 결과 트리에서 검사. 이미 있던 위반은 막지 않는다
- 네트워크 사용 없음. 배포 저장소 상태 (push 됐는지) 는 status · push 에서만 본다

## release 연동

release plugin 이 켜져 있고 version 파일이 release 대상이 아니면, mirror 의 version 파일 변경은 release: 커밋에서만 허용한다 (`commit/version-outside` 와 같은 기준).
release: 커밋 본문 `Package: mirror:<id> <version>` 절 = 배포 저장소 태그 · GitHub Release 본문.

## status

```text
plugins.mirror.sections.targets    [{ id, path, repo, tag, version, lastSource, pending }]
요약 줄                            mirror <id> 미반영 N 커밋 (pending > 0 일 때만)
```

lastSource = 로컬 `gnam/mirror/<id>` 브랜치 마지막 커밋의 Mirror-Source. 브랜치가 없으면 null (fetch 는 하지 않는다).

## AGENTS.md 조각

```text
mirror     gnam.json mirror.targets 의 path 는 배포 저장소의 루트. 배포 저장소에 직접 커밋 금지
           include 원본 (공통 케이스 등) 변경도 배포 대상. 확인 = npx gnam run mirror status
```

미구현: 전체

Deferred: 배포 저장소 이슈 · PR 을 원본으로 옮기기, 여러 path 를 한 배포 저장소로, 배포 저장소 → 원본 가져오기
