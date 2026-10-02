/**
 * release: 커밋 (.agents/skills/gnam-release/references/release.md). gnam.json "release" 가 있을 때만 쓴다.
 * 검사: release 커밋 형식 · 버전, 그 밖 커밋의 대상 package version 변경 금지.
 */
import { type CommitContext, definePlugin, type GnamConfig } from "../../core/plugin.ts"
import type { Violation } from "../../core/violation.ts"
import { releaseConfigOf, releaseConfigProblems } from "./config.ts"
import { outsideProblems, RELEASE_SUBJECT, releaseProblems } from "./model.ts"
import { releaseCli } from "./release.ts"
import { releaseStates } from "./repo.ts"

const stateOf = (ctx: CommitContext) => {
  const config = releaseConfigOf(ctx.config["release"])
  return config === null ? null : releaseStates(ctx.cwd, config, ctx.view)
}

const toViolation = (p: { rule: string; why: string; current: string; fix: string }): Violation => ({
  rule: `commit/${p.rule}`,
  why: p.why,
  current: p.current,
  fix: p.fix,
})

export default definePlugin({
  id: "release",
  version: "0.1.0",
  kinds: [
    {
      label: "release: …",
      subject: RELEASE_SUBJECT,
      validate(ctx) {
        // merge 커밋 (PR 제목) 은 통합일 뿐이다. 검사 · 태그는 브랜치의 release 커밋 하나가 기준
        if (ctx.merge) return []
        const release = stateOf(ctx)
        if (release === null)
          return [
            {
              rule: "commit/release-target",
              why: "release 커밋은 gnam.json release 를 켠 저장소에서만 쓴다.",
              current: ctx.subject,
              fix: "gnam.json 에 release.targets 를 설정하거나 (.agents/skills/gnam-release/references/release.md) 제목을 chore: 로 쓴다.",
            },
          ]
        return releaseProblems(ctx.subject, ctx.body, ctx.files, release.states, release.date).map(toViolation)
      },
    },
  ],
  everyCommit(ctx, owner) {
    if (ctx.merge || owner === "release" || owner === "run") return []
    const release = stateOf(ctx)
    return release === null ? [] : outsideProblems(release.states).map(toViolation)
  },
  configProblems: releaseConfigProblems,
  commands: Object.fromEntries(
    (
      [
        ["status", "대상별 직전 release · 계산 수준 · 근거"],
        ["bump", "[<name>[@<level|X.Y.Z>]]…  package.json version 변경 + 커밋 메시지 초안"],
        ["publish", "<before> <sha>  CI (main push). release 커밋마다 태그 + GitHub Release"],
      ] as const
    ).map(([name, describe]) => [
      name,
      { describe, run: (args: string[], cwd: string, config: GnamConfig) => releaseCli(cwd, releaseConfigOf(config["release"]), [name, ...args]) },
    ]),
  ),
  skills: ["skills/gnam-release"],
  agentsMd: "agents.md",
})
