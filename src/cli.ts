import { readFileSync } from "node:fs"
import { join } from "node:path"
import { validateCommit } from "./core/commit.ts"
import { readConfig, requireConfig } from "./core/config.ts"
import { git, gitOrThrow, lines, nulList } from "./core/git.ts"
import { boundaryOf, cleanMessage, commitInput, gitLookup, historyArgs, pushRange } from "./core/history.ts"
import { builtinIds, loadPlugins, PACKAGE_ROOT } from "./core/loader.ts"
import type { GnamPlugin } from "./core/plugin.ts"
import { addPlugin, doctor, init, link, realProject, removePlugin, sync } from "./core/project.ts"
import { format, type Violation } from "./core/violation.ts"

const USAGE = `gnam — Git-Native Agent Memory

  gnam init [--plugins a,b] [--no-install] [--source SPEC]   gnam.json · hook · skill · AGENTS.md 설치
  gnam commit-msg <message-file>                            commit-msg hook 검사 (staged 기준)
  gnam verify [--range A..B | --push BEFORE SHA]            커밋 history (기본: HEAD, gnam 도입 이후) + plugin 파일 검사
  gnam plugin list | add <spec> | remove <spec> [--cascade] plugin 관리. spec = <내장 id> · ./경로 · npm 패키지
  gnam run <plugin> <command> [args…]                       plugin 명령
  gnam sync                                                 gnam.json 기준 hook · skill · AGENTS.md 블록 재생성
  gnam link                                                 hook · skill 링크 복구 (postinstall)
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

async function run(project: string, args: string[]): Promise<number> {
  const [id, name, ...rest] = args
  const config = requireConfig(project)
  const loaded = await loadPlugins(project, config)
  const target = loaded.find((l) => l.plugin.id === id)
  if (target === undefined) throw new Error(`활성 plugin 아님: ${id ?? "(없음)"}`)
  const command = name === undefined ? undefined : target.plugin.commands?.[name]
  if (command === undefined) {
    const list = Object.entries(target.plugin.commands ?? {}).map(([n, c]) => `  ${n}  ${c.describe}`)
    console.error(`gnam run ${target.plugin.id} <command>\n${list.join("\n") || "  (명령 없음)"}`)
    return 1
  }
  return await command.run(rest, project, config)
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
      case "doctor": {
        const problems = await doctor(realProject("."))
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
