import { test } from "node:test"
import { expect } from "./expect.ts"
import { measuredOf, summarize } from "../src/plugins/run/run-usage.ts"

const assistant = (requestId: string, model: string, effort: string, out: number, timestamp: string) => ({
  type: "assistant",
  requestId,
  effort,
  version: "2.1.282",
  timestamp,
  message: {
    model,
    usage: { input_tokens: 1, cache_creation_input_tokens: 10, cache_read_input_tokens: 100, output_tokens: out },
  },
})

test("요청 중복 제거 · subagent 합산 · turn_duration 합 · 최다 조합", () => {
  const main = [
    assistant("r1", "claude-opus-5-5", "high", 50, "2026-09-01T00:00:00Z"),
    assistant("r1", "claude-opus-5-5", "high", 50, "2026-09-01T00:00:01Z"),
    assistant("r2", "claude-opus-5-5", "high", 30, "2026-09-01T00:10:00Z"),
    { type: "system", subtype: "turn_duration", durationMs: 360_000, timestamp: "2026-09-01T00:10:00Z" },
    { type: "system", subtype: "api_error", timestamp: "2026-09-01T01:00:00Z" },
  ]
  const usage = summarize(main, [assistant("s1", "claude-haiku-4-5", "low", 5, "2026-09-01T00:05:00Z")])
  expect(usage).toMatchObject({ model: "claude-opus-5-5", effort: "high", harness: "2.1.282", out: 85, requests: 3 })
  expect(usage).toMatchObject({
    active_min: 6,
    wall_min: 60,
    api_errors: 1,
    cache_read: 300,
    mixed: ["claude-haiku-4-5/low"],
  })
  expect(Object.keys(measuredOf(usage))).toEqual([
    "model",
    "effort",
    "active_min",
    "out",
    "impl_min",
    "impl_out",
    "api_errors",
    "harness",
  ])
  expect(Object.keys(measuredOf(usage, true))).not.toContain("impl_min")
})

const prompt = (text: string, timestamp: string) => ({ type: "user", timestamp, message: { content: text } })
const turn = (durationMs: number, timestamp: string) => ({
  type: "system",
  subtype: "turn_duration",
  durationMs,
  timestamp,
})

test("impl_* 는 '리뷰 결과 반영 지시' 부터 다음 '작업 지시' 전까지를 뺀다", () => {
  const usage = summarize([
    prompt('\n\n<pasted_content id="a">\n작업 지시. Step 1', "2026-09-01T00:00:00Z"),
    assistant("r1", "m", "high", 100, "2026-09-01T00:01:00Z"),
    { type: "user", isMeta: true, timestamp: "2026-09-01T00:02:00Z", message: { content: "Stop hook feedback" } },
    turn(600_000, "2026-09-01T00:10:00Z"),
    prompt("조정자 답변. 진행", "2026-09-01T00:11:00Z"),
    turn(300_000, "2026-09-01T00:16:00Z"),
    prompt('<pasted_content id="b">리뷰 결과 반영 지시 (reviewer-1)', "2026-09-01T01:00:00Z"),
    assistant("r2", "m", "high", 40, "2026-09-01T01:01:00Z"),
    turn(120_000, "2026-09-01T01:02:00Z"),
    prompt("조정자 지시다. 바로 진행", "2026-09-01T01:03:00Z"),
    turn(60_000, "2026-09-01T01:04:00Z"),
    prompt("작업 지시. Step 2", "2026-09-01T02:00:00Z"),
    assistant("r3", "m", "high", 7, "2026-09-01T02:01:00Z"),
    turn(240_000, "2026-09-01T02:04:00Z"),
  ])
  expect(usage).toMatchObject({ active_min: 22, impl_min: 19, out: 147, impl_out: 107 })
})

test("반영 지시가 없으면 impl_* = 전체", () => {
  const usage = summarize([
    assistant("r1", "m", "low", 9, "2026-09-01T00:00:00Z"),
    turn(120_000, "2026-09-01T00:02:00Z"),
  ])
  expect(usage).toMatchObject({ active_min: 2, impl_min: 2, out: 9, impl_out: 9 })
})

test("turn_duration 없는 transcript 는 5분 넘는 공백을 뺀다", () => {
  const usage = summarize([
    assistant("r1", "m", "low", 1, "2026-09-01T00:00:00Z"),
    assistant("r2", "m", "low", 1, "2026-09-01T00:04:00Z"),
    assistant("r3", "m", "low", 1, "2026-09-01T02:00:00Z"),
  ])
  expect(usage).toMatchObject({ active_min: 4, wall_min: 120 })
})
