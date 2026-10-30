/**
 * recall 순위 (specs/recall.md 순위). BM25, 동점은 수집 순서.
 * 대체된 plan 은 점수를 바꾸지 않고 superseded by <hash> 만 붙인다.
 */
import type { Doc } from "./corpus.ts"
import { tokenize } from "./tokenize.ts"

const K1 = 1.2
const B = 0.75

export interface Hit {
  doc: Doc
  score: number
  /** 이 plan 커밋을 Supersedes: 로 가리킨 커밋 ref */
  supersededBy: string | null
}

const SUPERSEDES = /^[ \t]*Supersedes:[ \t]*([0-9a-f]{7,40})\b/gm

/** 커밋 ref → 그 커밋을 대체한 커밋 ref. hash 길이가 달라도 앞부분이 맞으면 같은 커밋 */
export function supersededMap(docs: Doc[]): Map<string, string> {
  const commits = docs.filter((d) => d.kind === "commit")
  const map = new Map<string, string>()
  for (const by of commits)
    for (const [, hash = ""] of by.text.matchAll(SUPERSEDES)) {
      const target = commits.find((d) => d.ref.startsWith(hash) || hash.startsWith(d.ref))
      if (target !== undefined && target !== by && !map.has(target.ref)) map.set(target.ref, by.ref)
    }
  return map
}

export function search(docs: Doc[], query: string, limit: number): Hit[] {
  const terms = [...new Set(tokenize(query))]
  if (terms.length === 0 || docs.length === 0) return []
  const freqs = docs.map((d) => {
    const tf = new Map<string, number>()
    const tokens = tokenize(d.text)
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1)
    return { tf, length: tokens.length }
  })
  const avgdl = freqs.reduce((sum, f) => sum + f.length, 0) / docs.length || 1
  const idf = new Map(
    terms.map((t) => {
      const n = freqs.filter((f) => f.tf.has(t)).length
      return [t, Math.log(1 + (docs.length - n + 0.5) / (n + 0.5))]
    }),
  )
  const superseded = supersededMap(docs)
  return docs
    .map((doc, i) => {
      const { tf, length } = freqs[i] ?? { tf: new Map<string, number>(), length: 0 }
      let score = 0
      for (const t of terms) {
        const f = tf.get(t) ?? 0
        if (f > 0) score += (idf.get(t) ?? 0) * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * length) / avgdl)))
      }
      return { doc, score, order: i, supersededBy: superseded.get(doc.ref) ?? null }
    })
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, limit)
    .map(({ doc, score, supersededBy }) => ({ doc, score, supersededBy }))
}
