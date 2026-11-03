/**
 * gnam run multirun start · sync · status · collect · open · close · abort (specs/multirun.md '명령').
 * CLI 는 기계적인 부분만: clone 준비 · ref 보존 · 측정 수집 · 보존 확인 후 정리. 세션 실행 · 커밋 판단은 스킬 (gnam-multirun).
 *
 *   상태   <git common dir>/gnam/multirun/<run-id>/state.json (커밋 안 됨)
 *   clone  ${XDG_CACHE_HOME:-~/.cache}/gnam/multirun/<repo>-<run-id>/vN
 *   tag    multirun/<run-id>/vN/heads/<branch> · multirun/<run-id>/vN/tags/<tag>
 */
import { randomUUID } from "node:crypto"
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { basename, dirname, join } from "node:path"
import { spawnSync } from "node:child_process"
import { PLAN_SUBJECT, readyOf } from "../../core/commit.ts"
import { git, lines } from "../../core/git.ts"
import { PACKAGE_ROOT } from "../../core/loader.ts"
import type { GnamConfig } from "../../core/plugin.ts"
import { agentsOf, fieldOf, NA } from "../run/run-format.ts"
import { usageOf } from "../run/run-usage.ts"
import { blockOf, byNumber, KEY_ORDER, RUN_ID, VARIANT } from "./model.ts"

export interface MultirunConfig {
  /** null = lock 파일로 판정. 문자열 = 그 셸 명령 */
  setup: string | null
  copy: string[]
}
export const MULTIRUN_DEFAULTS: MultirunConfig = { setup: null, copy: [".env"] }

export function multirunConfigProblems(value: unknown): string[] {
  if (value === undefined) return []
  if (typeof value !== "object" || value === null || Array.isArray(value)) return ["객체여야 함 ({ setup, copy })"]
  const problems: string[] = []
  const v = value as Record<string, unknown>
  for (const key of Object.keys(v)) if (key !== "setup" && key !== "copy") problems.push(`모르는 키 ${key}`)
  if ("setup" in v && v["setup"] !== null && typeof v["setup"] !== "string") problems.push("setup: 문자열 또는 null")
  if ("copy" in v && (!Array.isArray(v["copy"]) || v["copy"].some((p) => typeof p !== "string" || p === "")))
    problems.push("copy: 상대 경로 문자열 배열")
  return problems
}

const configOf = (config: GnamConfig): MultirunConfig => ({ ...MULTIRUN_DEFAULTS, ...((config["multirun"] as Partial<MultirunConfig>) ?? {}) })

export interface VariantState {
  name: string
  clone: string
  agent: "claude" | "codex"
  session: string
  model: string
  effort: string
}

export interface RunState {
  id: string
  plan: string
  topic: string
  base: string
  branch: string
  source: string
  created: string
  closed: string | null
  variants: VariantState[]
  opened: string[]
}

class Failure extends Error {}

const commonDir = (cwd: string) => {
  const out = git(["rev-parse", "--path-format=absolute", "--git-common-dir"], cwd)
  if (!out.ok) throw new Failure("git 저장소 밖")
  return out.out.trim()
}
/** 원본 작업 트리 (worktree 안에서 실행해도 main 작업 트리) */
function sourceOf(cwd: string): string {
  const common = commonDir(cwd)
  if (basename(common) === ".git") return dirname(common)
  const top = git(["rev-parse", "--show-toplevel"], cwd)
  if (!top.ok) throw new Failure("작업 트리 없음 (bare 저장소)")
  return top.out.trim()
}
const statesRoot = (cwd: string) => join(commonDir(cwd), "gnam", "multirun")
const stateFile = (cwd: string, id: string) => join(statesRoot(cwd), id, "state.json")
export const cacheRoot = () => join(process.env["XDG_CACHE_HOME"] || join(homedir(), ".cache"), "gnam", "multirun")

function readState(cwd: string, id: string): RunState {
  const file = stateFile(cwd, id)
  if (!existsSync(file)) throw new Failure(`multirun ${id} 없음 (${file})`)
  return JSON.parse(readFileSync(file, "utf8")) as RunState
}
const writeState = (cwd: string, state: RunState) => {
  mkdirSync(dirname(stateFile(cwd, state.id)), { recursive: true })
  writeFileSync(stateFile(cwd, state.id), `${JSON.stringify(state, null, 2)}\n`)
}
export function stateIds(cwd: string): string[] {
  const root = statesRoot(cwd)
  if (!existsSync(root)) return []
  return readdirSync(root)
    .filter((name) => RUN_ID.test(name) && existsSync(join(root, name, "state.json")))
    .sort(byNumber)
}

const must = (args: string[], cwd: string) => {
  const r = git(args, cwd)
  if (!r.ok) throw new Failure(`git ${args.join(" ")} 실패\n${r.err.trim()}`)
  return r.out
}
/** ref 이름 → hash */
function refsOf(cwd: string, ...patterns: string[]): Map<string, string> {
  const out = git(["for-each-ref", "--format=%(refname) %(objectname)", ...patterns], cwd)
  return new Map(lines(out.ok ? out.out : "").map((line) => line.split(" ") as [string, string]))
}
const tagPrefix = (id: string, name: string) => `refs/tags/multirun/${id}/${name}`

// ── start ──────────────────────────────────────────────

/** lock 파일로 설치 명령 판정. 없으면 null */
export function detectSetup(dir: string): string | null {
  const has = (file: string) => existsSync(join(dir, file))
  if (has("package-lock.json")) return "npm ci"
  if (has("bun.lock") || has("bun.lockb")) return "bun install"
  if (has("pnpm-lock.yaml")) return "pnpm install --frozen-lockfile"
  if (has("yarn.lock")) return "yarn install --frozen-lockfile"
  return null
}

/**
 * clone 에서 link 를 돌릴 gnam. clone 자신의 설치본 → clone 이 gnam 패키지 자체 → 실행 중인 gnam 순.
 * 실행 중인 gnam (원본의 설치본) 을 쓰면 스킬 링크가 원본 경로를 가리켜 clone 이 dirty 가 된다.
 */
export function gnamBinFor(clone: string): string {
  const installed = join(clone, "node_modules", "@obov", "gnam", "bin", "gnam.js")
  if (existsSync(installed)) return installed
  try {
    const pkg = JSON.parse(readFileSync(join(clone, "package.json"), "utf8")) as { name?: unknown }
    if (pkg.name === "@obov/gnam" && existsSync(join(clone, "bin", "gnam.js"))) return join(clone, "bin", "gnam.js")
  } catch {
    // package.json 없음 · 형식 오류 = 설치본 없음
  }
  return join(PACKAGE_ROOT, "bin", "gnam.js")
}

/** vN=값 지정. 'x' 만 쓰면 전체 기본값 */
function perVariant(args: string[], flag: string): { all: string | null; by: Map<string, string> } {
  const by = new Map<string, string>()
  let all: string | null = null
  for (let i = 0; i < args.length; i++) {
    if (args[i] !== flag) continue
    const value = args[i + 1] ?? ""
    const m = /^(v[1-9]\d*)=(.+)$/.exec(value)
    if (m !== null) by.set(m[1] ?? "", m[2] ?? "")
    else if (value !== "") all = value
  }
  return { all, by }
}

export function startDraft(state: RunState): string {
  const agents = state.variants.map(
    (v) => `Agent: ${v.name} role=variant model=${v.model} effort=${v.effort} agent=${v.agent} session=${v.session}`,
  )
  return `multirun.${state.topic}.start: ${state.variants.length} 변형\n\nPlan: ${state.plan.slice(0, 7)}\nId: ${state.id}\nBase: ${state.base.slice(0, 7)}\n\n${agents.join("\n")}\n`
}

export function start(args: string[], cwd: string, config: GnamConfig): number {
  const planArg = args.find((a, i) => !a.startsWith("-") && !["-n", "--model", "--agent", "--effort"].includes(args[i - 1] ?? ""))
  const nAt = args.indexOf("-n")
  const n = Number(args[nAt + 1])
  if (planArg === undefined || nAt < 0 || !Number.isInteger(n) || n < 2) {
    console.error("사용: gnam run multirun start <plan> -n <N≥2> [--model [vN=]<id>] [--effort [vN=]<e>] [--agent vN=codex]")
    return 1
  }
  const source = sourceOf(cwd)
  const resolved = git(["rev-parse", "--verify", "-q", `${planArg}^{commit}`], source)
  if (!resolved.ok) throw new Failure(`plan 없음: ${planArg}`)
  const plan = resolved.out.trim()
  const topic = PLAN_SUBJECT.exec(must(["show", "-s", "--format=%s", plan], source))?.[1]
  if (topic === undefined) throw new Failure(`${planArg}: spec.<topic>.plan: 커밋이 아님`)
  if (readyOf(must(["show", "-s", "--format=%b", plan], source)) !== true) throw new Failure(`${planArg}: Blocking 이 남은 plan (착수 가능 조건 1)`)
  if (!git(["merge-base", "--is-ancestor", plan, "HEAD"], source).ok) throw new Failure(`${planArg}: HEAD 의 조상 아님`)
  const branch = git(["symbolic-ref", "--short", "-q", "HEAD"], source)
  if (!branch.ok) throw new Failure("detached HEAD. 브랜치에서 실행한다")
  const base = must(["rev-parse", "HEAD"], source).trim()

  const plan7 = plan.slice(0, 7)
  const k = stateIds(cwd).filter((id) => id.startsWith(`${plan7}-`)).length + 1
  const id = `${plan7}-${k}`
  const models = perVariant(args, "--model")
  const efforts = perVariant(args, "--effort")
  const agents = perVariant(args, "--agent")
  const dir = join(cacheRoot(), `${basename(source)}-${id}`)
  if (existsSync(dir)) throw new Failure(`clone 위치가 이미 있음: ${dir}`)
  const { setup, copy } = configOf(config)
  const variants: VariantState[] = []
  const state: RunState = {
    id,
    plan,
    topic,
    base,
    branch: branch.out.trim(),
    source,
    created: new Date().toISOString(),
    closed: null,
    variants,
    opened: [],
  }
  try {
    for (let i = 1; i <= n; i++) {
      const name = `v${i}`
      const clone = join(dir, name)
      mkdirSync(dir, { recursive: true })
      must(["clone", "-q", "--no-tags", "--single-branch", "--branch", state.branch, source, clone], source)
      must(["remote", "remove", "origin"], clone)
      must(["checkout", "-q", "-b", name], clone)
      // 기준 브랜치 사본은 지운다 (보존 tag 에 원본과 같은 브랜치가 변형마다 생기지 않게). Base 는 vN 이력에 있다
      must(["branch", "-q", "-D", state.branch], clone)
      for (const path of copy) if (existsSync(join(source, path))) cpSync(join(source, path), join(clone, path), { recursive: true })
      const command = setup ?? detectSetup(clone)
      if (command !== null) {
        const r = spawnSync("sh", ["-c", command], { cwd: clone, encoding: "utf8" })
        if (r.status !== 0) throw new Failure(`${name} setup 실패 (${command})\n${r.stdout ?? ""}${r.stderr ?? ""}`.trimEnd())
      }
      if (existsSync(join(clone, "gnam.json"))) {
        const r = spawnSync(process.execPath, [gnamBinFor(clone), "link"], { cwd: clone, encoding: "utf8" })
        if (r.status !== 0) throw new Failure(`${name} gnam link 실패\n${r.stdout ?? ""}${r.stderr ?? ""}`.trimEnd())
      }
      const agent = agents.by.get(name) === "codex" ? "codex" : "claude"
      variants.push({
        name,
        clone,
        agent,
        session: agent === "claude" ? randomUUID() : NA,
        model: models.by.get(name) ?? models.all ?? "?",
        effort: efforts.by.get(name) ?? efforts.all ?? "?",
      })
    }
    writeState(cwd, state)
  } catch (error) {
    rmSync(dir, { recursive: true, force: true })
    rmSync(dirname(stateFile(cwd, id)), { recursive: true, force: true })
    throw error
  }
  const draft = startDraft(state)
  const draftFile = join(dirname(stateFile(cwd, id)), "start-message.txt")
  writeFileSync(draftFile, draft)
  console.log(`multirun ${id}  plan ${plan7} (${topic}) · base ${base.slice(0, 7)} · 변형 ${n}`)
  for (const v of variants) console.log(`  ${v.name}  ${v.clone}  session ${v.session}`)
  console.log(`\nstart 커밋 초안 (model · effort 의 ? 를 채운 뒤 git commit --allow-empty -F ${draftFile}):\n`)
  console.log(draft)
  return 0
}

// ── sync ───────────────────────────────────────────────

/** 변형 이름 → 갱신된 ref 수. clone 없으면 null */
export function syncRun(cwd: string, state: RunState): Map<string, number | null> {
  const result = new Map<string, number | null>()
  for (const v of state.variants) {
    if (!existsSync(v.clone)) {
      result.set(v.name, null)
      continue
    }
    const prefix = tagPrefix(state.id, v.name)
    const before = refsOf(state.source, prefix)
    must(["fetch", "-q", "--no-tags", v.clone, `+refs/heads/*:${prefix}/heads/*`, `+refs/tags/*:${prefix}/tags/*`], state.source)
    const after = refsOf(state.source, prefix)
    result.set(v.name, [...after].filter(([ref, hash]) => before.get(ref) !== hash).length)
  }
  return result
}

const targets = (args: string[], cwd: string, all = false) => {
  const id = args.find((a) => !a.startsWith("-"))
  if (id !== undefined) return [readState(cwd, id)]
  return stateIds(cwd)
    .map((i) => readState(cwd, i))
    .filter((s) => all || s.closed === null)
}

export function sync(args: string[], cwd: string): number {
  for (const state of targets(args, cwd)) {
    console.log(`multirun ${state.id}`)
    for (const [name, count] of syncRun(cwd, state)) console.log(`  ${name}  ${count === null ? "clone 없음 (건너뜀)" : `갱신 ${count}`}`)
  }
  return 0
}

// ── status ─────────────────────────────────────────────

const RECORD = "\x1e"
const UNIT = "\x1f"
/** HEAD 에서 닿는 multirun 커밋 (hash · 제목 · 본문) */
function multirunCommits(source: string, kind: "start" | "report") {
  const out = git(["log", `--format=%H${UNIT}%s${UNIT}%B${RECORD}`, "-E", `--grep=^multirun\\.[A-Za-z0-9_-]+\\.${kind}: `], source)
  if (!out.ok) return []
  return out.out
    .split(RECORD)
    .map((r) => r.replace(/^\n/, ""))
    .filter((r) => r !== "")
    .map((r) => {
      const [hash = "", subject = "", body = ""] = r.split(UNIT)
      return { hash, subject, body }
    })
}
export const startOf = (state: RunState) => multirunCommits(state.source, "start").find((c) => fieldOf(c.body, "Id") === state.id) ?? null
export function reportOf(state: RunState) {
  const startCommit = startOf(state)
  if (startCommit === null) return null
  return (
    multirunCommits(state.source, "report").find((c) => {
      const ref = fieldOf(c.body, "Start")?.split(/\s+/)[0] ?? ""
      return ref.length >= 7 && startCommit.hash.startsWith(ref)
    }) ?? null
  )
}

/** clone 의 ref 와 보존 tag 를 대조. 어긋난 ref 이름 */
function unsynced(state: RunState, v: VariantState): string[] {
  const tags = refsOf(state.source, tagPrefix(state.id, v.name))
  const prefix = tagPrefix(state.id, v.name)
  const out: string[] = []
  for (const [ref, hash] of refsOf(v.clone, "refs/heads", "refs/tags")) {
    const mapped = ref.startsWith("refs/heads/") ? `${prefix}/heads/${ref.slice(11)}` : `${prefix}/tags/${ref.slice(10)}`
    if (tags.get(mapped) !== hash) out.push(ref)
  }
  return out
}
/** 미커밋 · untracked (ignore 제외) · stash */
function dirtyOf(clone: string): string[] {
  const out: string[] = []
  const status = git(["status", "--porcelain"], clone)
  const changed = lines(status.out)
  if (changed.some((l) => !l.startsWith("??"))) out.push("미커밋 변경")
  if (changed.some((l) => l.startsWith("??"))) out.push("untracked 파일")
  if (lines(git(["stash", "list"], clone).out).length > 0) out.push("stash")
  return out
}

const VARIANT_COMMIT = /^multirun\.[A-Za-z0-9_-]+\.variant: /

export interface VariantStatus {
  name: string
  model: string
  clone: string | null
  tip: string | null
  variant: string | null
  synced: boolean | null
  dirty: string[] | null
}
export interface RunStatus {
  id: string
  plan: string
  topic: string
  start: string | null
  report: string | null
  closed: string | null
  variants: VariantStatus[]
}

export function runStatus(state: RunState): RunStatus {
  const startCommit = startOf(state)
  const committed = new Map(agentsOf(startCommit?.body ?? "").map((a) => [a.name, a.fields["model"] ?? ""]))
  const variants = state.variants.map((v): VariantStatus => {
    const alive = existsSync(v.clone)
    const tag = `${tagPrefix(state.id, v.name)}/heads/${v.name}`
    const tipRef = alive ? git(["rev-parse", "-q", "--verify", v.name], v.clone) : git(["rev-parse", "-q", "--verify", tag], state.source)
    const tip = tipRef.ok ? tipRef.out.trim() : null
    const where = alive ? v.clone : state.source
    const variantCommit =
      tip === null
        ? null
        : (lines(git(["log", "--format=%H %s", `${state.base}..${tip}`], where).out)
            .map((l) => l.split(" "))
            .find(([, ...s]) => VARIANT_COMMIT.test(s.join(" ")))?.[0] ?? null)
    return {
      name: v.name,
      model: committed.get(v.name) || v.model,
      clone: alive ? v.clone : null,
      tip,
      variant: variantCommit,
      synced: alive ? unsynced(state, v).length === 0 : null,
      dirty: alive ? dirtyOf(v.clone) : null,
    }
  })
  return {
    id: state.id,
    plan: state.plan,
    topic: state.topic,
    start: startCommit?.hash ?? null,
    report: reportOf(state)?.hash ?? null,
    closed: state.closed,
    variants,
  }
}

export const statusData = (args: string[], cwd: string) => ({ runs: targets(args, cwd).map(runStatus) })

export function showStatus(args: string[], cwd: string): number {
  const runs = statusData(args, cwd).runs
  if (runs.length === 0) console.log("multirun 없음")
  const short = (h: string | null) => (h === null ? "없음" : h.slice(0, 7))
  for (const run of runs) {
    console.log(`${run.id}  spec.${run.topic}.plan ${short(run.plan)} · start ${short(run.start)} · report ${short(run.report)}${run.closed ? ` · closed ${run.closed}` : ""}`)
    for (const v of run.variants) {
      const cols = [
        v.name,
        v.model,
        v.clone === null ? "clone 없음" : v.variant !== null ? "variant 있음" : "진행",
        `tip ${short(v.tip)}`,
        v.synced === null ? "-" : v.synced ? "synced" : "미sync",
        v.dirty === null ? "-" : v.dirty.length === 0 ? "clean" : v.dirty.join(","),
      ]
      console.log(`  ${cols.join("  ")}`)
    }
  }
  return 0
}

/** gnam status 요약 줄 (G3) */
export function summaryLines(cwd: string): string[] {
  let ids: string[]
  try {
    ids = stateIds(cwd)
  } catch {
    return []
  }
  const out: string[] = []
  for (const id of ids) {
    const state = readState(cwd, id)
    if (state.closed !== null) continue
    const status = runStatus(state)
    const pending = status.variants.filter((v) => v.synced === false).map((v) => v.name)
    if (pending.length > 0) out.push(`multirun ${id} 미sync clone ${pending.join(" ")}`)
    if (status.report === null) out.push(`multirun ${id} report 없음`)
  }
  return out
}

// ── collect ────────────────────────────────────────────

const minutes = (from: number, to: number) => Math.max(0, Math.round((to - from) / 60))
const commitTime = (source: string, rev: string) => Number(must(["show", "-s", "--format=%ct", rev], source).trim())

export async function collectData(state: RunState) {
  const startCommit = startOf(state)
  const assigned = new Map(agentsOf(startCommit?.body ?? "").map((a) => [a.name, a.fields]))
  const startAt = startCommit !== null ? commitTime(state.source, startCommit.hash) : Math.round(Date.parse(state.created) / 1000)
  const variants = []
  for (const v of state.variants) {
    const tag = `multirun/${state.id}/${v.name}/heads/${v.name}`
    const tipRef = git(["rev-parse", "-q", "--verify", `refs/tags/${tag}`], state.source)
    const tip = tipRef.ok ? tipRef.out.trim() : null
    const commits =
      tip === null
        ? []
        : must(["log", `--format=%H${UNIT}%s${UNIT}%B${RECORD}`, `${state.base}..${tip}`], state.source)
            .split(RECORD)
            .map((r) => r.replace(/^\n/, ""))
            .filter((r) => r !== "")
            .map((r) => {
              const [hash = "", subject = "", body = ""] = r.split(UNIT)
              return { hash, subject, body: body.trim() }
            })
    const variantCommit = commits.find((c) => VARIANT_COMMIT.test(c.subject)) ?? null
    const variant =
      variantCommit === null
        ? null
        : Object.fromEntries(
            ["Id", "Approach", "Plugins", "Checks", "Decisions", "Deviation", "Remaining"].map((f) => [f, (blockOf(variantCommit.body, f) ?? []).join("\n")]),
          )
    const numstat =
      tip === null
        ? []
        : lines(must(["diff", "--numstat", state.base, tip], state.source)).map((l) => {
            const [added = "0", deleted = "0", ...path] = l.split("\t")
            return { path: path.join("\t"), added: Number(added) || 0, deleted: Number(deleted) || 0 }
          })
    const endRev = variantCommit?.hash ?? tip
    const usage = v.agent === "claude" && v.session !== NA ? await usageOf(v.session) : null
    const sub = { sessions: 0, active_min: 0, out: 0 }
    for (const c of commits.filter((c) => /^run\.[A-Za-z0-9_-]+\.end: /.test(c.subject)))
      for (const agent of agentsOf(c.body)) {
        sub.sessions++
        sub.active_min += Number(agent.fields["active_min"]) || 0
        sub.out += Number(agent.fields["out"]) || 0
      }
    variants.push({
      name: v.name,
      model: assigned.get(v.name)?.["model"] ?? v.model,
      effort: assigned.get(v.name)?.["effort"] ?? v.effort,
      agent: v.agent,
      session: v.session,
      tip,
      tag: tip === null ? null : tag,
      commits,
      variant,
      numstat,
      lines: numstat.reduce((t, f) => t + f.added + f.deleted, 0),
      wall_min: endRev === null ? null : minutes(startAt, commitTime(state.source, endRev)),
      usage:
        usage === null
          ? null
          : {
              model: usage.model,
              effort: usage.effort,
              active_min: usage.active_min,
              out: usage.out,
              input: usage.input,
              cache_write: usage.cache_write,
              cache_read: usage.cache_read,
              requests: usage.requests,
              api_errors: usage.api_errors,
              harness: usage.harness,
            },
      sub,
    })
  }
  return { id: state.id, plan: state.plan, topic: state.topic, base: state.base, start: startCommit?.hash ?? null, variants }
}

export async function collect(args: string[], cwd: string): Promise<number> {
  const id = args.find((a) => !a.startsWith("-"))
  if (id === undefined) {
    console.error("사용: gnam run multirun collect <run-id>")
    return 1
  }
  const state = readState(cwd, id)
  syncRun(cwd, state)
  console.log(JSON.stringify(await collectData(state), null, 2))
  return 0
}

// ── open ───────────────────────────────────────────────

export function open(args: string[], cwd: string): number {
  const [id, name] = args.filter((a) => !a.startsWith("-"))
  if (id === undefined || name === undefined || !VARIANT.test(name)) {
    console.error("사용: gnam run multirun open <run-id> <vN>")
    return 1
  }
  const state = readState(cwd, id)
  if (!state.variants.some((v) => v.name === name)) throw new Failure(`${id} 에 ${name} 없음`)
  syncRun(cwd, state)
  const tag = `refs/tags/${tagPrefix(state.id, name).slice(10)}/heads/${name}`
  if (!git(["rev-parse", "-q", "--verify", tag], state.source).ok) throw new Failure(`보존 tag 없음: ${tag}`)
  const path = join(cacheRoot(), `${basename(state.source)}-${id}`, `open-${name}`)
  if (!existsSync(path)) must(["worktree", "add", "-q", "--detach", path, tag], state.source)
  if (!state.opened.includes(path)) state.opened.push(path)
  writeState(cwd, state)
  console.log(path)
  return 0
}

// ── close · abort ──────────────────────────────────────

export function close(args: string[], cwd: string): number {
  const id = args.find((a, i) => !a.startsWith("-") && args[i - 1] !== "--push")
  const pushAt = args.indexOf("--push")
  const remote = pushAt >= 0 ? args[pushAt + 1] : undefined
  if (id === undefined || (pushAt >= 0 && (remote === undefined || remote.startsWith("-")))) {
    console.error("사용: gnam run multirun close <run-id> [--push <remote>]")
    return 1
  }
  const state = readState(cwd, id)
  if (state.closed !== null) {
    console.log(`multirun ${id} 이미 닫힘 (${state.closed})`)
    return 0
  }
  if (reportOf(state) === null) throw new Failure(`multirun ${id}: report 커밋 없음. report (abort 면 gnam run multirun abort 초안) 를 먼저 커밋한다`)
  syncRun(cwd, state)
  const blocked = new Map<string, string[]>()
  for (const v of state.variants) {
    if (!existsSync(v.clone)) continue
    const reasons = [...dirtyOf(v.clone), ...unsynced(state, v).map((ref) => `미보존 ref ${ref}`)]
    if (reasons.length > 0) blocked.set(v.name, reasons)
  }
  if (remote !== undefined) {
    const r = git(["push", "-q", remote, `refs/tags/multirun/${id}/*:refs/tags/multirun/${id}/*`], state.source)
    if (!r.ok) throw new Failure(`push 실패 (${remote}). 아무것도 지우지 않음\n${r.err.trim()}`)
  }
  for (const v of state.variants) {
    if (blocked.has(v.name)) console.log(`  ${v.name}  유지: ${blocked.get(v.name)?.join(", ")}`)
    else if (existsSync(v.clone)) {
      rmSync(v.clone, { recursive: true, force: true })
      console.log(`  ${v.name}  clone 삭제`)
    }
  }
  if (blocked.size > 0) {
    console.error(`multirun ${id}: 보존 확인 실패 ${[...blocked.keys()].join(" ")}. 커밋 · sync 후 다시 close`)
    return 1
  }
  for (const path of state.opened) {
    git(["worktree", "remove", "--force", path], state.source)
    rmSync(path, { recursive: true, force: true })
  }
  git(["worktree", "prune"], state.source)
  const dir = join(cacheRoot(), `${basename(state.source)}-${id}`)
  if (existsSync(dir) && readdirSync(dir).length === 0) rmSync(dir, { recursive: true, force: true })
  state.closed = new Date().toISOString()
  state.opened = []
  writeState(cwd, state)
  console.log(`multirun ${id} 닫힘. tag refs/tags/multirun/${id}/* 유지${remote !== undefined ? ` · ${remote} 에 push` : ""}`)
  return 0
}

const agentLine = (name: string, fields: Record<string, string | number | null | undefined>) =>
  `Agent: ${name} ${KEY_ORDER.filter((k) => fields[k] !== undefined && fields[k] !== null)
    .map((k) => `${k}=${fields[k]}`)
    .join(" ")}`

export function reportDraft(data: Awaited<ReturnType<typeof collectData>>, state: RunState, outcome: string): string {
  const variantLines = data.variants.filter((v) => v.tip !== null).map((v) => `${v.name} ${v.tip?.slice(0, 7)} ${v.tag}`)
  const agents = data.variants.map((v) => {
    const u = v.usage
    const workflow = (v.variant?.["Approach"] ?? "").split(/[\s,.(]/)[0] || undefined
    const na = (value: number | undefined) => (value === undefined ? NA : value)
    return agentLine(v.name, {
      role: "variant",
      model: u?.model ?? v.model,
      effort: u?.effort ?? v.effort,
      agent: v.agent,
      session: v.session,
      workflow,
      wall_min: v.wall_min ?? NA,
      active_min: na(u?.active_min),
      out: na(u?.out),
      input: u?.input,
      cache_write: u?.cache_write,
      cache_read: u?.cache_read,
      requests: u?.requests,
      api_errors: u?.api_errors,
      sub_sessions: v.sub.sessions,
      sub_active_min: v.sub.sessions > 0 ? v.sub.active_min : undefined,
      sub_out: v.sub.sessions > 0 ? v.sub.out : undefined,
      lines: v.lines,
      checks: NA,
    })
  })
  agents.push("Agent: summarizer role=summarizer model=? effort=? agent=claude session=na active_min=na out=na")
  return [
    `multirun.${state.topic}.report: ${outcome === "aborted" ? "중단" : "비교"}`,
    "",
    `Start: ${data.start?.slice(0, 7) ?? "?"}`,
    `Outcome: ${outcome}`,
    "",
    "Variants:",
    ...(variantLines.length > 0 ? variantLines : ["(보존된 변형 없음)"]),
    "",
    "Comparison: 없음 (중단)",
    "Combinable: 없음",
    "Recommendation: 없음",
    "Decision: 대기",
    "",
    ...agents,
    "",
  ].join("\n")
}

export async function abort(args: string[], cwd: string): Promise<number> {
  const id = args.find((a) => !a.startsWith("-"))
  if (id === undefined) {
    console.error("사용: gnam run multirun abort <run-id>")
    return 1
  }
  const state = readState(cwd, id)
  syncRun(cwd, state)
  const draft = reportDraft(await collectData(state), state, "aborted")
  const file = join(dirname(stateFile(cwd, id)), "report-message.txt")
  writeFileSync(file, draft)
  console.log(`report 초안 (? 를 채운 뒤 git commit --allow-empty -F ${file}, 그다음 gnam run multirun close ${id}):\n`)
  console.log(draft)
  return 0
}

/** Failure 는 stderr 한 줄 · exit 1 */
export function guarded<T extends unknown[]>(fn: (...args: T) => number | Promise<number>) {
  return async (...args: T): Promise<number> => {
    try {
      return await fn(...args)
    } catch (error) {
      if (!(error instanceof Failure)) throw error
      console.error(`multirun: ${error.message}`)
      return 1
    }
  }
}

