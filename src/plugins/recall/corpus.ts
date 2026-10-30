/**
 * recall 검색 대상 수집 (specs/recall.md 검색 대상). 매 실행마다 저장소에서 다시 읽는다.
 *   커밋 = HEAD 에서 도달 가능한 커밋의 제목 + 본문 (새 것부터)
 *   spec = specs/*.md 의 ## 절 + 머리 절,  lore = lore/*.md 의 ## 항목
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { git, gitOrThrow, nulList } from "../../core/git.ts"

export type DocKind = "commit" | "spec" | "lore"

export interface Doc {
  ref: string
  kind: DocKind
  title: string
  text: string
}

export function commitDocs(cwd: string): Doc[] {
  if (!git(["rev-parse", "-q", "--verify", "HEAD"], cwd).ok) return []
  const fields = gitOrThrow(["log", "-z", "--format=%h%x00%s%x00%b", "--abbrev=7", "HEAD"], cwd).split("\0")
  const docs: Doc[] = []
  for (let i = 0; i + 2 < fields.length; i += 3) {
    const [hash = "", subject = "", body = ""] = fields.slice(i, i + 3)
    docs.push({ ref: hash.trim(), kind: "commit", title: subject, text: `${subject}\n${body}` })
  }
  return docs
}

const SECTION_DIRS: Record<string, DocKind> = { "specs/": "spec", "lore/": "lore" }
const SECTION_FILE = /^(specs|lore)\/[^/]+\.md$/

/** ## 절 단위. 코드 블록 안 ## 줄은 경계 아님. 머리 절 (첫 ## 전) 은 # 제목 줄 외 내용이 있을 때만 */
export function sections(path: string, kind: DocKind, source: string): Doc[] {
  const lines = source.split("\n")
  const parts: { line: number; title: string | null; lines: string[] }[] = [{ line: 1, title: null, lines: [] }]
  let fenced = false
  for (const [i, line] of lines.entries()) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced
    if (!fenced && line.startsWith("## ")) parts.push({ line: i + 1, title: line.slice(3).trim(), lines: [] })
    parts.at(-1)?.lines.push(line)
  }
  const [head, ...rest] = parts
  const docs: Doc[] = []
  if (kind === "spec" && head !== undefined && head.lines.some((l) => l.trim() !== "" && !l.startsWith("# "))) {
    const h1 = head.lines.find((l) => l.startsWith("# "))
    docs.push({ ref: `${path}:1`, kind, title: h1 === undefined ? path : h1.slice(2).trim(), text: head.lines.join("\n") })
  }
  for (const part of rest) docs.push({ ref: `${path}:${part.line}`, kind, title: part.title ?? path, text: part.lines.join("\n") })
  return docs
}

/** files = git 추적 · 미추적 (무시 제외) 파일 */
export function fileDocs(cwd: string, files: string[]): Doc[] {
  return files
    .filter((f) => SECTION_FILE.test(f) && !f.endsWith("/README.md"))
    .sort((a, b) => kindOrder(a) - kindOrder(b) || (a < b ? -1 : a > b ? 1 : 0))
    .flatMap((f) => sections(f, kindOf(f), readFileSync(join(cwd, f), "utf8")))
}

const kindOf = (file: string): DocKind => SECTION_DIRS[file.slice(0, file.indexOf("/") + 1)] ?? "spec"
const kindOrder = (file: string) => (kindOf(file) === "spec" ? 0 : 1)

/** 수집 순서 = 커밋 (새 것부터) → spec → lore. 동점 순위의 기준 */
export function collect(cwd: string): Doc[] {
  const files = nulList(gitOrThrow(["ls-files", "-z", "--cached", "--others", "--exclude-standard"], cwd))
  return [...commitDocs(cwd), ...fileDocs(cwd, files)]
}
