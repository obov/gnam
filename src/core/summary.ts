/**
 * gnam status 요약 (specs/info.md 요약). 세션 시작에 git status 와 함께 읽는 한 화면.
 */
import { fieldsOf } from "./fields.ts"
import { git, lines } from "./git.ts"
import type { Problem } from "./status.ts"
import type { Plan, Trace } from "./trace.ts"

export interface SummaryInput {
  cwd: string
  version: string
  plugins: string[]
  problems: Problem[]
  handoff: { exists: boolean; content: string | null }
  trace: Trace
  /** plugin 이 낸 요약 줄 (label · 내용) */
  pluginLines: string[]
}

const LIMIT = 5
const LABEL_WIDTH = 11

/** 표시 폭 (한글 2칸) */
function width(text: string): number {
  let w = 0
  for (const ch of text) w += /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿＀-｠￠-￦]/.test(ch) ? 2 : 1
  return w
}

const label = (name: string) => name + " ".repeat(Math.max(2, LABEL_WIDTH - width(name)))
const short = (sha: string) => sha.slice(0, 7)
const capped = (parts: string[]) => (parts.length > LIMIT ? [...parts.slice(0, LIMIT), `외 ${parts.length - LIMIT}`] : parts)
const topicOf = (plan: Plan) => /^spec\.([A-Za-z0-9_-]+)\.plan: /.exec(plan.subject)?.[1] ?? ""

export function summary(input: SummaryInput): string {
  const { problems, trace } = input
  const out: string[] = []
  out.push(
    `gnam ${input.version} · plugins ${input.plugins.join(", ") || "없음"} · ${problems.length === 0 ? "문제 없음" : `문제 ${problems.length}`}`,
  )
  for (const p of problems) out.push(`- ${p.message}`)

  const next = input.handoff.content === null ? null : (fieldsOf(input.handoff.content).get("Next")?.[0] ?? "").trim()
  out.push(`${label("인계 메모")}${input.handoff.exists ? (next ? `있음 · Next: ${next}` : "있음") : "없음"}`)

  if (trace.requests.length > 0) {
    const open = trace.requests.filter((r) => r.status === "open").length
    const started = trace.requests.filter((r) => r.status === "started").length
    out.push(`${label("요청")}미착수 ${open} · 진행 ${started}`)
  }

  const order = new Map(lines(git(["rev-list", "HEAD"], input.cwd).out).map((sha, i) => [sha, i]))
  const plans = new Map<string, Plan>()
  for (const topic of Object.values(trace.topics)) for (const plan of topic.plans) plans.set(plan.sha, plan)
  const active = [...plans.values()]
    .filter((p) => p.status === "partial" || p.status === "not-started")
    .sort((a, b) => (order.get(a.sha) ?? 0) - (order.get(b.sha) ?? 0))
    .map((p) => `${topicOf(p)} ${short(p.sha)} ${p.steps.filter((s) => s.impls.length > 0).length}/${p.steps.length}`)
  if (active.length > 0) out.push(`${label("plan")}${capped(active).join(" · ")}`)

  trace.decisions.blocking.forEach((b, i) => {
    const text = (b.text.split("\n")[0] ?? "").replace(/^(B\d+)[.:]\s*/, "$1 ")
    out.push(`${i === 0 ? label("Blocking") : " ".repeat(LABEL_WIDTH)}${b.topic} ${short(b.plan)} ${text}`)
  })

  const open = trace.decisions.open.map((o) => `${o.path}:${o.line}`)
  if (open.length > 0) out.push(`${label("미결")}${capped(open).join(" · ")}`)

  out.push(...input.pluginLines)
  return `${out.join("\n")}\n`
}

/** plugin 요약 줄 정렬: '<plugin id>  <내용>' 을 같은 폭으로 */
export const pluginLine = (id: string, text: string) => `${label(id)}${text}`
