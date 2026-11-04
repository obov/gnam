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

test("커밋 검사: 새 위반만 · warn / block · 필수 파일 삭제 · layout: 커밋 · layout.json 은 layout: 에서만", async () => {
  const { mkdirSync, rmSync, writeFileSync } = await import("node:fs")
  const { dirname, join } = await import("node:path")
  const { tempRepo } = await import("./helpers.ts")
  const repo = tempRepo({ format: 1, plugins: ["@gnam/layout"] })
  const write = (path: string, content = path) => {
    mkdirSync(dirname(join(repo.root, path)), { recursive: true })
    writeFileSync(join(repo.root, path), content)
    repo.git("add", path)
  }
  const layout = (value: object) => write(".gnam/layout.json", JSON.stringify(value))
  const check = (message: string) => {
    writeFileSync(join(repo.root, ".msg"), message)
    return repo.gnam("commit-msg", join(repo.root, ".msg"))
  }
  const commit = (message: string) => {
    const r = check(message)
    if (r.status === 0) repo.git("commit", "-q", "--no-verify", "-m", message)
    return r
  }
  const base = { structure: [{ name: "gnam.json" }, { name: "*.md" }, { name: "src", children: [{ name: "*.ts" }] }] }
  try {
    write("gnam.json", JSON.stringify({ format: 1, plugins: ["@gnam/layout"] }))
    layout(base)
    write("old.js")
    write("README.md")
    const adopt = commit("chore: layout 도입")
    expect(adopt.status).toBe(0)
    expect(adopt.err).toContain("GNAM/layout/unlisted (warn)")
    expect(adopt.err).toContain("old.js")

    write("old.js", "changed")
    const edit = commit("chore: 기존 위반 파일 수정")
    expect(edit.status).toBe(0)
    expect(edit.err).not.toContain("GNAM/layout")

    write("src/a.js")
    const warn = check("chore: 새 위반")
    expect(warn.status).toBe(0)
    expect(warn.err).toContain("GNAM/layout/unlisted (warn)")
    expect(warn.err).toContain("src/a.js")
    repo.git("rm", "-q", "--cached", "src/a.js")
    rmSync(join(repo.root, "src/a.js"))

    write("gnam.json", JSON.stringify({ format: 1, plugins: ["@gnam/layout"], layout: { enforce: "block" } }))
    write("src/index.ts")
    expect(commit("chore: block · 진입점").status).toBe(0)
    write("src/a.js")
    const block = check("chore: 새 위반 (block)")
    expect(block.status).toBe(1)
    expect(block.err).toContain("GNAM/layout/unlisted\n")
    repo.git("rm", "-q", "--cached", "src/a.js")

    layout({ ...base, structure: [base.structure[0], base.structure[1], { name: "src", enforceExistence: "index.ts", children: [{ name: "*.ts" }] }] })
    expect(check("layout: src 진입점 필수").err).toContain("GNAM/commit/layout-goal")
    write("README.md", "x")
    expect(check("layout: src 진입점 필수\n\nGoal: 진입점 고정").err).toContain("GNAM/commit/layout-files")
    repo.git("reset", "-q", "README.md")
    expect(commit("layout: src 진입점 필수\n\nGoal: 진입점 고정").status).toBe(0)

    repo.git("rm", "-q", "src/index.ts")
    write("src/b.ts")
    const removed = check("chore: 진입점 삭제")
    expect(removed.status).toBe(1)
    expect(removed.err).toContain("GNAM/layout/existence")
    expect(removed.err).toContain("src/index.ts 없음")
    repo.git("reset", "-q", "--hard", "HEAD")

    layout({ ...base, ignorePatterns: ["x/**"] })
    const outside = check("chore: 규칙 몰래 변경")
    expect(outside.status).toBe(1)
    expect(outside.err).toContain("GNAM/commit/layout-files")
    repo.git("reset", "-q", "--hard", "HEAD")

    layout({ structure: [{ name: "(" }] })
    expect(check("layout: 깨진 규칙\n\nGoal: x").err).toContain("GNAM/layout/schema")
    repo.git("reset", "-q", "--hard", "HEAD")

    const verify = repo.gnam("verify")
    expect(verify.status).toBe(1)
    expect(verify.err).toContain("GNAM/layout/unlisted\n")
    expect(verify.err).toContain("old.js")
    expect(verify.err).not.toContain("GNAM/commit/")
  } finally {
    repo.cleanup()
  }
})

test("명령 · status: plugin add scaffold · where (없는 경로) · capture → check 0 · rules 탭 · enforce 형식", async () => {
  const { existsSync, mkdirSync, readFileSync, writeFileSync } = await import("node:fs")
  const { dirname, join } = await import("node:path")
  const { tempRepo } = await import("./helpers.ts")
  const repo = tempRepo()
  const write = (path: string) => {
    mkdirSync(dirname(join(repo.root, path)), { recursive: true })
    writeFileSync(join(repo.root, path), path)
  }
  try {
    writeFileSync(join(repo.root, ".gitignore"), "node_modules\n")
    expect(repo.gnam("plugin", "add", "layout").status).toBe(0)
    expect(existsSync(join(repo.root, ".gnam/layout.json"))).toBe(true)
    expect(readFileSync(join(repo.root, "AGENTS.md"), "utf8")).toContain("### layout (폴더 구조)")
    for (const f of ["src/plugins/lore/index.ts", "src/plugins/lore/lore.ts", "src/plugins/run/index.ts", "src/plugins/run/usage.ts", "src/cli.ts"]) write(f)

    const captured = repo.gnam("run", "layout", "capture", "src")
    expect(captured.status).toBe(0)
    const fragment = JSON.parse(captured.out) as unknown[]
    expect(fragment).toEqual([
      {
        name: "src",
        children: [
          { name: "cli.ts" },
          { name: "plugins", children: [{ name: "{kebab-case}", enforceExistence: ["index.ts"], children: [{ name: "{kebab-case}.ts" }] }] },
        ],
      },
    ])
    writeFileSync(
      join(repo.root, ".gnam/layout.json"),
      JSON.stringify({ structureRoot: "src", structure: { children: (fragment[0] as { children: unknown[] }).children } }),
    )
    const check = repo.gnam("run", "layout", "check")
    expect(check.out).toBe("layout 위반 없음\n")
    expect(check.status).toBe(0)

    const where = repo.gnam("run", "layout", "where", "src/plugins/lore/utils/x.ts")
    expect(where.status).toBe(1)
    expect(where.out).toContain("허용 안 함 (layout/unlisted)")
    expect(where.out).toContain("이동 후보: src/plugins/lore/x.ts")
    const okWhere = JSON.parse(repo.gnam("run", "layout", "where", "src/plugins/new-one/a.ts", "--json").out) as Record<string, unknown>
    expect(okWhere["ok"]).toBe(true)
    expect(okWhere["requires"]).toEqual(["src/plugins/new-one/index.ts"])
    expect(repo.gnam("run", "layout", "show").out).toContain("{kebab-case}/   requires index.ts")

    write("src/plugins/Bad.md")
    const status = JSON.parse(repo.gnam("status", "--json", "--deep").out) as {
      plugins: { layout: { sections: { rules: unknown; violations: unknown } } }
      views: { id: string }[]
    }
    expect(status.plugins.layout.sections.rules).toEqual([])
    expect(status.plugins.layout.sections.violations).toEqual([{ rule: "layout/unlisted", path: "src/plugins/Bad.md", level: "warn" }])
    expect(status.views.map((v) => v.id)).toContain("layout-rules")
    expect(repo.gnam("status").out).toContain("layout 위반 1 (warn)")

    writeFileSync(join(repo.root, "gnam.json"), JSON.stringify({ format: 1, plugins: ["@gnam/layout"], layout: { enforce: "stop" } }))
    const bad = repo.gnam("run", "layout", "check")
    expect(bad.status).not.toBe(0)
    expect(bad.err).toContain('layout: enforce = "warn" | "block"')
  } finally {
    repo.cleanup()
  }
})
