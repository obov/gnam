import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import type { Violation } from "../../core/violation.ts"

type Row = Record<string, unknown>
const row = (value: unknown): Row =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Row) : {}
const text = (value: unknown): value is string => typeof value === "string" && value.trim() !== ""
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(text)
const TERMINAL = ["done", "partial", "aborted"]
const KINDS = [
  "assigned",
  "dispatched",
  "submitted",
  "verified",
  "accepted",
  "rejected",
  "blocked",
  "changed",
  "intervened",
  "stopped",
]
export const EXPERIMENT_FILE = /^experiments\/agent-workflows\/([a-z0-9][a-z0-9-]*)\/record\.json$/

/** 구조·참조 검사. 사실성/권한/실제 시간 제한은 실행자와 하네스가 검증한다. */
export function experimentProblems(value: unknown): string[] {
  const r = row(value)
  const problems: string[] = []
  const need = (ok: boolean, message: string) => {
    if (!ok) problems.push(message)
  }
  const required = (item: Row, fields: string[], prefix: string) => {
    for (const key of fields) need(text(item[key]), `${prefix}.${key}: 비어 있음`)
  }
  const list = (key: string, nonempty = false): Row[] => {
    need(Array.isArray(r[key]), `${key}: 배열 필요`)
    const items = Array.isArray(r[key]) ? r[key].map(row) : []
    need(!nonempty || items.length > 0, `${key}: 최소 1개 필요`)
    return items
  }
  const indexed = (items: Row[], label: string) => {
    const map = new Map<string, Row>()
    for (const item of items) {
      need(text(item["id"]), `${label}.id: 필요`)
      if (!text(item["id"])) continue
      need(!map.has(item["id"]), `${label}: 중복 ID ${item["id"]}`)
      map.set(item["id"], item)
    }
    return map
  }
  const refs = (value: unknown, map: Map<string, Row>, label: string) => {
    need(strings(value), `${label}: ID 배열 필요`)
    if (strings(value)) for (const id of value) need(map.has(id), `${label}: 참조 없음 ${id}`)
  }
  need(r["schema_version"] === 1 && r["mode"] === "ept", "schema_version=1 / mode=ept 필요")
  required(r, ["id", "request", "question", "hypothesis", "baseline"], "record")
  need(["proposed", "ready", "running", ...TERMINAL].includes(String(r["status"])), "status: 잘못된 상태")
  need(
    r["status"] === "proposed" ? r["approval"] === null : text(r["approval"]),
    "approval: 제안은 null, 실행은 확정 근거 필요",
  )
  for (const key of ["variables", "controls", "metrics"])
    need(strings(r[key]) && r[key].length > 0, `${key}: 비어 있지 않은 문자열 배열 필요`)
  const limits = row(r["limits"])
  for (const key of ["max_concurrency", "max_attempts", "max_wall_min"])
    need(Number.isInteger(limits[key]) && Number(limits[key]) > 0, `limits.${key}: 양의 정수 필요`)
  required(limits, ["stop"], "limits")
  const arms = list("arms", true),
    tasks = list("tasks", true),
    agents = list("agents", true),
    evidence = list("evidence"),
    events = list("events"),
    results = list("results")
  const armMap = indexed(arms, "arms"),
    taskMap = indexed(tasks, "tasks"),
    agentMap = indexed(agents, "agents"),
    evidenceMap = indexed(evidence, "evidence")
  need(armMap.has(String(r["baseline"])), "baseline: arm 없음")
  for (const arm of arms) {
    required(arm, ["structure", "review", "session_policy", "order", "isolation", "exposure"], `arm ${arm["id"]}`)
    need(
      tasks.some((t) => t["arm"] === arm["id"]),
      `arm ${arm["id"]}: task 없음`,
    )
    need(
      agents.some((a) => a["arm"] === arm["id"] && a["role"] === "root"),
      `arm ${arm["id"]}: root 기록 필요`,
    )
  }
  const sameArm = (item: Row, other: Row | undefined, label: string) =>
    need(other !== undefined && other["arm"] === item["arm"], `${label}: 같은 arm 참조 필요`)
  for (const task of tasks) {
    need(armMap.has(String(task["arm"])), `task ${task["id"]}: arm 없음`)
    required(task, ["scope", "completion"], `task ${task["id"]}`)
    refs(task["inputs"], evidenceMap, "task.inputs")
    refs(task["depends_on"], taskMap, "task.depends_on")
    if (strings(task["depends_on"]))
      for (const id of task["depends_on"]) sameArm(task, taskMap.get(id), "task.depends_on")
  }
  for (const agent of agents) {
    need(armMap.has(String(agent["arm"])), `agent ${agent["id"]}: arm 없음`)
    required(agent, ["role", "authority"], `agent ${agent["id"]}`)
    for (const key of ["session", "model", "effort"])
      need(agent[key] === null || text(agent[key]), `agent.${key}: 문자열 또는 null 필요`)
    for (const key of ["parent", "report_to"])
      if (agent[key] !== null) sameArm(agent, agentMap.get(String(agent[key])), `agent.${key}`)
  }
  // 의존/부모 순환은 실행 구조를 복원할 수 없게 한다.
  const cycles = (map: Map<string, Row>, key: string) => {
    const visit = (id: string, path: Set<string>): boolean => {
      if (path.has(id)) return true
      const item = map.get(id)
      if (item === undefined) return false
      const next = item[key]
      const ids = strings(next) ? next : text(next) ? [next] : []
      return ids.some((child) => visit(child, new Set([...path, id])))
    }
    for (const id of map.keys()) need(!visit(id, new Set()), `${key}: 순환 ${id}`)
  }
  cycles(taskMap, "depends_on")
  cycles(agentMap, "parent")
  for (const e of evidence) {
    need(
      text(e["path"]) &&
        !e["path"].startsWith("/") &&
        !e["path"].includes("\\") &&
        !e["path"].split("/").includes(".."),
      "evidence.path: repo 상대 경로 필요",
    )
    need(typeof e["sha256"] === "string" && /^[a-f0-9]{64}$/.test(e["sha256"]), "evidence.sha256: 64자리 필요")
  }
  const seen = new Map<string, Row>()
  const attempts = new Map<string, Row>()
  for (const e of events) {
    required(e, ["id", "at", "arm", "agent", "kind", "note"], "event")
    need(!seen.has(String(e["id"])), `event: 중복 ID ${e["id"]}`)
    need(
      typeof e["at"] === "string" &&
        /^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(e["at"]) &&
        Number.isFinite(Date.parse(e["at"])),
      "event.at: ISO 날짜 필요",
    )
    need(KINDS.includes(String(e["kind"])), "event.kind: 잘못된 종류")
    need(armMap.has(String(e["arm"])), "event.arm: 없음")
    sameArm(e, agentMap.get(String(e["agent"])), "event.agent")
    if (e["task"] !== null) sameArm(e, taskMap.get(String(e["task"])), "event.task")
    need(e["attempt"] === null || text(e["attempt"]), "event.attempt: 문자열 또는 null 필요")
    if (text(e["attempt"])) {
      const prior = attempts.get(e["attempt"])
      if (e["kind"] === "assigned") {
        need(text(e["task"]) && prior === undefined, "assigned: 새 attempt와 task 필요")
        attempts.set(e["attempt"], e)
      } else
        need(
          prior !== undefined && prior["arm"] === e["arm"] && prior["task"] === e["task"],
          "attempt: 앞선 assigned와 같은 arm/task 필요",
        )
    } else if (["assigned", "dispatched"].includes(String(e["kind"]))) need(false, "배정/전달: attempt 필요")
    refs(e["refs"], seen, "event.refs")
    refs(e["evidence"], evidenceMap, "event.evidence")
    if (["submitted", "verified", "accepted"].includes(String(e["kind"]))) {
      need(
        text(e["task"]) && text(e["attempt"]) && strings(e["evidence"]) && e["evidence"].length > 0,
        "완료 경로: task/attempt/evidence 필요",
      )
    }
    if (e["kind"] === "accepted")
      for (const kind of ["submitted", "verified"]) {
        need(
          strings(e["refs"]) &&
            e["refs"].some((id) => {
              const prior = seen.get(id)
              return (
                prior?.["kind"] === kind &&
                prior["arm"] === e["arm"] &&
                prior["task"] === e["task"] &&
                prior["attempt"] === e["attempt"]
              )
            }),
          `accepted: 같은 시도의 ${kind} 참조 필요`,
        )
      }
    seen.set(String(e["id"]), e)
  }
  need(attempts.size <= Number(limits["max_attempts"]), "limits.max_attempts: 시도 상한 초과")
  const finished = TERMINAL.includes(String(r["status"]))
  const resultArms = new Set<string>()
  for (const result of results) {
    const arm = String(result["arm"])
    need(armMap.has(arm) && !resultArms.has(arm), `result.arm: 없음 또는 중복 ${arm}`)
    resultArms.add(arm)
    need([...TERMINAL, "not_started"].includes(String(result["outcome"])), "result.outcome: 잘못된 상태")
    required(result, ["limitations"], "result")
    refs(result["evidence"], evidenceMap, "result.evidence")
    const measures = row(result["measures"])
    for (const key of [
      "wall_ms",
      "agent_active_ms",
      "root_active_ms",
      "input_tokens",
      "output_tokens",
      "handoff_failures",
      "rework_count",
    ])
      need(Object.hasOwn(measures, key), `result.measures.${key}: 미측정도 null로 기록`)
    for (const [key, n] of Object.entries(measures))
      need(
        n === null || (typeof n === "number" && Number.isFinite(n) && n >= 0),
        `measure ${key}: 0 이상 수 또는 null 필요`,
      )
    if (result["outcome"] === "done")
      for (const task of tasks.filter((t) => t["arm"] === arm))
        need(
          events.some((e) => e["task"] === task["id"] && e["kind"] === "accepted"),
          `result done: task ${task["id"]} 완료 증거 없음`,
        )
    if (r["status"] === "done") need(result["outcome"] === "done", "status done: 모든 arm done 필요")
  }
  if (finished) {
    for (const id of armMap.keys()) need(resultArms.has(id), `results: 미실행 arm도 기록 ${id}`)
    const conclusion = row(r["conclusion"])
    need(["keep", "change", "inconclusive"].includes(String(conclusion["decision"])), "conclusion.decision: 필요")
    required(conclusion, ["reason", "applicability", "confounds"], "conclusion")
  }
  return problems
}

export function experimentViolations(cwd: string, files: string[]): Violation[] {
  const violations: Violation[] = []
  for (const file of files.filter((f) => EXPERIMENT_FILE.test(f))) {
    const problems: string[] = []
    try {
      const record: unknown = JSON.parse(readFileSync(join(cwd, file), "utf8"))
      problems.push(...experimentProblems(record))
      if (row(record)["id"] !== EXPERIMENT_FILE.exec(file)?.[1]) problems.push("id와 실험 폴더명 불일치")
      const evidence = row(record)["evidence"]
      if (Array.isArray(evidence))
        for (const item of evidence) {
          const e = row(item)
          if (!text(e["path"]) || !e["path"].startsWith(`${dirname(file)}/`) || e["path"].split("/").includes("..")) {
            problems.push("증거는 같은 실험 폴더에 보관")
            continue
          }
          const hash = createHash("sha256")
            .update(readFileSync(join(cwd, e["path"])))
            .digest("hex")
          if (hash !== e["sha256"]) problems.push(`증거 해시 불일치 ${e["path"]}`)
        }
    } catch (error) {
      problems.push(String(error))
    }
    if (problems.length > 0)
      violations.push({
        rule: "experiment/record",
        why: "구조·시도·완료·측정 누락이 있으면 실험을 다시 검증할 수 없다.",
        current: `${file}: ${problems.join(" · ")}`,
        fix: ".agents/skills/gnam-ept/references/experiments.md 형식과 실제 증거를 맞춘다.",
      })
  }
  return violations
}
