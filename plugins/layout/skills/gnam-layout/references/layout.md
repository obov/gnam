---
type: Principle
title: layout — 폴더 구조 선언
description: .gnam/layout.json 형식 (eslint-plugin-project-structure folder-structure 호환 부분 집합) · 검사 시점 · 위반 처리 · layout: 커밋
tags: [gnam, layout]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-04T00:00:00Z }
---

# layout — 폴더 구조 선언

원본 규칙: 저장소의 `specs/layout.md` (gnam 패키지). 이 문서는 쓰는 쪽 요약이다.

## 작업 순서

```text
파일 만들기 전   npx gnam run layout where <경로>     허용 · 이동 후보 · 함께 있어야 할 파일
구조 정하기      npx gnam run layout capture <폴더>   현재 트리 → structure 조각. 다듬어 layout.json 에 넣는다
                 layout: <구조 결정> 커밋 (layout.json 만, 본문 Goal:)
확인             npx gnam run layout check [<경로>]   작업 트리 전체 위반
                 npx gnam run layout show             structure 트리
```

## 위반이 나왔을 때

커밋 출력 (git commit 결과) 에 `GNAM/layout/<규칙>` 이 Why · Current · Fix 로 나온다.

```text
(warn)    기본. 커밋은 됐다. 같은 작업 안에서 처리한다
          A 이동: git mv <경로> <이동 후보> → refactor: 커밋
          B 구조 변경: layout.json 수정 → layout: 커밋 (Goal: 왜 이 위치를 허용하는가)
(없음)    gnam.json "layout": { "enforce": "block" }. 커밋 거부. 파일을 옮기거나 구조를 먼저 바꾼다
```

이미 있던 위반은 커밋을 막지 않는다 (부모 대비 새 위반만). 전체는 `check` · `gnam verify`.

## 형식

```json
{
  "structure": [
    { "name": "*" },
    { "name": "src", "children": [{ "name": "{kebab-case}.ts" }, { "name": "plugins", "children": [{ "ruleId": "plugin" }] }] }
  ],
  "rules": {
    "plugin": { "name": "{kebab-case}", "enforceExistence": ["index.ts"], "children": [{ "name": "{kebab-case}.ts" }] }
  },
  "ignorePatterns": ["dist/**"]
}
```

```text
name                정규식. ^$ 자동, . = 문자, .. = 임의 문자, * = 한 단계, ** = 정규식 *
                    {camelCase} {PascalCase} {strictCamelCase} {StrictPascalCase} {snake_case} {SNAKE_CASE} {kebab-case}
                    {folderName} {FolderName} {folder-name} {folder_name} {FOLDER_NAME} = 부모 폴더 이름
children            있으면 폴더. [] = 이름만 검사, 안쪽 자유. 없으면 파일
enforceExistence    이 노드가 있으면 있어야 할 경로. 폴더 = 그 안 기준, 파일 = 같은 폴더 기준. '..' 가능
                    {nodeName} {NodeName} {node-name} {node_name} {NODE_NAME} = 이 노드 이름 (파일은 첫 '.' 앞)
ruleId              rules 의 이름 또는 plugin 규칙 <plugin id>.<이름>. 같은 노드의 키가 규칙 키를 덮는다
rules               재사용 규칙. 자기 ruleId 를 children 에 두면 재귀, folderRecursionLimit 로 깊이 제한
regexParameters     사용자 파라미터 { 이름: 정규식 }
ignorePatterns      * ** ? ! \ glob. 바깥 배열 OR, 안쪽 배열 AND
structureRoot       이 경로 아래만 검사 (기본 ".")
```

children 일치 순서: 파일 → 폴더, 리터럴 → 파라미터 → `*`. 같은 name 은 첫 노드만.

## 규칙

```text
layout/unlisted      어떤 노드와도 맞지 않는 경로
layout/existence     enforceExistence 가 요구한 경로 없음
layout/recursion     folderRecursionLimit 초과
layout/schema        layout.json 형식 (layout: 커밋에서는 항상 거부)
commit/layout-files  layout: 커밋은 layout.json 만 · layout.json 변경은 layout: 에서만
commit/layout-goal   layout: 커밋 본문 Goal
```
