import { definePlugin } from "../../core/plugin.ts"
import { collect } from "./corpus.ts"
import { search } from "./rank.ts"
import { tokenize } from "./tokenize.ts"

const USAGE = "사용: gnam run recall search <query…> [--limit N]"

export function searchCommand(args: string[], cwd: string): number {
  const at = args.indexOf("--limit")
  const raw = at >= 0 ? args[at + 1] : "10"
  const limit = Number(raw)
  const query = (at >= 0 ? [...args.slice(0, at), ...args.slice(at + 2)] : args).join(" ")
  if (!/^[1-9][0-9]*$/.test(raw ?? "") || !Number.isSafeInteger(limit)) {
    console.error(`--limit 는 양의 정수: ${raw ?? "(없음)"}\n${USAGE}`)
    return 1
  }
  if (tokenize(query).length === 0) {
    console.error(USAGE)
    return 1
  }
  const hits = search(collect(cwd), query, limit)
  if (hits.length === 0) console.log("결과 없음")
  for (const { doc, supersededBy } of hits)
    console.log(`${doc.ref}  ${doc.kind}  ${doc.title}${supersededBy === null ? "" : `  superseded by ${supersededBy}`}`)
  return 0
}

export default definePlugin({
  id: "recall",
  version: "0.1.0",
  commands: {
    search: { describe: "<query…> [--limit N]  커밋 · spec 절 · lore 항목 BM25 검색 (한글 bigram)", run: searchCommand },
  },
  agentsMd: "agents.md",
})
