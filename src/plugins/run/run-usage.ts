/**
 * Claude Code 세션 transcript → run.end 의 측정 키 (.agents/skills/gnam-run/references/run.md).
 *
 *   gnam run run usage <session-id> …            세션마다 Agent 줄에 붙일 key=value 한 줄
 *   gnam run run usage --root <projects> <id> …  transcript 위치 지정 (기본 $CLAUDE_CONFIG_DIR 또는 ~/.claude 의 projects)
 *
 * 세션 = <projects>/<프로젝트>/<id>.jsonl, 그 세션의 subagent = <projects>/<프로젝트>/<id>/subagents/*.jsonl.
 * 토큰은 subagent 포함. 활동 시간은 메인 transcript 의 turn_duration 합 (subagent 는 그 turn 안에서 돈다).
 * turn_duration 이 없는 이전 판은 5분 넘는 공백을 대기로 보고 뺀 시간.
 * impl_min · impl_out = 구현 구간만. '리뷰 결과 반영 지시' 프롬프트부터 다음 '작업 지시' 전까지 (반영 · rebase) 를 뺀다
 * (multi-agent plugin roles/runner.md 템플릿 첫 줄). 추정 (est_*) 과 비교하는 값.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const IDLE_MS = 5 * 60_000
const IMPL_PROMPT = "작업 지시"
const FIX_PROMPT = "리뷰 결과 반영 지시"

interface Totals {
  input: number
  cache_write: number
  cache_read: number
  out: number
  requests: number
}

export interface Usage extends Totals {
  model: string
  effort: string
  harness: string
  /** 요청 수가 가장 많은 조합 외의 모델 · effort (세션 중 변경) */
  mixed: string[]
  active_min: number
  /** 반영 구간을 뺀 활동 분 · 출력 토큰 */
  impl_min: number
  impl_out: number
  wall_min: number
  api_errors: number
}

type Entry = Record<string, unknown>
const record = (value: unknown): Entry => (typeof value === "object" && value !== null ? (value as Entry) : {})
const num = (value: unknown) => (typeof value === "number" ? value : 0)
const str = (value: unknown) => (typeof value === "string" ? value : "")
const timeOf = (entry: Entry) => Date.parse(str(entry["timestamp"]))

/** 사람 (조정자) 이 보낸 프롬프트 본문. tool_result · hook 주입 (isMeta) 은 null */
function promptOf(entry: Entry): string | null {
  if (entry["type"] !== "user" || entry["isMeta"] === true) return null
  const content = record(entry["message"])["content"]
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return null
  const blocks = content.map(record)
  if (blocks.some((block) => block["type"] === "tool_result")) return null
  return blocks.map((block) => str(block["text"])).join("\n")
}

/** 프롬프트 시각마다 구간 전환. 붙여넣은 지시는 <pasted_content …> 로 감싸여 온다 */
function phasesOf(main: Entry[]): { at: number; fix: boolean }[] {
  const phases: { at: number; fix: boolean }[] = []
  for (const entry of main) {
    const text = (promptOf(entry) ?? "").replace(/^\s*(<pasted_content[^>]*>\s*)?/, "")
    if (text.startsWith(FIX_PROMPT)) phases.push({ at: timeOf(entry), fix: true })
    else if (text.startsWith(IMPL_PROMPT)) phases.push({ at: timeOf(entry), fix: false })
  }
  return phases
}

/** main = 메인 transcript 줄, subagents = subagent transcript 줄 */
export function summarize(main: Entry[], subagents: Entry[] = []): Usage {
  const byConfig = new Map<string, Totals & { out: number }>()
  const seen = new Set<string>()
  const phases = phasesOf(main)
  const fixAt = (time: number) => phases.findLast((phase) => phase.at <= time)?.fix ?? false
  let harness = ""
  let apiErrors = 0
  let implOut = 0
  for (const entry of [...main, ...subagents]) {
    if (entry["subtype"] === "api_error") apiErrors++
    const message = record(entry["message"])
    const usage = record(message["usage"])
    if (entry["type"] !== "assistant" || Object.keys(usage).length === 0) continue
    harness = str(entry["version"]) || harness
    // 한 요청의 블록이 줄마다 나뉘고 같은 usage 가 반복된다
    const id = str(entry["requestId"]) || str(message["id"])
    if (seen.has(id)) continue
    seen.add(id)
    const key = `${str(message["model"]) || "na"} ${str(entry["effort"]) || "na"}`
    const totals = byConfig.get(key) ?? { input: 0, cache_write: 0, cache_read: 0, out: 0, requests: 0 }
    totals.input += num(usage["input_tokens"])
    totals.cache_write += num(usage["cache_creation_input_tokens"])
    totals.cache_read += num(usage["cache_read_input_tokens"])
    totals.out += num(usage["output_tokens"])
    totals.requests++
    byConfig.set(key, totals)
    if (!fixAt(timeOf(entry))) implOut += num(usage["output_tokens"])
  }

  const ranked = [...byConfig.entries()].sort((a, b) => b[1].requests - a[1].requests)
  const [model = "na", effort = "na"] = (ranked[0]?.[0] ?? "na na").split(" ")
  const sum = (field: keyof Totals) => ranked.reduce((total, [, totals]) => total + totals[field], 0)

  const times = main.map(timeOf).filter((time) => !Number.isNaN(time))
  const turns = main.filter((entry) => entry["subtype"] === "turn_duration")
  let activeMs = 0
  let implMs = 0
  const add = (ms: number, at: number) => {
    activeMs += ms
    if (!fixAt(at)) implMs += ms
  }
  for (const entry of turns) add(num(entry["durationMs"]), timeOf(entry))
  if (turns.length === 0) {
    for (let i = 1; i < times.length; i++) {
      const gap = (times[i] ?? 0) - (times[i - 1] ?? 0)
      if (gap > 0 && gap < IDLE_MS) add(gap, times[i] ?? 0)
    }
  }
  const wallMs = times.length > 1 ? Math.max(...times) - Math.min(...times) : 0

  return {
    model,
    effort,
    harness: harness || "na",
    mixed: ranked.slice(1).map(([key]) => key.replace(" ", "/")),
    input: sum("input"),
    cache_write: sum("cache_write"),
    cache_read: sum("cache_read"),
    out: sum("out"),
    requests: sum("requests"),
    active_min: Math.round(activeMs / 60_000),
    impl_min: Math.round(implMs / 60_000),
    impl_out: implOut,
    wall_min: Math.round(wallMs / 60_000),
    api_errors: apiErrors,
  }
}

/** Agent 줄에 붙일 측정 키 (run-format 키 순서). reviewer 는 impl_* 를 적지 않는다 */
export function measuredOf(usage: Usage, reviewer = false): Record<string, string> {
  const keys: Record<string, string | number> = {
    model: usage.model,
    effort: usage.effort,
    active_min: usage.active_min,
    out: usage.out,
    ...(reviewer ? {} : { impl_min: usage.impl_min, impl_out: usage.impl_out }),
    api_errors: usage.api_errors,
    harness: usage.harness,
  }
  return Object.fromEntries(Object.entries(keys).map(([key, value]) => [key, String(value)]))
}

/** Agent 줄에 붙이지 않는 참고 값 */
export const extraOf = (usage: Usage) =>
  `wall_min=${usage.wall_min} input=${usage.input} cache_write=${usage.cache_write} cache_read=${usage.cache_read} requests=${usage.requests}`

const pairs = (keys: Record<string, string>) =>
  Object.entries(keys)
    .map(([key, value]) => `${key}=${value}`)
    .join(" ")

/** 세션 transcript. 없으면 null */
export async function usageOf(session: string, root = defaultRoot()): Promise<Usage | null> {
  const found = await read(root, session)
  return found === null ? null : summarize(found.main, found.subagents)
}

export const defaultRoot = () => join(process.env["CLAUDE_CONFIG_DIR"] ?? join(homedir(), ".claude"), "projects")

const parse = (text: string): Entry[] =>
  text
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [record(JSON.parse(line))]
      } catch {
        return []
      }
    })

async function read(root: string, session: string): Promise<{ main: Entry[]; subagents: Entry[] } | null> {
  if (!existsSync(root)) return null
  for (const project of readdirSync(root)) {
    const file = join(root, project, `${session}.jsonl`)
    if (!existsSync(file)) continue
    const dir = join(root, project, session, "subagents")
    const subagents: Entry[] = []
    const paths = existsSync(dir) ? readdirSync(dir).filter((name) => name.endsWith(".jsonl")) : []
    for (const path of paths) {
      subagents.push(...parse(readFileSync(join(dir, path), "utf8")))
    }
    return { main: parse(readFileSync(file, "utf8")), subagents }
  }
  return null
}

export async function usageCli(args: string[]): Promise<number> {
  const at = args.indexOf("--root")
  const root = at >= 0 ? (args[at + 1] ?? "") : defaultRoot()
  const sessions = args.filter((_, i) => at < 0 || (i !== at && i !== at + 1))
  if (sessions.length === 0) {
    console.error("사용: gnam run run usage [--root <projects>] <session-id> …")
    return 1
  }
  for (const session of sessions) {
    const usage = await usageOf(session, root)
    console.log(`session ${session}`)
    if (usage === null) {
      console.log(`  미측정 (transcript 없음: ${root}/*/${session}.jsonl)`)
      process.exitCode = 1
      continue
    }
    console.log(`  ${pairs(measuredOf(usage))}`)
    console.log(`  참고 ${extraOf(usage)}`)
    if (usage.mixed.length > 0) console.log(`  세션 중 변경 ${usage.mixed.join(", ")} (model · effort 는 요청 수 최다)`)
  }
  return process.exitCode === 1 ? 1 : 0
}
