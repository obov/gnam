# export — 하위 폴더를 배포용 외부 저장소로 내보내고 그 관계를 기록한다

문제: 한 저장소에서 개발한 폴더를 따로 배포하려면 손으로 복사해 올려야 하고, 어느 버전이 어디서 나왔는지 놓친다

opt-in 내장 plugin `export`. 개발 저장소 하나의 하위 폴더를 별도 저장소 (배포 전용, 읽기 전용) 로 내보낼 때,
어느 폴더가 어느 저장소로 가는지 · 함께 복사하는 파일 · 태그 형식을 gnam.json 에 선언하고, 내보낸 커밋을 원본 커밋과 이어 둔다.

쓰임: SwiftPM 처럼 저장소 루트 · 순수 semver 태그로만 설치되는 생태계 (예: 다언어 저장소의 `swift/` → `<name>-swift`).
경계: 외부 저장소 → 개발 저장소 방향 (가져오기 · submodule) 은 다루지 않는다. 배포 저장소에 직접 커밋하지 않는다.

## 설정

gnam.json (커밋됨):

```json
{
  "export": {
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
repo           필수. 배포 저장소 URL (https · ssh · file). 자격은 git 자격 도우미 · ssh key, gnam.json (URL 포함) 에 금지
branch         기본 main
include        (선택) { <원본 경로>: <배포 저장소 안 경로> }. path 밖 파일을 함께 복사 (공통 테스트 케이스 등)
tag            (선택) 배포 저장소 태그 형식. {version} 치환. 없으면 태그를 만들지 않는다
version        tag 가 있으면 필수. 버전 한 줄 파일 (저장소 루트 기준, path 안이어도 된다)
```

- 형식 문제 = configProblems (필수 키 · id 형식 · include 원본이 path 와 겹침 · include 대상끼리 겹침 · repo 에 자격 포함 · tag 에 {version} 없음)
- 대상 path 가 다른 대상과 겹치면 configProblems
- path · include 원본이 저장소에 있는지는 파일 검사 (export/target-missing)

## 내보내기

```text
gnam run export build <id> [--json]    배포 트리 생성. 원본 HEAD 기준, 로컬 브랜치 gnam/export/<id> 에 커밋 하나 추가
gnam run export push <id>              build 결과를 repo · branch 로 push, 버전이 바뀌었으면 tag 도 push (CI 용)
gnam run export status [<id>]          대상별 마지막 내보낸 원본 커밋 · 그 뒤 path · include 변경 커밋 수 · 배포 버전
```

배포 트리 = 원본 HEAD (커밋된 것) 의 path 내용 + include 복사본. 원본 기록 (path 밖) 은 배포 저장소에 넣지 않는다.
배포 커밋 author · committer = 원본 커밋의 것 (같은 원본 · 같은 이전 배포 커밋이면 같은 hash).
배포 커밋은 배포 브랜치의 이전 커밋 위에 쌓아 배포 저장소 history 가 앞으로만 진행한다 (force push 없음).

배포 커밋 메시지:

```text
export: <원본 커밋 제목>

Export-Source: <원본 저장소 URL> <원본 커밋 hash>
Export-Target: <id>
```

- 원본 → 배포 추적 = 배포 커밋 trailer. 배포 → 원본 추적은 `Export-Source` 로 원본 커밋을 찾는다
- 변경 없음 (배포 트리 동일) 이면 커밋 · push 생략, exit 0
- tag 는 version 파일 값이 배포 저장소에 없는 태그일 때만. 이미 있고 배포 history 안 커밋이면 그대로, history 밖 커밋이면 덮지 않고 exit 1
- 원본 저장소 URL = origin (자격 제거). origin 이 없으면 `.`

push 순서:

```text
1. 배포 저장소 branch fetch
2. 로컬 배포 브랜치가 원격 끝을 포함 → 그대로 push (fast-forward)
   포함 안 함 (CI 새 clone 등) → 원격 끝 위에 같은 원본으로 다시 build 후 push
   원격 끝에 Export-Source 없음 (직접 커밋) · 그 원본이 내보낼 원본의 조상이 아님 · 원본 커밋이 없음 (shallow) → exit 1
3. tag
```

## 원본 저장소 검사

```text
export/target-missing    path · include 원본이 HEAD 에 없음 (verify)
export/version-format    version 파일이 tag 형식에 맞지 않음 (semver 대상이면 MAJOR.MINOR.PATCH)
```

- commit-msg 는 위 규칙을 그 커밋 결과 트리에서 검사. 이미 있던 위반은 막지 않는다
- 네트워크 사용 없음. 배포 저장소 상태 (push 됐는지) 는 status · push 에서만 본다

## release 연동

release plugin 이 켜져 있고 version 파일이 release 대상이 아니면, export 의 version 파일 변경은 release: 커밋에서만 허용한다 (`commit/version-outside` 와 같은 기준).
release: 커밋 제목 항목 `export:<id> <version>` = version 파일 값, 직전 release 의 같은 항목보다 큼. 이 커밋은 version 파일을 바꿀 수 있다.
release: 커밋 본문 `Package: export:<id> <version>` 절 = 배포 저장소 주석 태그 메시지 (push 가 태그를 만들 때). `release publish` 는 export 항목을 건너뛴다.
`release bump` 는 version 파일을 바꾸지 않는다 (직접 수정).

## status

```text
plugins.export.sections.targets    [{ id, path, repo, tag, version, lastSource, pending }]
요약 줄                            export <id> 미반영 N 커밋 (pending > 0 일 때만)
```

lastSource = 로컬 `gnam/export/<id>` 브랜치 마지막 커밋의 Export-Source. 브랜치가 없으면 null (fetch 는 하지 않는다).
pending = lastSource..HEAD 중 path · include 원본을 바꾼 커밋 수 (lastSource 없으면 HEAD 까지 전체). 배포 트리가 HEAD 와 같으면 0, lastSource 커밋이 저장소에 없으면 null.

## AGENTS.md 조각

```text
export     gnam.json export.targets 의 path 는 배포 저장소의 루트. 배포 저장소에 직접 커밋 금지
           include 원본 (공통 케이스 등) 변경도 배포 대상. 확인 = npx gnam run export status
```

Deferred: 배포 저장소 이슈 · PR 을 원본으로 옮기기, 여러 path 를 한 배포 저장소로, 배포 저장소 → 원본 가져오기, 배포 저장소 GitHub Release 생성, release bump 의 version 파일 변경, push 자격 환경 변수 (GNAM_EXPORT_TOKEN)
