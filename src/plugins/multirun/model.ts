/**
 * multirun 커밋 형식 (specs/multirun.md '커밋 종류'). commit-msg 검사 · collect · status 가 같이 쓴다.
 *
 *   multirun.<topic>.start    main. Plan · Id · Base + 변형 Agent 줄
 *   multirun.<topic>.variant  clone 의 변형 브랜치 끝. Id · Approach · Plugins · Checks · Decisions · Deviation · Remaining
 *   multirun.<topic>.report   main. Start · Outcome · Variants · Comparison · Combinable · Recommendation · Decision + Agent 줄
 *   결정 커밋                  Multirun: <report hash> <vN | combine | discard>
 *
 * Agent 줄 문법은 run 커밋과 같다 (run-format.ts agentsOf). 키 집합만 다르다.
 */
import { HASH, PLAN_SUBJECT, readyOf, topicsOf } from "../../core/commit.ts"
import type { CommitContext } from "../../core/plugin.ts"
import type { Violation } from "../../core/violation.ts"
import { agentsOf, fieldOf, NA } from "../run/run-format.ts"

export const MULTIRUN_SUBJECT = /^multirun\.([A-Za-z0-9_-]+)\.(start|variant|report): \S/
export const RUN_ID = /^([0-9a-f]{7})-([1-9]\d*)$/
export const VARIANT = /^v([1-9]\d*)$/
export const OUTCOMES = ["done", "partial", "aborted"]
export const CHOICES = ["combine", "discard"]
const VARIANT_FIELDS = ["Approach", "Plugins", "Checks", "Decisions", "Deviation", "Remaining"]
const REPORT_FIELDS = ["Comparison", "Combinable", "Recommendation"]

const ALIASES = ["opus", "sonnet", "haiku", "fable", "mythos", "default"]
const EFFORTS = ["none", "minimal", "low", "medium", "high", "xhigh", "max", NA]
type Check = (value: string) => boolean
const oneOf =
  (...values: string[]): Check =>
  (value) =>
    values.includes(value)
const count: Check = (value) => value === NA || /^\d+$/.test(value)
const text: Check = (value) => value !== ""

/** 허용 키. 선언 순서 = 줄 안 키 순서 */
const KEYS: Record<string, Check> = {
  role: oneOf("variant", "summarizer"),
  model: (value) => value !== "" && !ALIASES.includes(value),
  effort: oneOf(...EFFORTS),
  agent: oneOf("claude", "codex"),
  session: text,
  workflow: text,
  wall_min: count,
  active_min: count,
  out: count,
  input: count,
  cache_write: count,
  cache_read: count,
  requests: count,
  api_errors: count,
  sub_sessions: count,
  sub_active_min: count,
  sub_out: count,
  lines: count,
  checks: oneOf("pass", "fail", NA),
}
export const KEY_ORDER = Object.keys(KEYS)
const START_KEYS = ["role", "model", "effort", "agent", "session"]
const REQUIRED = {
  variant: ["role", "model", "effort", "agent", "session", "wall_min", "active_min", "out", "lines", "checks"],
  summarizer: ["role", "model", "effort", "agent", "session", "active_min", "out"],
}

/** '<name>:' 아래 줄 (다음 빈 줄 · 다음 필드 전까지). 같은 줄의 값도 첫 줄로 포함. 없으면 null */
export function blockOf(body: string, name: string): string[] | null {
  const lines = body.split("\n")
  const at = lines.findIndex((line) => line.startsWith(`${name}:`))
  if (at < 0) return null
  const out: string[] = []
  const first = (lines[at] ?? "").slice(name.length + 1).trim()
  if (first !== "") out.push(first)
  for (const line of lines.slice(at + 1)) {
    if (line.trim() === "" || /^[A-Z][A-Za-z-]*:/.test(line)) break
    out.push(line.trim())
  }
  return out
}

export interface VariantRef {
  name: string
  tip: string
  tag: string
}

/** report Variants: 'vN <tip hash> <tag>' 줄 */
export function variantsOf(body: string): VariantRef[] {
  return (blockOf(body, "Variants") ?? []).map((line) => {
    const [name = "", tip = "", tag = ""] = line.split(/\s+/)
    return { name, tip, tag }
  })
}

/** Agent 줄 형식 문제. 빈 배열이면 통과 */
export function agentLineProblems(kind: "start" | "report", body: string): string[] {
  const problems: string[] = []
  const agents = agentsOf(body)
  if (agents.length === 0) return ["Agent: 줄 없음"]
  const last = (body.trim().split(/\n[ \t]*\n/).at(-1) ?? "").split("\n")
  if (!last.every((line) => line.startsWith("Agent:")) || last.length !== agents.length)
    problems.push("Agent: 줄은 본문 마지막 문단에 모으고 그 문단에는 Agent: 줄만 둔다")
  const names = new Set<string>()
  for (const { name, fields } of agents) {
    if (name === "") {
      problems.push(`형식 오류: ${fields["raw"]}`)
      continue
    }
    if (names.has(name)) problems.push(`${name}: 이름 중복`)
    names.add(name)
    const role = fields["role"]
    if (kind === "start" && role !== "variant") problems.push(`${name}: start 의 role 은 variant`)
    if (role === "variant" && !VARIANT.test(name)) problems.push(`${name}: 변형 이름은 v1 … vN`)
    const required = kind === "start" ? START_KEYS : role === "summarizer" ? REQUIRED.summarizer : REQUIRED.variant
    for (const key of required) if (!(key in fields)) problems.push(`${name}: ${key}= 없음`)
    for (const [key, value] of Object.entries(fields)) {
      const check = KEYS[key]
      if (check === undefined || (kind === "start" && !START_KEYS.includes(key))) problems.push(`${name}: 모르는 키 ${key}`)
      else if (!check(value)) problems.push(`${name}: ${key}=${value} 허용 안 됨`)
    }
    const known = Object.keys(fields).filter((key) => key in KEYS)
    const ordered = KEY_ORDER.filter((key) => known.includes(key))
    if (known.join(" ") !== ordered.join(" ")) problems.push(`${name}: 키 순서 ${ordered.join(" ")}`)
  }
  const variants = agents.filter((a) => a.fields["role"] === "variant").map((a) => a.name)
  const expected = variants.map((_, i) => `v${i + 1}`)
  if ([...variants].sort(byNumber).join(" ") !== expected.join(" ")) problems.push(`변형 이름이 v1 … v${variants.length} 연속이 아님`)
  if (variants.length < 2) problems.push("변형 2개 이상")
  if (kind === "report" && agents.filter((a) => a.fields["role"] === "summarizer").length !== 1)
    problems.push("summarizer 줄 하나 (role=summarizer)")
  return problems
}

export const byNumber = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true })

export function validateMultirun(ctx: CommitContext): Violation[] {
  const match = MULTIRUN_SUBJECT.exec(ctx.subject)
  const topic = match?.[1] ?? ""
  const kind = match?.[2] ?? ""
  const { body } = ctx
  const violations: Violation[] = []
  const add = (rule: string, why: string, current: string, fix: string) => violations.push({ rule: `commit/${rule}`, why, current, fix })
  const need = (name: string, fix: string) => {
    if (fieldOf(body, name) === null)
      add("multirun-body", "multirun 본문 필드가 비교 · 보존 · 결정 추적 기준이다 (specs/multirun.md).", `본문에 ${name}: 없음`, fix)
  }
  const agentRule = (problems: string[]) => {
    for (const problem of problems)
      add("multirun-agents", "변형 · 요약 세션마다 Agent 한 줄이어야 줄 단위 검색 · 집계가 된다.", problem, "Agent: <vN|summarizer> key=value … (specs/multirun.md 키 순서)")
  }
  const ref = (name: string, hash: string, pattern: RegExp, fix: string) => {
    const subject = HASH.test(hash) ? ctx.subjectOf(hash) : null
    const problem = subject === null ? "커밋 없음" : !ctx.isAncestor(hash) ? "조상 아님" : pattern.test(subject) ? null : `종류가 다름 (${subject})`
    if (problem !== null)
      add("multirun-ref", "multirun 커밋은 먼저 커밋된 plan · start 를 가리킨다.", `${name}: ${hash} → ${problem}`, fix)
  }

  if (ctx.merge)
    add("merge-kind", "multirun 커밋은 기록 전용 빈 커밋이다. merge 로 만들지 않는다.", `multirun.${topic}.${kind}`, "git commit --allow-empty 로 쓴다.")
  if (ctx.files !== null && ctx.files.length > 0)
    add("multirun-empty", "multirun 커밋은 기록만 담는다. 작업은 impl 커밋이 한다.", ctx.files.join(", "), "stage 를 비우고 git commit --allow-empty 로 쓴다.")

  const id = fieldOf(body, "Id")
  if (kind !== "report") {
    if (id === null) need("Id", "'Id: <plan 7자>-<k>' (gnam run multirun start 출력).")
    else if (!RUN_ID.test(id)) add("multirun-body", "run-id 가 보존 tag 이름 (multirun/<run-id>/…) 이다.", `Id: ${id}`, "Id: <plan 7자>-<k>")
  }

  if (kind === "start") {
    const plan = fieldOf(body, "Plan")?.split(/\s+/)[0]
    if (plan === undefined) need("Plan", "'Plan: <plan hash>'.")
    else {
      const planTopic = PLAN_SUBJECT.exec(ctx.subjectOf(plan) ?? "")?.[1]
      const gathered = planTopic !== undefined && topicsOf(ctx.bodyOf(plan) ?? "")?.includes(topic) === true
      ref("Plan", plan, planTopic === topic || gathered ? PLAN_SUBJECT : /^$/, `git log --oneline --grep '^spec\\.${topic}\\.plan:' 에서 고른다.`)
      if (planTopic !== undefined && readyOf(ctx.bodyOf(plan) ?? "") !== true)
        add("multirun-ref", "multirun 은 착수 가능한 plan 만 실행한다 (commits/plan.md 착수 가능 조건).", `Plan: ${plan} → Blocking 남음`, "Blocking 을 푼 새 plan (Supersedes) 을 쓴다.")
      if (id !== null && RUN_ID.test(id) && !plan.startsWith(RUN_ID.exec(id)?.[1] ?? "-"))
        add("multirun-body", "run-id 는 plan hash 7자로 시작한다.", `Id: ${id} · Plan: ${plan}`, "gnam run multirun start 가 만든 Id 를 쓴다.")
    }
    const base = fieldOf(body, "Base")
    if (base === null) need("Base", "'Base: <clone 시작 commit>'.")
    else if (!HASH.test(base)) add("multirun-body", "Base 는 clone 시작 commit hash.", `Base: ${base}`, "Base: <hash>")
    agentRule(agentLineProblems("start", body))
    return violations
  }

  if (kind === "variant") {
    for (const name of VARIANT_FIELDS) need(name, `'${name}: …' (없으면 '없음').`)
    return violations
  }

  // report
  const start = fieldOf(body, "Start")?.split(/\s+/)[0]
  if (start === undefined) need("Start", "'Start: <multirun.start hash>'.")
  else ref("Start", start, new RegExp(`^multirun\\.${topic}\\.start: `), `git log --oneline --grep '^multirun\\.${topic}\\.start:' 에서 고른다.`)
  const outcome = fieldOf(body, "Outcome")
  if (outcome === null || !OUTCOMES.includes(outcome))
    add("multirun-body", "Outcome 이 중단된 multirun 까지 남긴다.", `Outcome: ${outcome ?? "(없음)"}`, `Outcome: ${OUTCOMES.join(" | ")}`)
  for (const name of REPORT_FIELDS) need(name, `'${name}:' (specs/multirun.md report).`)
  const decision = fieldOf(body, "Decision")
  if (decision !== "대기") add("multirun-body", "결정은 사용자 몫. report 는 추천만 남긴다.", `Decision: ${decision ?? "(없음)"}`, "Decision: 대기")
  const variants = variantsOf(body)
  if (variants.length === 0) need("Variants", "'Variants:' 아래 'vN <tip hash> <tag>' 줄.")
  for (const v of variants)
    if (!VARIANT.test(v.name) || !HASH.test(v.tip) || !v.tag.startsWith("multirun/"))
      add("multirun-body", "Variants 줄이 보존 tag 와 tip 을 잇는다.", `Variants: ${v.name} ${v.tip} ${v.tag}`, "vN <tip hash> multirun/<run-id>/vN/heads/<branch>")
  const problems = agentLineProblems("report", body)
  const started = start !== undefined && HASH.test(start) ? agentsOf(ctx.bodyOf(start) ?? "").map((a) => a.name) : []
  const listed = new Set(agentsOf(body).map((a) => a.name))
  const varNames = new Set(variants.map((v) => v.name))
  for (const name of started) {
    if (name !== "" && !listed.has(name)) problems.push(`${name}: start 에 있는데 report 에 없음`)
    if (name !== "" && variants.length > 0 && !varNames.has(name)) problems.push(`${name}: Variants 에 없음`)
  }
  agentRule(problems)
  return violations
}

/** 결정 커밋 'Multirun: <report hash> <선택>' 검사. 필드가 없으면 빈 배열 */
export function decisionProblems(ctx: CommitContext): Violation[] {
  const value = fieldOf(ctx.body, "Multirun")
  if (value === null) return []
  const [hash = "", choice = ""] = value.split(/\s+/)
  const topic = /^spec\.([A-Za-z0-9_-]+)\./.exec(ctx.subject)?.[1]
  const pattern = new RegExp(`^multirun\\.${topic ?? "[A-Za-z0-9_-]+"}\\.report: `)
  const subject = HASH.test(hash) ? ctx.subjectOf(hash) : null
  const problem =
    subject === null ? "커밋 없음" : !ctx.isAncestor(hash) ? "조상 아님" : !pattern.test(subject) ? `종류가 다름 (${subject})` : null
  const violation = (current: string, fix: string): Violation => ({
    rule: "commit/multirun-decision",
    why: "결정 커밋이 어느 report 의 어느 변형을 골랐는지 잇는다 (specs/multirun.md 결정 커밋).",
    current,
    fix,
  })
  if (problem !== null) return [violation(`Multirun: ${hash} → ${problem}`, `git log --oneline --grep '^multirun\\.${topic ?? "<topic>"}\\.report:' 에서 고른다.`)]
  const names = variantsOf(ctx.bodyOf(hash) ?? "").map((v) => v.name)
  if (![...names, ...CHOICES].includes(choice))
    return [violation(`Multirun: ${hash} ${choice || "(선택 없음)"}`, `선택: ${[...names, ...CHOICES].join(" | ")}`)]
  return []
}
