/**
 * 위임 상태 트리 (runs/) 를 사용자용 트리로 출력한다. 형식은 workflows/delegate.md.
 *
 *   gnam run multi-agent status            run 전부
 *   gnam run multi-agent status <run-id>   run 하나
 *
 * runs/ = <git common dir>/gnam/runs. 커밋되지 않고, worktree 안에서 실행해도 같은 트리를 읽는다.
 * MULTI_AGENT_RUNS 가 있으면 그 경로를 쓴다 (검증용).
 *
 * atcher status 가 성공하면 미완료 노드마다 세션 이름 (노드 경로를 - 로 이은 것) 으로 대조해 런타임 상태를 붙인다.
 * atcher status 의 범위 = 이 명령을 실행한 세션의 하위 트리. root 에서 실행해야 전체가 대조된다.
 * atcher 가 없거나 실패하거나 3초 안에 끝나지 않으면 대조 없이 출력한다.
 * agent · pane · tab 중 하나라도 기록된 노드 (herdr adapter) 는 대조하지 않는다.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { spawnSync } from "node:child_process"
import { git } from "../../core/git.ts"

/** 갱신이 이보다 오래된 미완료 노드는 멈춤 의심으로 표시한다 */
const STALE_MS = 30 * 60_000
const ACTIVE = new Set(["진행", "판단 필요", "막힘"])
/** atcher status 대기 상한. 넘기면 대조 없이 출력 */
const ATCHER_TIMEOUT_MS = 3000

type Node = { id: string; fields: Map<string, string[]>; children: Node[] }
/** atcher status 의 agents 항목 중 대조에 쓰는 부분 */
type Agent = { name: string; status: string }
/** exitCode null = 시간 초과 등 signal 종료 */
type Spawned = { exitCode: number | null; stdout: string }

export function runsDir(cwd = process.cwd()) {
  const configured = process.env["MULTI_AGENT_RUNS"] ?? ""
  if (configured !== "") return configured
  const out = git(["rev-parse", "--path-format=absolute", "--git-common-dir"], cwd)
  if (!out.ok) throw new Error("git repo 밖")
  return join(out.out.trim(), "gnam", "runs")
}

/** node 파일: 한 줄에 "키  값". 같은 키 여러 줄 허용 (question) */
function parse(text: string) {
  const fields = new Map<string, string[]>()
  for (const line of text.split("\n")) {
    const m = line.match(/^(\S+)\s+(.*\S)\s*$/)
    if (m?.[1] === undefined || m[1] === "" || m[2] === undefined || m[2] === "") continue
    fields.set(m[1], [...(fields.get(m[1]) ?? []), m[2]])
  }
  return fields
}

function load(dir: string, id: string): Node {
  const file = join(dir, "node")
  const fields = existsSync(file) ? parse(readFileSync(file, "utf8")) : new Map([["status", ["node 파일 없음"]]])
  const children = readdirSync(dir)
    .filter((name) => statSync(join(dir, name)).isDirectory())
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((name) => load(join(dir, name), name))
  return { id, fields, children }
}

const get = (n: Node, key: string) => n.fields.get(key)?.[0] ?? ""

function stale(n: Node, now: number) {
  const updated = Date.parse(get(n, "updated"))
  if (!ACTIVE.has(get(n, "status")) || Number.isNaN(updated)) return ""
  const minutes = Math.round((now - updated) / 60_000)
  return now - updated > STALE_MS ? `  (갱신 ${minutes}분 전)` : ""
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null

/** atcher status 결과 → 에이전트 목록. 실패 · 형식 오류 = undefined (대조 생략) */
export function agentsFrom(result: Spawned | undefined): Agent[] | undefined {
  if (result === undefined || result.exitCode !== 0) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(result.stdout)
  } catch {
    return undefined
  }
  if (!isRecord(parsed) || !Array.isArray(parsed["agents"])) return undefined
  const agents: Agent[] = []
  for (const a of parsed["agents"]) {
    if (!isRecord(a) || typeof a["name"] !== "string" || typeof a["status"] !== "string") return undefined
    agents.push({ name: a["name"], status: a["status"] })
  }
  return agents
}

export function atcherStatus(): Spawned | undefined {
  try {
    const out = spawnSync("atcher", ["status"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: ATCHER_TIMEOUT_MS })
    if (out.error !== undefined || out.signal !== null) return undefined
    return { exitCode: out.status, stdout: out.stdout }
  } catch {
    return undefined
  }
}

/** herdr adapter 만 node 에 적는 자리 정보. 하나라도 있으면 atcher 대조 대상 아님 */
const HERDR_FIELDS = ["agent", "pane", "tab"]

/** 미완료 · atcher adapter 노드의 런타임 상태. root 와 herdr adapter 노드는 대조하지 않는다 */
function session(n: Node, path: string[], agents: Agent[] | undefined) {
  if (agents === undefined || path.length === 0 || get(n, "status") === "완료") return ""
  if (HERDR_FIELDS.some((key) => n.fields.has(key))) return ""
  const found = agents.find((a) => a.name === path.join("-"))
  return found === undefined ? "  (세션 없음)" : `  (세션 ${found.status})`
}

function active(n: Node): number {
  return n.children.reduce((sum, c) => sum + active(c), ACTIVE.has(get(n, "status")) ? 1 : 0)
}

type View = { now: number; agents: Agent[] | undefined; lines: string[] }

function render(n: Node, path: string[], prefix: string, branch: string, view: View) {
  const { now, agents, lines } = view
  const cols = [n.id, get(n, "role"), get(n, "status"), get(n, "task")].filter(Boolean)
  lines.push(`${prefix}${branch}${cols.join("  ")}${stale(n, now)}${session(n, path, agents)}`)
  const inner = prefix + (branch === "└─ " ? "   " : branch === "├─ " ? "│  " : "")
  for (const q of n.fields.get("question") ?? []) lines.push(`${inner}${n.children.length > 0 ? "│  " : "   "}? ${q}`)
  n.children.forEach((c, i) => {
    render(c, [...path, c.id], inner, i === n.children.length - 1 ? "└─ " : "├─ ", view)
  })
}

export function show(dir: string, only?: string, now = Date.now(), agents?: Agent[]) {
  if (!existsSync(dir)) return "run 없음"
  const ids = readdirSync(dir)
    .filter((id) => statSync(join(dir, id)).isDirectory() && (only === undefined || only === "" || id === only))
    .sort()
  if (ids.length === 0) return only !== undefined && only !== "" ? `run 없음: ${only}` : "run 없음"
  return ids
    .map((id) => {
      const root = load(join(dir, id), "root")
      const budget = get(root, "budget")
      const used = active(root) - (ACTIVE.has(get(root, "status")) ? 1 : 0)
      const lines = [`run ${id}${budget !== "" ? `  예산 ${budget} (사용 ${used})` : ""}`]
      render(root, [], "", "", { now, agents, lines })
      return lines.join("\n")
    })
    .join("\n\n")
}

