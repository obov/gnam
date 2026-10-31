import { spawnSync } from "node:child_process"
import { test } from "node:test"
import { expect } from "./expect.ts"
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const skills = new URL("../plugins/multi-agent/skills/", import.meta.url).pathname
const argsScript = join(skills, "harness-execute/claude-args.sh")
const cloneScript = join(skills, "multi-agent/clone.sh")
const bundled = join(skills, "harness-execute/system-prompt.md")

function setup() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "claude-args-")))
  const repo = join(dir, "repo")
  const home = join(dir, "home")
  mkdirSync(repo)
  mkdirSync(home)
  spawnSync("git", ["init", "-q"], { cwd: repo })
  const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, ".config"), HERDR_ENV: "1" }
  const run = (...args: string[]) => {
    const child = spawnSync("bash", [argsScript, ...args], { cwd: repo, env, encoding: "utf8" })
    return { status: child.status, out: child.stdout.trim(), err: child.stderr }
  }
  const project = join(repo, ".gnam/claude-args")
  const global = join(home, ".config/gnam/claude-args")
  const put = (file: string, text: string) => {
    mkdirSync(join(file, ".."), { recursive: true })
    writeFileSync(file, text)
  }
  return { dir, repo, home, env, run, project, global, put }
}

test("claude 시작 인자: 파일이 없으면 기본값", () => {
  const t = setup()
  try {
    expect(t.run().out.split("\n")).toEqual(["--dangerously-skip-permissions", "--system-prompt-file", bundled])
    expect(t.run("source").out).toBe(`default ${bundled}`)
  } finally {
    rmSync(t.dir, { recursive: true, force: true })
  }
})

test("claude 시작 인자: 프로젝트 > 전역 > 기본값, 붙여 넣은 명령 정규화", () => {
  const t = setup()
  try {
    t.put(t.global, "--system-prompt-file /g/prompt.md\n")
    expect(t.run().out).toBe("--system-prompt-file\n/g/prompt.md")
    expect(t.run("source").out).toBe(`global ${t.global}`)

    t.put(
      t.project,
      [
        "# 주석",
        "claude \\",
        "--tools Bash,Read \\",
        "--model sonnet --effort high \\",
        "--session-id abc \\",
        '--settings "~/a b/c.json" \\',
        "--system-prompt-file /p/prompt.md",
        "",
      ].join("\n"),
    )
    expect(t.run().out.split("\n")).toEqual([
      "--tools",
      "Bash,Read",
      "--settings",
      `${t.home}/a b/c.json`,
      "--system-prompt-file",
      "/p/prompt.md",
    ])
    expect(t.run("source").out).toBe(`project ${t.project}`)
    expect(JSON.parse(t.run("--json").out)).toHaveLength(6)
  } finally {
    rmSync(t.dir, { recursive: true, force: true })
  }
})

test("claude 시작 인자: init 은 기본값으로 만들고 덮어쓰지 않는다", () => {
  const t = setup()
  try {
    expect(t.run("init").out).toBe(t.project)
    expect(t.run().out.split("\n")).toEqual(["--dangerously-skip-permissions", "--system-prompt-file", bundled])
    const again = t.run("init")
    expect(again.status).not.toBe(0)
    expect(t.run("init", "--global").out).toBe(t.global)
  } finally {
    rmSync(t.dir, { recursive: true, force: true })
  }
})

test("clone.sh start 가 설정 인자 뒤에 session · model · effort 를 붙인다", () => {
  const t = setup()
  try {
    const log = join(t.dir, "herdr.log")
    writeFileSync(join(t.dir, "herdr"), '#!/bin/sh\nprintf "%s\\n" "$@" > "$HERDR_LOG"\n', { mode: 0o755 })
    mkdirSync(join(t.repo, ".git/clone"))
    writeFileSync(join(t.repo, ".git/clone/r1.tsv"), `a\trunner\tp1\tsess-1\t${t.repo}\n`)
    t.put(t.project, "--tools Bash --model old --system-prompt-file /p/prompt.md\n")
    const env = { ...t.env, PATH: `${t.dir}:${process.env["PATH"]}`, HERDR_LOG: log }
    const child = spawnSync("bash", [cloneScript, "start", "r1", "a", "sonnet", "high"], { cwd: t.repo, env })
    expect(child.status).toBe(0)
    const got = readFileSync(log, "utf8").trim().split("\n")
    expect(got.slice(got.indexOf("--") + 1)).toEqual([
      "--tools",
      "Bash",
      "--system-prompt-file",
      "/p/prompt.md",
      "--session-id",
      "sess-1",
      "--model",
      "sonnet",
      "--effort",
      "high",
    ])
  } finally {
    rmSync(t.dir, { recursive: true, force: true })
  }
})
