import { readFileSync } from "node:fs"
import { join } from "node:path"
import { validateCommit } from "./core/commit.ts"
import { readConfig, requireConfig } from "./core/config.ts"
import { git, gitOrThrow, lines, nulList } from "./core/git.ts"
import { boundaryOf, cleanMessage, commitInput, gitLookup, historyArgs, pushRange } from "./core/history.ts"
import { builtinIds, loadPlugins, PACKAGE_ROOT } from "./core/loader.ts"
import type { GnamPlugin } from "./core/plugin.ts"
import { OutputError, output, type OutputOptions, type Renderer } from "./core/output.ts"
import { addPlugin, init, link, realProject, removePlugin, sync } from "./core/project.ts"
import { collectStatus, Context, problemsOf, summaryOf } from "./core/status.ts"
import { TraceError } from "./core/trace.ts"
import { format, type Violation } from "./core/violation.ts"

const USAGE = `gnam — Git-Native Agent Memory

  gnam init [--plugins a,b] [--no-install] [--source SPEC]   gnam.json · hook · skill · AGENTS.md 설치
  gnam commit-msg <message-file>                            commit-msg hook 검사 (staged 기준)
  gnam verify [--range A..B | --push BEFORE SHA]            커밋 history (기본: HEAD, gnam 도입 이후) + plugin 파일 검사
  gnam plugin list | add <spec> | remove <spec> [--cascade] plugin 관리. spec = <내장 id> · ./경로 · npm 패키지
  gnam run <plugin> <command> [args…]                       plugin 명령
  gnam sync                                                 gnam.json 기준 hook · skill · AGENTS.md 블록 재생성
  gnam link                                                 hook · skill 링크 복구 (postinstall)
  gnam status [<경로>…] [--json] [--format F] [--where k=v] [--fields a,b] [--keys]
              [--since REV] [--deep] [--check] [-C DIR]…   작업 기록 상태. 인자 없으면 요약, 경로 · --json 이면 JSON 트리
  gnam doctor                                               설치 상태 점검
`

async function activePlugins(project: string): Promise<GnamPlugin[]> {
  const config = readConfig(project)
  return config === null ? [] : (await loadPlugins(project, config)).map((l) => l.plugin)
}

async function commitMsg(project: string, file: string | undefined): Promise<number> {
  if (file === undefined) throw new Error("사용: gnam commit-msg <message-file>")
  const config = readConfig(project)
  if (config === null) return 0
  const plugins = await activePlugins(project)
  const message = cleanMessage(readFileSync(file, "utf8"))
  const files = nulList(gitOrThrow(["diff", "--cached", "--name-only", "-z"], project))
  const merge = git(["rev-parse", "-q", "--verify", "MERGE_HEAD"], project).ok
  const violations = validateCommit(
    { message, files, merge, cwd: project, view: { kind: "index" }, config, ...gitLookup(project, null) },
    plugins,
  )
  if (violations.length === 0) return 0
  console.error(format(violations))
  return 1
}

async function verify(project: string, args: string[]): Promise<number> {
  const config = requireConfig(project)
  const loaded = await loadPlugins(project, config)
  const plugins = loaded.map((l) => l.plugin)
  const exists = (rev: string) => git(["cat-file", "-e", `${rev}^{commit}`], project).ok
  const range =
    args[0] === "--range" ? (args[1] ?? "") : args[0] === "--push" ? pushRange(args[1] ?? "", args[2] ?? "", exists) : "HEAD"
  if (range === "") throw new Error("사용: gnam verify [--range A..B | --push BEFORE SHA]")
  const report: string[] = []
  const boundary = range.includes("..") ? null : boundaryOf(project, range)
  const shas = git(["rev-parse", "-q", "--verify", "HEAD"], project).ok
    ? lines(gitOrThrow(["rev-list", "--reverse", ...historyArgs(range, boundary)], project))
    : []
  for (const sha of shas) {
    const input = commitInput(project, sha)
    const violations = validateCommit(
      { ...input, cwd: project, view: { kind: "commit", sha }, config, ...gitLookup(project, sha) },
      plugins,
    )
    if (violations.length > 0) report.push(`${sha.slice(0, 7)} ${input.message.split("\n")[0]}\n\n${format(violations)}`)
  }
  const files = nulList(gitOrThrow(["ls-files", "-z", "--cached", "--others", "--exclude-standard"], project))
  const fileViolations: Violation[] = plugins.flatMap((p) => p.verify?.(project, files, config) ?? [])
  if (fileViolations.length > 0) report.push(format(fileViolations))
  if (report.length > 0) {
    console.error(report.join("\n\n===\n\n"))
    return 1
  }
  console.log(`gnam verify: 커밋 ${shas.length}개 · plugin ${plugins.length}개 통과`)
  return 0
}

async function plugin(project: string, args: string[]): Promise<number> {
  const [sub, spec] = args
  if (sub === "list") {
    const config = requireConfig(project)
    const loaded = await loadPlugins(project, config)
    for (const { spec, plugin } of loaded)
      console.log(`${plugin.id}@${plugin.version}  ${spec}${plugin.requires?.length ? `  requires ${plugin.requires.join(", ")}` : ""}`)
    const available = builtinIds().filter((id) => !loaded.some((l) => l.plugin.id === id))
    console.log(`\n추가 가능한 내장: ${available.join(", ") || "-"}`)
    return 0
  }
  if (sub === "add" && spec !== undefined) return print(await addPlugin(project, spec))
  if (sub === "remove" && spec !== undefined) return print(await removePlugin(project, spec, args.includes("--cascade")))
  throw new Error("사용: gnam plugin list | add <spec> | remove <spec> [--cascade]")
}

/** gnam run 의 출력 옵션 (--json · --format 이 있을 때만). 나머지는 명령 인자 */
export function splitRunArgs(args: string[]): { rest: string[]; out: OutputOptions | null } {
  if (!args.includes("--json") && !args.includes("--format")) return { rest: args, out: null }
  const out: OutputOptions = { paths: [], where: [], fields: [], format: "json", keys: false }
  const rest: string[] = []
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? ""
    if (arg === "--json") continue
    if (arg === "--keys") out.keys = true
    else if (arg === "--format" || arg === "--where" || arg === "--fields") {
      const value = args[++i]
      if (value === undefined) throw new OutputError(`${arg} 값 없음`, 1)
      if (arg === "--format") out.format = value
      else if (arg === "--where") out.where.push(value)
      else out.fields.push(...value.split(",").filter(Boolean))
    } else rest.push(arg)
  }
  return { rest, out }
}

async function run(project: string, args: string[]): Promise<number> {
  const [id, name, ...raw] = args
  const config = requireConfig(project)
  const loaded = await loadPlugins(project, config)
  const target = loaded.find((l) => l.plugin.id === id)
  if (target === undefined) throw new Error(`활성 plugin 아님: ${id ?? "(없음)"}`)
  const command = name === undefined ? undefined : target.plugin.commands?.[name]
  if (command === undefined) {
    const list = Object.entries(target.plugin.commands ?? {}).map(([n, c]) => `  ${n}  ${c.describe}${c.data ? "  (--json)" : ""}`)
    console.error(`gnam run ${target.plugin.id} <command>\n${list.join("\n") || "  (명령 없음)"}`)
    return 1
  }
  try {
    const { rest, out } = splitRunArgs(raw)
    if (out === null) return await command.run(rest, project, config)
    if (command.data === undefined) throw new OutputError(`${target.plugin.id} ${name} 는 구조화 결과가 없음 (--json · --format 불가)`, 1)
    const ctx = new Context({ cwd: project })
    const value = await command.data(rest, await ctx.statusContext())
    process.stdout.write(output(value, out, await ctx.formats()))
    return 0
  } catch (error) {
    if (error instanceof OutputError) {
      console.error(`gnam run: ${error.message}`)
      return error.code
    }
    throw error
  }
}

interface StatusArgs extends OutputOptions {
  dirs: string[]
  json: boolean
  deep: boolean
  check: boolean
  since: string | undefined
  schema: boolean
}

const STATUS_VALUE_OPTIONS = new Set(["-C", "--format", "--where", "--fields", "--since"])
const STATUS_FLAGS = new Set(["--json", "--deep", "--check", "--keys", "--schema"])

export function parseStatusArgs(args: string[]): StatusArgs {
  const parsed: StatusArgs = {
    paths: [],
    where: [],
    fields: [],
    format: "json",
    keys: false,
    dirs: [],
    json: false,
    deep: false,
    check: false,
    since: undefined,
    schema: false,
  }
  let format: string | undefined
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? ""
    if (STATUS_VALUE_OPTIONS.has(arg)) {
      const value = args[++i]
      if (value === undefined) throw new OutputError(`${arg} 값 없음`, 1)
      if (arg === "-C") parsed.dirs.push(value)
      else if (arg === "--format") format = value
      else if (arg === "--where") parsed.where.push(value)
      else if (arg === "--fields") parsed.fields.push(...value.split(",").filter(Boolean))
      else parsed.since = value
    } else if (STATUS_FLAGS.has(arg)) {
      if (arg === "--json") parsed.json = true
      else if (arg === "--deep") parsed.deep = true
      else if (arg === "--check") parsed.check = true
      else if (arg === "--keys") parsed.keys = true
      else parsed.schema = true
    } else if (arg.startsWith("-") && arg !== "-") throw new OutputError(`모르는 옵션: ${arg}`, 1)
    else parsed.paths.push(arg)
  }
  if (format !== undefined) parsed.format = format
  return parsed
}

/** 요약 모드: 경로 · 데이터 옵션이 하나도 없을 때 */
const summaryMode = (a: StatusArgs, raw: string[]) =>
  a.paths.length === 0 && !a.json && !a.keys && !a.schema && a.where.length === 0 && a.fields.length === 0 && !raw.includes("--format")

async function status(args: string[]): Promise<number> {
  try {
    const a = parseStatusArgs(args)
    const roots = (a.dirs.length === 0 ? ["."] : a.dirs).map((d) => realProject(d))
    let problems = 0
    if (summaryMode(a, args)) {
      for (const [i, root] of roots.entries()) {
        if (roots.length > 1) process.stdout.write(`${i === 0 ? "" : "\n"}== ${root}\n`)
        process.stdout.write(await summaryOf(root))
        if (a.check) problems += (await problemsOf(new Context({ cwd: root }))).length
      }
      return a.check && problems > 0 ? 3 : 0
    }
    const results: Record<string, string> = {}
    const values: Record<string, unknown> = {}
    let extra: Record<string, Renderer> = {}
    for (const root of roots) {
      const ctx = new Context({ cwd: root, paths: a.paths, deep: a.deep, since: a.since })
      const tree = await collectStatus(ctx.options, ctx)
      if (root === roots[0]) extra = await ctx.formats()
      if (a.check) problems += (await problemsOf(ctx)).length
      if (roots.length === 1) results[root] = output(tree, a, extra)
      else values[root] = JSON.parse(output(tree, { ...a, format: "compact" })) as unknown
    }
    if (roots.length === 1) process.stdout.write(Object.values(results)[0] ?? "")
    else process.stdout.write(output(values, { paths: [], where: [], fields: [], keys: false, format: a.format }, extra))
    return a.check && problems > 0 ? 3 : 0
  } catch (error) {
    if (error instanceof OutputError) {
      console.error(`gnam status: ${error.message}`)
      return error.code
    }
    if (error instanceof TraceError) {
      console.error(`gnam status: ${error.message}`)
      return 1
    }
    throw error
  }
}

function print(report: string[]): number {
  for (const line of report) console.log(line)
  return 0
}

function option(args: string[], name: string): string | undefined {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}

export async function main(argv: string[]): Promise<number> {
  const [command, ...args] = argv
  try {
    switch (command) {
      case "init": {
        const dir = args[0] !== undefined && !args[0].startsWith("--") ? args[0] : "."
        const { mkdirSync } = await import("node:fs")
        mkdirSync(dir, { recursive: true })
        const plugins = option(args, "--plugins")
        return print(
          await init(realProject(dir), {
            plugins: plugins === undefined ? [] : plugins.split(",").filter(Boolean),
            install: !args.includes("--no-install"),
            source: option(args, "--source"),
          }),
        )
      }
      case "commit-msg":
        return await commitMsg(realProject("."), args[0])
      case "verify":
        return await verify(realProject("."), args)
      case "plugin":
        return await plugin(realProject("."), args)
      case "run":
        return await run(realProject("."), args)
      case "sync":
        return print(await sync(realProject(".")))
      case "link":
        return print(await link(realProject(".")))
      case "status":
        return await status(args)
      case "doctor": {
        const problems = (await problemsOf(new Context({ cwd: realProject(".") }))).map((p) => p.message)
        for (const p of problems) console.error(`- ${p}`)
        if (problems.length === 0) console.log("gnam doctor: 문제 없음")
        return problems.length === 0 ? 0 : 1
      }
      case "--version":
      case "-v":
        console.log((JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8")) as { version: string }).version)
        return 0
      default:
        console.log(USAGE)
        return command === undefined || command === "help" || command === "--help" ? 0 : 1
    }
  } catch (error) {
    console.error(`gnam: ${error instanceof Error ? error.message : String(error)}`)
    return 1
  }
}
