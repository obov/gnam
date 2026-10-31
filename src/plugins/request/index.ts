/**
 * request: 사용자 요청 원문 · 첨부를 빈 커밋으로 기록 (specs/request.md).
 * 검사: request 커밋 형식.
 */
import { definePlugin } from "../../core/plugin.ts"
import { REQUEST_SUBJECT, requestProblems } from "./model.ts"

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
})
