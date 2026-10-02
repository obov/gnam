/**
 * 커밋 메시지 검사. 코어 종류 = chore · refactor · spec.<topic>.<plan|impl|chore>.
 * 나머지 종류 (spec.<topic>.merge · run.* · release) 는 plugin 이 등록한다 (plugin.ts CommitKind).
 * 규약 원본: skills/gnam/references/commits/
 */
import type { CommitContext, GnamPlugin } from "./plugin.ts"
import type { Violation } from "./violation.ts"

const CORE_SUBJECT = /^(?:chore|refactor|spec\.([A-Za-z0-9_-]+)\.(plan|impl|chore)): \S/
const CORE_LABELS = ["chore: …", "refactor: …", "spec.<topic>.<plan|impl|chore>: …"]
const PLAN_REF = /^Plan: ([0-9a-f]{7,40})\b/
const REFACTOR_SUBJECT = /^refactor: /
export const PLAN_SUBJECT = /^spec\.([A-Za-z0-9_-]+)\.plan: /
export const HASH = /^[0-9a-f]{7,40}$/

/** 'Topics: a, b' 한 줄. 필드가 없으면 null */
export function topicsOf(body: string): string[] | null {
  const match = /^Topics:[ \t]*(.*)$/m.exec(body)
  if (match === null) return null
  return (match[1] ?? "")
    .split(",")
    .map((topic) => topic.trim())
    .filter((topic) => topic !== "")
}

/** 'Blocking: 없음' 이면 true. 필드가 없으면 null (Blocking 도입 전 plan) */
export function readyOf(body: string): boolean | null {
  const match = /^Blocking:[ \t]*(.*)$/m.exec(body)
  if (match === null) return null
  return (match[1] ?? "").trim() === "없음"
}

/** 들여쓴 '<name>: <값>' 줄의 첫 값 전부 */
const refsOf = (body: string, name: string) =>
  [...body.matchAll(new RegExp(`^[ \\t]*${name}:[ \\t]*(\\S*)`, "gm"))].map((m) => m[1] ?? "")

/** Plan: 절의 번호 단계. 단계 = 번호 줄부터 다음 번호 줄 · 다음 필드 전까지 */
function planSteps(body: string): string[] {
  const all = body.split("\n")
  const start = all.findIndex((line) => /^Plan:/.test(line))
  if (start < 0) return []
  const steps: string[][] = []
  for (const line of all.slice(start + 1)) {
    if (/^[A-Z][A-Za-z ]*:/.test(line)) break
    if (/^\d+\.\s/.test(line)) steps.push([line])
    else steps.at(-1)?.push(line)
  }
  return steps.map((step) => step.join("\n"))
}

export type Lookup = Omit<CommitContext, "message" | "subject" | "body" | "plugins" | "cwd" | "view" | "config"> &
  Partial<Pick<CommitContext, "cwd" | "view" | "config">>

/** 커밋 하나 검사. plugins = 활성 plugin (loader.ts) */
export function validateCommit(input: Lookup & { message: string }, plugins: GnamPlugin[] = []): Violation[] {
  const [subject = "", ...rest] = input.message.split("\n")
  const ctx: CommitContext = {
    ...input,
    cwd: input.cwd ?? process.cwd(),
    view: input.view ?? { kind: "index" },
    config: input.config ?? { format: 1, plugins: [] },
    subject,
    body: rest.join("\n").trim(),
    plugins: plugins.map((p) => p.id),
  }
  const violations: Violation[] = []
  for (const line of ctx.message.split("\n")) {
    if (/^co-authored-by:/i.test(line.trim())) {
      violations.push({
        rule: "commit/no-co-author",
        why: "공동 작성자 줄 금지. 하네스가 붙이는 trailer 도 포함한다.",
        current: line.trim(),
        fix: "해당 줄을 지운다. Claude Code 는 .claude/settings.json attribution.commit 이 빈 문자열인지 확인한다.",
      })
    }
  }

  let owner = "core"
  const kind = plugins.flatMap((p) => (p.kinds ?? []).map((k) => ({ plugin: p, kind: k }))).find(({ kind }) =>
    kind.subject.test(subject),
  )
  if (kind !== undefined) {
    owner = kind.plugin.id
    violations.push(...kind.kind.validate(ctx))
  } else {
    const core = validateCore(ctx, plugins)
    if (core === null) return [...violations, subjectViolation(subject, plugins)]
    violations.push(...core)
  }
  for (const plugin of plugins) violations.push(...(plugin.everyCommit?.(ctx, owner) ?? []))
  return violations
}

function subjectViolation(subject: string, plugins: GnamPlugin[]): Violation {
  const labels = [...CORE_LABELS, ...plugins.flatMap((p) => (p.kinds ?? []).map((k) => k.label))]
  return {
    rule: "commit/subject",
    why: "커밋 제목 접두가 history 검색 키다 (git log --grep '^spec\\.<topic>\\.<kind>:'). squash · fixup 커밋도 금지.",
    current: subject || "(빈 제목)",
    fix: `제목을 ${labels.map((l) => `'${l}'`).join(" · ")} 중 하나로 쓴다. <topic> = specs/ 파일 이름.`,
  }
}

/** 코어 종류 검사. 제목이 코어 종류가 아니면 null */
function validateCore(ctx: CommitContext, plugins: GnamPlugin[]): Violation[] | null {
  const { subject, body, files, merge, subjectOf, bodyOf, specExists, isAncestor } = ctx
  const match = CORE_SUBJECT.exec(subject)
  if (match === null) return null
  const violations: Violation[] = []
  const add = (rule: string, why: string, current: string, fix: string) =>
    violations.push({ rule: `commit/${rule}`, why, current, fix })
  const fields = (name: string) => new RegExp(`^${name}:`, "m").test(body)
  const [, topic, kind] = match

  if (REFACTOR_SUBJECT.test(subject)) {
    if (merge) {
      add(
        "merge-kind",
        "merge 커밋은 브랜치 통합이다. refactor 규칙 (specs/ 금지 · Invariant) 을 merge 로 우회하지 않는다.",
        subject,
        "브랜치의 refactor 커밋을 그대로 두고 merge 제목을 'chore: …' 로 쓴다.",
      )
      return violations
    }
    const specFiles = (files ?? []).filter((file) => file.startsWith("specs/"))
    if (specFiles.length > 0) {
      add(
        "refactor-files",
        "refactor 는 동작을 유지하고 구조만 바꾼다. spec 을 바꾸면 합의된 동작이 바뀐 것이다.",
        specFiles.join(", "),
        "spec 변경을 spec.<topic>.plan · spec.<topic>.chore 커밋으로 나누거나, 동작이 바뀌면 chore · impl 로 쓴다.",
      )
    }
    for (const name of ["Goal", "Scope", "Invariant"]) {
      if (!fields(name)) {
        add(
          "refactor-body",
          "refactor 본문은 Goal · Scope · Invariant 를 적는다. Invariant 가 유지한 동작과 그 보증 (테스트 · 검사) 이다.",
          `본문에 ${name}: 없음`,
          name === "Invariant"
            ? "본문에 'Invariant:' 아래 유지하는 동작과 그것을 보증하는 테스트 · 검사를 쓴다."
            : `본문에 ${name}: 필드를 추가한다.`,
        )
      }
    }
    return violations
  }

  if (merge && kind !== undefined) {
    const mergeKind = plugins.some((p) => p.id === "merge")
    add(
      "merge-kind",
      "merge 커밋은 브랜치 통합이다. plan · impl · spec chore 규칙 (파일 · Plan:) 을 merge 로 우회하지 않는다.",
      subject,
      mergeKind
        ? `제목을 'spec.${topic}.merge: …' 로 쓰거나, 변경을 일반 커밋으로 만든 뒤 merge 한다.`
        : "merge 제목을 'chore: …' 로 쓰거나, 변경을 일반 커밋으로 만든 뒤 merge 한다.",
    )
  }

  if (kind === "plan") {
    const specFile = `specs/${topic}.md`
    if (files !== null && (files.length > 1 || (files.length === 1 && files[0] !== specFile))) {
      add(
        "plan-files",
        "plan 커밋은 spec 파일 하나만 바꾼다 (없으면 --allow-empty). 구현은 impl 커밋으로 나눈다.",
        files.join(", "),
        `${specFile} 만 stage 하거나 빈 커밋으로 계획만 남긴다.`,
      )
    }
    for (const name of ["Goal", "Plan", "Blocking"]) {
      if (!fields(name)) {
        add(
          "plan-body",
          "plan 본문이 구현 계획 기록이다 (Goal · Plan · Scope · Blocking · Decisions expected · Risks · Open). Blocking 이 착수 가능 여부를 정한다.",
          `본문에 ${name}: 없음`,
          name === "Blocking"
            ? "사람이 먼저 정할 결정이 없으면 'Blocking: 없음', 있으면 'Blocking:' 아래 B1. … 을 쓴다."
            : `본문에 ${name}: 필드를 추가한다.`,
        )
      }
    }

    for (const hash of refsOf(body, "Supersedes")) {
      const refSubject = HASH.test(hash) ? subjectOf(hash) : null
      const problem =
        topicsOf(body) !== null
          ? "수집 plan 에는 Supersedes 를 쓰지 않음"
          : refSubject === null
            ? "커밋 없음"
            : !isAncestor(hash)
              ? "조상 아님"
              : PLAN_SUBJECT.exec(refSubject)?.[1] !== topic
                ? `같은 topic plan 아님 (${refSubject})`
                : null
      if (problem !== null) {
        add(
          "supersedes-ref",
          "Supersedes: 는 이 plan 이 대체하는 먼저 커밋된 같은 topic plan 이다. 수집 plan 은 From: 으로 다시 모은다.",
          `Supersedes: ${hash || "(빈 값)"} → ${problem}`,
          `git log --oneline --grep '^spec\\.${topic}\\.plan:' 에서 hash 를 고른다. 수집 plan 이면 Supersedes 대신 From: <이전 수집 hash> <단계>.`,
        )
      }
    }

    const topics = topicsOf(body)
    const froms = refsOf(body, "From")
    const specs = refsOf(body, "Spec")
    if (topics === null && (froms.length > 0 || specs.length > 0)) {
      add(
        "gather-topics",
        "From: · Spec: 이 있으면 수집 plan 이다. Topics: 가 수집 plan 판별 기준이자 impl 이 따를 수 있는 topic 목록이다.",
        "본문에 Topics: 없음",
        `본문에 'Topics: ${topic}, <다른 topic>' 한 줄을 추가한다.`,
      )
    }
    if (topics !== null) {
      if (files !== null && files.length > 0) {
        add(
          "gather-files",
          "수집 plan 은 흩어진 항목을 모으기만 한다. spec 변경은 그 topic 의 plan 을 먼저 커밋하고 Spec: 으로 가리킨다.",
          files.join(", "),
          "stage 를 비우고 --allow-empty 로 커밋한다.",
        )
      }
      if (!topics.includes(topic ?? "")) {
        add(
          "gather-topics",
          "Topics: 는 대표 topic (제목의 spec.<topic>.plan) 을 포함한다.",
          `Topics: ${topics.join(", ")}`,
          `Topics: 에 ${topic} 을 추가한다.`,
        )
      }
      for (const name of topics.filter((t) => !specExists(t))) {
        add(
          "gather-topics",
          "Topics: 의 각 topic 은 specs/<topic>.md 파일 이름이다.",
          `specs/${name}.md 없음`,
          "쉼표로 구분한 specs/ 파일 이름 (확장자 제외) 을 쓴다.",
        )
      }
      planSteps(body).forEach((step, index) => {
        if (!/^[ \t]+From:/m.test(step)) {
          add(
            "gather-from",
            "수집 plan 은 모으기만 한다. 단계마다 출처가 있어야 원래 항목을 역추적할 수 있다. 새 작업은 일반 plan 으로 나눈다.",
            `단계 ${index + 1} 에 From: 없음`,
            "단계 아래에 'From: <hash> <단계|Remaining|Deferred>' 를 쓰거나, 그 단계를 일반 plan 으로 옮긴다.",
          )
        }
      })
    }
    for (const [name, hash] of [
      ...froms.map((hash) => ["From", hash] as const),
      ...specs.map((hash) => ["Spec", hash] as const),
    ]) {
      const refSubject = HASH.test(hash) ? subjectOf(hash) : null
      if (refSubject === null || !isAncestor(hash)) {
        add(
          "from-ref",
          "From: · Spec: 은 이 plan 보다 먼저 커밋된 출처를 가리킨다. 오타 · 순서 역전이면 출처가 끊긴다.",
          `${name}: ${hash || "(빈 값)"} → ${refSubject === null ? "커밋 없음" : "조상 아님"}`,
          name === "Spec" ? "그 topic 의 plan 을 먼저 커밋하고 hash 를 쓴다." : "git log 에서 출처 커밋 hash 를 고른다.",
        )
        continue
      }
      const specTopic = PLAN_SUBJECT.exec(refSubject)?.[1]
      if (name === "Spec" && (specTopic === undefined || topics?.includes(specTopic) !== true)) {
        add(
          "from-ref",
          "Spec: 은 Topics: 안 topic 의 plan 커밋을 가리킨다.",
          `Spec: ${hash} → ${refSubject}`,
          "git log --oneline --grep '^spec\\.<topic>\\.plan:' 에서 hash 를 고른다.",
        )
      }
    }
  }

  if (kind === "impl") {
    const first = body.split("\n")[0] ?? ""
    const ref = PLAN_REF.exec(first)
    if (ref === null) {
      add(
        "impl-plan",
        "impl 본문 첫 필드가 따르는 plan 을 고정한다.",
        first || "(빈 본문)",
        "본문 첫 줄을 'Plan: <plan 커밋 hash> <단계>' 로 쓴다.",
      )
    } else {
      const hash = ref[1] ?? ""
      const planSubject = subjectOf(hash)
      const planTopic = planSubject === null ? undefined : PLAN_SUBJECT.exec(planSubject)?.[1]
      const gathered = planTopic !== undefined && topicsOf(bodyOf(hash) ?? "")?.includes(topic ?? "") === true
      if (planTopic !== undefined && readyOf(bodyOf(hash) ?? "") === false) {
        add(
          "impl-ready",
          "Blocking 이 남은 plan 은 설계 plan 이다 (착수 가능 조건 1). 사람이 확정한 뒤 새 plan (Supersedes) 을 따른다.",
          `${hash} → Blocking 미해소`,
          "확정 내용을 반영한 새 plan 커밋 ('Blocking: 없음' · 'Supersedes: <이전 plan>') 을 먼저 쓰고 그 hash 를 가리킨다.",
        )
      }
      if (planTopic !== topic && !gathered) {
        add(
          "impl-plan",
          "Plan: 이 가리키는 커밋이 같은 topic 의 plan 이거나, Topics: 에 이 topic 을 포함한 수집 plan 이어야 한다.",
          `${hash} → ${planSubject ?? "(커밋 없음)"}`,
          `git log --oneline --grep '^spec\\.${topic}\\.plan:' 또는 git log -E --grep '^Topics:(.*[ ,])?${topic}([ ,]|$)' 에서 hash 를 고른다.`,
        )
      }
    }
  }

  if (kind === "chore") {
    for (const name of ["Goal", "Scope"]) {
      if (!fields(name)) {
        add("chore-body", "spec chore 본문은 Goal · Scope 를 적는다.", `본문에 ${name}: 없음`, `본문에 ${name}: 필드를 추가한다.`)
      }
    }
  }
  return violations
}
