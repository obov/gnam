/**
 * 저장소 설치 상태. 셋 다 gnam.json 에서 다시 만들 수 있다 (gnam sync):
 *   hook     .githooks/commit-msg + git config core.hooksPath .githooks (clone 마다 postinstall 의 gnam link 가 복구)
 *   skills   .agents/skills/<name> · .claude/skills/<name> → node_modules/@obov/gnam/… symlink (Codex · Claude Code 공통)
 *   AGENTS   AGENTS.md 의 <!-- gnam:begin --> … <!-- gnam:end --> 블록 (코어 + plugin 조각). 블록 밖은 건드리지 않는다
 */
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import { basename, dirname, join, relative, resolve, sep } from "node:path"
import { defaultConfig, readConfig, requireConfig, writeConfig, type GnamConfig } from "./config.ts"
import { exec, git } from "./git.ts"
import {
  BUILTIN_PREFIX,
  builtinIds,
  dependentsOf,
  type Loaded,
  loadPlugin,
  loadPlugins,
  normalizeSpec,
  PACKAGE_ROOT,
  pluginProblems,
} from "./loader.ts"

export const HOOKS_DIR = ".githooks"
const HOOK = `${HOOKS_DIR}/commit-msg`
const HOOK_MARK = "gnam commit-msg hook"
const SKILL_DIRS = [".agents/skills", ".claude/skills"]
const BEGIN = "<!-- gnam:begin -->"
const END = "<!-- gnam:end -->"
const LINK_SCRIPT = "gnam link"

export type Report = string[]

const isLink = (path: string) => {
  try {
    return lstatSync(path).isSymbolicLink()
  } catch {
    return false
  }
}

/** 프로젝트에 설치된 gnam 경로로 바꾼다. npx 캐시를 가리키는 링크는 캐시 정리 후 끊긴다 */
function stable(project: string, path: string): string {
  const installed = join(project, "node_modules", "@obov", "gnam")
  if (!path.startsWith(PACKAGE_ROOT) || !existsSync(join(installed, "package.json"))) return path
  return join(installed, relative(PACKAGE_ROOT, path))
}

// ---------- hook ----------

export function installHook(project: string, report: Report): void {
  if (git(["rev-parse", "--git-dir"], project).ok === false) {
    report.push("hook 생략: git 저장소 아님")
    return
  }
  const path = join(project, HOOK)
  const template = readFileSync(join(PACKAGE_ROOT, "templates", "commit-msg"), "utf8")
  if (existsSync(path) && !readFileSync(path, "utf8").includes(HOOK_MARK)) {
    report.push(`hook 생략: ${HOOK} 가 gnam 것이 아님. 그 hook 안에서 'npx gnam commit-msg "$1"' 를 호출한다`)
  } else if (!existsSync(path) || readFileSync(path, "utf8") !== template) {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, template)
    chmodSync(path, 0o755)
    report.push(`${HOOK} 작성`)
  }
  if (process.env["CI"]) return
  const current = git(["config", "--local", "core.hooksPath"], project).out.trim()
  if (current === HOOKS_DIR) return
  if (current !== "") {
    report.push(`core.hooksPath = ${current} (gnam 아님). 그 디렉터리의 commit-msg 에서 'npx gnam commit-msg "$1"' 를 호출한다`)
    return
  }
  git(["config", "--local", "core.hooksPath", HOOKS_DIR], project)
  report.push(`core.hooksPath = ${HOOKS_DIR}`)
}

export function hookProblems(project: string): string[] {
  const problems: string[] = []
  if (!existsSync(join(project, HOOK))) problems.push(`${HOOK} 없음`)
  const current = git(["config", "--local", "core.hooksPath"], project).out.trim()
  if (current !== HOOKS_DIR && !process.env["CI"]) problems.push(`core.hooksPath = ${current || "(없음)"}, 기대 ${HOOKS_DIR}`)
  return problems
}

// ---------- skills ----------

interface SkillSource {
  name: string
  source: string
}

function skillSources(project: string, loaded: Loaded[]): SkillSource[] {
  const core = { name: "gnam", source: stable(project, join(PACKAGE_ROOT, "skills", "gnam")) }
  const fromPlugins = loaded.flatMap(({ root, plugin }) =>
    (plugin.skills ?? []).map((dir) => ({ name: basename(dir), source: stable(project, join(root, dir)) })),
  )
  return [core, ...fromPlugins]
}

/** .claude/skills 가 .agents/skills 를 가리키는 링크면 한쪽만 */
function skillDirs(project: string): string[] {
  const claude = join(project, ".claude/skills")
  if (isLink(claude)) return [".agents/skills"]
  return SKILL_DIRS
}

/** gnam 이 만든 링크인가: 패키지 · node_modules/@obov/gnam · 활성 plugin 자원을 가리킨다 */
function managed(project: string, link: string, roots: string[]): boolean {
  const target = resolve(dirname(link), readlinkSync(link))
  const owners = [PACKAGE_ROOT, join(project, "node_modules", "@obov", "gnam"), ...roots]
  return owners.some((o) => target === o || target.startsWith(o.endsWith(sep) ? o : o + sep))
}

export function linkSkills(project: string, loaded: Loaded[], report: Report, remove: Loaded[] = []): void {
  const wanted = skillSources(project, loaded)
  const roots = [...loaded, ...remove].map((l) => l.root)
  for (const dir of skillDirs(project)) {
    const base = join(project, dir)
    for (const { name, source } of wanted) {
      if (!existsSync(join(source, "SKILL.md"))) {
        report.push(`skill 원본 없음: ${source}`)
        continue
      }
      const target = join(base, name)
      if (existsSync(target) && !isLink(target)) {
        report.push(`${dir}/${name} 는 저장소 소유 스킬. 링크 생략`)
        continue
      }
      const rel = relative(base, source)
      if (isLink(target) && readlinkSync(target) === rel) continue
      mkdirSync(base, { recursive: true })
      if (isLink(target)) unlinkSync(target)
      symlinkSync(rel, target, "dir")
      report.push(`${dir}/${name} → ${rel}`)
    }
    if (!existsSync(base)) continue
    for (const entry of readdirSync(base)) {
      const path = join(base, entry)
      if (!isLink(path) || wanted.some((w) => w.name === entry) || !managed(project, path, roots)) continue
      unlinkSync(path)
      report.push(`${dir}/${entry} 링크 제거`)
    }
  }
}

export function skillProblems(project: string, loaded: Loaded[]): string[] {
  const problems: string[] = []
  for (const dir of skillDirs(project))
    for (const { name } of skillSources(project, loaded)) {
      const target = join(project, dir, name)
      if (!existsSync(join(target, "SKILL.md"))) problems.push(`${dir}/${name} 링크 없음 · 끊김`)
    }
  return problems
}

// ---------- AGENTS.md ----------

export function agentsBlock(loaded: Loaded[]): string {
  const parts = [readFileSync(join(PACKAGE_ROOT, "templates", "agents.md"), "utf8").trim()]
  for (const { root, plugin } of loaded)
    if (plugin.agentsMd !== undefined) parts.push(readFileSync(join(root, plugin.agentsMd), "utf8").trim())
  return `${BEGIN}\n<!-- gnam sync 가 생성. 이 블록 안은 직접 고치지 않는다 -->\n\n${parts.join("\n\n")}\n\n${END}`
}

/** 블록을 바꾼 새 본문. 블록이 없으면 끝에 붙인다 */
export function withBlock(text: string, block: string): string {
  const begin = text.indexOf(BEGIN)
  const end = text.indexOf(END)
  if (begin >= 0 && end > begin) return text.slice(0, begin) + block + text.slice(end + END.length)
  return `${text.trimEnd()}${text.trim() === "" ? "" : "\n\n"}${block}\n`
}

export function writeAgents(project: string, loaded: Loaded[], report: Report): void {
  const path = join(project, "AGENTS.md")
  const before = existsSync(path) ? readFileSync(path, "utf8") : ""
  const after = withBlock(before, agentsBlock(loaded))
  if (after !== before) {
    writeFileSync(path, after)
    report.push("AGENTS.md gnam 블록 갱신")
  }
  const claude = join(project, "CLAUDE.md")
  if (!existsSync(claude)) {
    writeFileSync(claude, "@AGENTS.md\n")
    report.push("CLAUDE.md 작성 (@AGENTS.md)")
  }
}

export function agentsProblems(project: string, loaded: Loaded[]): string[] {
  const path = join(project, "AGENTS.md")
  if (!existsSync(path)) return ["AGENTS.md 없음"]
  const text = readFileSync(path, "utf8")
  return withBlock(text, agentsBlock(loaded)) === text ? [] : ["AGENTS.md gnam 블록이 현재 plugin 구성과 다름 (gnam sync)"]
}

// ---------- scaffold ----------

export function scaffold(project: string, loaded: Loaded[], report: Report): void {
  const files: [string, string][] = [["specs/README.md", join(PACKAGE_ROOT, "templates", "specs-README.md")]]
  for (const { root, plugin } of loaded)
    for (const [dest, src] of Object.entries(plugin.scaffold ?? {})) files.push([dest, join(root, src)])
  for (const [dest, src] of files) {
    const path = join(project, dest)
    if (existsSync(path)) continue
    mkdirSync(dirname(path), { recursive: true })
    copyFileSync(src, path)
    report.push(`${dest} 작성`)
  }
}

// ---------- package.json ----------

type PackageJson = { name?: string; private?: boolean; scripts?: Record<string, string>; devDependencies?: Record<string, string> }

export function packageManager(project: string): "bun" | "pnpm" | "yarn" | "npm" {
  if (existsSync(join(project, "bun.lock")) || existsSync(join(project, "bun.lockb"))) return "bun"
  if (existsSync(join(project, "pnpm-lock.yaml"))) return "pnpm"
  if (existsSync(join(project, "yarn.lock"))) return "yarn"
  if (existsSync(join(project, "package-lock.json"))) return "npm"
  return process.versions["bun"] !== undefined ? "bun" : "npm"
}

/** postinstall 에 gnam link 추가. clone 직후 install 이 hook · skill 링크를 복구한다 */
export function preparePackage(project: string, report: Report): void {
  const path = join(project, "package.json")
  const pkg: PackageJson = existsSync(path)
    ? (JSON.parse(readFileSync(path, "utf8")) as PackageJson)
    : { name: basename(project), private: true }
  const scripts = (pkg.scripts ??= {})
  const current = scripts["postinstall"]
  if (current === undefined) scripts["postinstall"] = LINK_SCRIPT
  else if (!current.includes(LINK_SCRIPT)) scripts["postinstall"] = `${current} && ${LINK_SCRIPT}`
  const text = `${JSON.stringify(pkg, null, 2)}\n`
  if (!existsSync(path) || readFileSync(path, "utf8") !== text) {
    writeFileSync(path, text)
    report.push("package.json postinstall = gnam link")
  }
  if (git(["rev-parse", "--git-dir"], project).ok && !git(["check-ignore", "-q", "--no-index", "node_modules/"], project).ok) {
    const ignore = join(project, ".gitignore")
    const before = existsSync(ignore) ? readFileSync(ignore, "utf8") : ""
    writeFileSync(ignore, `${before}${before === "" || before.endsWith("\n") ? "" : "\n"}node_modules/\n`)
    report.push(".gitignore node_modules/")
  }
}

export function install(project: string, spec: string, report: Report): void {
  const pm = packageManager(project)
  const args = pm === "npm" ? ["install", "-D", spec] : ["add", "-D", spec]
  const result = exec(pm, args, project)
  if (!result.ok) throw new Error(`${pm} ${args.join(" ")} 실패\n${result.err}`)
  report.push(`${pm} ${args.join(" ")}`)
}

// ---------- 명령 ----------

/** gnam.json 기준으로 hook · skill 링크를 맞춘다. postinstall 용. 설정이 없거나 git 밖이면 조용히 끝낸다 */
export async function link(project: string): Promise<Report> {
  const report: Report = []
  const config = readConfig(project)
  if (config === null) return report
  const loaded = await loadPlugins(project, config)
  installHook(project, report)
  linkSkills(project, loaded, report)
  return report
}

/** link + AGENTS.md 블록 + scaffold. 판 갱신 · plugin 변경 뒤 */
export async function sync(project: string, removed: Loaded[] = []): Promise<Report> {
  const config = requireConfig(project)
  const loaded = await loadPlugins(project, config)
  const report: Report = []
  installHook(project, report)
  linkSkills(project, loaded, report, removed)
  writeAgents(project, loaded, report)
  scaffold(project, loaded, report)
  return report
}

export interface InitOptions {
  plugins?: string[]
  install?: boolean
  /** 설치할 gnam 표기. 기본 @obov/gnam@^<이 판> */
  source?: string
}

export async function init(project: string, options: InitOptions = {}): Promise<Report> {
  const report: Report = []
  if (git(["rev-parse", "--git-dir"], project).ok === false) {
    git(["init", "-q"], project)
    report.push("git init")
  }
  const config = readConfig(project) ?? defaultConfig()
  for (const input of options.plugins ?? []) addSpec(config, normalizeSpec(input))
  await withRequires(project, config)
  writeConfig(project, config)
  report.push(`gnam.json (plugins: ${config.plugins.join(", ") || "-"})`)
  preparePackage(project, report)
  if (options.install !== false) {
    const version = (JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8")) as { version: string }).version
    install(project, options.source ?? `@obov/gnam@^${version}`, report)
  }
  report.push(...(await sync(project)))
  return report
}

const addSpec = (config: GnamConfig, spec: string) => {
  if (!config.plugins.includes(spec)) config.plugins.push(spec)
}

/** 빠진 내장 requires 를 자동 추가. 내장이 아닌 requires 는 오류로 남긴다 (loadPlugins) */
async function withRequires(project: string, config: GnamConfig): Promise<string[]> {
  const added: string[] = []
  for (let changed = true; changed; ) {
    changed = false
    const loaded = await Promise.all(config.plugins.map((s) => loadPlugin(s, project)))
    const ids = loaded.map((l) => l.plugin.id)
    for (const need of loaded.flatMap((l) => l.plugin.requires ?? [])) {
      if (ids.includes(need) || !builtinIds().includes(need)) continue
      addSpec(config, `${BUILTIN_PREFIX}${need}`)
      added.push(need)
      ids.push(need)
      changed = true
    }
  }
  return added
}

export async function addPlugin(project: string, input: string): Promise<Report> {
  const config = requireConfig(project)
  const spec = normalizeSpec(input)
  if (config.plugins.includes(spec)) return [`${spec} 이미 있음`]
  addSpec(config, spec)
  const added = await withRequires(project, config)
  const problems = pluginProblems(await Promise.all(config.plugins.map((s) => loadPlugin(s, project))), config)
  if (problems.length > 0) throw new Error(`추가 거부: ${problems.join(" · ")}`)
  writeConfig(project, config)
  return [`plugin 추가 ${spec}${added.length > 0 ? ` (의존 자동 추가: ${added.join(", ")})` : ""}`, ...(await sync(project))]
}

export async function removePlugin(project: string, input: string, cascade = false): Promise<Report> {
  const config = requireConfig(project)
  const loaded = await loadPlugins(project, config)
  const spec = normalizeSpec(input)
  const target = loaded.find((l) => l.spec === spec || l.plugin.id === input)
  if (target === undefined) throw new Error(`활성 plugin 아님: ${input}`)
  const removing = new Set([target.plugin.id])
  for (let changed = true; changed; ) {
    changed = false
    for (const l of loaded)
      if (!removing.has(l.plugin.id) && (l.plugin.requires ?? []).some((r) => removing.has(r))) {
        if (!cascade)
          throw new Error(`${target.plugin.id} 에 의존: ${dependentsOf(loaded, target.plugin.id).join(", ")}. --cascade 로 함께 제거`)
        removing.add(l.plugin.id)
        changed = true
      }
  }
  const removed = loaded.filter((l) => removing.has(l.plugin.id))
  config.plugins = config.plugins.filter((s) => !removed.some((l) => l.spec === s))
  writeConfig(project, config)
  return [`plugin 제거 ${removed.map((l) => l.plugin.id).join(", ")}`, ...(await sync(project, removed))]
}

export async function doctor(project: string): Promise<string[]> {
  const config = readConfig(project)
  if (config === null) return ["gnam.json 없음 (npx gnam init)"]
  const loaded = await loadPlugins(project, config)
  return [...hookProblems(project), ...skillProblems(project, loaded), ...agentsProblems(project, loaded)]
}

export const realProject = (cwd: string) => {
  const top = git(["rev-parse", "--show-toplevel"], cwd)
  return top.ok ? realpathSync(top.out.trim()) : realpathSync(cwd)
}
