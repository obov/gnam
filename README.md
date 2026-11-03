# gnam — Git-Native Agent Memory

파일에는 현재 상태, 커밋에는 상태가 변한 이유. 에이전트 (Claude Code · Codex) 와 사람이 같은 커밋 규약을 쓰도록 commit-msg hook 과 CI 검사로 강제한다.

```bash
npx @obov/gnam init                      # 코어만: chore · refactor · spec.<topic>.plan|impl|chore
npx @obov/gnam init --plugins lore,run   # plugin 함께
```

Node (>= 20) · Bun (>= 1.2) 모두 지원. 실행 파일은 hook 에서 node 우선, 없으면 bun.

## init 이 하는 일

| 대상 | 내용 |
|---|---|
| `gnam.json` | `{ "format": 1, "plugins": [] }`. format 을 바꾼 커밋 = 검사 경계 |
| `package.json` | devDependency `@obov/gnam`, `postinstall: gnam link` (clone 후 hook · 링크 복구) |
| `.githooks/commit-msg` | `git config core.hooksPath .githooks`. 다른 hooksPath 가 있으면 건드리지 않고 안내 |
| `.agents/skills/gnam` · `.claude/skills/gnam` | `node_modules/@obov/gnam/skills/gnam` symlink (Codex · Claude Code) |
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
npx gnam plugin add multi-agent        # 빠진 내장 의존 (run · merge · harness) 자동 추가
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
| `recall` | 커밋 · `specs/` 절 · `lore/` 항목 BM25 검색 (한글 bigram) · `search` | - |
| `request` | `request:` 요청 원문 · 첨부 커밋 · 작업 커밋 `Request:` 검사 · `open` · `show` | - |
| `s3` | 첨부를 S3 호환 저장소에 sha256 key 로 보관 · `put` · `get` · `url` · `check` | - |
| `harness` | harness-execute 스킬 (에이전트 세션 실행 · adapter · `claude-args.sh`) | - |
| `multi-agent` | multi-agent · agent-routing 스킬 · `status` | run, merge, harness |
| `multirun` | 같은 plan 을 N 개 clone 에서 변형 실행 · 원본 tag 보존 · report 비교 · `start` · `sync` · `status` · `collect` · `open` · `close` · `abort` | harness |

표기: `@gnam/<id>` (내장) · `./경로` (로컬) · npm 패키지명 (외부).

### plugin 작성

```js
// gnam-plugins/docs/index.js
import { definePlugin } from "@obov/gnam/plugin"
export default definePlugin({
  id: "docs",
  version: "0.1.0",
  kinds: [{ label: "docs: …", subject: /^docs: \S/, validate: (ctx) => [] }],
  verify: (cwd, files, config) => [],        // gnam verify 의 파일 검사
  commands: { hello: { describe: "예시", run: () => 0 } },
  skills: ["skills/docs"],                   // plugin 루트 기준. SKILL.md 디렉터리
  skillDeps: [                               // GitHub 스킬 의존. add 때 commit 으로 잠가 .gnam/skills/<name>/ 에 받는다
    { name: "skill-creator", source: "github:anthropics/skills/skills/skill-creator", ref: "main" },
  ],
  agentsMd: "agents.md",                     // AGENTS.md gnam 블록에 들어갈 조각
  scaffold: { "docs/README.md": "files/README.md" },
})
```

```bash
npx gnam plugin add ./gnam-plugins/docs
```

### 스킬 의존 (skillDeps)

`plugin add` 가 선언된 GitHub 스킬을 받아 프로젝트에 둔다. 전역 스킬 디렉터리는 건드리지 않는다.

| 대상 | 내용 |
|---|---|
| `.gnam/skills/<name>/` | 받은 스킬 (`.git` · symlink 제외). 커밋 대상 |
| `.claude/skills/<name>` · `.agents/skills/<name>` | `../../.gnam/skills/<name>` 상대 링크. 커밋 대상 |
| `gnam.json` `skills` | name → source · ref · commit · sha256 · by (선언한 plugin) |

clone 만으로 복원되고 `link` · `sync` · `verify` 는 네트워크를 쓰지 않는다. 마지막 plugin 을 제거하면 스킬도 지운다.

```bash
npx gnam skill list                    # 잠긴 스킬
npx gnam skill update [<name>…]        # ref 재해석 · diff --stat. --yes 로 적용
npx gnam skill verify                  # 내용 해시 · 선언 대조 (gnam status problems 에도)
```

받은 스킬은 에이전트가 따르는 지시문 · 스크립트다. 처음 받은 내용과 update 의 diff 를 읽고 커밋한다.

## CI

```yaml
- run: npx gnam verify --push "${{ github.event.before }}" "${{ github.sha }}"   # push
- run: npx gnam verify --range "origin/${{ github.base_ref }}..HEAD"            # PR
```

`verify` 는 커밋 history (기본 HEAD, gnam 도입 이후) 와 plugin 파일 검사를 함께 돈다.

## status

```bash
npx gnam status                                    # 세션 시작 요약 (git status 와 함께)
npx gnam status gnam.version --format raw          # 경로 하나의 값
npx gnam status trace.requests --where status=open # 미착수 요청
npx gnam status trace --since <저장한 trace.head>   # 바뀐 부분만
npx gnam status --keys install · --schema trace     # 구조 탐색
npx gnam status problems --check                   # 문제 있으면 exit 3 (CI)
npx gnam status gnam.version -C ../a -C ../b       # 여러 저장소
```

트리 = schema · gnam · project · config · plugins · builtins · kinds · rules · install · problems · handoff · env · trace.
형식 json · compact · ndjson · raw · env · text + plugin 형식. 코드에서는 `import { status } from "@obov/gnam/status"`.

## 명령

```text
gnam init [DIR] [--plugins a,b] [--no-install] [--source SPEC]
gnam commit-msg <file>
gnam verify [--range A..B | --push BEFORE SHA]
gnam plugin list | add <spec> | remove <spec> [--cascade]
gnam run <plugin> <command> [args…] [--json | --format F]
gnam skill list | update [<name>…] [--yes] | verify
gnam status [<경로>…] [--json] [--format F] [--where k=v] [--fields a,b] [--keys] [--schema] [--since REV] [--deep] [--check] [-C DIR]…
gnam sync      gnam.json 기준 hook · skill 링크 · AGENTS.md 블록 · scaffold 재생성
gnam link      hook · skill 링크만 (postinstall)
gnam doctor    설치 상태 점검
gnam outdated [--json]   npm 최신 버전 · 업그레이드 명령 · 그 사이 이전 항목 (네트워크)
```

## 업그레이드

```bash
npx gnam outdated                      # 새 버전 · 업그레이드 명령 · 할 일 (CHANGELOG '이전:' 항목)
npm install -D @obov/gnam@latest       # postinstall 의 gnam link 가 건너온 버전 사이 이전 항목을 한 번 출력
```

`gnam status` 는 네트워크를 쓰지 않는다. 새 버전 확인은 `outdated` 만.

## 개발

```bash
npm install
npm run check     # tsc + node --test + bun test
npm run build     # dist/ (배포본)
```

배포 전 `CHANGELOG.md` 에 `## <version>` 절. 사용자가 저장소 · 설정 · 절차를 바꿔야 하는 변경은 `- 이전: <할 일>` 한 줄씩 (자동으로 맞춰지는 변경은 적지 않는다).
`gnam outdated` 와 업그레이드 후 `gnam link` 가 이 줄을 보인다.

## License

MIT
