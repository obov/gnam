/**
 * plugin 표기 해석 · 로드. 표기 3종:
 *   @gnam/<id>    내장. 코드 = <패키지>/{dist|src}/plugins/<id>/index, 자원 (skills · 조각) = <패키지>/plugins/<id>/
 *   ./<경로>      로컬. 디렉터리의 index.js · index.mjs · index.ts (ts 는 node >= 22.18 · bun)
 *   <패키지명>    npm 패키지. node_modules/<이름> 의 package.json "gnam" (진입 파일) → main → index.js
 * 모든 plugin 은 default export 로 definePlugin({...}) 를 낸다.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { isAbsolute, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import type { GnamConfig } from "./config.ts"
import type { GnamPlugin } from "./plugin.ts"

export const BUILTIN_PREFIX = "@gnam/"
/** 이 패키지 루트 (src/core · dist/core 의 두 단계 위) */
export const PACKAGE_ROOT = fileURLToPath(new URL("../..", import.meta.url))
const FROM_SOURCE = import.meta.url.endsWith(".ts")
const CODE_DIR = join(PACKAGE_ROOT, FROM_SOURCE ? "src" : "dist", "plugins")

export interface Loaded {
  spec: string
  kind: "builtin" | "local" | "package"
  /** 자원 기준 디렉터리 (skills · agentsMd · scaffold 경로의 기준) */
  root: string
  plugin: GnamPlugin
}

export function builtinIds(): string[] {
  if (!existsSync(CODE_DIR)) return []
  return readdirSync(CODE_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
}

export const isLocalSpec = (spec: string) => spec.startsWith("./") || spec.startsWith("../") || isAbsolute(spec)

/** 사용자가 쓴 이름을 표기로 정규화. 내장 id 는 @gnam/<id> */
export function normalizeSpec(input: string): string {
  if (input.startsWith(BUILTIN_PREFIX) || isLocalSpec(input)) return input
  return builtinIds().includes(input) ? `${BUILTIN_PREFIX}${input}` : input
}

function entryOf(spec: string, project: string): { kind: Loaded["kind"]; entry: string; root: string } {
  if (spec.startsWith(BUILTIN_PREFIX)) {
    const id = spec.slice(BUILTIN_PREFIX.length)
    const entry = join(CODE_DIR, id, FROM_SOURCE ? "index.ts" : "index.js")
    if (!existsSync(entry)) throw new Error(`내장 plugin 없음: ${spec} (있는 것: ${builtinIds().join(", ") || "-"})`)
    return { kind: "builtin", entry, root: join(PACKAGE_ROOT, "plugins", id) }
  }
  if (isLocalSpec(spec)) {
    const root = resolve(project, spec)
    const entry = ["index.js", "index.mjs", "index.ts"].map((f) => join(root, f)).find(existsSync)
    if (entry === undefined) throw new Error(`로컬 plugin 진입 파일 없음: ${spec}/index.{js,mjs,ts}`)
    return { kind: "local", entry, root }
  }
  const root = join(project, "node_modules", spec)
  const manifest = join(root, "package.json")
  if (!existsSync(manifest)) throw new Error(`plugin 패키지 없음: ${spec}. 먼저 설치한다 (npm i -D ${spec})`)
  const pkg = JSON.parse(readFileSync(manifest, "utf8")) as { gnam?: string; main?: string }
  return { kind: "package", entry: join(root, pkg.gnam ?? pkg.main ?? "index.js"), root }
}

export async function loadPlugin(spec: string, project: string): Promise<Loaded> {
  const { kind, entry, root } = entryOf(spec, project)
  const mod = (await import(pathToFileURL(entry).href)) as { default?: GnamPlugin }
  const plugin = mod.default
  if (typeof plugin?.id !== "string" || typeof plugin.version !== "string")
    throw new Error(`${spec}: default export 가 plugin 이 아님 (definePlugin({ id, version, … }))`)
  if (kind === "builtin" && `${BUILTIN_PREFIX}${plugin.id}` !== spec) throw new Error(`${spec}: id 불일치 ${plugin.id}`)
  return { spec, kind, root, plugin }
}

/** 활성 plugin 전부. 중복 id · 빠진 requires · 설정 형식 문제는 오류 */
export async function loadPlugins(project: string, config: GnamConfig): Promise<Loaded[]> {
  const loaded: Loaded[] = []
  for (const spec of config.plugins) loaded.push(await loadPlugin(spec, project))
  const problems = pluginProblems(loaded, config)
  if (problems.length > 0) throw new Error(`gnam.json plugins: ${problems.join(" · ")}`)
  return loaded
}

export function pluginProblems(loaded: Loaded[], config: GnamConfig): string[] {
  const problems: string[] = []
  const ids = loaded.map((l) => l.plugin.id)
  for (const [i, id] of ids.entries()) if (ids.indexOf(id) !== i) problems.push(`${id} 중복`)
  for (const { plugin } of loaded) {
    for (const need of plugin.requires ?? [])
      if (!ids.includes(need)) problems.push(`${plugin.id} 가 ${need} 필요 (gnam plugin add ${need})`)
    if (plugin.configProblems !== undefined)
      for (const p of plugin.configProblems(config[plugin.id])) problems.push(`${plugin.id}: ${p}`)
  }
  return problems
}

export const dependentsOf = (loaded: Loaded[], id: string) =>
  loaded.filter((l) => (l.plugin.requires ?? []).includes(id)).map((l) => l.plugin.id)
