/**
 * export: 하위 폴더를 배포용 외부 저장소로 내보내고 원본 커밋과 이어 기록한다 (specs/export.md).
 */
import { definePlugin, type GnamConfig, type StatusContext } from "../../core/plugin.ts"
import { build, targetState } from "./build.ts"
import { type ExportConfig, type ExportTarget, exportConfigOf, exportConfigProblems } from "./config.ts"
import { push } from "./push.ts"
import { exportEveryCommit, exportVerify } from "./rules.ts"

const fail = (message: string) => {
  console.error(`gnam run export: ${message}`)
  return 1
}

type Picked = { config: ExportConfig; id: string; target: ExportTarget } | { error: string }

function pick(config: GnamConfig, id: string | undefined, usage: string): Picked {
  const exportConfig = exportConfigOf(config["export"])
  if (exportConfig === null) return { error: "gnam.json export.targets 없음 또는 형식 문제 (npx gnam status 의 problems)" }
  if (id === undefined) return { error: `사용: ${usage}` }
  const target = exportConfig.targets[id]
  if (target === undefined) return { error: `${id}: export.targets 에 없음 (있는 것: ${Object.keys(exportConfig.targets).join(", ")})` }
  return { config: exportConfig, id, target }
}

const BUILD_USAGE = "gnam run export build <id> [--json]"

function buildData(args: string[], cwd: string, config: GnamConfig) {
  const picked = pick(config, args.find((a) => !a.startsWith("--")), BUILD_USAGE)
  if ("error" in picked) throw new Error(picked.error)
  return build(cwd, picked.id, picked.target)
}

function statesOf(cwd: string, config: GnamConfig, id: string | undefined) {
  const exportConfig = exportConfigOf(config["export"])
  if (exportConfig === null) return []
  return Object.entries(exportConfig.targets)
    .filter(([key]) => id === undefined || key === id)
    .map(([key, target]) => targetState(cwd, key, target))
}

const short = (sha: string | null) => (sha === null ? "없음" : sha.slice(0, 7))

export default definePlugin({
  id: "export",
  version: "0.1.0",
  configProblems: exportConfigProblems,
  verify: (cwd, files, config) => exportVerify(cwd, files, config),
  everyCommit: (ctx) => exportEveryCommit(ctx),
  commands: {
    build: {
      describe: "<id> [--json]  원본 HEAD 로 배포 트리를 만들어 gnam/export/<id> 에 커밋 (변경 없으면 생략)",
      run(args, cwd, config) {
        try {
          const built = buildData(args, cwd, config)
          console.log(
            built.changed
              ? `${built.id}: ${short(built.base)} → ${short(built.commit)} (원본 ${short(built.source)})`
              : `${built.id}: 변경 없음 (${short(built.commit)})`,
          )
          return 0
        } catch (error) {
          return fail(error instanceof Error ? error.message : String(error))
        }
      },
      data: (args, ctx: StatusContext) => buildData(args, ctx.cwd, ctx.config),
    },
    push: {
      describe: "<id>  배포 브랜치를 repo · branch 로 push (force 없음), 새 버전이면 tag (CI 용)",
      run(args, cwd, config) {
        const picked = pick(config, args[0], "gnam run export push <id>")
        if ("error" in picked) return fail(picked.error)
        try {
          for (const line of push(cwd, picked.id, picked.target)) console.log(`${picked.id}: ${line}`)
          return 0
        } catch (error) {
          return fail(error instanceof Error ? error.message : String(error))
        }
      },
    },
    status: {
      describe: "[<id>]  대상별 마지막 내보낸 원본 커밋 · 미반영 커밋 수 · 배포 버전 (fetch 없음)",
      run(args, cwd, config) {
        if (exportConfigOf(config["export"]) === null) return fail("gnam.json export.targets 없음 또는 형식 문제")
        const states = statesOf(cwd, config, args[0])
        if (states.length === 0) return fail(`${args[0]}: export.targets 에 없음`)
        for (const s of states)
          console.log(
            `${s.id} (${s.path} → ${s.repo}) 마지막 원본 ${short(s.lastSource)} · 미반영 ${s.pending ?? "?"} · 버전 ${s.version ?? "-"}`,
          )
        return 0
      },
      data: (args, ctx) => statesOf(ctx.cwd, ctx.config, args[0]),
    },
  },
  status: {
    sections: {
      targets: {
        describe: "export 대상 (마지막 내보낸 원본 커밋 · 미반영 커밋 수)",
        schema: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              path: { type: "string" },
              repo: { type: "string" },
              tag: { type: ["string", "null"] },
              version: { type: ["string", "null"] },
              lastSource: { type: ["string", "null"] },
              pending: { type: ["integer", "null"] },
            },
          },
        },
        collect: (ctx) => statesOf(ctx.cwd, ctx.config, undefined),
      },
    },
    summary: (ctx) =>
      statesOf(ctx.cwd, ctx.config, undefined)
        .filter((s) => (s.pending ?? 0) > 0)
        .map((s) => `export ${s.id} 미반영 ${s.pending} 커밋`),
  },
  rules: [
    { id: "export/target-missing", why: "export.targets 의 path · include 원본이 있다" },
    { id: "export/version-format", why: "export version 파일 = MAJOR.MINOR.PATCH 한 줄" },
  ],
  skills: ["skills/gnam-export"],
  agentsMd: "agents.md",
})
