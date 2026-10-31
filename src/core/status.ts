/**
 * gnam status 트리 수집 (specs/info.md 트리). 고른 경로의 최상위 키만 계산한다.
 * 키 순서 = spec 순서. 실패 (gnam.json 깨짐 · plugin 로드 실패) 는 problems 로 모으고 계속한다.
 */
import { existsSync, readFileSync, readlinkSync, statSync } from "node:fs"
import { basename, isAbsolute, join, resolve } from "node:path"
import { CONFIG_FILE, configPath, configProblems, FORMAT, type GnamConfig } from "./config.ts"
import { exec, git } from "./git.ts"
import { BUILTIN_PREFIX, builtinIds, isLocalSpec, type Loaded, loadPlugin, PACKAGE_ROOT, pluginProblems } from "./loader.ts"
import { CORE_FORMATS, parsePath, type Renderer } from "./output.ts"
import type { StatusContext } from "./plugin.ts"
import { pluginLine, summary } from "./summary.ts"
import { CORE_RULES } from "./rules.ts"
import { collectTrace } from "./trace.ts"
import { agentsProblems, HOOKS_DIR, hookProblems, isLink, skillDirs, skillProblems, skillSources } from "./project.ts"

export const SCHEMA = 1

export interface StatusOptions {
  cwd: string
  /** 고른 경로. 비면 전체 */
  paths?: string[]
  /** deep 섹션 포함 */
  deep?: boolean
  /** trace 범위 시작 rev */
  since?: string
}

export interface Problem {
  source: string
  message: string
}

interface Failed {
  spec: string
  kind: Loaded["kind"]
  error: string
}

/** 수집 중 공유하는 상태. 같은 실행에서 한 번만 계산 */
export class Context {
  readonly cwd: string
  readonly options: StatusOptions
  private memo = new Map<string, unknown>()
  /** 섹션 · 요약 · 형식 계산 중 생긴 문제 */
  readonly late: Problem[] = []
  constructor(options: StatusOptions) {
    this.cwd = options.cwd
    this.options = options
  }
  once<T>(key: string, compute: () => T): T {
    if (!this.memo.has(key)) this.memo.set(key, compute())
    return this.memo.get(key) as T
  }

  /** gnam.json 원문 · 해석 문제 */
  config(): { raw: unknown; config: GnamConfig | null; problems: string[] } {
    return this.once("config", () => {
      const path = configPath(this.cwd)
      if (!existsSync(path)) return { raw: null, config: null, problems: [`${CONFIG_FILE} 없음 (npx gnam init)`] }
      let raw: unknown
      try {
        raw = JSON.parse(readFileSync(path, "utf8")) as unknown
      } catch (error) {
        return { raw: null, config: null, problems: [`${CONFIG_FILE} JSON 아님: ${(error as Error).message}`] }
      }
      const problems = configProblems(raw).map((p) => `${CONFIG_FILE}: ${p}`)
      const plugins = (raw as { plugins?: unknown } | null)?.plugins
      const usable = Array.isArray(plugins) && plugins.every((p) => typeof p === "string")
      return { raw, config: usable ? (raw as GnamConfig) : null, problems }
    })
  }

  /** 활성 plugin. 실패한 것은 failed 로 */
  async plugins(): Promise<{ loaded: Loaded[]; failed: Failed[]; problems: Problem[] }> {
    const cached = this.memo.get("plugins") as Promise<{ loaded: Loaded[]; failed: Failed[]; problems: Problem[] }> | undefined
    if (cached !== undefined) return cached
    const promise = (async () => {
      const { config } = this.config()
      const loaded: Loaded[] = []
      const failed: Failed[] = []
      const problems: Problem[] = []
      for (const spec of config?.plugins ?? []) {
        try {
          loaded.push(await loadPlugin(spec, this.cwd))
        } catch (error) {
          const kind: Loaded["kind"] = spec.startsWith(BUILTIN_PREFIX) ? "builtin" : isLocalSpec(spec) ? "local" : "package"
          failed.push({ spec, kind, error: (error as Error).message })
          problems.push({ source: `plugin:${idOf(spec)}`, message: (error as Error).message })
        }
      }
      if (config !== null)
        for (const message of pluginProblems(loaded, config)) problems.push({ source: `plugin:${message.split(/[ :]/)[0]}`, message })
      const owners = new Map<string, string>(CORE_FORMATS.map((f) => [f, "core"]))
      for (const { plugin } of loaded)
        for (const name of Object.keys(plugin.formats ?? {})) {
          const owner = owners.get(name)
          if (owner !== undefined) problems.push({ source: `plugin:${plugin.id}`, message: `${plugin.id}: 형식 이름 ${name} 이 ${owner} 와 겹침` })
          else owners.set(name, plugin.id)
        }
      return { loaded, failed, problems }
    })()
    this.memo.set("plugins", promise)
    return promise
  }

  /** plugin 에 넘기는 문맥 */
  async statusContext(): Promise<StatusContext> {
    const { config } = this.config()
    const { loaded } = await this.plugins()
    return { cwd: this.cwd, config: config ?? { format: FORMAT, plugins: [] }, plugins: loaded.map((l) => l.plugin.id) }
  }

  /** plugin 형식 이름 → renderer. 이름이 겹친 형식은 뺀다 */
  async formats(): Promise<Record<string, Renderer>> {
    const { loaded } = await this.plugins()
    const sctx = await this.statusContext()
    const out: Record<string, Renderer> = {}
    for (const { plugin } of loaded)
      for (const [name, format] of Object.entries(plugin.formats ?? {}))
        if (!(CORE_FORMATS as readonly string[]).includes(name) && !(name in out)) out[name] = (value) => format.render(value, sctx)
    return out
  }
}

/** plugin 섹션을 계산할지: 경로가 없으면 deep 아닌 것 (--deep 이면 전부), 경로가 그 섹션 (또는 상위) 을 가리키면 */
function wantSection(options: StatusOptions, id: string, name: string, deep: boolean): boolean {
  const paths = (options.paths ?? []).map(parsePath)
  if (paths.length === 0) return !deep || options.deep === true
  return paths.some((p) => {
    const want = ["plugins", id, "sections", name]
    const prefix = want.slice(0, Math.min(p.length, 4))
    if (!prefix.every((seg, i) => p[i] === seg)) return false
    return p.length >= 4 || !deep || options.deep === true
  })
}

async function sectionsOf(ctx: Context, l: Loaded): Promise<Record<string, unknown> | null> {
  const sections = l.plugin.status?.sections
  if (sections === undefined) return null
  const sctx = await ctx.statusContext()
  const out: Record<string, unknown> = {}
  for (const [name, section] of Object.entries(sections)) {
    if (!wantSection(ctx.options, l.plugin.id, name, section.deep === true)) continue
    try {
      out[name] = await section.collect(sctx)
    } catch (error) {
      out[name] = null
      ctx.late.push({ source: `plugin:${l.plugin.id}`, message: `${l.plugin.id}: 섹션 ${name} 실패: ${(error as Error).message}` })
    }
  }
  return out
}

/** plugin 요약 줄 */
export async function pluginSummaryLines(ctx: Context): Promise<string[]> {
  const { loaded } = await ctx.plugins()
  const sctx = await ctx.statusContext()
  const out: string[] = []
  for (const { plugin } of loaded) {
    if (plugin.status?.summary === undefined) continue
    try {
      for (const line of await plugin.status.summary(sctx)) out.push(pluginLine(plugin.id, line))
    } catch (error) {
      ctx.late.push({ source: `plugin:${plugin.id}`, message: `${plugin.id}: 요약 실패: ${(error as Error).message}` })
    }
  }
  return out
}

const idOf = (spec: string) => (spec.startsWith(BUILTIN_PREFIX) ? spec.slice(BUILTIN_PREFIX.length) : spec)

function packageVersion(): string {
  return (JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8")) as { version: string }).version
}

function gitText(args: string[], cwd: string): string | null {
  const result = git(args, cwd)
  return result.ok ? result.out.trim() : null
}

function versionOf(cmd: string): string | null {
  const result = exec(cmd, ["--version"], process.cwd())
  if (!result.ok) return null
  return /(\d+\.\d+\.\d+\S*)/.exec(result.out)?.[1] ?? (result.out.trim() || null)
}

function pluginObject(l: Loaded, config: GnamConfig | null) {
  const p = l.plugin
  return {
    spec: l.spec,
    kind: l.kind,
    version: p.version,
    root: l.root,
    requires: p.requires ?? [],
    kinds: (p.kinds ?? []).map((k) => ({ label: k.label, subject: k.subject.source })),
    commands: Object.entries(p.commands ?? {}).map(([name, c]) => ({ name, describe: c.describe, json: c.data !== undefined })),
    formats: Object.keys(p.formats ?? {}),
    skills: (p.skills ?? []).map((dir) => basename(dir)),
    agentsMd: p.agentsMd !== undefined,
    scaffold: Object.keys(p.scaffold ?? {}),
    configProblems: p.configProblems?.(config?.[p.id]) ?? [],
  }
}

export async function problemsOf(ctx: Context): Promise<Problem[]> {
  const { problems: configIssues, config } = ctx.config()
  const problems: Problem[] = configIssues.map((message) => ({ source: "config", message }))
  if (config === null) return problems
  const { loaded, problems: pluginIssues } = await ctx.plugins()
  problems.push(...pluginIssues)
  for (const message of [...hookProblems(ctx.cwd), ...skillProblems(ctx.cwd, loaded), ...agentsProblems(ctx.cwd, loaded)])
    problems.push({ source: "install", message })
  problems.push(...ctx.late)
  return problems
}

function handoffOf(cwd: string) {
  const rel = gitText(["rev-parse", "--git-path", "gnam/handoff.md"], cwd)
  if (rel === null) return { path: null, exists: false, content: null, modifiedAt: null }
  const path = isAbsolute(rel) ? rel : resolve(cwd, rel)
  if (!existsSync(path)) return { path, exists: false, content: null, modifiedAt: null }
  return { path, exists: true, content: readFileSync(path, "utf8"), modifiedAt: statSync(path).mtime.toISOString() }
}

async function installOf(ctx: Context) {
  const cwd = ctx.cwd
  const { loaded } = await ctx.plugins()
  const skills = skillDirs(cwd).flatMap((dir) =>
    skillSources(cwd, loaded).map(({ name }) => {
      const path = join(cwd, dir, name)
      return { dir, name, target: isLink(path) ? readlinkSync(path) : null, ok: existsSync(join(path, "SKILL.md")) }
    }),
  )
  const agents = join(cwd, "AGENTS.md")
  const claude = join(cwd, "CLAUDE.md")
  return {
    hooks: {
      hooksPath: gitText(["config", "--local", "core.hooksPath"], cwd) || null,
      expected: HOOKS_DIR,
      commitMsg: existsSync(join(cwd, HOOKS_DIR, "commit-msg")),
    },
    skills,
    agentsMd: { exists: existsSync(agents), inSync: existsSync(agents) && agentsProblems(cwd, loaded).length === 0 },
    claudeMd: { exists: existsSync(claude), importsAgents: existsSync(claude) && readFileSync(claude, "utf8").includes("@AGENTS.md") },
  }
}

function envOf(cwd: string) {
  const gitDir = gitText(["rev-parse", "--absolute-git-dir"], cwd)
  const commonDir = gitText(["rev-parse", "--path-format=absolute", "--git-common-dir"], cwd)
  return {
    node: versionOf("node"),
    bun: versionOf("bun"),
    git: versionOf("git"),
    ci: Boolean(process.env["CI"]),
    gitDir,
    commonDir,
    worktree: gitDir !== null && commonDir !== null && gitDir !== commonDir,
    branch: gitText(["symbolic-ref", "--short", "-q", "HEAD"], cwd),
  }
}

type Section = (ctx: Context) => unknown | Promise<unknown>

/** 최상위 키 → 계산. 순서 = 출력 순서 */
export const SECTIONS: [string, Section][] = [
  ["schema", () => SCHEMA],
  [
    "gnam",
    () => ({
      version: packageVersion(),
      root: PACKAGE_ROOT.replace(/[/\\]$/, ""),
      source: existsSync(join(PACKAGE_ROOT, "src", "cli.ts")) ? "checkout" : "package",
      format: FORMAT,
    }),
  ],
  ["project", (ctx) => ctx.cwd],
  [
    "config",
    async (ctx) => {
      const { raw, config } = ctx.config()
      const { loaded } = await ctx.plugins()
      const effective: Record<string, unknown> | null = config === null ? null : { ...config }
      if (effective !== null)
        for (const { plugin } of loaded)
          if (plugin.configDefaults !== undefined) effective[plugin.id] = mergeDefaults(plugin.configDefaults, config?.[plugin.id])
      return { path: configPath(ctx.cwd), raw, effective }
    },
  ],
  [
    "plugins",
    async (ctx) => {
      const { config } = ctx.config()
      const { loaded, failed } = await ctx.plugins()
      const out: Record<string, unknown> = {}
      const order = config?.plugins ?? []
      for (const spec of order) {
        const l = loaded.find((x) => x.spec === spec)
        if (l !== undefined) {
          const object: Record<string, unknown> = pluginObject(l, config)
          const sections = await sectionsOf(ctx, l)
          if (sections !== null) object["sections"] = sections
          out[l.plugin.id] = object
        }
        const f = failed.find((x) => x.spec === spec)
        if (f !== undefined) out[idOf(spec)] = f
      }
      return out
    },
  ],
  [
    "builtins",
    async (ctx) => {
      const { loaded } = await ctx.plugins()
      const active = new Set(loaded.filter((l) => l.kind === "builtin").map((l) => l.plugin.id))
      const out = []
      for (const id of builtinIds()) {
        let requires: string[] = []
        try {
          requires = (await loadPlugin(`${BUILTIN_PREFIX}${id}`, ctx.cwd)).plugin.requires ?? []
        } catch {
          requires = []
        }
        out.push({ id, active: active.has(id), requires })
      }
      return out
    },
  ],
  [
    "kinds",
    async (ctx) => {
      const { loaded } = await ctx.plugins()
      return [
        ...CORE_KINDS.map((k) => ({ ...k, owner: "core" })),
        ...loaded.flatMap(({ plugin }) => (plugin.kinds ?? []).map((k) => ({ label: k.label, subject: k.subject.source, owner: plugin.id }))),
      ]
    },
  ],
  [
    "rules",
    async (ctx) => {
      const { loaded } = await ctx.plugins()
      return [
        ...CORE_RULES.map((r) => ({ id: r.id, owner: "core", why: r.why })),
        ...loaded.flatMap(({ plugin }) => (plugin.rules ?? []).map((r) => ({ id: r.id, owner: plugin.id, why: r.why }))),
      ]
    },
  ],
  ["install", installOf],
  ["problems", problemsOf],
  ["handoff", (ctx) => handoffOf(ctx.cwd)],
  ["env", (ctx) => envOf(ctx.cwd)],
  ["trace", (ctx) => ctx.once("trace", () => collectTrace(ctx.cwd, ctx.options.since))],
]

/** 코어 커밋 종류 (commit.ts CORE_SUBJECT 를 종류별로 나눈 것) */
export const CORE_KINDS = [
  { label: "chore: …", subject: "^chore: \\S" },
  { label: "refactor: …", subject: "^refactor: \\S" },
  { label: "spec.<topic>.plan: …", subject: "^spec\\.([A-Za-z0-9_-]+)\\.plan: \\S" },
  { label: "spec.<topic>.impl: …", subject: "^spec\\.([A-Za-z0-9_-]+)\\.impl: \\S" },
  { label: "spec.<topic>.chore: …", subject: "^spec\\.([A-Za-z0-9_-]+)\\.chore: \\S" },
]

function mergeDefaults(defaults: unknown, value: unknown): unknown {
  if (value === undefined) return defaults
  const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v)
  if (isObj(defaults) && isObj(value)) return { ...defaults, ...value }
  return value
}

/** 경로들이 필요로 하는 최상위 키. 경로가 없으면 null (전부) */
export function neededKeys(paths: string[]): Set<string> | null {
  if (paths.length === 0) return null
  return new Set(paths.map((p) => parsePath(p)[0] ?? ""))
}

/** 트리. 고른 경로의 최상위 키만 계산 (경로 없음 = 전부) */
export async function collectStatus(options: StatusOptions, ctx = new Context(options)): Promise<Record<string, unknown>> {
  const needed = neededKeys(options.paths ?? [])
  const tree: Record<string, unknown> = {}
  for (const [key, compute] of SECTIONS) if (needed === null || needed.has(key)) tree[key] = await compute(ctx)
  return tree
}

/** 요약 텍스트 (인자 없는 gnam status) */
export async function summaryOf(cwd: string): Promise<string> {
  const ctx = new Context({ cwd })
  const { loaded } = await ctx.plugins()
  const pluginLines = await pluginSummaryLines(ctx)
  return summary({
    cwd,
    version: packageVersion(),
    plugins: loaded.map((l) => l.plugin.id),
    problems: await problemsOf(ctx),
    handoff: handoffOf(cwd),
    trace: ctx.once("trace", () => collectTrace(cwd)),
    pluginLines,
  })
}
