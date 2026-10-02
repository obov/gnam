# gnam — Git-Native Agent Memory

파일에는 현재 상태, 커밋에는 상태가 변한 이유. 에이전트 (Claude Code · Codex) 와 사람이 같은 커밋 규약을 쓰도록 commit-msg hook 과 CI 검사로 강제한다.

```bash
npx gnam init                      # 코어만: chore · refactor · spec.<topic>.plan|impl|chore
npx gnam init --plugins lore,run   # plugin 함께
```

Node (>= 20) · Bun (>= 1.2) 모두 지원. 실행 파일은 hook 에서 node 우선, 없으면 bun.

## init 이 하는 일

| 대상 | 내용 |
|---|---|
| `gnam.json` | `{ "format": 1, "plugins": [] }`. format 을 바꾼 커밋 = 검사 경계 |
| `package.json` | devDependency `gnam`, `postinstall: gnam link` (clone 후 hook · 링크 복구) |
| `.githooks/commit-msg` | `git config core.hooksPath .githooks`. 다른 hooksPath 가 있으면 건드리지 않고 안내 |
| `.agents/skills/gnam` · `.claude/skills/gnam` | `node_modules/gnam/skills/gnam` symlink (Codex · Claude Code) |
| `AGENTS.md` | `<!-- gnam:begin -->` 블록만 관리. 블록 밖은 유지. `CLAUDE.md` 없으면 `@AGENTS.md` |
| `specs/README.md` | 없을 때만 |

검사는 커밋 메시지뿐이다. 빌드 · 테스트 · lint 는 돌리지 않는다.

## 코어 커밋 종류

```text
chore:                spec 과 무관한 변경 (의존성 · 설정 · 도구)
refactor:             동작 유지 · 구조만. 본문 Goal · Scope · Invariant. specs/ 변경 금지
spec.<topic>.plan:    spec 파일 하나 (또는 빈 커밋) + 본문 Goal · Plan · Blocking
spec.<topic>.impl:    본문 첫 줄 Plan: <plan hash> <단계>
spec.<topic>.chore:   계획 없는 spec 정리. 본문 Goal · Scope
공통                  Co-authored-by 금지 · squash 금지
```

규약 원본: `skills/gnam/references/`

## plugin

```bash
npx gnam plugin list
npx gnam plugin add multi-agent        # 빠진 내장 의존 (run · merge) 자동 추가
npx gnam plugin remove run --cascade   # 의존하는 plugin 까지 제거
npx gnam run <plugin> <command>        # plugin 명령
```

| 내장 | 추가하는 것 | requires |
|---|---|---|
| `lore` | `lore/` 작업 노하우 형식 검사 · 스킬 | - |
| `merge` | `spec.<topic>.merge:` 커밋 종류 | - |
| `run` | `run.<topic>.start\|end\|policy:` 커밋 · `usage` · `stats` | - |
| `release` | `release:` 커밋 · 버전 밖 변경 검사 · `status` · `bump` · `publish` | - |
| `ept` | `experiments/agent-workflows/*/record.json` 검사 | - |
| `multi-agent` | multi-agent · harness-execute · agent-routing 스킬 · `status` | run, merge |

표기: `@gnam/<id>` (내장) · `./경로` (로컬) · npm 패키지명 (외부).

### plugin 작성

```js
// gnam-plugins/docs/index.js
import { definePlugin } from "gnam/plugin"
export default definePlugin({
  id: "docs",
  version: "0.1.0",
  kinds: [{ label: "docs: …", subject: /^docs: \S/, validate: (ctx) => [] }],
  verify: (cwd, files, config) => [],        // gnam verify 의 파일 검사
  commands: { hello: { describe: "예시", run: () => 0 } },
  skills: ["skills/docs"],                   // plugin 루트 기준. SKILL.md 디렉터리
  agentsMd: "agents.md",                     // AGENTS.md gnam 블록에 들어갈 조각
  scaffold: { "docs/README.md": "files/README.md" },
})
```

```bash
npx gnam plugin add ./gnam-plugins/docs
```

## CI

```yaml
- run: npx gnam verify --push "${{ github.event.before }}" "${{ github.sha }}"   # push
- run: npx gnam verify --range "origin/${{ github.base_ref }}..HEAD"            # PR
```

`verify` 는 커밋 history (기본 HEAD, gnam 도입 이후) 와 plugin 파일 검사를 함께 돈다.

## 명령

```text
gnam init [DIR] [--plugins a,b] [--no-install] [--source SPEC]
gnam commit-msg <file>
gnam verify [--range A..B | --push BEFORE SHA]
gnam plugin list | add <spec> | remove <spec> [--cascade]
gnam run <plugin> <command> [args…]
gnam sync      gnam.json 기준 hook · skill 링크 · AGENTS.md 블록 · scaffold 재생성
gnam link      hook · skill 링크만 (postinstall)
gnam doctor    설치 상태 점검
```

## 개발

```bash
npm install
npm run check     # tsc + node --test + bun test
npm run build     # dist/ (배포본)
```

## License

MIT
