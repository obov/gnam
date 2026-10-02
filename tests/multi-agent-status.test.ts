import { afterEach, beforeEach, test } from "node:test"
import { expect } from "./expect.ts"
import { spawnSync } from "node:child_process"
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { agentsFrom, show } from "../src/plugins/multi-agent/status.ts"

const GNAM = new URL("../bin/gnam.js", import.meta.url).pathname
const NOW = Date.parse("2026-09-24T15:00Z")
let dir = ""

function node(path: string, body: string) {
  mkdirSync(join(dir, path), { recursive: true })
  writeFileSync(join(dir, path, "node"), body)
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "multi-agent-runs-"))
  node("0924-1402", "role  root\nbudget  6\nstatus  진행\ntask  Tour 구현 위임\n")
  node("0924-1402/d1", "role  delegator\nstatus  진행\ntask  Step 3/5\nupdated  2026-09-24T14:50Z\n")
  node("0924-1402/d1/d1.1", "role  delegator\nstatus  판단 필요\ntask  Tour UI\nquestion  Q1 위치\n")
  node("0924-1402/d1/d1.1/r1", "role  runner\nstatus  완료\n")
  node("0924-1402/d1/r2", "role  runner\nstatus  진행\ntask  Step 3 구현\n")
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

const BASE = [
  "run 0924-1402  예산 6 (사용 3)",
  "root  root  진행  Tour 구현 위임",
  "└─ d1  delegator  진행  Step 3/5",
  "   ├─ d1.1  delegator  판단 필요  Tour UI",
  "   │  │  ? Q1 위치",
  "   │  └─ r1  runner  완료",
  "   └─ r2  runner  진행  Step 3 구현",
].join("\n")

test("atcher 결과 없음: 기존 출력 그대로", () => {
  expect(show(dir, undefined, NOW)).toBe(BASE)
  expect(show(dir, undefined, NOW, undefined)).toBe(BASE)
})

test("대조: 미완료 노드마다 세션 이름 (경로를 - 로 이은 것) 으로 런타임 상태, 없으면 세션 없음", () => {
  const agents = [
    { name: "d1", status: "working" },
    { name: "d1-r2", status: "blocked" },
    { name: "d1-d1.1-r1", status: "idle" },
  ]
  expect(show(dir, undefined, NOW, agents)).toBe(
    [
      "run 0924-1402  예산 6 (사용 3)",
      "root  root  진행  Tour 구현 위임",
      "└─ d1  delegator  진행  Step 3/5  (세션 working)",
      "   ├─ d1.1  delegator  판단 필요  Tour UI  (세션 없음)",
      "   │  │  ? Q1 위치",
      "   │  └─ r1  runner  완료",
      "   └─ r2  runner  진행  Step 3 구현  (세션 blocked)",
    ].join("\n"),
  )
})

test("대조: herdr adapter 노드 (pane 기록) 는 atcher 대상이 아니라 생략", () => {
  node("0924-1402/d1/r2", "role  runner\nagent  d1-r2\npane  w1:p7\nstatus  진행\ntask  Step 3 구현\n")
  expect(show(dir, undefined, NOW, [])).toContain("└─ r2  runner  진행  Step 3 구현\n".trimEnd())
  expect(show(dir, undefined, NOW, [])).not.toContain("Step 3 구현  (세션")
})

test("대조: agent · pane · tab 중 하나라도 있으면 herdr adapter 노드로 보고 생략", () => {
  for (const extra of ["agent  d1-r2", "pane  w1:p7", "tab  w1:t3"]) {
    node("0924-1402/d1/r2", `role  runner\n${extra}\nstatus  진행\ntask  Step 3 구현\n`)
    expect(show(dir, undefined, NOW, [])).toContain("└─ r2  runner  진행  Step 3 구현\n".trimEnd())
    expect(show(dir, undefined, NOW, [])).not.toContain("Step 3 구현  (세션")
  }
})

test("대조: 멈춤 의심 표시와 함께", () => {
  node("0924-1402/d1/r2", "role  runner\nstatus  진행\ntask  Step 3 구현\nupdated  2026-09-24T12:00Z\n")
  expect(show(dir, undefined, NOW, [])).toContain("└─ r2  runner  진행  Step 3 구현  (갱신 180분 전)  (세션 없음)")
})

test("agentsFrom: atcher status 성공이면 name · status 목록", () => {
  const stdout = JSON.stringify({
    runtime: "herdr",
    agents: [{ name: "d1", ref: "w1:p3", status: "working", ready: false, owned: true }],
  })
  expect(agentsFrom({ exitCode: 0, stdout })).toEqual([{ name: "d1", status: "working" }])
})

test("agentsFrom: 실패 · 형식 오류 = undefined (대조 생략)", () => {
  expect(agentsFrom(undefined)).toBeUndefined()
  expect(agentsFrom({ exitCode: 1, stdout: '{"error":"unavailable","message":"x"}' })).toBeUndefined()
  expect(agentsFrom({ exitCode: 1, stdout: '{"agents":[]}' })).toBeUndefined()
  expect(agentsFrom({ exitCode: 0, stdout: "not json" })).toBeUndefined()
  expect(agentsFrom({ exitCode: 0, stdout: '{"error":"unavailable"}' })).toBeUndefined()
  expect(agentsFrom({ exitCode: 0, stdout: '{"agents":[{"name":1}]}' })).toBeUndefined()
})

test("agentsFrom: 시간 초과 (exitCode null) = undefined", () => {
  expect(agentsFrom({ exitCode: null, stdout: '{"agents":[]}' })).toBeUndefined()
})

/** PATH 의 가짜 atcher 로 status.ts 실행. 실행부의 atcher 호출 연결 확인. 실행부는 현재 시각이라 updated 제거 */
function run(atcher: string) {
  node("0924-1402/d1", "role  delegator\nstatus  진행\ntask  Step 3/5\n")
  const bin = join(dir, "bin")
  mkdirSync(bin)
  writeFileSync(join(bin, "atcher"), `#!/bin/sh\n${atcher}\n`)
  chmodSync(join(bin, "atcher"), 0o755)
  const started = Date.now()
  writeFileSync(join(dir, "gnam.json"), JSON.stringify({ format: 1, plugins: ["@gnam/merge", "@gnam/run", "@gnam/multi-agent"] }))
  const out = spawnSync(process.execPath, [GNAM, "run", "multi-agent", "status", "0924-1402"], {
    cwd: dir,
    env: { MULTI_AGENT_RUNS: dir, PATH: `${bin}:/usr/bin:/bin` },
    encoding: "utf8",
  })
  return { exitCode: out.status, stdout: out.stdout, ms: Date.now() - started }
}

test("실행: atcher status 성공 → 세션 대조 표시", () => {
  const out = run(`echo '{"runtime":"fake","agents":[{"name":"d1-r2","status":"idle"}]}'`)
  expect(out.exitCode).toBe(0)
  expect(out.stdout).toContain("└─ r2  runner  진행  Step 3 구현  (세션 idle)")
  expect(out.stdout).toContain("└─ d1  delegator  진행  Step 3/5  (세션 없음)")
})

test("실행: atcher status 실패 → 기존 출력", () => {
  const out = run(`echo '{"error":"unavailable","message":"x"}'; exit 1`)
  expect(out.exitCode).toBe(0)
  expect(out.stdout.trimEnd()).toBe(BASE)
})

test("실행: atcher status 시간 초과 → 기존 출력", { timeout: 15_000 }, () => {
  const out = run(`sleep 10; echo '{"agents":[]}'`)
  expect(out.exitCode).toBe(0)
  expect(out.stdout.trimEnd()).toBe(BASE)
  expect(out.ms).toBeLessThan(8000)
})
