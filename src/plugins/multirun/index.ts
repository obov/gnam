/**
 * multirun: 같은 plan 을 N 개 clone 에서 변형 실행하고 원본 tag 로 보존 · report 로 비교한다 (specs/multirun.md).
 */
import { definePlugin } from "../../core/plugin.ts"
import {
  abort,
  close,
  collect,
  guarded,
  MULTIRUN_DEFAULTS,
  multirunConfigProblems,
  open,
  showStatus,
  start,
  statusData,
  summaryLines,
  sync,
} from "./commands.ts"
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
  commands: {
    start: {
      describe: "<plan> -n <N> [--model [vN=]<id>] [--effort [vN=]<e>] [--agent vN=codex]  변형 clone 준비 · start 커밋 초안",
      run: guarded(start),
    },
    sync: { describe: "[<run-id>]  clone 의 브랜치 · tag → 원본 tag multirun/<id>/vN/…", run: guarded(sync) },
    status: {
      describe: "[<run-id>]  변형별 clone · tip · variant 커밋 · sync · dirty",
      run: guarded(showStatus),
      data: (args, ctx) => statusData(args, ctx.cwd),
    },
    collect: { describe: "<run-id>  요약 세션 입력 JSON (sync 후 tag 기준)", run: guarded(collect) },
    open: { describe: "<run-id> <vN>  보존 tag 기준 detached worktree (결과 검토)", run: guarded(open) },
    close: { describe: "<run-id> [--push <remote>]  보존 확인 (G1) 후 clone · worktree 삭제", run: guarded(close) },
    abort: { describe: "<run-id>  sync 후 report 초안 (Outcome: aborted)", run: guarded(abort) },
  },
  status: { summary: (ctx) => summaryLines(ctx.cwd) },
  configDefaults: MULTIRUN_DEFAULTS,
  configProblems: multirunConfigProblems,
  skills: ["skills/gnam-multirun"],
  agentsMd: "agents.md",
  rules: [
    { id: "commit/multirun-empty", why: "multirun 커밋은 빈 커밋" },
    { id: "commit/multirun-body", why: "multirun 본문 필드 (Id · Plan · Base · Start · Outcome · Variants …)" },
    { id: "commit/multirun-ref", why: "Plan · Start 가 먼저 커밋된 착수 가능 plan · 같은 topic start" },
    { id: "commit/multirun-agents", why: "변형 · 요약 세션마다 Agent 한 줄 (키 순서)" },
    { id: "commit/multirun-decision", why: "결정 커밋 Multirun: 이 report 와 그 변형을 가리킨다" },
    { id: "commit/merge-kind", why: "multirun 커밋을 merge 로 만들지 않는다" },
  ],
})
