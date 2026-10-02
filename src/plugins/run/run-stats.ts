/**
 * run 커밋 (.agents/skills/gnam-run/references/run.md) 조회 · 집계.
 *
 *   gnam run run stats table [--by model,effort] [--where size=M,difficulty=K2] [--role runner] [--min 30] [--with-noise]
 *   gnam run run stats adopted [--where …]          merge 된 줄 수를 model · effort 별로
 *   gnam run run stats health                       기록 누락 · 미측정 · 노이즈 · 판정 · 추정 정확도 · 탐색 · 재작업
 *   gnam run run stats lines <merge hash> …         merge 별 변경 줄 · 파일 · 크기 (S/M/L) · area. end 줄 작성용
 *   gnam run run stats end <run.start hash> [--root <projects>]   end 초안 (측정 키 채움, 판정 키 '?') + 추정 대비표
 *
 * 교정된 end (다른 end 의 Corrects: 대상) 는 뺀다. noise 가 none 이 아닌 줄은 --with-noise 없이는 뺀다.
 * 칸의 표본이 --min 미만이면 판단 보류로 표시한다 (1000 run 도 칸이 100개면 칸당 수십 건).
 */
import { gitOrThrow } from "../../core/git.ts"
import { sizeOf } from "./classification.ts"
import { type Agent, agentsOf, fieldOf, KEY_ORDER, NA } from "./run-format.ts"
import { defaultRoot, measuredOf, type Usage, usageOf } from "./run-usage.ts"

export interface RunCommit {
  hash: string
  subject: string
  body: string
}

export interface Row {
  /** run.end hash 7자 */
  run: string
  agent: string
  fields: Record<string, string>
  /** 같은 이름의 start 줄 (추정치) */
  start: Record<string, string>
}

const RUN = /^run\.[A-Za-z0-9_-]+\.(start|end|policy): /
const kindOf = (subject: string) => RUN.exec(subject)?.[1] ?? ""
const sameHash = (a: string, b: string) => a.startsWith(b) || b.startsWith(a)

/** 교정되지 않은 end. 교정 end (Corrects:) 가 원래 end 를 대신한다 */
function liveEnds(commits: RunCommit[]): RunCommit[] {
  const ends = commits.filter((commit) => kindOf(commit.subject) === "end")
  const corrected = ends.flatMap((commit) => (fieldOf(commit.body, "Corrects") ?? "").split(/\s+/).filter(Boolean))
  return ends.filter((commit) => !corrected.some((hash) => sameHash(commit.hash, hash)))
}

/** end 줄마다 행 하나. 교정된 end 는 빠진다 */
export function rowsOf(commits: RunCommit[]): Row[] {
  const starts = commits.filter((commit) => kindOf(commit.subject) === "start")
  return liveEnds(commits).flatMap((commit) => {
    const runHash = fieldOf(commit.body, "Run") ?? ""
    const start = starts.find((s) => runHash !== "" && sameHash(s.hash, runHash))
    const planned = new Map(agentsOf(start?.body ?? "").map((agent) => [agent.name, agent.fields]))
    return agentsOf(commit.body)
      .filter((agent: Agent) => agent.name !== "")
      .map((agent) => ({
        run: commit.hash.slice(0, 7),
        agent: agent.name,
        fields: agent.fields,
        start: planned.get(agent.fields["from"] ?? agent.name) ?? {},
      }))
  })
}

/** 'k=v,k=v' 조건 */
const matches = (row: Row, where: string) =>
  where
    .split(",")
    .filter(Boolean)
    .every((pair) => {
      const [key = "", value = ""] = pair.split("=")
      return row.fields[key] === value
    })

const numbers = (values: (string | undefined)[]) =>
  values.filter((value): value is string => value !== undefined && value !== NA).map(Number)

export function quantile(values: number[], q: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? null
}

/** 터미널 표시 폭. 한글 · CJK 전각은 2칸 */
const widthOf = (text: string) =>
  [...text].reduce(
    (total, char) => total + (/[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\uff00-\uff60]/.test(char) ? 2 : 1),
    0,
  )

/** 열 맞춘 표. 첫 행 = 머리 */
export function columns(rows: string[][]): string[] {
  const widths = rows[0]?.map((_, i) => Math.max(...rows.map((row) => widthOf(row[i] ?? "")))) ?? []
  return rows.map((row) =>
    row
      .map((cell, i) => (i === row.length - 1 ? cell : cell + " ".repeat((widths[i] ?? 0) - widthOf(cell))))
      .join("  ")
      .trimEnd(),
  )
}

/** 추정과 비교하는 실측. 구현 구간 (impl_*) 이 없는 이전 기록은 전체 (active_min · out) */
const implMin = (row: Row) => row.fields["impl_min"] ?? row.fields["active_min"]
const implOut = (row: Row) => row.fields["impl_out"] ?? row.fields["out"]

/** 비율의 95% Wilson 구간 (%). 표본이 작을 때도 0 · 100 밖으로 나가지 않는다 */
export function wilson(yes: number, n: number): [number, number] {
  if (n === 0) return [0, 100]
  const z = 1.96
  const p = yes / n
  const center = (p + (z * z) / (2 * n)) / (1 + (z * z) / n)
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / (1 + (z * z) / n)
  return [Math.round(100 * Math.max(0, center - half)), Math.round(100 * Math.min(1, center + half))]
}

export interface TableOptions {
  by: string[]
  where: string
  role: string
  min: number
  withNoise: boolean
}

export function table(rows: Row[], { by, where, role, min, withNoise }: TableOptions): string[] {
  const kept = rows.filter(
    (row) =>
      (role === "all" || row.fields["role"] === role) &&
      (withNoise || row.fields["noise"] === "none") &&
      matches(row, where),
  )
  const groups = new Map<string, Row[]>()
  for (const row of kept) {
    const key = by.map((name) => `${name}=${row.fields[name] ?? "?"}`).join(" ")
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  const head = `행 ${kept.length} (role=${role}${withNoise ? "" : ", noise=none"}${where === "" ? "" : `, ${where}`})`
  const cells = [["칸", "n", "firstpass [95%]", "impl_min p50/p90", "active_min p50/p90", "out p50", "fit/under/over"]]
  for (const [key, group] of [...groups.entries()].sort()) {
    const tries = group.filter((row) => row.fields["firstpass"] !== NA)
    const yes = tries.filter((row) => row.fields["firstpass"] === "yes").length
    const [low, high] = wilson(yes, tries.length)
    const impl = numbers(group.map(implMin))
    const active = numbers(group.map((row) => row.fields["active_min"]))
    const tokens = numbers(group.map((row) => row.fields["out"]))
    const verdicts = ["fit", "under", "over"].map((v) => group.filter((row) => row.fields["verdict"] === v).length)
    const rate = tries.length === 0 ? NA : `${Math.round((100 * yes) / tries.length)}% [${low}–${high}]`
    const spread = (values: number[]) => `${quantile(values, 0.5) ?? NA}/${quantile(values, 0.9) ?? NA}`
    cells.push([
      key,
      `${group.length}${group.length < min ? " 보류" : ""}`,
      rate,
      spread(impl),
      spread(active),
      String(quantile(tokens, 0.5) ?? NA),
      verdicts.join("/"),
    ])
  }
  return [head, ...(cells.length > 1 ? columns(cells) : [])]
}

export function adopted(rows: Row[], where: string): string[] {
  const lines = new Map<string, number>()
  for (const row of rows.filter((r) => matches(r, where))) {
    const value = Number(row.fields["lines"] ?? 0)
    if (!Number.isFinite(value) || value === 0) continue
    const key = `${row.fields["model"]} · ${row.fields["effort"]}`
    lines.set(key, (lines.get(key) ?? 0) + value)
  }
  const total = [...lines.values()].reduce((a, b) => a + b, 0)
  return [...lines.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key, value]) => `${key}  ${value}줄 (${Math.round((100 * value) / total)}%)`)
}

export interface HealthInput {
  commits: RunCommit[]
  rows: Row[]
  /** run.end hash → 그 뒤에 같은 Plan 을 가리킨 impl 수 */
  reworkOf: (endHash: string, planHash: string) => number
}

export function health({ commits, rows, reworkOf }: HealthInput): string[] {
  const starts = commits.filter((commit) => kindOf(commit.subject) === "start")
  const ends = liveEnds(commits)
  const open = starts.filter((s) => !ends.some((e) => sameHash(s.hash, fieldOf(e.body, "Run") ?? "")))
  const pct = (part: number, whole: number) => (whole === 0 ? "na" : `${Math.round((100 * part) / whole)}%`)
  const unmeasured = rows.filter((row) => row.fields["active_min"] === NA || row.fields["out"] === NA).length
  const noisy = rows.filter((row) => row.fields["noise"] !== "none").length
  const explore = rows.filter((row) => row.fields["explore"] === "yes").length
  // reviewer 는 판정 · 예상이 없다 (.agents/skills/gnam-run/references/run.md)
  const rated = rows.filter((row) => row.fields["role"] !== "reviewer")
  const ratio = (actual: (row: Row) => string | undefined, estimate: string) =>
    quantile(
      rated.flatMap((row) => {
        const a = Number(actual(row))
        const e = Number(row.start[estimate])
        return Number.isFinite(a) && Number.isFinite(e) && e > 0 ? [a / e] : []
      }),
      0.5,
    )
  const reworked = ends.filter((end) => {
    const start = starts.find((s) => sameHash(s.hash, fieldOf(end.body, "Run") ?? ""))
    const plan = (fieldOf(start?.body ?? "", "Plan") ?? "").split(/\s+/)[0] ?? ""
    return plan !== "" && plan !== "없음" && reworkOf(end.hash, plan) > 0
  }).length
  const verdicts = ["fit", "under", "over", NA].map(
    (v) => `${v} ${pct(rated.filter((row) => row.fields["verdict"] === v).length, rated.length)}`,
  )
  const fixed = (value: number | null) => (value === null ? NA : value.toFixed(2))
  const openList =
    open.length === 0
      ? ""
      : ` (${open
          .slice(0, 10)
          .map((s) => s.hash.slice(0, 7))
          .join(" ")}${open.length > 10 ? " …" : ""})`
  return columns([
    ["항목", "값"],
    ["run", `start ${starts.length} · end ${ends.length} · end 없는 start ${open.length}${openList}`],
    [
      "에이전트 줄",
      `${rows.length} · 미측정 ${pct(unmeasured, rows.length)} · 노이즈 ${pct(noisy, rows.length)} · 탐색 ${pct(explore, rows.length)}`,
    ],
    ["판정 (runner)", verdicts.join(" · ")],
    ["실측/추정 p50", `impl_min ${fixed(ratio(implMin, "est_min"))} · impl_out ${fixed(ratio(implOut, "est_out"))}`],
    ["재작업", `${pct(reworked, ends.length)} (end 뒤 같은 Plan 의 impl)`],
  ])
}

export interface Draft {
  agent: Agent
  usage: Usage | null
}

/** over 후보: 구현 구간의 분 · 출력 토큰이 둘 다 추정의 절반 미만 (.agents/skills/gnam-run/references/run.md '판정') */
export function overCandidate(start: Record<string, string>, usage: Usage | null): boolean {
  const estMin = Number(start["est_min"])
  const estOut = Number(start["est_out"])
  if (usage === null || !(estMin > 0) || !(estOut > 0)) return false
  return usage.impl_min < estMin / 2 && usage.impl_out < estOut / 2
}

/** run.end 초안. 측정 키는 transcript 값, 판정 · 분류 키는 '?' (조정자가 채우기 전엔 commit-msg 가 막는다) */
export function endDraft(startHash: string, drafts: Draft[]): string[] {
  const line = ({ agent, usage }: Draft) => {
    const reviewer = agent.fields["role"] === "reviewer"
    const measured =
      usage === null
        ? {
            model: NA,
            effort: NA,
            active_min: NA,
            out: NA,
            ...(reviewer ? {} : { impl_min: NA, impl_out: NA }),
          }
        : measuredOf(usage, reviewer)
    const judged: Record<string, string> = reviewer
      ? { noise: "?" }
      : {
          size: "?",
          difficulty: "?",
          explore: agent.fields["explore"] ?? "?",
          firstpass: "?",
          retries: "?",
          blocked: "?",
          cause: "?",
          noise: "?",
          verdict: "?",
          lines: "?",
        }
    const keys: Record<string, string> = {
      role: agent.fields["role"] ?? "?",
      step: agent.fields["step"] ?? "?",
      ...measured,
      ...judged,
    }
    const pairs = KEY_ORDER.filter((key) => key in keys).map((key) => `${key}=${keys[key]}`)
    return `Agent: ${agent.name} ${pairs.join(" ")}`
  }
  const runners = drafts.filter(({ agent }) => agent.fields["role"] !== "reviewer")
  return [
    `Run: ${startHash.slice(0, 7)}`,
    "Outcome: ?",
    "Merges: ?",
    "",
    ...runners.map(({ agent }) => `Why: ${agent.name} ?`),
    "",
    ...drafts.map(line),
  ]
}

/** 추정 대비표 (커밋에 넣지 않는 판정 참고) */
export function estimateTable(drafts: Draft[]): string[] {
  const cells = [["에이전트", "est_min", "impl_min", "active_min", "est_out", "impl_out", "out", "over 후보"]]
  for (const { agent, usage } of drafts) {
    const reviewer = agent.fields["role"] === "reviewer"
    const show = (value: number | undefined) => (usage === null || value === undefined ? NA : String(value))
    cells.push([
      agent.name,
      agent.fields["est_min"] ?? "-",
      reviewer ? "-" : show(usage?.impl_min),
      show(usage?.active_min),
      agent.fields["est_out"] ?? "-",
      reviewer ? "-" : show(usage?.impl_out),
      show(usage?.out),
      reviewer ? "-" : overCandidate(agent.fields, usage) ? "yes" : "no",
    ])
  }
  return columns(cells)
}

/** 경로 → area. apps/<kind>/<name> · packages/<name> · 그 밖은 첫 디렉터리 */
export function areaOf(path: string): string {
  const parts = path.split("/")
  if (parts[0] === "apps") return parts.slice(0, 3).join("/")
  if (parts[0] === "packages") return parts.slice(0, 2).join("/")
  return parts.length > 1 ? (parts[0] ?? path) : "."
}

const git = (args: string[], cwd: string): string => gitOrThrow(args, cwd)

function readRuns(cwd: string): RunCommit[] {
  return git(
    ["log", "-E", "--grep", "^run\\.[A-Za-z0-9_-]+\\.(start|end|policy): ", "--format=%H%x1f%s%x1f%b%x1e"],
    cwd,
  )
    .split("\x1e")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const [hash = "", subject = "", body = ""] = chunk.split("\x1f")
      return { hash, subject, body: body.trim() }
    })
}

function option(args: string[], name: string, fallback: string): string {
  const at = args.indexOf(name)
  return at >= 0 ? (args[at + 1] ?? fallback) : fallback
}

export async function statsCli(argv: string[], cwd: string): Promise<number> {
  const [command = "", ...args] = argv
  const where = option(args, "--where", "")
  let out: string[]
  if (command === "end") {
    const [hash = ""] = args
    const at = args.indexOf("--root")
    const root = at >= 0 ? (args[at + 1] ?? "") : defaultRoot()
    const agents = agentsOf(git(["show", "-s", "--format=%b", hash], cwd)).filter((agent) => agent.name !== "")
    if (hash === "" || agents.length === 0) {
      console.error("사용: gnam run run stats end <run.start hash> [--root <projects>]")
      return 1
    }
    const drafts: Draft[] = []
    for (const agent of agents) {
      const session = agent.fields["session"]
      drafts.push({ agent, usage: session === undefined || session === NA ? null : await usageOf(session, root) })
    }
    out = [
      "# 추정 대비 (커밋에 넣지 않음. over 후보 = impl_min · impl_out 둘 다 추정의 절반 미만)",
      ...estimateTable(drafts),
      "",
      "# end 본문 초안 ('?' 를 채운다. lines · size = gnam run run stats lines <merge>)",
      ...endDraft(hash, drafts),
    ]
  } else if (command === "lines") {
    out = args.map((merge) => {
      const stat = git(["diff", "--numstat", `${merge}^1`, merge, "--", ".", ":(exclude)bun.lock"], cwd)
        .split("\n")
        .filter(Boolean)
        .map((line) => line.split("\t"))
      const lines = stat.reduce((total, [add = "0", del = "0"]) => total + (Number(add) || 0) + (Number(del) || 0), 0)
      const areas = [...new Set(stat.map(([, , path = ""]) => areaOf(path)))].sort()
      return `${merge} lines=${lines} files=${stat.length} size=${sizeOf(lines, stat.length)} area=${areas.join(",")}`
    })
  } else {
    const commits = readRuns(cwd)
    const rows = rowsOf(commits)
    if (command === "table") {
      out = table(rows, {
        by: option(args, "--by", "model,effort").split(","),
        where,
        role: option(args, "--role", "runner"),
        min: Number(option(args, "--min", "30")),
        withNoise: args.includes("--with-noise"),
      })
    } else if (command === "adopted") {
      out = adopted(rows, where)
    } else if (command === "health") {
      const reworkOf = (end: string, plan: string) =>
        git(
          [
            "log",
            "--format=%h",
            "--all-match",
            "--grep",
            `^Plan: ${plan.slice(0, 7)}`,
            "--grep",
            "^spec\\.[A-Za-z0-9_-]+\\.impl: ",
            `${end}..HEAD`,
          ],
          cwd,
        )
          .split("\n")
          .filter(Boolean).length
      out = health({ commits, rows, reworkOf })
    } else {
      console.error("사용: gnam run run stats table | adopted | health | lines <merge> … | end <run.start>")
      return 1
    }
  }
  console.log(out.join("\n"))
  return process.exitCode === 1 ? 1 : 0
}
