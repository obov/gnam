/**
 * s3: 요청 첨부를 S3 호환 저장소에 내용 주소 (sha256) 로 보관 (specs/s3.md).
 */
import { definePlugin } from "../../core/plugin.ts"
import { S3_DEFAULTS, s3ConfigProblems } from "./config.ts"

export default definePlugin({
  id: "s3",
  version: "0.1.0",
  configProblems: s3ConfigProblems,
  configDefaults: S3_DEFAULTS,
})
