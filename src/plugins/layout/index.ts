/**
 * layout: .gnam/layout.json 에 폴더 구조를 선언하고 어긋난 경로를 알린다 (specs/layout.md).
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { definePlugin, type GnamConfig, type GnamPlugin, type Violation } from "../../core/plugin.ts"
import { LAYOUT_FILE, layoutConfigProblems, levelOf, parseLayout } from "./config.ts"
import { layoutEveryCommit, layoutKind } from "./commit.ts"
import { schemaFound, toViolation } from "./found.ts"
import { type Found, findViolations } from "./match.ts"

/** 작업 트리 기준 위반. layout.json 없으면 null */
export function workingFound(cwd: string, files: string[], plugins: GnamPlugin[]): Found[] | null {
  const path = join(cwd, LAYOUT_FILE)
  if (!existsSync(path)) return null
  const parsed = parseLayout(readFileSync(path, "utf8"), plugins)
  return parsed.layout === null ? schemaFound(parsed.problems) : findViolations(parsed.layout, files)
}

export default definePlugin({
  id: "layout",
  version: "0.1.0",
  kinds: [layoutKind],
  everyCommit: layoutEveryCommit,
  verify: (cwd: string, files: string[], config: GnamConfig, plugins: GnamPlugin[]) =>
    (workingFound(cwd, files, plugins) ?? []).map((f) => toViolation(f, levelOf(config))),
  configProblems: layoutConfigProblems,
  configDefaults: { enforce: "warn" },
  rules: [
    { id: "layout/unlisted", why: "구조의 어떤 노드와도 맞지 않는 경로" },
    { id: "layout/existence", why: "enforceExistence 가 요구한 경로가 있다" },
    { id: "layout/recursion", why: "folderRecursionLimit 안의 깊이" },
    { id: "layout/schema", why: ".gnam/layout.json 형식" },
    { id: "commit/layout-files", why: "layout: 커밋은 .gnam/layout.json 만, layout.json 변경은 layout: 커밋에서만" },
    { id: "commit/layout-goal", why: "layout: 커밋 본문 Goal (구조를 정한 이유)" },
  ],
})
