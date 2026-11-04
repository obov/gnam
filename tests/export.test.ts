import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, test } from "node:test"
import { expect } from "./expect.ts"
import { validateCommit } from "../src/core/commit.ts"
import { commitInput, gitLookup } from "../src/core/history.ts"
import { build, targetState } from "../src/plugins/export/build.ts"
import { exportConfigOf, exportConfigProblems } from "../src/plugins/export/config.ts"
import exportPlugin from "../src/plugins/export/index.ts"
import { push } from "../src/plugins/export/push.ts"
import releasePlugin from "../src/plugins/release/index.ts"

const example = {
  targets: {
    swift: {
      path: "swift",
      repo: "https://github.com/acme/gentizer-swift.git",
      branch: "main",
      include: { conformance: "Tests/Conformance" },
      tag: "{version}",
      version: "swift/VERSION",
    },
  },
}

test("configProblems: 올바른 예 = 0, 문제마다 한 줄", () => {
  expect(exportConfigProblems(example)).toEqual([])
  expect(exportConfigProblems(undefined)).toEqual([])
  expect(exportConfigProblems({ targets: { a: { path: "a", repo: "git@github.com:acme/a.git" } } })).toEqual([])
  expect(exportConfigProblems("x")).toEqual(["export = 객체"])
  expect(exportConfigProblems({ targets: {} })).toEqual(['export.targets = { "<id>": { path · repo … } } (1개 이상)'])
  expect(
    exportConfigProblems({
      extra: 1,
      targets: {
        Bad: { path: "a", repo: "https://u:p@github.com/x.git" },
        b: { repo: "ftp://x" },
        c: { path: "c", repo: "https://github.com/c.git", include: { "c/x": "x", y: "t", z: "t/z" }, tag: "v1", other: 1 },
        d: { path: "c/d", repo: "https://github.com/d.git", tag: "{version}", branch: "a..b" },
        e: { path: "../e", repo: "https://token@github.com/e.git", version: "/abs" },
      },
    }),
  ).toEqual([
    "export 알 수 없는 키 extra",
    "export.targets.Bad: id = [a-z][a-z0-9-]*",
    "export.targets.Bad.repo: URL 에 자격 금지 (git 자격 도우미 · ssh key 를 쓴다)",
    "export.targets.b.path 필수 (저장소 루트 기준 폴더, 끝 / 없이)",
    "export.targets.b.repo: https · ssh URL",
    "export.targets.c 알 수 없는 키 other",
    "export.targets.c.include c/x: path 와 겹침 (이미 배포 트리에 있다)",
    "export.targets.c.include z: 대상 t/z 가 t 와 겹침",
    "export.targets.c.tag 에 {version} 필요",
    "export.targets.c.version 필수 (tag 가 있으면)",
    "export.targets.d.branch = 브랜치 이름",
    "export.targets.d.version 필수 (tag 가 있으면)",
    "export.targets.e.path 필수 (저장소 루트 기준 폴더, 끝 / 없이)",
    "export.targets.e.repo: URL 에 자격 금지 (git 자격 도우미 · ssh key 를 쓴다)",
    "export.targets.e.version = 저장소 루트 기준 파일 경로",
    "export.targets.c.path 가 d 의 path 와 겹침",
  ])
  expect(exportConfigOf(example)?.targets["swift"]?.branch).toBe("main")
  expect(exportConfigOf({ targets: { a: { path: "a", repo: "file:///x" } } })?.targets["a"]).toEqual({
    path: "a",
    repo: "file:///x",
    branch: "main",
    include: {},
    tag: null,
    version: null,
  })
})

const roots: string[] = []
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true })
})

function repoAt(root: string) {
  const git = (...args: string[]) => {
    const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd: root, encoding: "utf8" })
    if (r.status !== 0) throw new Error(`git ${args.join(" ")}\n${r.stderr}`)
    return r.stdout.trim()
  }
  const write = (path: string, text: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  const commit = (message: string) => {
    git("add", "-A")
    git("commit", "-q", "--allow-empty", "-m", message)
    return git("rev-parse", "HEAD")
  }
  return { root, git, write, commit }
}

function setup() {
  const root = mkdtempSync(join(tmpdir(), "export-"))
  const remote = mkdtempSync(join(tmpdir(), "export-remote-"))
  roots.push(root, remote)
  spawnSync("git", ["init", "-q", "--bare", "-b", "main", remote])
  const repo = repoAt(root)
  repo.git("init", "-q", "-b", "main")
  repo.write("swift/Package.swift", "// swift\n")
  repo.write("swift/VERSION", "1.0.0\n")
  repo.write("conformance/cases.json", "[]\n")
  repo.write("ts/index.ts", "export {}\n")
  repo.commit("chore: 시작")
  const target = {
    path: "swift",
    repo: `file://${remote}`,
    branch: "main",
    include: { conformance: "Tests/Conformance" },
    tag: "{version}",
    version: "swift/VERSION",
  }
  const remoteGit = (...args: string[]) => spawnSync("git", ["--git-dir", remote, ...args], { encoding: "utf8" }).stdout.trim()
  return { ...repo, remote, remoteGit, target }
}

test("build: 배포 트리 = path + include, 변경 없으면 커밋 0, trailer = 원본 hash", () => {
  const r = setup()
  const first = build(r.root, "swift", r.target)
  expect(first.changed).toBe(true)
  expect(first.base).toBe(null)
  const files = r.git("ls-tree", "-r", "--name-only", first.commit ?? "").split("\n")
  expect(files).toEqual(["Package.swift", "Tests/Conformance/cases.json", "VERSION"])
  expect(r.git("log", "-1", "--format=%B", first.commit ?? "")).toBe(
    `export: chore: 시작\n\nExport-Source: . ${first.source}\nExport-Target: swift`,
  )
  expect(build(r.root, "swift", r.target).changed).toBe(false)

  r.write("ts/index.ts", "export const a = 1\n")
  r.commit("chore: path 밖 변경")
  expect(build(r.root, "swift", r.target).changed).toBe(false)
  expect(targetState(r.root, "swift", r.target).pending).toBe(0)

  r.write("swift/Sources/A.swift", "struct A {}\n")
  const source = r.commit("chore: swift 변경")
  expect(targetState(r.root, "swift", r.target)).toEqual({
    id: "swift",
    path: "swift",
    repo: r.target.repo,
    tag: "{version}",
    version: "1.0.0",
    lastSource: first.source,
    pending: 1,
  })
  const second = build(r.root, "swift", r.target)
  expect(second.changed).toBe(true)
  expect(second.base).toBe(first.commit)
  expect(r.git("rev-list", "--count", "refs/heads/gnam/export/swift")).toBe("2")
  expect(r.git("log", "-1", "--format=%B", second.commit ?? "")).toContain(`Export-Source: . ${source}`)
  expect(targetState(r.root, "swift", r.target)).toMatchObject({ lastSource: source, pending: 0 })
  // 같은 원본 · 같은 부모 = 같은 hash (원본 author · committer)
  r.git("update-ref", "refs/heads/gnam/export/swift", first.commit ?? "")
  expect(build(r.root, "swift", r.target).commit).toBe(second.commit)
})

test("push: 새 브랜치 + 태그, 재실행은 추가 없음, 버전 올림 = 새 태그, CI 새 clone 은 원격 끝 위에 다시 build", () => {
  const r = setup()
  build(r.root, "swift", r.target)
  expect(push(r.root, "swift", r.target)).toEqual([
    `main: 새 브랜치 → ${r.git("rev-parse", "--short=7", "refs/heads/gnam/export/swift")}`,
    `태그 1.0.0 생성 (${r.git("rev-parse", "--short=7", "refs/heads/gnam/export/swift")})`,
  ])
  expect(r.remoteGit("tag")).toBe("1.0.0")
  expect(push(r.root, "swift", r.target).at(-1)).toMatch(/^태그 1\.0\.0 있음/)
  expect(r.remoteGit("tag")).toBe("1.0.0")

  r.write("swift/VERSION", "1.1.0\n")
  r.write("swift/B.swift", "\n")
  r.commit("chore: 1.1.0")
  build(r.root, "swift", r.target)
  push(r.root, "swift", r.target)
  expect(r.remoteGit("tag").split("\n")).toEqual(["1.0.0", "1.1.0"])
  expect(r.remoteGit("rev-list", "--count", "main")).toBe("2")

  // CI: 배포 브랜치 없는 새 clone. 원격 끝이 원본의 조상에서 나갔으므로 그 위에 쌓는다
  const ci = repoAt(mkdtempSync(join(tmpdir(), "export-ci-")))
  roots.push(ci.root)
  ci.git("clone", "-q", r.root, ".")
  ci.write("swift/C.swift", "\n")
  ci.commit("chore: C")
  build(ci.root, "swift", r.target)
  const lines = push(ci.root, "swift", r.target)
  expect(lines[0]).toMatch(/^main: 배포 저장소 끝 \w{7} 위에 다시 build/)
  expect(r.remoteGit("rev-list", "--count", "main")).toBe("3")
  expect(r.remoteGit("log", "-1", "--format=%s", "main")).toBe("export: chore: C")
})

test("push: 직접 커밋된 배포 저장소 · 배포 history 밖 태그 = exit 1, 덮지 않음", () => {
  const r = setup()
  build(r.root, "swift", r.target)
  push(r.root, "swift", r.target)
  // 배포 저장소에 사람이 직접 커밋
  const human = repoAt(mkdtempSync(join(tmpdir(), "export-human-")))
  roots.push(human.root)
  human.git("clone", "-q", r.remote, ".")
  human.write("README.md", "x\n")
  human.commit("docs: 직접")
  human.git("push", "-q", "origin", "main")
  r.write("swift/D.swift", "\n")
  r.commit("chore: D")
  build(r.root, "swift", r.target)
  assert.throws(() => push(r.root, "swift", r.target), /Export-Source 없음 \(배포 저장소에 직접 커밋됨\)/)
  expect(r.remoteGit("log", "-1", "--format=%s", "main")).toBe("docs: 직접")

  // 배포 history 밖 커밋을 가리키는 같은 이름 태그
  const s = setup()
  const other = repoAt(mkdtempSync(join(tmpdir(), "export-other-")))
  roots.push(other.root)
  other.git("init", "-q", "-b", "x")
  other.commit("x")
  other.git("push", "-q", s.remote, "x:refs/tags/1.0.0")
  build(s.root, "swift", s.target)
  assert.throws(() => push(s.root, "swift", s.target), /태그 1\.0\.0 가 배포 history 밖 커밋/)
})

test("push: release: 커밋의 Package: export:<id> 절 = 주석 태그 메시지", () => {
  const r = setup()
  r.git("commit", "-q", "--allow-empty", "-m", "release: export:swift 1.0.0\n\nPackage: export:swift 1.0.0\n- 첫 배포")
  build(r.root, "swift", r.target)
  push(r.root, "swift", r.target)
  expect(r.remoteGit("cat-file", "-t", "refs/tags/1.0.0")).toBe("tag")
  expect(r.remoteGit("tag", "-l", "--format=%(contents)", "1.0.0")).toBe("- 첫 배포")
})

const configWith = (target: object, release = false) => ({
  format: 1,
  plugins: ["@gnam/export", ...(release ? ["@gnam/release"] : [])],
  export: { targets: { swift: target } },
  ...(release ? { release: { targets: { ts: "semver" } } } : {}),
})

function check(root: string, sha: string, config: object, plugins = [exportPlugin]) {
  return validateCommit(
    { ...commitInput(root, sha), ...gitLookup(root, sha), cwd: root, view: { kind: "commit", sha }, config: config as never },
    plugins,
  ).map((v) => v.rule)
}

test("검사: path 삭제 · 잘못된 버전 = 새 위반만, verify = 작업 트리", () => {
  const r = setup()
  const config = configWith(r.target)
  r.write("swift/VERSION", "v1\n")
  expect(check(r.root, r.commit("chore: 버전 형식"), config)).toEqual(["export/version-format"])
  // 이미 있던 위반은 막지 않는다
  expect(check(r.root, r.commit("chore: 빈 변경"), config)).toEqual([])
  r.write("swift/VERSION", "1.0.1\n")
  r.commit("chore: 버전 복구")
  rmSync(join(r.root, "conformance"), { recursive: true })
  expect(check(r.root, r.commit("chore: include 삭제"), config)).toEqual(["export/target-missing"])
  expect(exportPlugin.verify?.(r.root, ["swift/VERSION", "swift/Package.swift"], config as never, [])?.map((v) => v.current)).toEqual([
    "swift: conformance 없음 (include)",
  ])
  unlinkSync(join(r.root, "swift/VERSION"))
  expect(exportPlugin.verify?.(r.root, ["swift/Package.swift", "conformance/cases.json"], config as never, [])?.map((v) => v.rule)).toEqual([
    "export/version-format",
  ])
})

test("release 연동: export version 파일 변경은 release: 커밋에서만, Package: export:<id> 절", () => {
  const r = setup()
  r.write("ts/package.json", '{ "name": "@x/ts", "version": "1.0.0" }\n')
  r.commit("chore: ts package")
  const config = configWith(r.target, true)
  const plugins = [exportPlugin, releasePlugin]
  r.write("swift/VERSION", "1.1.0\n")
  expect(check(r.root, r.commit("chore: 버전 올림"), config, plugins)).toEqual(["commit/version-outside"])
  r.git("reset", "-q", "--hard", "HEAD~1")

  r.write("swift/VERSION", "1.1.0\n")
  r.git("add", "-A")
  r.git("commit", "-q", "-m", "release: export:swift 1.1.0\n\nPackage: export:swift 1.1.0\n- 새 API")
  expect(check(r.root, r.git("rev-parse", "HEAD"), config, plugins)).toEqual([])
  r.git("reset", "-q", "--hard", "HEAD~1")

  r.write("swift/VERSION", "1.1.0\n")
  r.git("add", "-A")
  r.git("commit", "-q", "-m", "release: export:swift 1.2.0\n\nPackage: export:swift 1.2.0\n- 새 API")
  expect(check(r.root, r.git("rev-parse", "HEAD"), config, plugins)).toEqual(["commit/release-version"])
  r.git("reset", "-q", "--hard", "HEAD~1")

  r.write("swift/VERSION", "1.1.0\n")
  r.git("add", "-A")
  r.git("commit", "-q", "-m", "release: export:swift 1.1.0")
  expect(check(r.root, r.git("rev-parse", "HEAD"), config, plugins)).toEqual(["commit/release-section"])
})
