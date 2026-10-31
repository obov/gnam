/**
 * s3: 요청 첨부를 S3 호환 저장소에 내용 주소 (sha256) 로 보관 (specs/s3.md).
 */
import { definePlugin } from "../../core/plugin.ts"
import { getCommand, putCommand, urlCommand } from "./commands.ts"
import { S3_DEFAULTS, s3ConfigProblems } from "./config.ts"

export default definePlugin({
  id: "s3",
  version: "0.1.0",
  configProblems: s3ConfigProblems,
  configDefaults: S3_DEFAULTS,
  commands: {
    put: { describe: "<file…>  올리고 첨부 줄 출력 (같은 내용은 생략)", run: (args, cwd, config) => putCommand(args, cwd, config) },
    get: { describe: "<sha256:<hex> | s3://…> [-o <path>]  내려받기 (sha256 확인)", run: (args, cwd, config) => getCommand(args, cwd, config) },
    url: { describe: "<ref> [--expires <초>]  presigned GET URL", run: (args, cwd, config) => urlCommand(args, cwd, config) },
  },
})
