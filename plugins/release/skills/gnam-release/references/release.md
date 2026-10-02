---
type: Commit Type
title: release 커밋
description: 버전 변경 커밋. 대상 · 방식 · 수준 계산 · 본문 절 · 태그 · GitHub Release
tags: [gnam, commit, release]
generated: { by: claude-code/claude-opus-5-5, at: 2026-09-26T00:00:00Z }
---

# release 커밋 — 버전 변경

여러 package 의 버전을 한 커밋에서 올린다. 커밋 = 버전 변경 + 무엇이 바뀌었는가. CHANGELOG 파일은 두지 않는다 (git 이 기록).
gnam.json `release` 를 켠 저장소만 쓴다. 설정 = `"release": { "targets": { "<package 디렉터리>": "semver|calver|openapi" }, "advisor"?: "jev" }`. 검사 Rule ID = commit/release-* · commit/version-outside.

```text
제목      release: <name> <version> · <name> <version>
파일      제목 대상 (semver · calver) 의 package.json version 만. openapi 대상만이면 빈 커밋
본문      대상마다 'Package: <name> <version>' 줄로 시작하는 절. 절 본문 = GitHub Release 본문 (제품 말 요약)
          Breaking 근거가 있으면 절 맨 위에 무엇이 깨지는지 · 쓰는 쪽이 할 일
태그      CI (main push) 가 <name>@<version> 태그 + GitHub Release 를 만든다. 로컬 태그 금지
작성      npx gnam run release bump → 초안의 근거 줄을 요약으로 고친다 (Package: 줄 유지) → git commit -F
```

```text
release: @repo/api 2.0.0 · @repo/ui 1.4.0

Package: @repo/api 2.0.0
- Breaking: v1 삭제. /v2 로 옮긴다
- 주문 취소 API

Package: @repo/ui 1.4.0
- DatePicker 추가
```

## 방식

```text
semver    package.json version. 수준은 아래 근거에서 계산
calver    YYYY.M.N (UTC). 같은 달의 직전 release 가 있으면 N + 1. 쓰는 코드가 없는 배포 단위 (앱)
openapi   active spec/v<N>.yaml info.version (packages/api). 새 v<N>.yaml = major. G13 이 올림을 강제
```

## 수준 계산 (semver)

직전 release 커밋 (그 package 를 포함한 가장 최근 것, merge 제외) 이후 package 디렉터리를 바꾼 커밋마다 수준을 매기고 가장 높은 것을 쓴다.

```text
major   본문 Breaking: (impl) 또는 따르는 plan 의 Breaking:
minor   impl 이 따르는 plan 이 직전 release 이후 커밋된, spec 을 바꾼 plan (새 합의)
        수집 plan 이면 Spec: 으로 가리킨 plan 중 하나라도 그러면
patch   직전 release 이전 plan 을 따르는 impl (이미 나간 동작의 수정) · 빈 plan 의 impl · chore · refactor
```

- 계산보다 낮출 수 없다. 올리는 것은 된다 (bump <name>@major)
- 0.x 에서는 major → minor. 1.0.0 은 bump <name>@1.0.0 으로만
- 첫 릴리스 (직전 release 없음) 는 package.json 버전 그대로
- release 가 아닌 커밋은 대상 version 을 바꾸지 않는다

Breaking 은 선언이다. HTTP API 는 G13 이 같은 메이저 안 호환성 깨짐을 막으므로 선언이 필요 없다.
그 밖의 경로는 쓰는 쪽이 코드 · 설정 · 절차를 바꿔야 하면 선언한다 (export 제거 · 이전에 받던 입력 거부 · 필수 설정 추가).
선언을 빠뜨렸으면 release 커밋에서 수준을 올리고 절에 적는다.

## 조회

```bash
git log --oneline --no-merges --grep '^release: '                  # 릴리스 이력
git log --oneline --no-merges -E --grep '^release: .*@repo/ui '    # 한 package
npx gnam run release status                                           # 다음 버전과 근거
```
