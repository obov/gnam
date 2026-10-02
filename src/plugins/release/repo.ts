/**
 * 릴리스 판정 입력을 git 에서 읽는다. 판정은 release/model.ts.
 *
 * view   worktree  gnam run release (작업 트리 · 부모 = HEAD)
 *        index     commit-msg hook (staged · 부모 = HEAD)
 *        commit    CI (그 커밋 · 부모 = 첫 부모)
 */
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import * as core from "../../core/git.ts"
import { infoVersion, type ReleaseConfig } from "./config.ts"
import { classify, type Commit, entriesOf, type ReleaseState } from "./model.ts"

export type View = { kind: "worktree" } | { kind: "index" } | { kind: "commit"; sha: string }

const SPEC_FILE = /^v([1-9]\d*)\.yaml$/

const git = (cwd: string, args: string[]) => core.git(args, cwd)

/** 실패를 빈 결과로 삼키지 않는다 */
const gitOrThrow = (cwd: string, args: string[]) => core.gitOrThrow(args, cwd)

const records = (text: string) =>
  text
    .split("\x1e")
    .map((r) => r.replace(/^\n/, ""))
    .filter(Boolean)
    .map((r) => r.split("\x1f"))

/** 부모 (history 기준) rev. 부모 없는 커밋 · 빈 저장소면 null */
function parentOf(cwd: string, view: View): string | null {
  const rev = view.kind === "commit" ? `${view.sha}^1` : "HEAD"
  return git(cwd, ["rev-parse", "-q", "--verify", `${rev}^{commit}`]).ok ? rev : null
}

function reader(cwd: string, view: View, parent: string) {
  const show = (spec: string) => {
    const result = git(cwd, ["show", spec])
    return result.ok ? result.out : null
  }
  return {
    now: (path: string): string | null => {
      if (view.kind === "worktree") return existsSync(join(cwd, path)) ? readFileSync(join(cwd, path), "utf8") : null
      return show(view.kind === "index" ? `:${path}` : `${view.sha}:${path}`)
    },
    before: (path: string) => show(`${parent}:${path}`),
    list: (dir: string): string[] => {
      if (view.kind === "worktree") return existsSync(join(cwd, dir)) ? readdirSync(join(cwd, dir)) : []
      const out =
        view.kind === "index"
          ? gitOrThrow(cwd, ["ls-files", "--", `${dir}/`])
          : gitOrThrow(cwd, ["ls-tree", "--name-only", view.sha, `${dir}/`])
      return out
        .split("\n")
        .filter(Boolean)
        .map((p) => p.split("/").at(-1) ?? "")
    },
  }
}

function packageOf(text: string | null): { name: string; version: string } | null {
  if (text === null) return null
  try {
    const json = JSON.parse(text) as { name?: unknown; version?: unknown }
    return typeof json.name === "string" && typeof json.version === "string"
      ? { name: json.name, version: json.version }
      : null
  } catch {
    return null
  }
}

/** 가장 큰 v<N>.yaml 의 info.version */
function activeSpecVersion(read: ReturnType<typeof reader>, dir: string): string {
  const majors = read
    .list(`${dir}/spec`)
    .map((name) => Number(SPEC_FILE.exec(name)?.[1] ?? Number.NaN))
    .filter((n) => !Number.isNaN(n))
  if (majors.length === 0) throw new Error(`${dir}/spec/v<N>.yaml 없음 (release.targets ${dir} = openapi)`)
  const file = `${dir}/spec/v${Math.max(...majors)}.yaml`
  const version = infoVersion(read.now(file) ?? "")
  if (version === null) throw new Error(`${file}: info.version 없음`)
  return version
}

/** history 에서 이 package 를 포함한 가장 최근 release 커밋 (merge 제외) */
function lastRelease(cwd: string, parent: string, name: string): { hash: string; version: string } | null {
  const out = gitOrThrow(cwd, ["log", "--no-merges", "-E", "--grep", "^release: ", "--format=%H%x1f%s%x1e", parent])
  for (const [hash = "", subject = ""] of records(out)) {
    const entry = entriesOf(subject)?.entries.find((e) => e.name === name)
    if (entry !== undefined) return { hash, version: entry.version }
  }
  return null
}

function evidenceOf(cwd: string, parent: string, dir: string, last: { hash: string } | null) {
  if (last === null) return []
  const out = gitOrThrow(cwd, [
    "log",
    "--no-merges",
    "--format=%H%x1f%s%x1f%b%x1e",
    `${last.hash}..${parent}`,
    "--",
    dir,
  ])
  const commits: Commit[] = records(out)
    .map(([hash = "", subject = "", body = ""]) => ({ hash, subject, body: body.trim() }))
    .filter((c) => entriesOf(c.subject) === null)
  const format = (hash: string, placeholder: string) => {
    const result = git(cwd, ["log", "-1", `--format=${placeholder}`, `${hash}^{commit}`])
    return result.ok ? result.out.trim() : null
  }
  const lookup = {
    subjectOf: (hash: string) => format(hash, "%s"),
    bodyOf: (hash: string) => format(hash, "%b"),
    afterRelease: (hash: string) => !git(cwd, ["merge-base", "--is-ancestor", hash, last.hash]).ok,
    changesFiles: (hash: string) =>
      git(cwd, ["diff-tree", "--root", "--no-commit-id", "--name-only", "-r", hash]).out.trim() !== "",
  }
  return commits.map((c) => classify(c, lookup))
}

/** 대상마다 판정 입력. 부모가 없으면 (첫 커밋) null */
export function releaseStates(
  cwd: string,
  config: ReleaseConfig,
  view: View,
): { states: ReleaseState[]; date: Date } | null {
  const parent = parentOf(cwd, view)
  if (parent === null) return null
  const read = reader(cwd, view, parent)
  const date =
    view.kind === "commit" ? new Date(gitOrThrow(cwd, ["log", "-1", "--format=%cI", view.sha]).trim()) : new Date()
  const states = Object.entries(config.targets).map(([dir, scheme]): ReleaseState => {
    const now = packageOf(read.now(`${dir}/package.json`))
    if (now === null) throw new Error(`${dir}/package.json 에 name · version 없음 (release.targets)`)
    const before = packageOf(read.before(`${dir}/package.json`))?.version ?? null
    const last = lastRelease(cwd, parent, now.name)
    let evidence: ReturnType<typeof evidenceOf> | null = null
    return {
      dir,
      name: now.name,
      scheme,
      last,
      current: scheme === "openapi" ? activeSpecVersion(read, dir) : now.version,
      before,
      evidence: () => {
        evidence ??= evidenceOf(cwd, parent, dir, last)
        return evidence
      },
    }
  })
  return { states, date }
}
