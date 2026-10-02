import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { validateCommit } from "../src/core/commit.ts"
import type { GnamPlugin } from "../src/core/plugin.ts"

export const PACKAGE = fileURLToPath(new URL("..", import.meta.url))
const BIN = join(PACKAGE, "bin", "gnam.js")

/** 가짜 history 조회. commits = hash → 제목 · 본문 */
export function fakeLookup(commits: Record<string, { subject: string; body?: string }>, specs: string[]) {
  return {
    subjectOf: (hash: string) => commits[hash]?.subject ?? null,
    bodyOf: (hash: string) => (hash in commits ? (commits[hash]?.body ?? "") : null),
    specExists: (topic: string) => specs.includes(topic),
    isAncestor: (hash: string) => hash in commits,
  }
}

export function ruleRunner(lookup: ReturnType<typeof fakeLookup>, plugins: GnamPlugin[] = []) {
  return (message: string, files: string[] | null = [], merge = false) =>
    validateCommit({ message, files, merge, ...lookup }, plugins).map((v) => v.rule)
}

export interface Repo {
  root: string
  git: (...args: string[]) => { status: number; out: string; err: string }
  commit: (file: string, message: string) => string
  gnam: (...args: string[]) => { status: number; out: string; err: string }
  cleanup: () => void
}

/** 임시 git 저장소. node_modules/gnam → 이 패키지. gnam 은 현재 런타임 (node · bun) 으로 실행 */
export function tempRepo(gnamJson: object | null = { format: 1, plugins: [] }): Repo {
  const root = mkdtempSync(join(tmpdir(), "gnam-"))
  mkdirSync(join(root, "node_modules"))
  symlinkSync(PACKAGE, join(root, "node_modules", "gnam"), "dir")
  const run = (cmd: string, args: string[]) => {
    const r = spawnSync(cmd, args, { cwd: root, encoding: "utf8", env: { ...process.env, CI: "" } })
    return { status: r.status ?? 1, out: r.stdout, err: r.stderr }
  }
  const git = (...args: string[]) => run("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args])
  git("init", "-q", "-b", "main")
  if (gnamJson !== null) writeFileSync(join(root, "gnam.json"), JSON.stringify(gnamJson))
  return {
    root,
    git,
    commit(file, message) {
      mkdirSync(dirname(join(root, file)), { recursive: true })
      writeFileSync(join(root, file), file)
      git("add", file)
      git("commit", "-q", "--no-verify", "-m", message)
      return git("rev-parse", "HEAD").out.trim()
    },
    gnam: (...args) => run(process.execPath, [BIN, ...args]),
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  }
}
