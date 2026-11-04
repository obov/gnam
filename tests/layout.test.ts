import { test } from "node:test"
import { expect } from "./expect.ts"
import { compileName, BUILTIN_PARAMS, layoutOf, parseLayout, resolveRule, substituteNode } from "../src/plugins/layout/config.ts"
import type { GnamPlugin } from "../src/core/plugin.ts"

const ok = (value: unknown, plugins: GnamPlugin[] = []) => {
  const parsed = layoutOf(value, plugins)
  if (parsed.layout === null) throw new Error(parsed.problems.join("\n"))
  return parsed.layout
}
const problems = (value: unknown, plugins: GnamPlugin[] = []) => layoutOf(value, plugins).problems

test("이름 변환: . · .. · * · ** · ^$ · 파라미터", () => {
  const re = (name: string, parent = "x") => compileName(name, BUILTIN_PARAMS, parent)
  expect(re("a.ts").test("a.ts")).toBe(true)
  expect(re("a.ts").test("axts")).toBe(false)
  expect(re("a..ts").test("axts")).toBe(true)
  expect(re("*.ts").test("index.ts")).toBe(true)
  expect(re("*.ts").test("a/b.ts")).toBe(false)
  expect(re("a**").test("aaaa")).toBe(true)
  expect(re("a.ts").test("xa.ts")).toBe(false)
  expect(re("use{PascalCase}(.(test|api))?.ts").test("useNiceHook.api.ts")).toBe(true)
  expect(re("use{PascalCase}(.(test|api))?.ts").test("useNiceHook.x.ts")).toBe(false)
  expect(re("{kebab-case}").test("gnam-view")).toBe(true)
  expect(re("{kebab-case}").test("gnamView")).toBe(false)
  expect(re("{strictCamelCase}.ts").test("componentName1.ts")).toBe(true)
  expect(re("\\$fileName.ts").test("$fileName.ts")).toBe(true)
})

test("{folderName} 계열 = 부모 폴더 이름의 형식 변환 (리터럴)", () => {
  const re = (name: string) => compileName(name, BUILTIN_PARAMS, "user-profile")
  expect(re("{folderName}.ts").test("userProfile.ts")).toBe(true)
  expect(re("{FolderName}.tsx").test("UserProfile.tsx")).toBe(true)
  expect(re("{folder-name}.md").test("user-profile.md")).toBe(true)
  expect(re("{folder_name}.py").test("user_profile.py")).toBe(true)
  expect(re("{FOLDER_NAME}").test("USER_PROFILE")).toBe(true)
  expect(re("{FolderName}.tsx").test("Other.tsx")).toBe(false)
  expect(substituteNode("../plugins/{node-name}/{NodeName}.md", "gnamView")).toBe("../plugins/gnam-view/GnamView.md")
})

test("layout/schema: JSON · 모르는 키 · 없는 ruleId · 잘못된 정규식 · rules 이름의 '.' · 꺼진 plugin · 재귀 제한 위치", () => {
  expect(parseLayout("{", []).problems[0]).toMatch(/^JSON 파싱 실패/)
  expect(problems({})).toEqual(["structure 없음"])
  const listed = problems({
      structure: [{ name: "a", extra: 1 }, { ruleId: "nope" }, { name: "(" }, { name: "{nope}" }, { ruleId: "lore.folder" }, {}],
      rules: { "a.b": { name: "x" }, r: { name: "r", folderRecursionLimit: 0 } },
      regexParameters: { bad: "(" },
      structureRoot: "../x",
      other: true,
    })
  expect(listed.find((p) => p.startsWith("structure[2].name '(': "))).toMatch(/regular expression/i)
  expect(listed.filter((p) => !p.startsWith("structure[2].name"))).toEqual([
    "모르는 키 other",
    "rules.a.b: 이름은 [A-Za-z0-9_-]+ ('.' 은 plugin 규칙 표기)",
    "regexParameters.bad: 잘못된 정규식 (",
    "structure[0]: 모르는 키 extra",
    "structure[1].ruleId 'nope': rules 에 없음",
    "structure[3].name '{nope}': 알 수 없는 파라미터 {nope}",
    "structure[4].ruleId 'lore.folder': 꺼진 plugin 이거나 plugin 에 없는 규칙",
    "structure[5]: name 또는 ruleId 필요",
    "rules.r.folderRecursionLimit: 1 이상 정수",
    "structureRoot '../x': 저장소 안 상대 경로",
  ])
  expect(problems({ structure: [{ name: "a", children: [{ name: "b", folderRecursionLimit: 2 }] }] })).toEqual([
    "structure[0].children[0].folderRecursionLimit: rules 안에서만",
  ])
  expect(problems({ structure: [{ ruleId: "a" }], rules: { a: { ruleId: "b" }, b: { ruleId: "a" } } })).toContain(
    "rules.a: ruleId 순환 (a → b → a)",
  )
})

test("ruleId 병합: 노드 키가 규칙 키를 덮음 · plugin 규칙 <id>.<이름> · plugin 안 bare ruleId 는 그 plugin 것", () => {
  const plugin = {
    id: "lore",
    version: "0",
    layout: { rules: { folder: { name: "lore", children: [{ ruleId: "entry" }] }, entry: { name: "{lore.topic}.md" } }, regexParameters: { topic: "[a-z-]+" } },
  } as GnamPlugin
  const layout = ok({ structure: [{ ruleId: "lore.folder" }, { ruleId: "shared", name: "pkg" }], rules: { shared: { name: "x", children: [] } } }, [plugin])
  const [first, second] = layout.root.children ?? []
  expect(resolveRule(layout, second!)).toEqual({ rule: { name: "pkg", children: [] }, id: "shared", limit: null })
  expect(resolveRule(layout, first!).rule.children).toEqual([{ ruleId: "lore.entry" }])
  expect(layout.params["lore.topic"]).toBe("[a-z-]+")
  expect(layout.rules.get("lore.folder")?.owner).toBe("lore")
})
