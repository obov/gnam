import { spawnSync } from "node:child_process"
import { test } from "node:test"
import { expect } from "./expect.ts"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { summarize } from "../src/plugins/run/run-usage.ts"

const script = new URL("../plugins/multi-agent/skills/multi-agent/clone.sh", import.meta.url).pathname

test("clone 파일 전달이 구현·리뷰 반영 실측 구간을 보존한다", () => {
  const dir = mkdtempSync(join(tmpdir(), "clone-prompt-"))
  try {
    const log = join(dir, "prompt.txt")
    writeFileSync(join(dir, "herdr"), '#!/bin/sh\nprintf "%s" "$4" > "$PROMPT_LOG"\n', { mode: 0o755 })
    const env = { ...process.env, HERDR_ENV: "1", PATH: `${dir}:${process.env["PATH"]}`, PROMPT_LOG: log }
    const send = (first: string) => {
      const file = join(dir, "instruction.md")
      writeFileSync(file, `${first}\n지시 내용`)
      const child = spawnSync("bash", [script, "prompt", "test", "runner", file], { env })
      expect(child.status).toBe(0)
      return readFileSync(log, "utf8")
    }
    expect(send("코드 리뷰 지시. 읽기만 한다")).toStartWith("코드 리뷰 지시:")
    const impl = send("작업 지시. Step 1")
    const fix = send("리뷰 결과 반영 지시 (reviewer)")
    const resume = send("작업 지시. Step 2")
    const usage = summarize([
      { type: "user", timestamp: "2026-09-01T00:00:00Z", message: { content: impl } },
      {
        type: "assistant",
        requestId: "r1",
        timestamp: "2026-09-01T00:01:00Z",
        message: { model: "m", usage: { output_tokens: 100 } },
      },
      { type: "user", timestamp: "2026-09-01T00:02:00Z", message: { content: fix } },
      {
        type: "assistant",
        requestId: "r2",
        timestamp: "2026-09-01T00:03:00Z",
        message: { model: "m", usage: { output_tokens: 50 } },
      },
      { type: "user", timestamp: "2026-09-01T00:04:00Z", message: { content: resume } },
      {
        type: "assistant",
        requestId: "r3",
        timestamp: "2026-09-01T00:05:00Z",
        message: { model: "m", usage: { output_tokens: 20 } },
      },
    ])
    expect(usage).toMatchObject({ out: 170, impl_out: 120 })
    const file = join(dir, "bad.md")
    writeFileSync(file, "표지 없는 지시")
    rmSync(log)
    const bad = spawnSync("bash", [script, "prompt", "test", "runner", file], { env })
    expect(bad.status).not.toBe(0)
    expect(existsSync(log)).toBe(false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
