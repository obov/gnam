import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { expect } from "./expect.ts"
import { PACKAGE, tempRepo } from "./helpers.ts"
import {
  changelogMigrations,
  compareVersions,
  formatOutdated,
  installedVersion,
  migrationsBetween,
  outdated,
  upgradeNotice,
} from "../src/core/upgrade.ts"

const CHANGELOG = `# Changelog

## 0.4.1

- 수정
- 이전: c 할 일

## 0.4.0

- 기능
- 이전: a 할 일
- 이전: b 할 일

## 0.3.1

- 이전: 0.3.1 할 일

## 0.3.0

- 이전: 0.3.0 할 일
`

test("버전 비교: 숫자 · prerelease", () => {
  expect(compareVersions("0.10.0", "0.9.9")).toBe(1)
  expect(compareVersions("1.0.0", "1.0.0")).toBe(0)
  expect(compareVersions("1.0.0-rc.1", "1.0.0")).toBe(-1)
  expect(compareVersions("v0.3.2", "0.3.10")).toBe(-1)
})

test("이전 항목: 0.3.0 → 0.4.1 은 0.3.1 · 0.4.0 · 0.4.1 만 오래된 버전부터", () => {
  expect(changelogMigrations(CHANGELOG)).toHaveLength(5)
  expect(migrationsBetween(CHANGELOG, "0.3.0", "0.4.1")).toEqual([
    { version: "0.3.1", text: "0.3.1 할 일" },
    { version: "0.4.0", text: "a 할 일" },
    { version: "0.4.0", text: "b 할 일" },
    { version: "0.4.1", text: "c 할 일" },
  ])
  expect(migrationsBetween(CHANGELOG, "0.3.1", "0.4.0").map((m) => m.text)).toEqual(["a 할 일", "b 할 일"])
  expect(migrationsBetween(CHANGELOG, "0.4.1", "0.4.1")).toEqual([])
  expect(migrationsBetween(CHANGELOG, "0.4.1", "0.3.0")).toEqual([])
})

test("link 이전 안내: 기록 없음 → 기록만, 0.3.0 → 0.4.0 출력 후 갱신, 다운그레이드 → 안내 없이 갱신", () => {
  const repo = tempRepo()
  try {
    const record = join(repo.root, ".git", "gnam", "version")
    const notice = (installed: string) => {
      const report: string[] = []
      upgradeNotice(repo.root, report, installed, () => CHANGELOG)
      return report
    }
    expect(notice("0.3.0")).toEqual([])
    expect(readFileSync(record, "utf8")).toBe("0.3.0\n")
    expect(notice("0.4.0")).toEqual(["gnam 0.3.0 → 0.4.0 이전 항목:", "  0.3.1  0.3.1 할 일", "  0.4.0  a 할 일", "  0.4.0  b 할 일"])
    expect(readFileSync(record, "utf8")).toBe("0.4.0\n")
    expect(notice("0.4.0")).toEqual([])
    expect(notice("0.3.1")).toEqual([])
    expect(readFileSync(record, "utf8")).toBe("0.3.1\n")

    rmSync(record)
    expect(repo.gnam("link").status).toBe(0)
    expect(readFileSync(record, "utf8")).toBe(`${installedVersion()}\n`)
    writeFileSync(record, "0.0.1\n")
    expect(repo.gnam("link").status).toBe(0)
    expect(readFileSync(record, "utf8")).toBe(`${installedVersion()}\n`)
  } finally {
    repo.cleanup()
  }
})

// ---------- outdated ----------

/** 가짜 registry: packument (dist-tags · tarball) + tarball (package/CHANGELOG.md) */
async function fakeRegistry(latest: string, status = 200) {
  const dir = mkdtempSync(join(tmpdir(), "gnam-registry-"))
  mkdirSync(join(dir, "package"))
  writeFileSync(join(dir, "package", "CHANGELOG.md"), CHANGELOG)
  writeFileSync(join(dir, "package", "package.json"), "{}")
  const r = spawnSync("tar", ["--format=ustar", "-czf", join(dir, "pkg.tgz"), "package"], {
    cwd: dir,
    env: { ...process.env, COPYFILE_DISABLE: "1" },
  })
  if (r.status !== 0) throw new Error(String(r.stderr))
  const tgz = readFileSync(join(dir, "pkg.tgz"))
  const paths: string[] = []
  const server = createServer((req, res) => {
    paths.push(req.url ?? "")
    if (status !== 200) return res.writeHead(status).end()
    if (req.url === "/@obov%2fgnam") {
      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
      res.writeHead(200, { "content-type": "application/json" })
      return res.end(JSON.stringify({ "dist-tags": { latest }, versions: { [latest]: { dist: { tarball: `${base}/pkg.tgz` } } } }))
    }
    if (req.url === "/pkg.tgz") return res.writeHead(200).end(tgz)
    res.writeHead(404).end()
  })
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done))
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    paths,
    close: async () => {
      await new Promise<void>((done) => server.close(() => done()))
      rmSync(dir, { recursive: true, force: true })
    },
  }
}

test("outdated: 새 버전 · 이전 항목 · 업그레이드 명령 · --json 키", async () => {
  const registry = await fakeRegistry("0.4.1")
  try {
    const o = await outdated("npm", "0.3.0", registry.url)
    expect(o).toEqual({
      installed: "0.3.0",
      latest: "0.4.1",
      upgrade: "npm install -D @obov/gnam@latest",
      migrations: [
        { version: "0.3.1", text: "0.3.1 할 일" },
        { version: "0.4.0", text: "a 할 일" },
        { version: "0.4.0", text: "b 할 일" },
        { version: "0.4.1", text: "c 할 일" },
      ],
    })
    expect(formatOutdated(o)).toEqual([
      "gnam 0.3.0 → 0.4.1 (latest)",
      "업그레이드  npm install -D @obov/gnam@latest",
      "이전 항목",
      "  0.3.1  0.3.1 할 일",
      "  0.4.0  a 할 일",
      "  0.4.0  b 할 일",
      "  0.4.1  c 할 일",
    ])
    expect((await outdated("pnpm", "0.4.0", registry.url)).upgrade).toBe("pnpm add -D @obov/gnam@latest")
    expect(Object.keys(o)).toEqual(["installed", "latest", "upgrade", "migrations"])
  } finally {
    await registry.close()
  }
})

test("outdated: 최신이면 tarball 을 받지 않음 · registry 오류는 throw", async () => {
  const registry = await fakeRegistry("0.4.1")
  const broken = await fakeRegistry("0.4.1", 500)
  try {
    const o = await outdated("npm", "0.4.1", registry.url)
    expect(formatOutdated(o)).toEqual(["gnam 0.4.1 (latest 0.4.1) · 최신"])
    expect(registry.paths).toEqual(["/@obov%2fgnam"])
    let message = ""
    await outdated("npm", "0.3.0", broken.url).catch((error: Error) => (message = error.message))
    expect(message).toContain("HTTP 500")
  } finally {
    await registry.close()
    await broken.close()
  }
})

test("outdated CLI: registry 오류면 stdout 없이 exit 1", () => {
  const repo = tempRepo()
  try {
    const r = spawnSync(process.execPath, [join(PACKAGE, "bin", "gnam.js"), "outdated"], {
      cwd: repo.root,
      encoding: "utf8",
      env: { ...process.env, npm_config_registry: "http://127.0.0.1:9" },
    })
    expect(r.status).toBe(1)
    expect(r.stdout).toBe("")
    expect(r.stderr).toContain("gnam:")
  } finally {
    repo.cleanup()
  }
})
