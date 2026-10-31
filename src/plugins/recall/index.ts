import { definePlugin } from "../../core/plugin.ts"
import { collect } from "./corpus.ts"
import { search } from "./rank.ts"
import { tokenize } from "./tokenize.ts"

const USAGE = "사용: gnam run recall search <query…> [--limit N]"

/** 인자 → query · limit. 틀리면 오류 메시지 */
function parseSearch(args: string[]): { query: string; limit: number } | string {
  const at = args.indexOf("--limit")
  const raw = at >= 0 ? args[at + 1] : "10"
  const limit = Number(raw)
  const query = (at >= 0 ? [...args.slice(0, at), ...args.slice(at + 2)] : args).join(" ")
  if (!/^[1-9][0-9]*$/.test(raw ?? "") || !Number.isSafeInteger(limit)) return `--limit 는 양의 정수: ${raw ?? "(없음)"}\n${USAGE}`
  if (tokenize(query).length === 0) return USAGE
  return { query, limit }
}

/** search --json 결과 */
export function searchData(args: string[], cwd: string) {
  const parsed = parseSearch(args)
  if (typeof parsed === "string") throw new Error(parsed)
  return search(collect(cwd), parsed.query, parsed.limit).map(({ doc, score, supersededBy }) => ({
    ref: doc.ref,
    kind: doc.kind,
    title: doc.title,
    score: Math.round(score * 1000) / 1000,
    supersededBy,
  }))
}

export function searchCommand(args: string[], cwd: string): number {
  const parsed = parseSearch(args)
  if (typeof parsed === "string") {
    console.error(parsed)
    return 1
  }
  const hits = search(collect(cwd), parsed.query, parsed.limit)
  if (hits.length === 0) console.log("결과 없음")
  for (const { doc, supersededBy } of hits)
    console.log(`${doc.ref}  ${doc.kind}  ${doc.title}${supersededBy === null ? "" : `  superseded by ${supersededBy}`}`)
  return 0
}

export default definePlugin({
  id: "recall",
  version: "0.1.0",
  commands: {
    search: {
      describe: "<query…> [--limit N]  커밋 · spec 절 · lore 항목 BM25 검색 (한글 bigram)",
      run: searchCommand,
      data: (args, ctx) => searchData(args, ctx.cwd),
      schema: {
        type: "array",
        items: {
          type: "object",
          properties: {
            ref: { type: "string" },
            kind: { enum: ["commit", "spec", "lore"] },
            title: { type: "string" },
            score: { type: "number" },
            supersededBy: { type: ["string", "null"] },
          },
        },
      },
    },
  },
  agentsMd: "agents.md",
})
