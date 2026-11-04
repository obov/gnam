# gnam-view

gnam 저장소의 spec 진행 · 결정 · 요청 · 항목 · 커밋 · plugin 상태를 Claude Code pane 으로 보여 주는 mod.

## 설치

Claude Code 프롬프트에서:

```text
/plugin install gnam-view --marketplace obov/gnam
```

셸에서:

```bash
claude plugin install gnam-view --marketplace obov/gnam
```

설정 파일로 켜기 (marketplace 를 한 번 추가한 뒤):

```json
{ "enabledPlugins": { "gnam-view@gnam": true } }
```

## 사용

- 프로젝트에 `@obov/gnam` 0.5 이상 (`npm i -D @obov/gnam`). 0.4 이하는 plugin 탭 없이 동작
- `/gnam-view` 로 pane 열기. `r` 새로고침, 숫자 키로 탭 이동
- 설정 탭: 탭 보이기 · 순서 · 처음 탭 · 아이콘 · 그래프 (개인, 프로젝트별 저장), 새 탭 추가 (`gnam.json` `view.tabs`, 커밋하면 공유)
- 탭 정의 형식: [specs/view.md](../../specs/view.md)
