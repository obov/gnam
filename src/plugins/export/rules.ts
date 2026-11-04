/**
 * 원본 저장소 검사 (specs/export.md 원본 저장소 검사). 네트워크 없음.
 *
 *   export/target-missing    path · include 원본이 없음
 *   export/version-format    version 파일이 없거나 MAJOR.MINOR.PATCH 한 줄이 아님
 *
 * verify = 작업 트리. commit-msg · history = 그 커밋 결과 트리에서, 부모에 없던 위반만
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { CommitContext, GnamConfig, Violation } from "../../core/plugin.ts"
import { gitIn } from "./build.ts"
import { type ExportConfig, exportConfigOf, isVersion } from "./config.ts"

interface Reader {
  /** 파일 또는 폴더가 있는가 */
  exists(path: string): boolean
  read(path: string): string | null
}

interface Found {
  key: string
  violation: Violation
}

export function problemsWith(config: ExportConfig, reader: Reader): Found[] {
  const found: Found[] = []
  for (const [id, t] of Object.entries(config.targets)) {
    const missing = [t.path, ...Object.keys(t.include)].filter((p) => !reader.exists(p))
    for (const path of missing)
      found.push({
        key: `missing\0${id}\0${path}`,
        violation: {
          rule: "export/target-missing",
          why: "gnam.json export.targets 의 path · include 원본이 배포 트리가 된다. 없으면 build 가 실패한다",
          current: `${id}: ${path} 없음${path === t.path ? " (path)" : " (include)"}`,
          fix: `${path} 를 되돌리거나 gnam.json export.targets.${id} 를 새 위치로 고친다`,
        },
      })
    if (t.version === null) continue
    const text = reader.read(t.version)
    const value = text?.trim() ?? null
    if (value !== null && isVersion(value)) continue
    found.push({
      key: `version\0${id}\0${value ?? ""}`,
      violation: {
        rule: "export/version-format",
        why: "version 파일 값이 배포 저장소 태그가 된다 (tag 의 {version}). SwiftPM 등은 MAJOR.MINOR.PATCH 태그만 버전으로 읽는다",
        current: `${id}: ${t.version} ${text === null ? "없음" : JSON.stringify(value)}`,
        fix: `${t.version} 에 MAJOR.MINOR.PATCH 한 줄을 쓴다 (예: 1.0.0)`,
      },
    })
  }
  return found
}

/** gnam verify: 작업 트리 파일 기준 */
export function exportVerify(cwd: string, files: string[], config: GnamConfig): Violation[] {
  const exportConfig = exportConfigOf(config["export"])
  if (exportConfig === null) return []
  const reader: Reader = {
    exists: (p) => files.some((f) => f === p || f.startsWith(`${p}/`)),
    read: (p) => (existsSync(join(cwd, p)) ? readFileSync(join(cwd, p), "utf8") : null),
  }
  return problemsWith(exportConfig, reader).map((f) => f.violation)
}

/** rev = 커밋 hash 또는 index (":") */
function treeReader(cwd: string, rev: string | null): Reader {
  const spec = (p: string) => (rev === null ? `:${p}` : `${rev}:${p}`)
  return {
    exists: (p) =>
      rev === null ? gitIn(cwd, ["ls-files", "--", p]).out.trim() !== "" : gitIn(cwd, ["cat-file", "-e", spec(p)]).ok,
    read: (p) => {
      const result = gitIn(cwd, ["show", spec(p)])
      return result.ok ? result.out : null
    },
  }
}

export function exportEveryCommit(ctx: CommitContext): Violation[] {
  if (ctx.merge) return []
  const config = exportConfigOf(ctx.config["export"])
  if (config === null) return []
  const rev = ctx.view.kind === "index" ? null : ctx.view.sha
  const parent = gitIn(ctx.cwd, ["rev-parse", "-q", "--verify", rev === null ? "HEAD^{commit}" : `${rev}^^{commit}`])
  // 첫 커밋은 비교할 기준이 없다
  if (!parent.ok) return []
  const before = new Set(problemsWith(config, treeReader(ctx.cwd, parent.out.trim())).map((f) => f.key))
  return problemsWith(config, treeReader(ctx.cwd, rev))
    .filter((f) => !before.has(f.key))
    .map((f) => f.violation)
}
