/**
 * multirun: 같은 plan 을 N 개 clone 에서 변형 실행하고 원본 tag 로 보존 · report 로 비교한다 (specs/multirun.md).
 */
import { definePlugin } from "../../core/plugin.ts"
import { decisionProblems, MULTIRUN_SUBJECT, validateMultirun } from "./model.ts"

export default definePlugin({
  id: "multirun",
  version: "0.1.0",
  requires: ["harness"],
  kinds: [{ label: "multirun.<topic>.<start|variant|report>: …", subject: MULTIRUN_SUBJECT, validate: validateMultirun }],
  everyCommit(ctx, owner) {
    if (owner === "multirun") return []
    return decisionProblems(ctx)
  },
  rules: [
    { id: "commit/multirun-empty", why: "multirun 커밋은 빈 커밋" },
    { id: "commit/multirun-body", why: "multirun 본문 필드 (Id · Plan · Base · Start · Outcome · Variants …)" },
    { id: "commit/multirun-ref", why: "Plan · Start 가 먼저 커밋된 착수 가능 plan · 같은 topic start" },
    { id: "commit/multirun-agents", why: "변형 · 요약 세션마다 Agent 한 줄 (키 순서)" },
    { id: "commit/multirun-decision", why: "결정 커밋 Multirun: 이 report 와 그 변형을 가리킨다" },
    { id: "commit/merge-kind", why: "multirun 커밋을 merge 로 만들지 않는다" },
  ],
})
