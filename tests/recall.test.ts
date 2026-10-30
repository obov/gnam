import { test } from "node:test"
import { expect } from "./expect.ts"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { collect, sections } from "../src/plugins/recall/corpus.ts"
import { tokenize } from "../src/plugins/recall/tokenize.ts"
import { tempRepo } from "./helpers.ts"

function writeRepoFile(root: string, path: string, body: string) {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), body)
}

test("토큰화: 한글 bigram · 영문 숫자 소문자 단어 (specs/recall.md 예시)", () => {
  expect(tokenize("재시도를 추가")).toEqual(["재시", "시도", "도를", "추가"])
  expect(tokenize("handoff.md 경로는")).toEqual(["handoff", "md", "경로", "로는"])
  expect(tokenize("plan커밋")).toEqual(["plan", "커밋"])
})

test("토큰화: 1글자 한글 · 대문자 · NFD 입력 · 기호", () => {
  expect(tokenize("시 G5 Deferred:")).toEqual(["시", "g5", "deferred"])
  expect(tokenize("인증".normalize("NFD"))).toEqual(["인증"])
  expect(tokenize("— · :")).toEqual([])
})

test("문서 수집: 커밋 · spec 절 · lore 항목, 코드 블록 안 ## 는 경계 아님", () => {
  const repo = tempRepo()
  try {
    const first = repo.commit("a.txt", "chore: 첫 커밋\n\n본문 줄")
    const second = repo.commit("b.txt", "chore: 두 번째")
    const spec = "# recall\n\n## 명령\n\n```md\n## 예시 아님\n```\n\n## 순위\n\nBM25\n"
    const lore = "# 노하우\n\n## 재시도 간격\n\nWhen: x\n"
    const files = { "specs/recall.md": spec, "specs/README.md": "## 목록\n", "lore/retry.md": lore, "lore/README.md": "## x\n" }
    for (const [path, body] of Object.entries(files)) writeRepoFile(repo.root, path, body)
    const docs = collect(repo.root)
    expect(docs.map((d) => [d.ref, d.kind, d.title])).toEqual([
      [second.slice(0, 7), "commit", "chore: 두 번째"],
      [first.slice(0, 7), "commit", "chore: 첫 커밋"],
      ["specs/recall.md:3", "spec", "명령"],
      ["specs/recall.md:9", "spec", "순위"],
      ["lore/retry.md:3", "lore", "재시도 간격"],
    ])
    expect(docs[1]?.text).toContain("본문 줄")
    expect(docs[2]?.text).toContain("## 예시 아님")
  } finally {
    repo.cleanup()
  }
})

test("문서 수집: spec 머리 절은 # 제목 외 내용이 있을 때만", () => {
  expect(sections("specs/x.md", "spec", "# X\n\n설명\n\n## A\n").map((d) => [d.ref, d.title])).toEqual([
    ["specs/x.md:1", "X"],
    ["specs/x.md:5", "A"],
  ])
  expect(sections("specs/x.md", "spec", "## A\n")).toHaveLength(1)
  expect(sections("lore/x.md", "lore", "# L\n\n설명\n## A\n").map((d) => d.title)).toEqual(["A"])
})
