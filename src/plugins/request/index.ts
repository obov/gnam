/**
 * request: 사용자 요청 원문 · 첨부를 빈 커밋으로 기록 (specs/request.md).
 * 검사: request 커밋 형식, 작업 커밋 (plan · spec chore · chore · refactor) 의 Request 필드.
 */
import { git } from "../../core/git.ts"
import { type CommitContext, definePlugin } from "../../core/plugin.ts"
import { linkProblems, REQUEST_SUBJECT, requestProblems } from "./model.ts"

/** Request 필드가 필요한 제목: plan · spec chore · chore · refactor (impl 은 Plan 으로 이어짐) */
const LINKED_SUBJECT = /^(?:chore|refactor|spec\.[A-Za-z0-9_-]+\.(?:plan|chore)): /

/** 그 커밋 시점 gnam.json 에 request plugin 이 있는가. hook (index) 은 지금 활성이므로 true */
function activeAt(ctx: CommitContext): boolean {
  if (ctx.view.kind === "index") return true
  const result = git(["show", `${ctx.view.sha}:gnam.json`], ctx.cwd)
  if (!result.ok) return false
  try {
    const plugins = (JSON.parse(result.out) as { plugins?: unknown }).plugins
    return Array.isArray(plugins) && plugins.some((p) => p === "@gnam/request" || p === "request")
  } catch {
    return false
  }
}

export default definePlugin({
  id: "request",
  version: "0.1.0",
  kinds: [
    {
      label: "request: …",
      subject: REQUEST_SUBJECT,
      validate: (ctx) => requestProblems(ctx),
    },
  ],
  everyCommit(ctx, owner) {
    if (owner !== "core" || ctx.merge || !LINKED_SUBJECT.test(ctx.subject) || !activeAt(ctx)) return []
    return linkProblems(ctx)
  },
})
