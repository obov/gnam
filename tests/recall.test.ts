import { test } from "node:test"
import { expect } from "./expect.ts"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { collect, type Doc, sections } from "../src/plugins/recall/corpus.ts"
import { search } from "../src/plugins/recall/rank.ts"
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

const doc = (ref: string, text: string, kind: Doc["kind"] = "commit"): Doc => ({ ref, kind, title: text.split("\n")[0] ?? "", text })

test("순위: 조사가 붙은 '재시도를' 문서가 '재시도' query 1위, 무관 문서 제외", () => {
  const docs = [
    doc("c000001", "chore: 재시작 스크립트 정리"),
    doc("c000002", "chore: 설정 시도 기록"),
    doc("c000003", "spec.auth.impl: 토큰 갱신 실패 시 재시도를 추가\n\n간격 1초"),
    doc("c000004", "chore: 배포 설정"),
  ]
  const hits = search(docs, "재시도", 10)
  expect(hits[0]?.doc.ref).toBe("c000003")
  expect(hits.map((h) => h.doc.ref)).not.toContain("c000004")
  expect(search(docs, "— :", 10)).toEqual([])
  expect(search(docs, "재시도 설정", 1)).toHaveLength(1)
})

test("순위: 동점은 수집 순서, 대체된 plan 에 superseded by 표시 (점수 유지)", () => {
  const docs = [
    doc("bbbbbbb", "spec.x.plan: 재시도 새 계획\n\nSupersedes: aaaaaaa1234"),
    doc("aaaaaaa", "spec.x.plan: 재시도 옛 계획"),
    doc("specs/x.md:3", "## 재시도\n", "spec"),
  ]
  const hits = search(docs, "계획", 10)
  expect(hits.map((h) => [h.doc.ref, h.supersededBy])).toEqual([
    ["aaaaaaa", "bbbbbbb"],
    ["bbbbbbb", null],
  ])
  const tie = search([doc("c1", "재시도"), doc("c2", "재시도")], "재시도", 10)
  expect(tie.map((h) => h.doc.ref)).toEqual(["c1", "c2"])
})

test("search 명령: 출력 형식 · --limit · 빈 query exit 1 · 결과 없음 exit 0", () => {
  const repo = tempRepo({ format: 1, plugins: ["@gnam/recall"] })
  try {
    const old = repo.commit("a.txt", "spec.auth.plan: 재시도 계획")
    const next = repo.commit("b.txt", `spec.auth.plan: 재시도 간격 계획\n\nSupersedes: ${old}`)
    writeRepoFile(repo.root, "lore/retry.md", "## 재시도 간격은 1초\n\nWhen: 토큰 갱신\n")
    const out = repo.gnam("run", "recall", "search", "재시도를", "--limit", "5")
    expect(out.status).toBe(0)
    const lines = out.out.trim().split("\n")
    expect(lines).toHaveLength(3)
    expect(lines).toContain(`${old.slice(0, 7)}  commit  spec.auth.plan: 재시도 계획  superseded by ${next.slice(0, 7)}`)
    expect(lines).toContain("lore/retry.md:1  lore  재시도 간격은 1초")
    expect(repo.gnam("run", "recall", "search", "재시도", "--limit", "1").out.trim().split("\n")).toHaveLength(1)
    for (const bad of [["--limit", "0", "재시도"], ["재시도", "--limit"], [":"], []]) {
      const r = repo.gnam("run", "recall", "search", ...bad)
      expect(r.status).toBe(1)
      expect(r.err).toContain("사용: gnam run recall search")
    }
    const none = repo.gnam("run", "recall", "search", "배포")
    expect([none.status, none.out.trim()]).toEqual([0, "결과 없음"])
  } finally {
    repo.cleanup()
  }
})
