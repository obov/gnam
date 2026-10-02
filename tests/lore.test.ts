import { afterEach, test } from "node:test"
import { expect } from "./expect.ts"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { loreEntryProblems, loreViolations } from "../src/plugins/lore/lore.ts"
let root = ""
afterEach(() => rmSync(root, { recursive: true, force: true }))
function fixture(files: Record<string, string>) {
  root = mkdtempSync(join(tmpdir(), "lore-"))
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  return Object.keys(files)
}
test("lore 항목 필드: When · Basis (실측|경험칙) · Evidence, 코드 블록 안 ## 무시", () => {
  const ok = "# 영상\n\n## 첫 3초 질문\n\nWhen: 쇼츠 도입부\nBasis: 실측\nEvidence: a1b2c3d\n\n본문\n"
  expect(loreEntryProblems(ok)).toEqual([])
  expect(loreEntryProblems("# 빈 파일\n```md\n## 예시\n```\n")).toBeNull()
  expect(loreEntryProblems("## 가\nWhen: x\nBasis: 느낌\n")).toEqual(["'가' Basis: 없음", "'가' Evidence: 없음"])
})

test("lore/location · lore/entry-fields · lore/index", () => {
  const entry = "## a\nWhen: x\nBasis: 경험칙\nEvidence: researches/a.md\n"
  const listed = fixture({
    "lore/README.md": "```text\nstory.md  데이터 스토리\ngone.md  지운 파일\n```\n",
    "lore/story.md": entry,
    "lore/extra.md": "## b\nWhen: y\n",
    "lore/sub/x.md": entry,
  })
  expect(loreViolations(root, listed).map((v) => `${v.rule} ${v.current}`)).toEqual([
    "lore/entry-fields lore/extra.md: 'b' Basis: 없음 · 'b' Evidence: 없음",
    "lore/index lore/README.md 에 extra.md 없음",
    "lore/location lore/sub/x.md",
    "lore/index lore/README.md: gone.md 파일 없음",
  ])
})
