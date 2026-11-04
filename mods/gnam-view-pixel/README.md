# gnam-view-pixel

gnam 저장소가 **어떤 문제를 어떤 기능으로 해결했고, 지금 무엇을 하는지** 를 Claude Code pane 안에 그림 (pixel, kitty graphics) 으로 보여 주는 mod.
글자 pane 인 [gnam-view](../gnam-view) 와 같은 정보를 사람이 묻는 순서로 놓는다.

```text
첫 화면    목적 (README 첫 문단) → 진행 요약 1줄 → 지금 (진행 중) → 다음 (시작 전) → 구현된 기능 (끝난 topic 전부)
topic 펼침 문제 (spec 의 '문제:' 줄) → 해결 (spec 첫 줄 · 최근 plan Summary) → 이력 (plan 목록) → 세부 (단계 · 커밋 · 파일)
뒤쪽 탭    2 결정 (막힘 · 미결 · 정할 것 · 내린 결정) · 3 이력 (plan) · 4 커밋 · 5 항목 (trace.items)
```

이 저장소에서 꺼진 builtin plugin 의 기능은 흐리게, `plugin 꺼짐` 표시로 남는다.

## 요구

- 터미널 Claude Code (desktop · VS Code · mobile 은 안내만). 그림은 **kitty graphics** 를 그리는 터미널: kitty · Ghostty · iTerm2 3.5+ (WezTerm 등은 Claude Code 의 Image 지원을 따름). tmux 는 지원하지 않는다
- node (>= 20), macOS (arm64 · x64) 또는 Linux (x64 · arm64)
- 프로젝트에 `@obov/gnam` 0.5 이상 (`npm i -D @obov/gnam`). spec `문제:` 줄은 `gnam status` 가 `trace.topics.<t>.problem` 을 낼 때부터 보인다 (없으면 비움)
- pixel 런타임 (패치된 Electron, 약 300MB) 을 처음 한 번 내려받는다

## 설치

```text
/plugin install gnam-view-pixel --marketplace obov/gnam
/gnam-pixel setup          # 런타임 내려받기 + 앱 빌드 (처음 한 번, 몇 분)
/gnam-pixel                # 열기 · 다시 실행하면 닫기
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

## 키

pane 을 한 번 클릭하면 키가 pane 으로 간다 (Esc 로 프롬프트에 돌려줌).

```text
j/k · ↑/↓        이동            Enter · 클릭   topic 펼치기 · 접기 (한 번에 하나)
1-5 · ←/→ · Tab  탭              Esc            접기
r                다시 읽기        g / G          처음 · 끝
휠               스크롤
```

턴이 끝날 때마다 mod 가 앱에 알리고, 앱은 HEAD · `gnam.json` · `specs/` 가 바뀌었을 때만 다시 읽는다. 읽기 실패면 이전 화면을 두고 위에 오류 1줄.

## 설정

`theme`: `auto` (기본, 어두운 기본값 · 터미널 색을 받으면 그것) · `dark` · `light`.

## 구조

```text
hooks/register.tsx   /gnam-pixel → bridge launch → GET /state long-poll → Image · $.ui.blit (POSIX shm frame)
hooks/surface.tsx    Client: 키 · 마우스 · 크기를 bridge 로
app/src/bridge.ts    별도 node 프로세스. PIXEL_EMBED 소켓 host + 127.0.0.1 http (Bearer token). 60초 idle 이면 종료
app/src/main.tsx     pixel 앱 (React). model.ts (status · README · git log) → store.ts (키 · 갱신) → view.tsx
```

구조는 [terminal-browser](https://github.com/zenbu-labs/terminal-browser) 의 claude-code-plugin (MIT) 을 따른다.
로그: `~/.local/state/gnam-view-pixel/bridge.log`, 앱 stderr `~/.local/state/pixel/logs/app.stderr.log`.

## 개발

```bash
(cd mods/gnam-view-pixel && claude plugin validate . && claude plugin test)
(cd mods/gnam-view-pixel/app && npm test)   # 타입 · 모델 · 화면 · 갱신 · bridge (실제 pixel 런타임으로 frame 수신)
```
