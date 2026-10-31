import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import type { Repo } from "./helpers.ts"

export function write(repo: Repo, path: string, body: string) {
  mkdirSync(dirname(join(repo.root, path)), { recursive: true })
  writeFileSync(join(repo.root, path), body)
}

export function commit(repo: Repo, message: string, files: Record<string, string> = {}) {
  for (const [path, body] of Object.entries(files)) {
    write(repo, path, body)
    repo.git("add", path)
  }
  repo.git("commit", "-q", "--no-verify", "--allow-empty", "-m", message)
  return repo.git("rev-parse", "HEAD").out.trim()
}

const plan = (topic: string, title: string, steps: string[], extra: string[] = [], blocking = "Blocking: 없음") =>
  [
    `spec.${topic}.plan: ${title}`,
    "",
    "Goal:",
    "g",
    "",
    "Plan:",
    ...steps.flatMap((s, i) => [`${i + 1}. ${s}`, `   완료: ${s} 테스트`]),
    "",
    blocking,
    ...extra,
  ].join("\n")

/** request 3 · plan 4 (Supersedes 1 · 수집 1) · impl 3 · chore 2 · 미결 2 (하나는 미커밋) */
export function fixture(repo: Repo) {
  const s = (sha: string) => sha.slice(0, 7)
  const base = commit(repo, "chore: gnam 도입", { "gnam.json": JSON.stringify({ format: 1, plugins: [] }) })
  const r1 = commit(repo, "request: 첫 요청\n\nText:\n> a")
  const r2 = commit(repo, "request: 다른 요청\n\nText:\n> b")
  const r3 = commit(repo, `request: 첫 요청 보충\n\nText:\n> c\n\nRefines: ${s(r1)}`)
  const p1 = commit(
    repo,
    plan("a", "A 계획", ["파서", "출력"], ["", "Risks:", "R1. 느림", "", `Request: ${s(r3)}`]),
    { "specs/a.md": "# a\n\n- 미구현: 출력\n- 미결: 형식 선택\n" },
  )
  const i1 = commit(repo, `spec.a.impl: 파서\n\nPlan: ${s(p1)} 1\n\nDeviation:\n이름 변경\n\nRemaining:\n- 오류 메시지`)
  const p2 = commit(repo, plan("a", "옛 계획", ["x"], [], "Blocking:\nB1. 옛 결정"), { "specs/a.md": "# a\n\n- 미구현: 출력\n- 미결: 형식 선택\n\n옛\n" })
  const p3 = commit(repo, plan("a", "새 계획", ["y"], ["", `Supersedes: ${s(p2)}`]))
  const i3 = commit(repo, `spec.a.impl: y\n\nPlan: ${s(p3)} 1`)
  write(repo, "specs/b.md", "# b\n")
  repo.git("add", "specs/b.md")
  commit(repo, "spec.b.chore: b 추가\n\nGoal:\ng\n\nScope:\nspecs/b.md")
  const p4 = commit(repo, plan("a", "수집", ["모으기"], ["", "Topics: a, b"], "Blocking:\nB1. 새 결정\nB2. 둘째"))
  const c1 = commit(repo, "chore: 규칙 개선\n\nRequest: 없음 (반복 chore 3회)\n\nDeferred:\n- 성능 측정")
  write(repo, "specs/a.md", "# a\n\n- 미구현: 출력\n- 미결: 형식 선택\n\n옛\n- 미결: 새 질문\n")
  return { base, r1, r2, r3, p1, i1, p2, p3, i3, p4, c1 }
}

