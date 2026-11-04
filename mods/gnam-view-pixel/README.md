# gnam-view-pixel

gnam 저장소가 **어떤 문제를 어떤 기능으로 해결했고, 지금 무엇을 하는지** 를 Claude Code pane 안에 그림 (pixel, kitty graphics) 으로 보여 주는 mod.
글자 pane 인 [gnam-view](../gnam-view) 와 같은 정보를 사람이 묻는 순서로 놓는다.

```text
헤더       프로젝트 · branch · gnam 버전 · 켜진 plugin 목록
첫 화면    목적 (README 첫 문단, 없으면 package.json description. 두 줄 넘으면 …) → 진행 요약 1줄 · 막대
           → 사람이 할 일 · 설정 신호 → 지금 (진행 중 · 다음 계획 필요) → 다음 (시작 전 · plan 없음) → 구현된 기능
topic 행   이름 · 한 줄 · 막힘 / 미구현 / 미결 개수 칩 · 다음 계획 필요 · plan 없음 · 단계 막대
topic 펼침 문제 (spec 의 '문제:' 줄) → 해결 (spec 첫 줄 · 설명 문단 · 최근 plan Summary) → 이력 (plan 목록)
           → 세부 (단계 · 막힘 · 미결 · 미구현 · 커밋 · 정리 커밋 수 · 파일)
뒤쪽 탭    결정 (막힘 · 미결 · 정할 것 · 내린 결정) · 요청 · 이력 (plan) · 커밋 · 항목 (trace.items)
           · 사용자 정의 view 들 · plugin · 설정
```

- 신호: 결정할 것 (막힘 · 미결) · 처리 중인 요청 · 설정 문제 (문제 텍스트) · 인계 메모. 있는 것만 한 줄씩, 누르면 해당 탭. 모두 0 이면 흐린 한 줄 `사람이 할 일 없음 · 설정 정상`
- 다음 계획 필요: 최근 plan 은 끝났지만 미구현 · 미결 · 막힘이 남은 topic. '지금' 에서 진행 중 다음
- 색은 상태에만 (진행 중 · 다음 계획 필요 · 시작 전 · 끝남 · 막힘 · 설정 문제). 미구현 · 미결 개수는 흐린 칩
- 이 저장소에서 꺼진 builtin plugin 의 기능은 흐리게, `plugin 꺼짐` 표시로 남는다

뒤쪽 탭:

```text
결정      막힘 (plan sha) · 미결 (spec 줄) · 정할 것 (진행 중 · 시작 전 plan 의 Decisions expected) · 내린 결정 (impl)
요청      상태 분포 · 상태 필터 (f) · 행 = 상태 · 제목 · ×가리킨 커밋 수 · sha. 요청이 없고 request plugin 이 꺼져 있으면 탭 없음
이력      plan 최근 → 과거, 대체 관계
커밋      종류 분포 (core · plugin, status kinds) · 14일 막대 · 종류 필터 (f) · topic 필터 (t · shift+t · ‹ ›)
항목      종류 분포 · 종류 필터 (f), 최근 순. 해결 여부는 판정하지 않음
view      gnam.json view.tabs · plugin status 섹션의 탭 정의 (list · table · progress, specs/view.md). source 가 없으면 '데이터 없음'
plugin    켜진 plugin 마다 버전 · 종류 · skill · 명령과 설명 · 오류 · 섹션 트리
설정      읽기 전용. 설치 (commit-msg hook · skill 링크 · AGENTS.md · CLAUDE.md · 인계 메모) · 설정 문제 · plugin 버전
          · 꺼진 내장 · gnam.json 추가 키 · 커밋 종류
```

탭 보이기 · 순서 · 새 탭 만들기 (gnam.json 편집) 는 [gnam-view](../gnam-view) 에서 한다.

## 요구

- 터미널 Claude Code (desktop · VS Code · mobile 은 안내만). 그림은 **kitty graphics** 를 그리는 터미널: kitty · Ghostty · iTerm2 3.5+ (WezTerm 등은 Claude Code 의 Image 지원을 따름) · herdr (분할 pane, 아래 '터미널별 동작'). tmux 는 지원하지 않는다
- node (>= 20), macOS (arm64 · x64) 또는 Linux (x64 · arm64)
- 프로젝트에 `@obov/gnam` 0.5 이상 (`npm i -D @obov/gnam`). spec `문제:` 줄은 `gnam status` 가 `trace.topics.<t>.problem` 을 낼 때부터 보인다 (없으면 비움)
- pixel 런타임 (패치된 Electron, 약 300MB) 을 처음 한 번 내려받는다

## 설치

```text
/plugin install gnam-view-pixel --marketplace obov/gnam
/gnam-pixel setup          # 런타임 내려받기 + 앱 빌드 (처음 한 번, 몇 분)
/gnam-pixel                # 열기 · 다시 실행하면 닫기 (herdr 에서는 연 pane 으로 이동)
/gnam-pixel close          # 닫기
```

셸에서 하려면 (설치된 plugin 폴더의 `app/` 에서):

```bash
cd <plugin 폴더>/app && npm run setup
```

이 저장소 checkout 에서 바로 띄워 보기:

```bash
(cd mods/gnam-view-pixel/app && npm run setup)
claude --plugin-dir mods/gnam-view-pixel
# 프롬프트에서 /gnam-pixel
```

## 터미널별 동작

```text
kitty · Ghostty · iTerm2 단독   Claude Code pane 안에 그린다 (bridge → Image)
herdr (HERDR_ENV=1)             herdr 는 Claude Code pane 의 Image (kitty placeholder) 를 그리지 못한다.
                                대신 Claude Code pane 옆에 herdr 분할 pane 을 만들고 그 안에서 pixel 앱을 직접 실행한다
```

herdr 에서:

- `/gnam-pixel` — 오른쪽 (설정 `split` 이 `down` 이면 아래) 에 pane 을 만들어 앱을 띄운다. focus 는 Claude Code pane 에 남는다. 이미 열려 있으면 새로 만들지 않고 그 pane 으로 이동
- `/gnam-pixel close` — 연 pane 을 닫는다. 그 pane 에서 Ctrl+C 로 앱이 정상 종료해도 pane 이 닫힌다 (오류로 끝나면 오류를 보이도록 셸이 남는다). Claude Code 세션이 끝나면 mod 가 닫는다
- 앱은 5초마다 HEAD · `gnam.json` · `specs/` · README · 인계 메모를 확인해 바뀌었을 때만 다시 읽는다 (`GNAM_VIEW_POLL_MS` 로 주기 변경). `r` 은 언제나 다시 읽기
- 키는 그 pane 에 직접 간다 (클릭 불필요). 같은 명령을 셸에서 직접 실행할 수도 있다:

```bash
GNAM_VIEW_CWD=<저장소> <plugin 폴더>/app/node_modules/.bin/pixel <plugin 폴더>/app/dist/main.cjs
```

## 키

pane 을 한 번 클릭하면 키가 pane 으로 간다 (Esc 로 프롬프트에 돌려줌). herdr 분할 pane 에서는 그 pane 을 focus 하면 된다.

```text
j/k · ↑/↓        이동            Enter · 클릭   topic 펼치기 · 접기 (한 번에 하나)
1-9 · ←/→ · Tab  탭 (10번째부터는 숫자 없음: ←/→ · Tab · 클릭)
f                필터 (요청 상태 · 커밋 종류 · 항목 종류, 칩 클릭도 됨)
t · shift+t      커밋 topic 필터 다음 · 이전
Esc              접기            g / G          처음 · 끝
r                다시 읽기        휠             스크롤
```

턴이 끝날 때마다 mod 가 앱에 알리고, 앱은 HEAD · `gnam.json` · `specs/` · README · package.json · 인계 메모가 바뀌었을 때만 다시 읽는다. 읽기 실패면 이전 화면을 두고 위에 오류 1줄.

## 설정

`theme`: `auto` (기본, 어두운 기본값 · 터미널 색을 받으면 그것) · `dark` · `light`.
`split`: herdr 분할 방향 `right` (기본) · `down`.

## 구조

```text
hooks/register.tsx   /gnam-pixel → bridge launch → GET /state long-poll → Image · $.ui.blit (POSIX shm frame)
hooks/surface.tsx    Client: 키 · 마우스 · 크기를 bridge 로
hooks/split.ts       herdr 안: herdr pane split · run · focus · close (bridge 없음, 연 pane id 는 $.state)
app/src/bridge.ts    별도 node 프로세스. PIXEL_EMBED 소켓 host + 127.0.0.1 http (Bearer token). 60초 idle 이면 종료. check = 설치 확인
app/src/main.tsx     pixel 앱 (React). model.ts (status · README · git log) → store.ts (키 · 갱신) → view.tsx
```

구조는 [terminal-browser](https://github.com/zenbu-labs/terminal-browser) 의 claude-code-plugin (MIT) 을 따른다.
로그: `~/.local/state/gnam-view-pixel/bridge.log`, 앱 stderr `~/.local/state/pixel/logs/app.stderr.log`.

## 개발

```bash
(cd mods/gnam-view-pixel && claude plugin validate . && claude plugin test)
(cd mods/gnam-view-pixel/app && npm test)   # 타입 · 모델 · 화면 · 갱신 · bridge (실제 pixel 런타임으로 frame 수신)
```
