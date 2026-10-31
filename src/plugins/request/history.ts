/**
 * request 연결 조회 (specs/request.md 명령). HEAD 에서 도달 가능한 커밋을 한 번 읽는다.
 */
import { git, gitOrThrow } from "../../core/git.ts"
import { fieldsOf, REQUEST_SUBJECT, requestRefOf } from "./model.ts"

export interface Commit {
  sha: string
  subject: string
  body: string
}

/** 새 것부터 */
export function readCommits(cwd: string): Commit[] {
  if (!git(["rev-parse", "-q", "--verify", "HEAD"], cwd).ok) return []
  const fields = gitOrThrow(["log", "-z", "--format=%H%x00%s%x00%b", "HEAD"], cwd).split("\0")
  const commits: Commit[] = []
  for (let i = 0; i + 2 < fields.length; i += 3) {
    const [sha = "", subject = "", body = ""] = fields.slice(i, i + 3)
    commits.push({ sha: sha.trim(), subject, body })
  }
  return commits
}

export interface Graph {
  /** 새 것부터 */
  requests: Commit[]
  resolve: (hash: string) => Commit | null
  /** request sha → 그 요청을 Refines 로 가리킨 request */
  refinedBy: Map<string, Commit[]>
  /** request sha → 이 요청이 Refines 로 가리킨 request */
  refines: Map<string, Commit>
  /** request sha → Request 필드로 가리킨 커밋 (새 것부터) */
  by: Map<string, Commit[]>
}

export function graphOf(commits: Commit[]): Graph {
  const requests = commits.filter((c) => REQUEST_SUBJECT.test(c.subject))
  const resolve = (hash: string) => (hash.length < 7 ? null : (requests.find((r) => r.sha.startsWith(hash)) ?? null))
  const push = (map: Map<string, Commit[]>, key: string, value: Commit) => map.set(key, [...(map.get(key) ?? []), value])
  const refinedBy = new Map<string, Commit[]>()
  const refines = new Map<string, Commit>()
  const by = new Map<string, Commit[]>()
  for (const request of requests) {
    const target = resolve((fieldsOf(request.body).get("Refines")?.[0] ?? "").trim())
    if (target === null) continue
    refines.set(request.sha, target)
    push(refinedBy, target.sha, request)
  }
  for (const commit of commits) {
    const ref = requestRefOf(commit.body)
    if (ref === null || !("hashes" in ref)) continue
    for (const hash of ref.hashes) {
      const target = resolve(hash)
      if (target !== null) push(by, target.sha, commit)
    }
  }
  return { requests, resolve, refinedBy, refines, by }
}

export const short = (sha: string) => sha.slice(0, 7)
const summary = (c: Commit) => c.subject.replace(/^request: /, "")

/** 어느 커밋도 가리키지 않고 Refines 로 대체되지 않은 request */
export function openRequests(graph: Graph): Commit[] {
  return graph.requests.filter((r) => !graph.by.has(r.sha) && !graph.refinedBy.has(r.sha))
}

/** Refines 로 이어진 요청 전부 (오래된 것부터) */
export function chainOf(graph: Graph, start: Commit): Commit[] {
  const seen = new Set<string>([start.sha])
  const queue = [start]
  while (queue.length > 0) {
    const current = queue.shift() as Commit
    const next = [...(graph.refinedBy.get(current.sha) ?? [])]
    const back = graph.refines.get(current.sha)
    if (back !== undefined) next.push(back)
    for (const c of next)
      if (!seen.has(c.sha)) {
        seen.add(c.sha)
        queue.push(c)
      }
  }
  return graph.requests.filter((r) => seen.has(r.sha)).reverse()
}

export function openCommand(cwd: string): number {
  const open = openRequests(graphOf(readCommits(cwd)))
  if (open.length === 0) console.log("미착수 요청 없음")
  for (const r of open) console.log(`${short(r.sha)}  ${summary(r)}`)
  return 0
}

export function showCommand(args: string[], cwd: string): number {
  const hash = args[0]
  if (hash === undefined) {
    console.error("사용: gnam run request show <hash>")
    return 1
  }
  const commits = readCommits(cwd)
  const graph = graphOf(commits)
  const target = graph.resolve(hash)
  if (target === null) {
    console.error(`request 커밋 아님: ${hash}`)
    return 1
  }
  const chain = chainOf(graph, target)
  const order = new Map(commits.map((c, i) => [c.sha, i]))
  const pointing = chain
    .flatMap((r) => (graph.by.get(r.sha) ?? []).map((c) => ({ c, r })))
    .sort((x, y) => (order.get(y.c.sha) ?? 0) - (order.get(x.c.sha) ?? 0))
  const out = [`${short(target.sha)}  ${target.subject}`, "", "Refines 체인"]
  for (const r of chain) out.push(`${short(r.sha)}  ${summary(r)}${r.sha === target.sha ? "  ← 이 요청" : ""}`)
  out.push("", "가리키는 커밋")
  if (pointing.length === 0) out.push("(없음)")
  for (const { c, r } of pointing) out.push(`${short(c.sha)}  ${c.subject}${chain.length > 1 ? `  → ${short(r.sha)}` : ""}`)
  console.log(out.join("\n"))
  return 0
}
