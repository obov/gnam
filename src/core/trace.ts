/**
 * gnam status trace: 기록의 연결 (요청 → plan → impl → spec). specs/info.md 'trace'.
 * 검사 경계 이후 HEAD 에서 도달 가능한 커밋을 git log 한 번으로 읽고, 본문 필드 · 커밋 간 연결 · 상태만 계산한다.
 * 원문 · diff 는 git 이 맡는다 (커밋은 sha 로 가리킨다).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fieldsOf, fieldText, itemsOf, requestRefOf } from "./fields.ts"
import { git, gitOrThrow, lines } from "./git.ts"
import { boundaryOf, historyArgs } from "./history.ts"

export class TraceError extends Error {}

interface Commit {
  sha: string
  subject: string
  body: string
  fields: Map<string, string[]>
}

export interface Step {
  n: number
  title: string
  done: string | null
  impls: string[]
}

export interface Impl {
  sha: string
  subject: string
  step: string
  deviation: string | null
  decisions: string | null
  remaining: string | null
  deferred: string | null
}

export interface Plan {
  sha: string
  subject: string
  requests: string[]
  supersedes: string | null
  supersededBy: string | null
  dropped: string[]
  blocking: string[]
  decisionsExpected: string[]
  risks: string[]
  open: string[]
  steps: Step[]
  status: "superseded" | "done" | "partial" | "not-started"
  impls: Impl[]
}

export interface Marker {
  line: number
  text: string
}

export interface Topic {
  path: string
  exists: boolean
  unimplemented: Marker[]
  open: Marker[]
  plans: Plan[]
  chores: { sha: string; subject: string; requests: string[] }[]
}

export interface Request {
  sha: string
  subject: string
  refines: string | null
  refinedBy: string[]
  by: string[]
  status: "open" | "started" | "refined"
}

export interface Item {
  kind: "remaining" | "deferred" | "open" | "risk" | "blocking"
  text: string
  sha: string
}

export interface Trace {
  head: string | null
  since: string | null
  boundary: { sha: string; subject: string } | null
  requests: Request[]
  topics: Record<string, Topic>
  agent: { sha: string; subject: string; reason: string }[]
  items: Item[]
  decisions: {
    blocking: { topic: string; plan: string; id: string | null; text: string }[]
    open: { path: string; line: number; text: string; introducedBy: string | null }[]
  }
}

const PLAN = /^spec\.([A-Za-z0-9_-]+)\.plan: /
const IMPL = /^spec\.([A-Za-z0-9_-]+)\.impl: /
const SPEC_CHORE = /^spec\.([A-Za-z0-9_-]+)\.chore: /
const CHORE = /^(?:chore|refactor): /
const REQUEST = /^request: /
const MARKER = (name: string) => new RegExp(`^\\s*(?:[-*]\\s+)?${name}:\\s*(.*)$`)

/** 오래된 것부터 */
function readCommits(cwd: string, boundary: string | null): Commit[] {
  if (!git(["rev-parse", "-q", "--verify", "HEAD"], cwd).ok) return []
  const out = gitOrThrow(["log", "-z", "--format=%H%x00%s%x00%b", ...historyArgs("HEAD", boundary)], cwd).split("\0")
  const commits: Commit[] = []
  for (let i = 0; i + 2 < out.length; i += 3) {
    const [sha = "", subject = "", body = ""] = out.slice(i, i + 3)
    commits.push({ sha: sha.trim(), subject, body, fields: fieldsOf(body) })
  }
  return commits.reverse()
}

/** '1' · '1-2' · '2, 4' → 단계 번호 */
export function stepNumbers(text: string): number[] {
  const numbers: number[] = []
  for (const part of text.split(/[,\s]+/)) {
    const range = /^(\d+)-(\d+)$/.exec(part)
    if (range !== null) for (let n = Number(range[1]); n <= Number(range[2]); n++) numbers.push(n)
    else if (/^\d+$/.test(part)) numbers.push(Number(part))
  }
  return numbers
}

/** Plan: 절의 번호 단계. 완료: 줄부터 단계 끝까지가 done */
export function stepsOf(lines: string[] | undefined): Omit<Step, "impls">[] {
  const steps: { n: number; title: string; rest: string[] }[] = []
  for (const line of lines ?? []) {
    const m = /^(\d+)\.\s+(.*)$/.exec(line)
    if (m !== null) steps.push({ n: Number(m[1]), title: (m[2] ?? "").trim(), rest: [] })
    else steps.at(-1)?.rest.push(line)
  }
  return steps.map(({ n, title, rest }) => {
    const at = rest.findIndex((l) => /^\s*완료:/.test(l))
    const done = at < 0 ? null : rest.slice(at).map((l) => l.trim()).join("\n").replace(/^완료:\s*/, "").trim()
    return { n, title, done: done === "" ? null : done }
  })
}

function markers(text: string, name: string): Marker[] {
  const re = MARKER(name)
  const out: Marker[] = []
  text.split("\n").forEach((line, i) => {
    const m = re.exec(line)
    if (m !== null) out.push({ line: i + 1, text: (m[1] ?? "").trim() })
  })
  return out
}

/** 줄 번호 → 그 줄을 넣은 커밋 (미커밋 = null) */
function blame(cwd: string, path: string): Map<number, string | null> {
  const result = git(["blame", "--porcelain", "--", path], cwd)
  const map = new Map<number, string | null>()
  if (!result.ok) return map
  for (const line of result.out.split("\n")) {
    const m = /^([0-9a-f]{40}) \d+ (\d+)/.exec(line)
    if (m !== null) map.set(Number(m[2]), /^0+$/.test(m[1] ?? "") ? null : (m[1] ?? null))
  }
  return map
}

function blockingOf(fields: Map<string, string[]>): string[] {
  const value = fields.get("Blocking")
  if (value === undefined) return []
  if (value.join("\n").trim() === "없음") return []
  return itemsOf(value)
}

function rangeOf(cwd: string, since: string): { sha: string; shas: Set<string> } {
  const resolved = git(["rev-parse", "-q", "--verify", `${since}^{commit}`], cwd)
  if (!resolved.ok) throw new TraceError(`--since: 커밋 없음: ${since}`)
  const sha = resolved.out.trim()
  if (!git(["merge-base", "--is-ancestor", sha, "HEAD"], cwd).ok)
    throw new TraceError(`--since: ${since} 가 HEAD 의 조상 아님 (history 재작성). --since 없이 다시 읽는다`)
  return { sha, shas: new Set(lines(gitOrThrow(["rev-list", `${sha}..HEAD`], cwd))) }
}

export function collectTrace(cwd: string, since?: string): Trace {
  const head = git(["rev-parse", "-q", "--verify", "HEAD"], cwd).ok ? gitOrThrow(["rev-parse", "HEAD"], cwd).trim() : null
  const range = since === undefined || since === "" ? null : rangeOf(cwd, since)
  const boundarySha = head === null ? null : boundaryOf(cwd, "HEAD")
  const commits = readCommits(cwd, boundarySha)
  const resolve = (hash: string, pool: Commit[] = commits) =>
    hash.length >= 7 ? (pool.find((c) => c.sha.startsWith(hash))?.sha ?? hash) : hash

  // 요청
  const requestCommits = commits.filter((c) => REQUEST.test(c.subject))
  const resolveRequest = (hash: string) => resolve(hash, requestCommits)
  const requests: Request[] = requestCommits.map((c) => {
    const refines = (c.fields.get("Refines")?.[0] ?? "").trim()
    return { sha: c.sha, subject: c.subject, refines: refines === "" ? null : resolveRequest(refines), refinedBy: [], by: [], status: "open" }
  })
  const requestBySha = new Map(requests.map((r) => [r.sha, r]))
  for (const r of requests) if (r.refines !== null) requestBySha.get(r.refines)?.refinedBy.push(r.sha)
  const agent: Trace["agent"] = []
  const requestsOf = (c: Commit): string[] => {
    const ref = requestRefOf(c.body)
    if (ref === null) return []
    if ("agent" in ref) return []
    return ref.hashes.map(resolveRequest)
  }
  for (const c of commits) {
    const ref = requestRefOf(c.body)
    if (ref === null) continue
    if ("agent" in ref) agent.push({ sha: c.sha, subject: c.subject, reason: ref.agent })
    else for (const sha of ref.hashes.map(resolveRequest)) requestBySha.get(sha)?.by.push(c.sha)
  }
  for (const r of requests) r.status = r.refinedBy.length > 0 ? "refined" : r.by.length > 0 ? "started" : "open"

  // plan · impl · chore
  const planCommits = commits.filter((c) => PLAN.test(c.subject))
  const plans = new Map<string, Plan & { topics: string[] }>()
  for (const c of planCommits) {
    const topic = PLAN.exec(c.subject)?.[1] ?? ""
    const topicsField = fieldText(c.fields, "Topics")
    const topics = topicsField === null ? [topic] : [...new Set([topic, ...topicsField.split(",").map((t) => t.trim()).filter(Boolean)])]
    const supersedes = (c.fields.get("Supersedes")?.[0] ?? "").trim()
    plans.set(c.sha, {
      sha: c.sha,
      subject: c.subject,
      requests: requestsOf(c),
      supersedes: supersedes === "" ? null : resolve(supersedes, planCommits),
      supersededBy: null,
      dropped: itemsOf(c.fields.get("Dropped")),
      blocking: blockingOf(c.fields),
      decisionsExpected: itemsOf(c.fields.get("Decisions expected")),
      risks: itemsOf(c.fields.get("Risks")),
      open: itemsOf(c.fields.get("Open")),
      steps: stepsOf(c.fields.get("Plan")).map((s) => ({ ...s, impls: [] })),
      status: "not-started",
      impls: [],
      topics,
    })
  }
  for (const plan of plans.values()) if (plan.supersedes !== null) {
    const target = plans.get(plan.supersedes)
    if (target !== undefined) target.supersededBy = plan.sha
  }
  const items: Item[] = []
  const chores = new Map<string, Topic["chores"]>()
  const touched = new Set<string>()
  for (const c of commits) {
    const impl = IMPL.exec(c.subject)
    if (impl !== null) {
      const ref = /^Plan:\s*([0-9a-f]{7,40})\s*(.*)$/.exec(c.body.split("\n")[0] ?? "")
      const plan = ref === null ? undefined : plans.get(resolve(ref[1] ?? "", planCommits))
      const step = (ref?.[2] ?? "").trim()
      const record: Impl = {
        sha: c.sha,
        subject: c.subject,
        step,
        deviation: fieldText(c.fields, "Deviation"),
        decisions: fieldText(c.fields, "Decisions"),
        remaining: fieldText(c.fields, "Remaining"),
        deferred: fieldText(c.fields, "Deferred"),
      }
      if (plan !== undefined) {
        plan.impls.push(record)
        for (const n of stepNumbers(step)) plan.steps.find((s) => s.n === n)?.impls.push(c.sha)
        if (range?.shas.has(c.sha) === true) touched.add(plan.sha)
      }
      for (const text of itemsOf(c.fields.get("Remaining"))) items.push({ kind: "remaining", text, sha: c.sha })
      for (const text of itemsOf(c.fields.get("Deferred"))) items.push({ kind: "deferred", text, sha: c.sha })
      continue
    }
    const plan = plans.get(c.sha)
    if (plan !== undefined) {
      for (const text of plan.risks) items.push({ kind: "risk", text, sha: c.sha })
      for (const text of plan.open) items.push({ kind: "open", text, sha: c.sha })
      for (const text of plan.blocking) items.push({ kind: "blocking", text, sha: c.sha })
      continue
    }
    const specChore = SPEC_CHORE.exec(c.subject)
    const topic = specChore !== null ? (specChore[1] ?? "") : CHORE.test(c.subject) ? "" : null
    if (topic === null) continue
    chores.set(topic, [...(chores.get(topic) ?? []), { sha: c.sha, subject: c.subject, requests: requestsOf(c) }])
    for (const text of itemsOf(c.fields.get("Remaining"))) items.push({ kind: "remaining", text, sha: c.sha })
    for (const text of itemsOf(c.fields.get("Deferred"))) items.push({ kind: "deferred", text, sha: c.sha })
  }
  for (const plan of plans.values()) {
    const withImpl = plan.steps.filter((s) => s.impls.length > 0).length
    plan.status =
      plan.supersededBy !== null
        ? "superseded"
        : plan.steps.length > 0 && withImpl === plan.steps.length
          ? "done"
          : plan.impls.length > 0
            ? "partial"
            : "not-started"
  }

  // spec 파일 · 결정
  const specDir = join(cwd, "specs")
  const specTopics = existsSync(specDir)
    ? readdirSync(specDir)
        .filter((f) => f.endsWith(".md") && f !== "README.md")
        .map((f) => f.slice(0, -3))
    : []
  const inRange = (sha: string) => range === null || range.shas.has(sha)
  const planKept = (p: Plan) => inRange(p.sha) || touched.has(p.sha)
  const topicNames = [...new Set([...specTopics.sort(), ...[...plans.values()].flatMap((p) => p.topics), ...chores.keys()])]
  const topics: Record<string, Topic> = {}
  const decisionsOpen: Trace["decisions"]["open"] = []
  for (const name of topicNames) {
    const path = `specs/${name}.md`
    const exists = name !== "" && existsSync(join(cwd, path))
    const text = exists ? readFileSync(join(cwd, path), "utf8") : ""
    const open = markers(text, "미결")
    if (open.length > 0) {
      const lineOwner = blame(cwd, path)
      for (const m of open) {
        const introducedBy = lineOwner.get(m.line) ?? null
        if (introducedBy === null || inRange(introducedBy)) decisionsOpen.push({ path, line: m.line, text: m.text, introducedBy })
      }
    }
    const topicPlans = [...plans.values()].filter((p) => p.topics.includes(name) && planKept(p)).map(({ topics: _, ...p }) => p)
    const topicChores = (chores.get(name) ?? []).filter((c) => inRange(c.sha))
    if (range !== null && topicPlans.length === 0 && topicChores.length === 0) continue
    topics[name] = { path, exists, unimplemented: markers(text, "미구현"), open, plans: topicPlans, chores: topicChores }
  }
  const decisionsBlocking = [...plans.values()]
    .filter((p) => p.supersededBy === null && p.blocking.length > 0 && inRange(p.sha))
    .flatMap((p) =>
      p.blocking.map((text) => ({
        topic: PLAN.exec(p.subject)?.[1] ?? "",
        plan: p.sha,
        id: /^(B\d+)[.:]/.exec(text)?.[1] ?? null,
        text,
      })),
    )
  const boundaryCommit = boundarySha === null ? null : { sha: boundarySha, subject: gitOrThrow(["log", "-1", "--format=%s", boundarySha], cwd).trim() }
  return {
    head,
    since: range?.sha ?? null,
    boundary: boundaryCommit,
    requests: requests.filter((r) => inRange(r.sha)),
    topics,
    agent: agent.filter((a) => inRange(a.sha)),
    items: items.filter((i) => inRange(i.sha)),
    decisions: { blocking: decisionsBlocking, open: decisionsOpen },
  }
}
