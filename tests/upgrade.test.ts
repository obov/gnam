import { readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"
import { expect } from "./expect.ts"
import { tempRepo } from "./helpers.ts"
import { changelogMigrations, compareVersions, installedVersion, migrationsBetween, upgradeNotice } from "../src/core/upgrade.ts"

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
