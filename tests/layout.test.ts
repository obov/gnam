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

const SPEC_EXAMPLE = {
  structure: [
    { name: "*" },
    { name: "(specs|tests)", children: [] },
    {
      name: "src",
      children: [{ name: "{kebab-case}.ts" }, { name: "plugins", children: [{ ruleId: "plugin_src" }] }],
    },
    { name: "plugins", children: [{ ruleId: "plugin_assets" }] },
  ],
  rules: {
    plugin_src: {
      name: "{kebab-case}",
      enforceExistence: ["index.ts", "../../../plugins/{node-name}/agents.md"],
      children: [{ name: "{kebab-case}.ts" }],
    },
    plugin_assets: { name: "{kebab-case}", children: [{ name: "agents.md" }, { name: "(skills|files)", children: [] }] },
  },
  ignorePatterns: ["dist/**"],
}

test("일치 · 위반: unlisted (실패 단계 · 허용 이름 · 이동 후보) · existence · children [] 자유 · ignore", async () => {
  const { findViolations, matchPath } = await import("../src/plugins/layout/match.ts")
  const layout = ok(SPEC_EXAMPLE)
  const files = [
    "README.md",
    "specs/a/deep/x.md",
    "dist/whatever/a.js",
    "src/cli.ts",
    "src/plugins/lore/index.ts",
    "src/plugins/lore/lore.ts",
    "plugins/lore/agents.md",
    "plugins/lore/skills/gnam-lore/SKILL.md",
    "src/plugins/layout/index.ts",
    "src/plugins/layout/utils/glob.ts",
    "src/plugins/Bad/index.ts",
    "src/plugins/noindex/a.ts",
    "plugins/noindex/agents.md",
  ]
  const found = findViolations(layout, files)
  expect(found.map((f) => `${f.rule} ${f.path}`)).toEqual([
    "layout/unlisted src/plugins/Bad/index.ts",
    "layout/unlisted src/plugins/layout/utils/glob.ts",
    "layout/existence plugins/layout/agents.md",
    "layout/existence src/plugins/noindex/index.ts",
  ])
  const glob = found.find((f) => f.path === "src/plugins/layout/utils/glob.ts")!
  expect(glob.why).toBe("src/plugins/{kebab-case} 아래 허용: {kebab-case}.ts (rule plugin_src)")
  expect(glob.current).toBe("src/plugins/layout/utils/glob.ts\n  utils/ ← 일치하는 노드 없음")
  expect(glob.fix).toContain("A. 이동: src/plugins/layout/glob.ts")
  expect(glob.fix).toContain("B. 구조 변경: .gnam/layout.json 의 rules.plugin_src.children 에 추가 → layout: 커밋")
  expect(matchPath(layout, "src/plugins/x/y.ts").steps.map((s) => s.ruleId)).toEqual([null, null, "plugin_src", null])
  expect(matchPath(layout, "dist/a.js").checked).toBe(false)
})

test("children 정렬: 파일 → 폴더, 리터럴 → 파라미터 → *, 같은 name 은 첫 노드만", async () => {
  const { matchPath } = await import("../src/plugins/layout/match.ts")
  const layout = ok({
    structure: [
      { name: "*", children: [{ name: "hi.js" }] },
      { name: "{camelCase}", children: [{ name: "hello.ts" }] },
      { name: "folderName", children: [{ name: "HELLO.js" }] },
      { name: "folderName", children: [{ name: "ignored.js" }] },
      { name: "{camelCase}.ts" },
      { name: "Hello.ts" },
    ],
  })
  expect(matchPath(layout, "folderName/HELLO.js").ok).toBe(true)
  expect(matchPath(layout, "folderName/ignored.js").ok).toBe(false)
  expect(matchPath(layout, "other/hello.ts").ok).toBe(true)
  expect(matchPath(layout, "Other/hi.js").ok).toBe(true)
  expect(matchPath(layout, "other/hi.js").ok).toBe(false)
  expect(matchPath(layout, "folderName/x.js").allowed).toEqual(["HELLO.js"])
})

test("재귀 · folderRecursionLimit: 제한 초과 = layout/recursion, 마지막 단계는 같은 name 의 다음 노드", async () => {
  const { findViolations } = await import("../src/plugins/layout/match.ts")
  const layout = ok({
    structure: [{ name: "src", ruleId: "folderRule" }],
    rules: {
      folderRule: {
        name: "{camelCase}",
        folderRecursionLimit: 3,
        children: [{ name: "{PascalCase}.*" }, { ruleId: "folderRule" }, { name: "{camelCase}", children: [{ name: "HELLO.ts" }] }],
      },
    },
  })
  const rules = (files: string[]) => findViolations(layout, files).map((f) => `${f.rule} ${f.path}`)
  expect(rules(["src/A.ts", "src/b/B.ts", "src/b/c/C.ts", "src/b/c/d/HELLO.ts"])).toEqual([])
  expect(rules(["src/b/c/d/D.ts"])).toEqual(["layout/recursion src/b/c/d/D.ts"])
  expect(rules(["src/b/c/d/e/E.ts"])).toEqual(["layout/recursion src/b/c/d/e/E.ts"])
  expect(rules(["src/b/lower.ts"])).toEqual(["layout/unlisted src/b/lower.ts"])
})

test("structureRoot 밖 · enforceExistence 가 structureRoot 밖 · 루트 enforceExistence · ignorePatterns AND · 부정", async () => {
  const { findViolations } = await import("../src/plugins/layout/match.ts")
  const { ignored } = await import("../src/plugins/layout/glob.ts")
  const layout = ok({
    structureRoot: "src",
    structure: { enforceExistence: "index.ts", children: [{ name: "{kebab-case}.ts", enforceExistence: "../../x.md" }] },
  })
  expect(findViolations(layout, ["README.md", "BAD.md"])).toEqual([])
  expect(findViolations(layout, ["src/a.ts"]).map((f) => `${f.rule} ${f.current}`)).toEqual([
    "layout/existence src/index.ts 없음",
    "layout/schema src/a.ts: ../../x.md → ../x.md",
  ])
  expect(ignored(["src/legacy/**", ["src/components/**", "!**/*.tsx"]], "src/components/a.ts")).toBe(true)
  expect(ignored(["src/legacy/**", ["src/components/**", "!**/*.tsx"]], "src/components/A.tsx")).toBe(false)
  expect(ignored(["**/*.snap"], "a.snap")).toBe(true)
  expect(ignored(["src/?.ts"], "src/ab.ts")).toBe(false)
})

test("gnam verify 파일 검사: 기본 warn 통과 · enforce block 이면 실패", async () => {
  const { mkdirSync, writeFileSync } = await import("node:fs")
  const { join } = await import("node:path")
  const { tempRepo } = await import("./helpers.ts")
  const repo = tempRepo({ format: 1, plugins: ["@gnam/layout"] })
  try {
    mkdirSync(join(repo.root, ".gnam"), { recursive: true })
    writeFileSync(join(repo.root, ".gnam/layout.json"), JSON.stringify({ structure: [{ name: "gnam.json" }, { name: "src", children: [{ name: "*.ts" }] }] }))
    mkdirSync(join(repo.root, "src"), { recursive: true })
    writeFileSync(join(repo.root, "src/a.js"), "")
    const warn = repo.gnam("verify")
    expect(warn.status).toBe(0)
    expect(warn.err).toContain("GNAM/layout/unlisted (warn)")
    writeFileSync(join(repo.root, "gnam.json"), JSON.stringify({ format: 1, plugins: ["@gnam/layout"], layout: { enforce: "block" } }))
    const block = repo.gnam("verify")
    expect(block.status).toBe(1)
    expect(block.err).toContain("GNAM/layout/unlisted\n")
  } finally {
    repo.cleanup()
  }
})
