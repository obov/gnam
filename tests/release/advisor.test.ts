import { test } from "node:test"
import { expect } from "../expect.ts"
import { adviseBreaking } from "../../src/plugins/release/advisor.ts"
import type { Evidence } from "../../src/plugins/release/model.ts"

const evidence = (hash: string, level: Evidence["level"]): Evidence => ({
  hash,
  subject: hash,
  body: "",
  level,
  reason: "",
})
const answer = (choice: string, confidence: number) => ({
  ok: true,
  out: JSON.stringify({ answers: { level: { type: "choice", choice, confidence } } }),
  err: "",
})

test("major 판정 + confidence 문턱 이상만 경고, 이미 major 인 근거는 묻지 않음", () => {
  const asked: string[] = []
  const answers: Record<string, ReturnType<typeof answer>> = {
    aaaaaaa: answer("major", 0.95),
    bbbbbbb: answer("major", 0.6),
    ccccccc: answer("minor", 0.99),
  }
  const judge = (request: unknown) => {
    const state = (request as { state: string }).state.split("\n")[0] ?? ""
    asked.push(state)
    return answers[state] ?? answer("patch", 1)
  }
  const warnings = adviseBreaking(
    [
      evidence("aaaaaaa", "patch"),
      evidence("bbbbbbb", "minor"),
      evidence("ccccccc", "patch"),
      evidence("ddddddd", "major"),
    ],
    judge,
  )
  expect(asked).toEqual(["aaaaaaa", "bbbbbbb", "ccccccc"])
  expect(warnings).toHaveLength(1)
  expect(warnings[0]).toStartWith("aaaaaaa 호환성 깨짐 의심")
})

test("jev 실패는 경고 한 줄", () => {
  expect(adviseBreaking([evidence("aaaaaaa", "patch")], () => ({ ok: false, out: "", err: "AUTH_MISSING\n" }))).toEqual(
    ["jev 실패: AUTH_MISSING"],
  )
})
