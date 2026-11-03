import { test } from "node:test"
import { expect } from "./expect.ts"
import { changelogMigrations, compareVersions, migrationsBetween } from "../src/core/upgrade.ts"

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
