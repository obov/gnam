/**
 * run 커밋: 에이전트 배정 · 실측 · 판정 기록 (.agents/skills/gnam-run/references/run.md). 빈 커밋, 에이전트마다 한 줄.
 *   run.<topic>.start · run.<topic>.end · run.<topic>.policy
 */
import { HASH, PLAN_SUBJECT, topicsOf } from "../../core/commit.ts"
import { type CommitContext, definePlugin } from "../../core/plugin.ts"
import type { Violation } from "../../core/violation.ts"
import { agentProblems, agentsOf, fieldOf, RUN_SUBJECT } from "./run-format.ts"
import { statsCli } from "./run-stats.ts"
import { usageCli } from "./run-usage.ts"

const OUTCOMES = ["done", "partial", "aborted"]

/** 이 hash 가 먼저 커밋된 커밋이고 제목이 pattern 에 맞으면 null, 아니면 문제 */
function refProblem(hash: string, pattern: RegExp, { subjectOf, isAncestor }: CommitContext): string | null {
  const refSubject = HASH.test(hash) ? subjectOf(hash) : null
  if (refSubject === null) return "커밋 없음"
  if (!isAncestor(hash)) return "조상 아님"
  return pattern.test(refSubject) ? null : `종류가 다름 (${refSubject})`
}

export function validateRun(ctx: CommitContext): Violation[] {
  const match = RUN_SUBJECT.exec(ctx.subject)
  const topic = match?.[1] ?? ""
  const kind = match?.[2] ?? ""
  const { body } = ctx
  const violations: Violation[] = []
  const add = (rule: string, why: string, current: string, fix: string) =>
    violations.push({ rule: `commit/${rule}`, why, current, fix })
  const hashes = (value: string | null) => (value === null || value === "없음" ? [] : value.split(/\s+/).filter(Boolean))
  const body_ = (name: string, fix: string) => {
    if (fieldOf(body, name) === null)
      add("run-body", "run 본문 필드가 조회 · 집계 기준이다 (.agents/skills/gnam-run/references/run.md).", `본문에 ${name}: 없음`, fix)
  }
  const ref = (name: string, hash: string, pattern: RegExp, fix: string) => {
    const problem = refProblem(hash, pattern, ctx)
    if (problem !== null)
      add(
        "run-ref",
        "run 커밋은 먼저 커밋된 plan · run · merge 를 가리킨다. 끊기면 배정과 결과를 잇지 못한다.",
        `${name}: ${hash} → ${problem}`,
        fix,
      )
  }

  if (ctx.merge) {
    add("merge-kind", "run 커밋은 기록 전용 빈 커밋이다. merge 로 만들지 않는다.", `run.${topic}.${kind}`, "main 에서 git commit --allow-empty 로 쓴다.")
  }
  if (ctx.files !== null && ctx.files.length > 0) {
    add(
      "run-empty",
      "run 커밋은 meta 정보만 담는다. 작업 기록은 plan · impl · merge 커밋이 한다.",
      ctx.files.join(", "),
      "stage 를 비우고 git commit --allow-empty 로 쓴다.",
    )
  }

  if (kind === "policy") {
    body_("Basis", "'Basis: <집계 명령과 범위>' 를 쓴다 (gnam run run stats table …).")
    body_("Policy", "'Policy:' 아래 조합별 기본 배정을 쓴다.")
    return violations
  }

  const agentRule = (problems: string[]) => {
    for (const problem of problems)
      add(
        "run-agents",
        "에이전트 한 줄 형식이어야 줄 단위 검색 · 집계가 된다 (.agents/skills/gnam-run/references/run.md).",
        problem,
        "Agent: <이름> key=value … 한 줄씩, 본문 마지막 문단에. 에이전트마다 'Why: <이름> <이유>'.",
      )
  }

  if (kind === "start") {
    const plan = fieldOf(body, "Plan")
    if (plan === null) body_("Plan", "'Plan: <plan hash> <단계>' 또는 plan 없는 실행이면 'Plan: 없음' 을 쓴다.")
    // plan 없는 실행 (multi-agent workflows/clone.md). 가리킬 plan 이 없어 참조 검사를 하지 않는다
    else if (plan.split(/\s+/)[0] !== "없음") {
      const hash = plan.split(/\s+/)[0] ?? ""
      const planTopic = PLAN_SUBJECT.exec(ctx.subjectOf(hash) ?? "")?.[1]
      const gathered = planTopic !== undefined && topicsOf(ctx.bodyOf(hash) ?? "")?.includes(topic) === true
      if (planTopic !== topic && !gathered)
        ref("Plan", hash, /^$/, `git log --oneline --grep '^spec\\.${topic}\\.plan:' 에서 hash 를 고른다.`)
    }
    const reference = fieldOf(body, "Reference")
    if (reference === null) body_("Reference", "참고한 run.*.end hash 를 쓰거나 'Reference: 없음'.")
    for (const hash of hashes(reference))
      ref("Reference", hash, /^run\.[A-Za-z0-9_-]+\.end: /, "git log --oneline -E --grep '^run\\..*\\.end:' 에서 고른다.")
    agentRule(agentProblems("start", body))
    return violations
  }

  const runHash = fieldOf(body, "Run")
  if (runHash === null) body_("Run", "'Run: <run.start hash>' 를 쓴다.")
  else ref("Run", runHash, new RegExp(`^run\\.${topic}\\.start: `), `git log --oneline --grep '^run\\.${topic}\\.start:' 에서 고른다.`)
  const outcome = fieldOf(body, "Outcome")
  if (outcome === null || !OUTCOMES.includes(outcome))
    add(
      "run-body",
      "Outcome 이 중단된 run 까지 집계에 남긴다 (생존자 편향 방지).",
      `Outcome: ${outcome ?? "(없음)"}`,
      `Outcome: ${OUTCOMES.join(" | ")}`,
    )
  const merges = fieldOf(body, "Merges")
  if (merges === null) body_("Merges", "'Merges: <merge hash> …' 또는 'Merges: 없음'.")
  for (const hash of hashes(merges))
    ref("Merges", hash, /^(spec\.[A-Za-z0-9_-]+\.merge|chore): /, "git log --merges --oneline 에서 고른다.")
  for (const hash of hashes(fieldOf(body, "Corrects")))
    ref("Corrects", hash, new RegExp(`^run\\.${topic}\\.end: `), "교정할 run.end hash 를 쓴다.")

  const problems = agentProblems("end", body)
  const started = runHash !== null && HASH.test(runHash) ? agentsOf(ctx.bodyOf(runHash) ?? "") : []
  const ended = new Set(agentsOf(body).map((agent) => agent.name))
  for (const { name } of started) if (name !== "" && !ended.has(name)) problems.push(`${name}: start 에 있는데 end 에 없음`)
  agentRule(problems)
  return violations
}

export default definePlugin({
  id: "run",
  version: "0.1.0",
  kinds: [{ label: "run.<topic>.<start|end|policy>: …", subject: RUN_SUBJECT, validate: validateRun }],
  commands: {
    usage: {
      describe: "[--root <projects>] <session-id> …  Claude Code transcript → run.end 측정 키",
      run: (args) => usageCli(args),
    },
    stats: {
      describe: "table | adopted | health | lines <merge> … | end <run.start>  run 커밋 조회 · 집계",
      run: (args, cwd) => statsCli(args, cwd),
    },
  },
  skills: ["skills/gnam-run"],
  agentsMd: "agents.md",
})
