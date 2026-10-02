/**
 * 릴리스 (.agents/skills/gnam-release/references/release.md). gnam.json release 가 없으면 아무것도 하지 않는다.
 *
 *   gnam run release status                        대상별 직전 release · 계산 수준 · 근거
 *   gnam run release bump [<name>[@<level|X.Y.Z>]]…  package.json version 변경 + 커밋 메시지 초안. 인자 없음 = 변경 있는 대상 전부
 *   gnam run release publish <before> <sha>
 *                                                 CI (main push). 범위의 release 커밋마다 태그 <name>@<version> + GitHub Release
 *
 * 검사 (release 커밋 형식 · 버전 · release 밖 version 변경) 는 commit-msg hook (release plugin kinds · everyCommit) 가 한다.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import * as core from "../../core/git.ts"
import type { ReleaseConfig } from "./config.ts"
import { adviseBreaking } from "./advisor.ts"
import {
  allowedVersions,
  bump,
  draftMessage,
  entriesOf,
  isSemver,
  LEVELS,
  type Level,
  type ReleaseState,
  sectionsOf,
} from "./model.ts"
import { releaseStates } from "./repo.ts"

type Gh = (args: string[], stdin?: string) => { ok: boolean; out: string; err: string }

const gh: Gh = (args, stdin) => core.exec("gh", args, process.cwd(), stdin ?? "")

const gitOrThrow = (cwd: string, args: string[]): string => core.gitOrThrow(args, cwd)

export const tagOf = (name: string, version: string) => `${name}@${version}`

/** 'name' · 'name@minor' · 'name@1.2.0' 요청에 맞는 버전. 허용 목록 밖이면 오류 문자열 */
export function pickVersion(state: ReleaseState, allowed: string[], request: string | null): string | Error {
  if (allowed.length === 0) return new Error(`${state.name}: 직전 release (${state.last?.version}) 이후 변경 없음`)
  if (request === null) return allowed[0] ?? ""
  const version =
    (LEVELS as readonly string[]).includes(request) && state.scheme === "semver" && state.last !== null
      ? bump(state.last.version, request as Level)
      : request
  if (version !== null && allowed.includes(version)) return version
  return new Error(`${state.name}@${request}: 허용 버전 ${allowed.join(" · ")} (계산 수준보다 낮출 수 없음)`)
}

/** package.json 의 첫 "version" 값만 바꾼다 (나머지 서식 유지) */
export function withVersion(text: string, version: string): string {
  return text.replace(/("version"\s*:\s*")[^"]*(")/, `$1${version}$2`)
}

function status(cwd: string, config: ReleaseConfig) {
  const input = releaseStates(cwd, config, { kind: "worktree" })
  if (input === null) return console.log("커밋 없음")
  for (const state of input.states) {
    const allowed = allowedVersions(state, input.date)
    console.log(
      `${state.name} (${state.dir}, ${state.scheme}) 직전 ${state.last?.version ?? "없음"} → ${allowed[0] ?? "변경 없음"}${allowed.length > 1 ? ` (허용 ${allowed.join(" · ")})` : ""}`,
    )
    if (state.scheme === "semver" && state.last !== null)
      for (const e of state.evidence())
        console.log(`  ${e.hash.slice(0, 7)} ${e.level.padEnd(5)} ${e.subject}  (${e.reason})`)
  }
  if (config.advisor === "jev") advise(input.states)
}

function advise(states: ReleaseState[]) {
  for (const state of states.filter((s) => s.scheme === "semver" && s.last !== null)) {
    for (const warning of adviseBreaking(state.evidence())) console.log(`  advisor: ${state.name} ${warning}`)
  }
}

function bumpCommand(cwd: string, config: ReleaseConfig, args: string[]) {
  const input = releaseStates(cwd, config, { kind: "worktree" })
  if (input === null) throw new Error("커밋 없음")
  const requests = new Map(
    args.map((arg) => {
      const at = arg.lastIndexOf("@")
      return at > 0 ? [arg.slice(0, at), arg.slice(at + 1)] : [arg, null]
    }),
  )
  for (const name of requests.keys())
    if (!input.states.some((s) => s.name === name)) throw new Error(`${name}: release.targets 에 없는 package`)

  const picks: { state: ReleaseState; version: string }[] = []
  const errors: string[] = []
  for (const state of input.states) {
    if (requests.size > 0 && !requests.has(state.name)) continue
    const allowed = allowedVersions(state, input.date)
    if (requests.size === 0 && allowed.length === 0) continue
    const version = pickVersion(state, allowed, requests.get(state.name) ?? null)
    if (version instanceof Error) errors.push(version.message)
    else picks.push({ state, version })
  }
  if (errors.length > 0) throw new Error(errors.join("\n"))
  if (picks.length === 0) return console.log("릴리스할 변경 없음")

  const files: string[] = []
  for (const { state, version } of picks) {
    // openapi · 첫 릴리스 (버전 그대로) 는 바꿀 파일이 없다
    if (state.scheme === "openapi" || state.current === version) continue
    const path = `${state.dir}/package.json`
    writeFileSync(join(cwd, path), withVersion(readFileSync(join(cwd, path), "utf8"), version))
    files.push(path)
  }
  const draft = resolve(cwd, gitOrThrow(cwd, ["rev-parse", "--git-path", "gnam/release-message.txt"]).trim())
  mkdirSync(dirname(draft), { recursive: true })
  writeFileSync(draft, `${draftMessage(picks)}\n`)
  console.log(draftMessage(picks))
  if (config.advisor === "jev") advise(picks.map((p) => p.state))
  console.log(
    `\n초안: ${draft}\n근거 줄을 제품 말 요약으로 고친 뒤 (Package: 줄 유지):\n  git add ${files.join(" ") || "(파일 없음)"} && git commit ${files.length === 0 ? "--allow-empty " : ""}-F ${draft}`,
  )
}

/** 범위 안 release 커밋의 태그 · GitHub Release. 이미 있으면 건너뛴다 (다시 실행해도 같은 결과) */
export function publish(cwd: string, range: string, run: Gh = gh): string[] {
  const log: string[] = []
  const out = gitOrThrow(cwd, ["log", "--reverse", "--no-merges", "-E", "--grep", "^release: ", "--format=%H", range])
  for (const hash of out.split("\n").filter(Boolean)) {
    const subject = gitOrThrow(cwd, ["log", "-1", "--format=%s", hash]).trim()
    const body = gitOrThrow(cwd, ["log", "-1", "--format=%b", hash])
    const sections = sectionsOf(body)
    for (const { name, version } of entriesOf(subject)?.entries ?? []) {
      if (!isSemver(version)) continue
      const tag = tagOf(name, version)
      if (run(["release", "view", tag]).ok) {
        log.push(`${tag} 있음`)
        continue
      }
      const notes = sections.get(name)?.notes ?? ""
      const created = run(["release", "create", tag, "--target", hash, "--title", tag, "--notes-file", "-"], notes)
      if (!created.ok) throw new Error(`gh release create ${tag} 실패\n${created.err}`)
      log.push(`${tag} 생성 (${hash.slice(0, 7)})`)
    }
  }
  return log
}

export function releaseCli(cwd: string, config: ReleaseConfig | null, argv: string[]): number {
  const [command, ...args] = argv
  try {
    if (config === null) console.log("gnam.json release 없음. 릴리스를 쓰지 않는다 (.agents/skills/gnam-release/references/release.md)")
    else if (command === "status") status(cwd, config)
    else if (command === "bump") bumpCommand(cwd, config, args)
    else if (command === "publish") {
      const [before = "", sha = ""] = args
      if (sha === "") throw new Error("사용: gnam run release publish <before> <sha>")
      const zero = before === "" || /^0+$/.test(before)
      const exists = !zero && core.git(["cat-file", "-e", `${before}^{commit}`], cwd).ok
      for (const line of publish(cwd, exists ? `${before}..${sha}` : sha)) console.log(line)
    } else {
      console.error("사용: gnam run release <status | bump [<name>[@<level|X.Y.Z>]]… | publish <before> <sha>>")
      return 1
    }
    return 0
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return 1
  }
}
