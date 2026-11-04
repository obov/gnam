# layout — 폴더 구조를 선언하고 어긋난 파일을 커밋 때 알린다

작업 중 정한 폴더 구조를 `.gnam/layout.json` 에 트리로 선언한다. 커밋마다 새로 생긴 위반을 hook 출력으로 알리고 (기본 경고, 설정으로 차단),
구조를 정한 이유는 `layout:` 커밋에 남긴다. 형식은 eslint-plugin-project-structure 의 folder-structure 규칙 (projectStructure.json) 과 키 · 문법을 맞춘 부분 집합이다.

경계: layout 은 경로만 본다 (위치 · 이름 · 함께 있어야 하는 파일). 파일 내용 · import · 코드 스타일은 Biome · ESLint 영역.
파일 이름 형식이 Biome `useFilenamingConvention` 과 겹치는 프로젝트는 한쪽만 쓴다.

## 선언 파일

```text
위치     .gnam/layout.json (커밋 대상). 저장소마다 하나
생성     plugin add layout 이 없을 때만 scaffold (모두 허용하는 구조)
변경     layout: 커밋으로만 (아래 '커밋 종류')
```

```json
{
  "structureRoot": ".",
  "structure": [
    { "name": "*" },
    { "name": "(specs|tests)", "children": [] },
    { "name": "src", "children": [
      { "name": "{kebab-case}.ts" },
      { "name": "plugins", "children": [{ "ruleId": "plugin_src" }] }
    ]},
    { "name": "plugins", "children": [{ "ruleId": "plugin_assets" }] }
  ],
  "rules": {
    "plugin_src": {
      "name": "{kebab-case}",
      "enforceExistence": ["index.ts", "../../../plugins/{node-name}/agents.md"],
      "children": [{ "name": "{kebab-case}.ts" }]
    },
    "plugin_assets": {
      "name": "{kebab-case}",
      "children": [{ "name": "agents.md" }, { "name": "(skills|files)", "children": [] }]
    }
  },
  "regexParameters": {},
  "ignorePatterns": ["dist/**"]
}
```

최상위 키:

```text
structure         Rule | Rule[]. 객체 = 루트 폴더 노드 (enforceExistence 가능), 배열 = 루트의 children
rules             (선택) { <이름>: Rule }. 이름은 [A-Za-z0-9_-]+ ('.' 금지, plugin 규칙과 구분)
regexParameters   (선택) { <이름>: <정규식 조각> }. 내장 파라미터 덮어쓰기 가능, {folderName} 계열은 덮어쓰기 무시
ignorePatterns    (선택) string | (string | string[])[]. 바깥 배열 OR, 안쪽 배열 AND
structureRoot     (선택, 기본 ".") 이 경로 아래만 검사. 저장소 루트 기준
```

## Rule

```text
name                 정규식 (아래 '이름'). children 있으면 폴더 이름, 없으면 파일 이름
children             (선택) Rule[]. 있으면 폴더 노드. [] = 폴더 이름만 검사, 안쪽 자유
enforceExistence     (선택) string | string[]. 이 노드가 있으면 이 경로들도 있어야 한다
ruleId               (선택) rules 의 이름 또는 plugin 규칙 <plugin id>.<이름>. 같은 노드에 쓴 키가 규칙의 키를 덮는다
folderRecursionLimit (선택) rules 안에서만. 자기 참조 재귀의 최대 깊이
```

검사 대상 파일 = git 추적 · 미추적 (무시 제외) 파일. 빈 폴더는 보지 않는다.

### 이름

원본과 같은 변환:

```text
^…$ 로 감싼다
.    → \.  (문자 그대로).  ..  → .  (정규식 원래 의미)
*    → ([^/]*)  (한 단계).  **  → *  (정규식 원래 의미)
{x}  → regexParameters 또는 내장 파라미터
```

내장 파라미터:

```text
{camelCase}        [a-z][a-zA-Z0-9]*
{PascalCase}       [A-Z][a-zA-Z0-9]*
{strictCamelCase}  [a-z][a-z0-9]*(?:[A-Z][a-z0-9]+)*[A-Z]?
{StrictPascalCase} [A-Z](?:[a-z0-9]+(?:[A-Z][a-z0-9]+)*[A-Z]?)?
{snake_case}       [a-z0-9]+(?:_[a-z0-9]+)*
{SNAKE_CASE}       [A-Z0-9]+(?:_[A-Z0-9]+)*
{kebab-case}       [a-z0-9]+(?:-[a-z0-9]+)*
{folderName} · {FolderName} · {folder-name} · {folder_name} · {FOLDER_NAME}
                   부모 폴더 이름을 그 형식으로 바꾼 리터럴
```

### children 순서

```text
정렬       파일 노드 → 폴더 노드. 각각 리터럴 → 파라미터 포함 → * 포함
중복       정렬 후 같은 name 은 첫 노드만. 뒤 노드는 무시
일치       경로를 '/' 로 나눠 단계마다 정렬된 children 에서 처음 맞는 노드.
           마지막 단계 = 파일 노드만, 중간 단계 = 폴더 노드만
```

### enforceExistence

```text
기준 경로   폴더 노드 = 그 폴더 안, 파일 노드 = 그 파일이 있는 폴더
참조        {nodeName} · {NodeName} · {node-name} · {node_name} · {NODE_NAME}
            현재 노드 이름 (파일은 첫 '.' 앞) 을 그 형식으로 바꾼 값
'..'        상위 폴더. 다른 트리의 짝 파일 요구에 쓴다 (예: src/plugins/<x> ↔ plugins/<x>/agents.md)
structureRoot 밖을 가리키면 layout/schema
```

### 재귀

규칙이 자기 ruleId 를 (직간접으로) children 에 두면 재귀. 기본 깊이 제한 없음.
`folderRecursionLimit: N` 이면 N 번째 단계에서 자기 참조 노드를 children 에서 뺀다 (같은 name 의 다음 노드가 그 단계에서 쓰인다).

### ignorePatterns

자체 glob (외부 의존 없음). `*` 한 단계 · `**` 여러 단계 · `?` 한 글자 · 앞 `!` 부정 · `\` 이스케이프. 저장소 루트 기준.

## plugin 이 주는 규칙

```text
GnamPlugin.layout   { rules?: Record<string, Rule>, regexParameters?: Record<string, string> }
참조                ruleId "<plugin id>.<이름>". 파라미터는 {<plugin id>.<이름>}
꺼진 plugin 참조    layout/schema
```

plugin 규칙은 사용자 rules 와 같은 형식 · 검사. 사용자는 참조만 하고 덮어쓰려면 같은 노드에 키를 쓴다.

## 검사

```text
gnam commit-msg   부모 트리 대비 이 커밋 결과 트리에서 새로 생긴 위반만 (index view = HEAD 대비 index)
gnam verify       파일 검사: 현재 저장소 전체 위반. history 검사: 커밋마다 commit-msg 와 같은 규칙
적용 시작         .gnam/layout.json 이 있는 커밋부터. 그 전 history 는 검사하지 않는다
```

- 새로 생긴 위반 = (rule, 경로) 쌍이 부모에는 없고 결과에는 있는 것. 추가 · 이름 변경 · 삭제 (enforceExistence 대상 삭제) 모두 같은 방식으로 잡힌다
- 이미 있던 위반은 커밋을 막지 않는다 (도입 전 파일 · 규칙 변경으로 생긴 위반). 전체는 verify · `layout check` 에서 본다
- merge 커밋은 검사하지 않는다

### 등급

```text
gnam.json   "layout": { "enforce": "warn" | "block" }   기본 warn
warn        Violation.level = warn. 출력은 같고 exit 0 (커밋 · verify 성공)
block       level = error. commit-msg 거부, verify 실패
```

`commit/layout-*` (커밋 종류 규칙) 은 enforce 와 무관하게 error.

core 변경: `Violation.level?: "error" | "warn"` (없으면 error). commit-msg · verify 는 error 가 하나라도 있을 때만 실패하고, warn 은 같은 형식에 `(warn)` 을 붙여 stderr 에 낸다.

### 출력

기존 Why · Current · Fix 형식. 에이전트는 git commit 의 Bash 도구 결과로 이 출력을 받는다.

```text
GNAM/layout/unlisted (warn)

Why:
src/plugins/<kebab-case> 아래는 {kebab-case}.ts 만 허용 (rule plugin_src)

Current:
src/plugins/layout/utils/glob.ts
  utils/ ← 일치하는 노드 없음

Fix:
A. 이동: src/plugins/layout/glob.ts
B. 구조 변경: .gnam/layout.json 의 plugin_src.children 에 추가 → layout: 커밋
확인: npx gnam run layout where src/plugins/layout/utils/glob.ts
```

- Current = 경로 + 실패한 단계. Why = 그 단계의 노드 (ruleId 있으면 함께)
- Fix A = 같은 이름이 맞는 가장 가까운 위치 (없으면 생략). warn 이면 커밋은 이미 됐으므로 다음 커밋에서 git mv

### 규칙

```text
layout/unlisted    어떤 노드와도 맞지 않는 경로
layout/existence   enforceExistence 가 요구한 경로가 없다
layout/recursion   folderRecursionLimit 때문에 맞지 않는 경로 (제한이 없으면 맞음)
layout/schema      .gnam/layout.json 파싱 · 형식 · 없는 ruleId · 잘못된 정규식 · structureRoot 밖 enforceExistence
commit/layout-files  layout: 커밋은 .gnam/layout.json 만
commit/layout-goal   layout: 커밋 본문 Goal
```

layout/schema 가 있으면 다른 layout 검사는 하지 않는다 (그 커밋 결과 트리 기준).

## 커밋 종류

```text
layout: <구조 결정 한 줄>
파일      .gnam/layout.json 하나
본문      Goal: 이 구조를 정한 이유
결과      layout/schema 위반 = error. 이 규칙으로 기존 파일이 어긋나면 warn 으로 목록 (커밋은 성공)
파일 이동 규칙에 맞춘 이동은 이후 refactor: 커밋
```

```bash
git log --oneline -- .gnam/layout.json   # 구조 결정 이력
```

## 명령

```text
gnam run layout where <경로>       허용 여부 · 일치한 노드 사슬 (규칙 이름 포함) · 실패 단계 · 후보 위치. --json
gnam run layout check [<경로>…]    전체 위반 (경로를 주면 그 아래만). 위반 있으면 exit 1 (enforce 무관)
gnam run layout show               structure 를 트리로 (ruleId 펼침, 재귀는 한 번만). --json
gnam run layout capture <폴더>     현재 트리 → structure 조각 JSON (stdout). 파일 · 폴더 이름을 내장 형식 파라미터로 일반화
```

- 파일을 만드는 명령 없음. capture 출력은 사람 · 에이전트가 layout.json 에 붙인다
- where 는 파일이 없어도 동작한다 (만들기 전 확인용)

## status

```text
plugins.layout.sections.rules        [{ id · owner (project | <plugin id>) · name }]   탭 "구조" (list, title = id, badge = owner, meta = name)
plugins.layout.sections.violations   deep. [{ rule · path · level }]
요약 줄                              layout 위반 N (warn | block)   위반 있을 때만
```

## 에이전트 안내 (AGENTS.md 조각)

```text
구조      .gnam/layout.json. 새 파일 전 npx gnam run layout where <경로>
경고      GNAM/layout/* 가 나오면 같은 작업 안에서 이동 (refactor:) 또는 구조 변경 (layout:)
형식      .agents/skills/gnam-layout/references/layout.md
```

## 원본과 다른 점

```text
설정 파일       .gnam/layout.json 하나 (mjs · ts · yaml 없음)
enforceExistence 기준 경로를 위 규칙으로 확정
ignorePatterns  micromatch 대신 자체 glob (위 문법만)
검사 시점       ESLint 실행이 아니라 commit-msg · verify. 커밋은 새로 생긴 위반만
```

## 범위 밖

- projectRoot (모노레포 여러 루트) · cache 파일 · longPathsInfo
- independent-modules · file-composition (파일 내용 검사)
- 에이전트 도구 hook 으로 쓰는 시점에 막기
