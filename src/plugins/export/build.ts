/**
 * 배포 트리 · 배포 커밋 (specs/export.md 내보내기). git plumbing 으로 index · 작업 트리를 건드리지 않는다.
 *
 * 배포 트리 = <source>:<path> + include 복사본
 * 배포 커밋 = 이전 배포 커밋 (base) 위에 commit-tree. 트리가 base 와 같으면 만들지 않는다
 */
import { spawnSync } from "node:child_process"
import { branchOf, type ExportTarget, sourcePaths } from "./config.ts"

export interface Git {
  ok: boolean
  out: string
  err: string
}

export function gitIn(cwd: string, args: string[], options: { input?: string; env?: Record<string, string> } = {}): Git {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    input: options.input,
    env: { ...process.env, ...options.env },
    maxBuffer: 256 * 1024 * 1024,
  })
  return { ok: result.status === 0, out: result.stdout ?? "", err: result.stderr ?? String(result.error ?? "") }
}

export function gitOk(cwd: string, args: string[], options: { input?: string; env?: Record<string, string> } = {}): string {
  const result = gitIn(cwd, args, options)
  if (!result.ok) throw new Error(`git ${args.join(" ")} 실패\n${result.err.trim()}`)
  return result.out
}

/** rev 의 객체 hash. 없으면 null */
export function resolve(cwd: string, rev: string): string | null {
  const result = gitIn(cwd, ["rev-parse", "-q", "--verify", rev])
  return result.ok ? result.out.trim() : null
}

export const isAncestor = (cwd: string, a: string, b: string) => gitIn(cwd, ["merge-base", "--is-ancestor", a, b]).ok

interface Entry {
  mode: string
  type: string
  sha: string
  name: string
}

function lsTree(cwd: string, tree: string): Entry[] {
  return gitOk(cwd, ["ls-tree", "-z", tree])
    .split("\0")
    .filter(Boolean)
    .map((line) => {
      const [meta = "", name = ""] = line.split("\t")
      const [mode = "", type = "", sha = ""] = meta.split(" ")
      return { mode, type, sha, name }
    })
}

const mktree = (cwd: string, entries: Entry[]) =>
  gitOk(cwd, ["mktree", "-z"], { input: entries.map((e) => `${e.mode} ${e.type} ${e.sha}\t${e.name}\0`).join("") }).trim()

/** tree 의 parts 위치에 entry 를 둔다 (중간 폴더는 만든다). 새 tree hash */
function put(cwd: string, tree: string | null, parts: string[], entry: Omit<Entry, "name">): string {
  const [head = "", ...rest] = parts
  const entries = tree === null ? [] : lsTree(cwd, tree)
  const existing = entries.find((e) => e.name === head)
  const placed =
    rest.length === 0
      ? { ...entry, name: head }
      : { mode: "040000", type: "tree", sha: put(cwd, existing?.type === "tree" ? existing.sha : null, rest, entry), name: head }
  return mktree(cwd, [...entries.filter((e) => e.name !== head), placed])
}

/** source 커밋의 path 객체 (mode · type · sha). 없으면 null */
function objectAt(cwd: string, source: string, path: string): Omit<Entry, "name"> | null {
  const line = gitOk(cwd, ["ls-tree", "-z", source, "--", path]).split("\0").find((l) => l.endsWith(`\t${path}`))
  if (line === undefined) return null
  const [mode = "", type = "", sha = ""] = (line.split("\t")[0] ?? "").split(" ")
  return { mode, type, sha }
}

/** 배포 트리 hash. path · include 원본이 없으면 오류 */
export function composeTree(cwd: string, target: ExportTarget, source: string): string {
  const root = objectAt(cwd, source, target.path)
  if (root === null || root.type !== "tree") throw new Error(`${target.path}: ${source.slice(0, 7)} 에 폴더 없음`)
  let tree = root.sha
  for (const [from, to] of Object.entries(target.include)) {
    const object = objectAt(cwd, source, from)
    if (object === null) throw new Error(`include ${from}: ${source.slice(0, 7)} 에 없음`)
    tree = put(cwd, tree, to.split("/"), object)
  }
  return tree
}

const SOURCE_TRAILER = /^Export-Source:[ \t]*(\S+)[ \t]+([0-9a-f]{40})[ \t]*$/m

/** 배포 커밋의 원본 커밋 hash. trailer 가 없으면 null */
export function sourceOf(cwd: string, commit: string): string | null {
  const body = gitIn(cwd, ["log", "-1", "--format=%B", commit])
  return body.ok ? (SOURCE_TRAILER.exec(body.out)?.[2] ?? null) : null
}

/** 원본 저장소 URL (origin, 자격 제거). 없으면 "." */
export function originUrl(cwd: string): string {
  const result = gitIn(cwd, ["remote", "get-url", "origin"])
  const raw = result.ok ? result.out.trim() : ""
  if (raw === "") return "."
  try {
    const url = new URL(raw)
    url.username = ""
    url.password = ""
    return url.href
  } catch {
    return raw
  }
}

export interface Built {
  id: string
  branch: string
  /** 원본 커밋 */
  source: string
  /** 배포 브랜치 끝 (새 커밋 또는 그대로) */
  commit: string | null
  /** 이전 배포 커밋 */
  base: string | null
  changed: boolean
}

/** 원본 커밋 정보 (author · committer 를 그대로 써서 같은 입력이면 같은 hash) */
function identityEnv(cwd: string, source: string): Record<string, string> {
  const [an = "", ae = "", ad = "", cn = "", ce = "", cd = ""] = gitOk(cwd, [
    "log",
    "-1",
    "--date=raw",
    "--format=%an%x00%ae%x00%ad%x00%cn%x00%ce%x00%cd",
    source,
  ])
    .trim()
    .split("\0")
  return {
    GIT_AUTHOR_NAME: an,
    GIT_AUTHOR_EMAIL: ae,
    GIT_AUTHOR_DATE: ad,
    GIT_COMMITTER_NAME: cn,
    GIT_COMMITTER_EMAIL: ce,
    GIT_COMMITTER_DATE: cd,
  }
}

export const messageOf = (subject: string, url: string, source: string, id: string) =>
  `export: ${subject}\n\nExport-Source: ${url} ${source}\nExport-Target: ${id}\n`

/**
 * source 기준 배포 커밋을 base 위에 만든다 (base 기본 = 로컬 배포 브랜치 끝).
 * 배포 브랜치를 새 끝으로 옮긴다. 트리가 base 와 같으면 커밋 없음 (changed false)
 */
export function build(cwd: string, id: string, target: ExportTarget, sourceRev = "HEAD", base?: string | null): Built {
  const source = resolve(cwd, `${sourceRev}^{commit}`)
  if (source === null) throw new Error(`${sourceRev}: 커밋 없음`)
  const branch = branchOf(id)
  const current = resolve(cwd, branch)
  const parent = base === undefined ? current : base
  const tree = composeTree(cwd, target, source)
  if (parent !== null && resolve(cwd, `${parent}^{tree}`) === tree) {
    if (current !== parent) gitOk(cwd, ["update-ref", branch, parent, ...(current === null ? [] : [current])])
    return { id, branch, source, commit: parent, base: parent, changed: false }
  }
  const subject = gitOk(cwd, ["log", "-1", "--format=%s", source]).trim()
  const commit = gitOk(cwd, ["commit-tree", tree, ...(parent === null ? [] : ["-p", parent]), "-F", "-"], {
    input: messageOf(subject, originUrl(cwd), source, id),
    env: identityEnv(cwd, source),
  }).trim()
  gitOk(cwd, ["update-ref", branch, commit, ...(current === null ? [] : [current])])
  return { id, branch, source, commit, base: parent, changed: true }
}

export interface TargetState {
  id: string
  path: string
  repo: string
  tag: string | null
  /** HEAD 의 version 파일 값. 없으면 null */
  version: string | null
  /** 로컬 배포 브랜치 끝의 Export-Source. 브랜치가 없으면 null */
  lastSource: string | null
  /** lastSource 이후 path · include 를 바꾼 커밋 수. 배포 트리가 HEAD 와 같으면 0 */
  pending: number | null
}

export function versionAt(cwd: string, rev: string, file: string | null): string | null {
  if (file === null) return null
  const result = gitIn(cwd, ["show", `${rev}:${file}`])
  return result.ok ? result.out.trim() : null
}

/** status 한 대상. 네트워크 없음 */
export function targetState(cwd: string, id: string, target: ExportTarget): TargetState {
  const head = resolve(cwd, "HEAD^{commit}")
  const tip = resolve(cwd, branchOf(id))
  const lastSource = tip === null ? null : sourceOf(cwd, tip)
  const base = { id, path: target.path, repo: target.repo, tag: target.tag, version: head === null ? null : versionAt(cwd, head, target.version), lastSource }
  if (head === null) return { ...base, pending: 0 }
  let same = false
  try {
    same = tip !== null && composeTree(cwd, target, head) === resolve(cwd, `${tip}^{tree}`)
  } catch {
    same = false
  }
  if (same) return { ...base, pending: 0 }
  const known = lastSource !== null && resolve(cwd, `${lastSource}^{commit}`) !== null
  if (lastSource !== null && !known) return { ...base, pending: null }
  const range = lastSource === null ? [head] : [`${lastSource}..${head}`]
  const count = Number(gitOk(cwd, ["rev-list", "--count", ...range, "--", ...sourcePaths(target)]).trim())
  return { ...base, pending: count }
}
