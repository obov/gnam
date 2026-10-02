import { test } from "node:test"
import { expect } from "../expect.ts"
import {
  allowedVersions,
  bump,
  calverNext,
  classify,
  draftMessage,
  entriesOf,
  type Evidence,
  type HistoryLookup,
  outsideProblems,
  type ReleaseState,
  releaseProblems,
  sectionsOf,
} from "../../src/plugins/release/model.ts"

const date = new Date("2026-09-26T00:00:00Z")

const state = (over: Partial<ReleaseState> = {}, evidence: Evidence["level"][] = []): ReleaseState => ({
  dir: "packages/a",
  name: "@repo/a",
  scheme: "semver",
  last: { hash: "a".repeat(40), version: "1.2.3" },
  current: "1.2.3",
  before: "1.2.3",
  evidence: () =>
    evidence.map((level, i) => ({ hash: `${i}`.repeat(7), subject: `s${i}`, body: "", level, reason: "" })),
  ...over,
})

test("제목: release: <name> <version> · …", () => {
  expect(entriesOf("chore: x")).toBeNull()
  expect(entriesOf("release: @repo/a 1.3.0 · @repo/b 2026.9.0")).toEqual({
    entries: [
      { name: "@repo/a", version: "1.3.0" },
      { name: "@repo/b", version: "2026.9.0" },
    ],
    invalid: [],
  })
  expect(entriesOf("release: @repo/a")?.invalid).toEqual(["@repo/a"])
})

test("절: Package: 줄부터 다음 Package: 줄 전까지", () => {
  const sections = sectionsOf("Package: @repo/a 1.3.0\n- 추가\n\nPackage: @repo/b 2.0.0\n\n- 삭제\n")
  expect(sections.get("@repo/a")).toEqual({ version: "1.3.0", notes: "- 추가" })
  expect(sections.get("@repo/b")).toEqual({ version: "2.0.0", notes: "- 삭제" })
})

test("bump: 0.x 의 major 는 minor", () => {
  expect(bump("1.2.3", "major")).toBe("2.0.0")
  expect(bump("1.2.3", "minor")).toBe("1.3.0")
  expect(bump("1.2.3", "patch")).toBe("1.2.4")
  expect(bump("0.4.1", "major")).toBe("0.5.0")
})

test("calver: 같은 달이면 N + 1, 아니면 0", () => {
  expect(calverNext(null, date)).toBe("2026.9.0")
  expect(calverNext("2026.9.2", date)).toBe("2026.9.3")
  expect(calverNext("2026.8.5", date)).toBe("2026.9.0")
})

const lookup = (plans: Record<string, { subject: string; body?: string; after: boolean; files: boolean }>) =>
  ({
    subjectOf: (h) => plans[h]?.subject ?? null,
    bodyOf: (h) => plans[h]?.body ?? "",
    afterRelease: (h) => plans[h]?.after ?? false,
    changesFiles: (h) => plans[h]?.files ?? false,
  }) satisfies HistoryLookup

test("근거: Breaking → major · 새 spec plan → minor · 이전 plan 수정 · 빈 plan · chore → patch", () => {
  const plans = lookup({
    aaaaaaa: { subject: "spec.x.plan: 새 기능", after: true, files: true },
    bbbbbbb: { subject: "spec.x.plan: 예전 기능", after: false, files: true },
    ccccccc: { subject: "spec.x.plan: 리팩터링", after: true, files: false },
    ddddddd: { subject: "spec.x.plan: 깨는 변경", body: "Breaking: 옵션 제거", after: true, files: true },
    eeeeeee: { subject: "spec.x.plan: 수집", body: "Topics: x, y\nSpec: aaaaaaa", after: true, files: false },
  })
  const level = (subject: string, body = "") => classify({ hash: "h", subject, body }, plans).level
  expect(level("spec.x.impl: a", "Plan: aaaaaaa 1")).toBe("minor")
  expect(level("spec.x.impl: b", "Plan: bbbbbbb 1")).toBe("patch")
  expect(level("spec.x.impl: c", "Plan: ccccccc 1")).toBe("patch")
  expect(level("spec.x.impl: d", "Plan: ddddddd 1")).toBe("major")
  expect(level("spec.x.impl: e", "Plan: eeeeeee 1")).toBe("minor")
  expect(level("spec.x.impl: f", "Plan: bbbbbbb 1\nBreaking: 반환 타입 변경")).toBe("major")
  expect(level("chore: 의존성")).toBe("patch")
})

test("허용 버전: 계산 수준 이상만, 변경 없으면 빈 배열", () => {
  expect(allowedVersions(state({}, ["patch", "minor"]), date)).toEqual(["1.3.0", "2.0.0"])
  expect(allowedVersions(state({}, ["patch"]), date)).toEqual(["1.2.4", "1.3.0", "2.0.0"])
  expect(allowedVersions(state({}, []), date)).toEqual([])
  expect(allowedVersions(state({ last: null, current: "0.1.0" }), date)).toEqual(["0.1.0"])
  expect(allowedVersions(state({ scheme: "calver", last: { hash: "x", version: "2026.9.0" } }), date)).toEqual([
    "2026.9.1",
  ])
  expect(allowedVersions(state({ scheme: "openapi", current: "2.0.0" }), date)).toEqual(["2.0.0"])
  expect(allowedVersions(state({ scheme: "openapi", current: "1.2.3" }), date)).toEqual([])
})

test("release 커밋: 버전 · 절 · 파일 · 대상", () => {
  const states = [state({ current: "1.3.0" }, ["minor"])]
  const rules = (subject: string, body: string, files: string[] = ["packages/a/package.json"]) =>
    releaseProblems(subject, body, files, states, date).map((p) => p.rule)
  expect(rules("release: @repo/a 1.3.0", "Package: @repo/a 1.3.0\n- 추가")).toEqual([])
  expect(rules("release: @repo/a 1.2.4", "Package: @repo/a 1.2.4\n- x")).toEqual(["release-version"])
  expect(rules("release: @repo/a 2.0.0", "Package: @repo/a 2.0.0\n- x")).toEqual(["release-version"])
  expect(rules("release: @repo/a 1.3.0", "Package: @repo/a 1.3.0")).toEqual(["release-section"])
  expect(rules("release: @repo/a 1.3.0", "Package: @repo/a 1.3.0\n- x", ["packages/a/src/x.ts"])).toEqual([
    "release-files",
  ])
  expect(rules("release: @repo/z 1.0.0", "Package: @repo/z 1.0.0\n- x", [])).toEqual(["release-target"])
  // 제목에 없는 대상의 package.json 변경
  expect(rules("release: @repo/z 1.0.0", "Package: @repo/z 1.0.0\n- x")).toEqual(["release-target", "release-files"])
})

test("release 가 아닌 커밋의 version 변경은 실패 (openapi 제외)", () => {
  expect(outsideProblems([state({ before: "1.2.3", current: "1.2.4" })]).map((p) => p.rule)).toEqual([
    "version-outside",
  ])
  expect(outsideProblems([state({ scheme: "openapi", before: "1.2.3", current: "2.0.0" })])).toEqual([])
})

test("초안: 제목 + 대상별 Package: 절, Breaking 먼저", () => {
  const draft = draftMessage([{ state: state({}, ["patch", "major"]), version: "2.0.0" }])
  expect(draft).toBe(
    "release: @repo/a 2.0.0\n\nPackage: @repo/a 2.0.0\n- Breaking: s1 (1111111)\n- s0 (0000000, patch)",
  )
})
