import { test } from "node:test"
import { expect } from "./expect.ts"
import { fields, leafPaths, output, OutputError, parsePath, render, select, where } from "../src/core/output.ts"

const tree = {
  gnam: { version: "0.3.0", source: "package" },
  plugins: {
    recall: { version: "0.1.0", kind: "builtin", commands: [{ name: "search" }] },
    "my.local": { version: "1.0.0", kind: "local", commands: [] },
  },
  kinds: [
    { label: "chore: …", owner: "core" },
    { label: "request: …", owner: "request" },
  ],
  handoff: { exists: false, content: null },
  note: "a\nb",
}

const opts = { paths: [] as string[], where: [] as string[], fields: [] as string[], format: "json", keys: false }

function codeOf(fn: () => unknown): number | null {
  try {
    fn()
    return null
  } catch (error) {
    return error instanceof OutputError ? error.code : -1
  }
}

test("경로: 점 · 배열 인덱스 · 따옴표 · 여럿 = 객체 · 없는 경로 exit 2", () => {
  expect(parsePath('plugins."my.local".version')).toEqual(["plugins", "my.local", "version"])
  expect(select(tree, ["gnam.version"])).toBe("0.3.0")
  expect(select(tree, ["kinds.1.owner"])).toBe("request")
  expect(select(tree, ['plugins."my.local".kind'])).toBe("local")
  expect(select(tree, ["gnam.version", "kinds.0.owner"])).toEqual({ "gnam.version": "0.3.0", "kinds.0.owner": "core" })
  expect(codeOf(() => select(tree, ["gnam.nope"]))).toBe(2)
  expect(codeOf(() => select(tree, ["kinds.5"]))).toBe(2)
  expect(codeOf(() => select(tree, ["gnam.toString"]))).toBe(2)
})

test("--where: 배열 · 객체 모음, AND, != , 형식 오류 exit 1", () => {
  expect(where(tree.kinds, ["owner=core"])).toEqual([tree.kinds[0]])
  expect(where(tree.plugins, ["kind=builtin"])).toEqual({ recall: tree.plugins.recall })
  expect(where(tree.plugins, ["kind!=builtin", "version=1.0.0"])).toEqual({ "my.local": tree.plugins["my.local"] })
  expect(where(tree.kinds, ["nope=x"])).toEqual([])
  expect(codeOf(() => where(tree.kinds, ["owner"]))).toBe(1)
  expect(codeOf(() => where(tree.gnam, ["version=1"]))).toBe(1)
})

test("--fields: 원소마다 · 점 경로는 중첩 유지 · 객체 하나", () => {
  expect(fields(tree.kinds, ["owner"])).toEqual([{ owner: "core" }, { owner: "request" }])
  expect(fields(tree.plugins, ["version", "commands.0.name"])).toEqual({
    recall: { version: "0.1.0", commands: { "0": { name: "search" } } },
    "my.local": { version: "1.0.0" },
  })
  expect(fields(tree.gnam, ["version"])).toEqual({ version: "0.3.0" })
})

test("형식: json · compact · ndjson · raw · env · text", () => {
  expect(render({ a: 1 }, "json")).toBe('{\n  "a": 1\n}\n')
  expect(render({ a: 1 }, "compact")).toBe('{"a":1}\n')
  expect(render([1, { b: 2 }], "ndjson")).toBe('1\n{"b":2}\n')
  expect(render({ a: 1 }, "ndjson")).toBe('{"key":"a","value":1}\n')
  expect(render("x y", "raw")).toBe("x y\n")
  expect(render(null, "raw")).toBe("\n")
  expect(render([1], "raw")).toBe("[1]\n")
  expect(render(tree.gnam, "env")).toBe("GNAM_VERSION='0.3.0'\nGNAM_SOURCE='package'\n")
  expect(render({ kinds: [{ label: "it's" }], n: null }, "env")).toBe("GNAM_KINDS_0_LABEL='it'\\''s'\nGNAM_N=''\n")
  expect(render({ gnam: { version: "1" }, list: [{ a: 1, b: 2 }, "x"], empty: [], note: "a\nb" }, "text")).toBe(
    ["gnam:", "  version: 1", "list:", "  - a: 1", "    b: 2", "  - x", "empty: []", "note: |", "  a", "  b", ""].join("\n"),
  )
  expect(codeOf(() => render(1, "yaml"))).toBe(1)
  expect(render([1, 2], "sum", { sum: (v) => String((v as number[]).reduce((a, b) => a + b)) })).toBe("3\n")
})

test("--keys: 고른 값 아래 잎 경로 (고른 경로 접두 포함)", () => {
  expect(leafPaths({ a: { b: 1, c: [] }, "d.e": [2] })).toEqual(["a.b", "a.c", '"d.e".0'])
  expect(output(tree, { ...opts, paths: ["gnam"], keys: true, format: "compact" })).toBe('["gnam.version","gnam.source"]\n')
})

test("처리 순서: 경로 → where → fields → 형식", () => {
  expect(output(tree, { ...opts, paths: ["kinds"], where: ["owner=request"], fields: ["label"], format: "ndjson" })).toBe(
    '{"label":"request: …"}\n',
  )
})
