# upgrade — 새 버전 확인 · 업그레이드 후 이전 안내

기존 방식으로 쓰던 저장소가 새 gnam 의 바뀐 방식으로 옮겨 가게 한다.
`gnam outdated` 는 npm 최신 버전과 그 사이 할 일을 보이고, 업그레이드 뒤 `gnam link` (postinstall) 는 건너온 버전 사이의 할 일을 한 번 보인다.
`gnam status` 는 네트워크를 쓰지 않는다 (specs/info.md 범위 밖 유지).

## 이전 항목 (CHANGELOG.md)

```text
## 0.4.0

- multi-agent: harness-execute 를 skillDeps 로 받음
- 이전: npx gnam plugin add multi-agent 다시 실행 (.gnam/skills/harness-execute 생성)
```

```text
형식    버전 절 (## <version>) 안의 '- 이전: <할 일>' 줄. 한 줄 = 할 일 하나
대상    사용자가 저장소 · 설정 · 절차를 바꿔야 하는 변경만. 자동으로 맞춰지는 변경은 적지 않는다
배포    CHANGELOG.md 를 패키지에 포함 (package.json files)
```

- 미구현: CHANGELOG.md 를 패키지 files 에 포함
- 미구현: 이전 항목 추출 = 두 버전 사이 (초과 · 이하) 의 절에서 '- 이전:' 줄을 오래된 버전부터

## gnam outdated

```text
gnam outdated [--json]
```

```text
gnam 0.3.2 → 0.4.0 (latest)
업그레이드  npm install -D @obov/gnam@latest
이전 항목
  0.4.0  npx gnam plugin add multi-agent 다시 실행 (.gnam/skills/harness-execute 생성)
```

- 미구현: npm registry 의 `@obov/gnam` dist-tags.latest 조회. timeout 2초
- 미구현: 최신과 같거나 더 높으면 `gnam <설치> (latest <최신>) · 최신` · exit 0
- 미구현: 새 버전이 있으면 위 형식 · exit 0. 이전 항목은 최신 버전의 CHANGELOG.md (registry 의 그 버전 tarball) 에서 추출
- 미구현: 네트워크 · registry 오류 = stderr 에 원인 · exit 1. 다른 출력 없음
- 미구현: `--json` = `{ installed · latest · upgrade · migrations: [{ version · text }] }`
- 업그레이드 명령은 packageManager 판정 (npm · pnpm · yarn · bun) 에 맞춘다

## gnam link 의 이전 안내

```text
<git common dir>/gnam/version    마지막으로 link 한 gnam 버전 (한 줄). 커밋 안 됨
```

- 미구현: link 가 설치 버전과 기록 버전을 비교. 기록보다 높으면 그 사이 이전 항목을 report 에 출력하고 기록 갱신
- 미구현: 기록이 없으면 (첫 link · 새 clone) 안내 없이 기록만
- 미구현: 기록보다 낮으면 (다운그레이드) 안내 없이 기록만 갱신
- 네트워크를 쓰지 않는다. 설치된 패키지의 CHANGELOG.md 만 읽는다

## 범위 밖

- Deferred: 자동 이전 (코드로 저장소를 고치는 migration 스크립트)
- Deferred: plugin 별 이전 항목 (외부 plugin 의 CHANGELOG)
- Deferred: gnam status 에 새 버전 표시 (네트워크 · 캐시로 출력이 달라짐)
