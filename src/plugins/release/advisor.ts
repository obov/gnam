/**
 * 로컬 보조 판정 (release.advisor = "jev"). Breaking: 선언 없는 근거 커밋 중 호환성을 깨는 것으로 보이는 것을 경고만 한다.
 * 판정은 확률이라 검사 (commit-msg · CI) 에 쓰지 않는다. 실측 (템플릿 판 6건) 3/6 일치, 틀린 판정은 confidence ≤ 0.78.
 * jev CLI + TYPESAFEAI_API_KEY 필요. 실패하면 경고 한 줄로 알리고 넘어간다.
 */
import { exec, which } from "../../core/git.ts"
import type { Evidence } from "./model.ts"

/** 이 값 이상일 때만 경고 (실측에서 맞은 판정은 전부 0.95 이상) */
const CONFIDENCE = 0.8

const QUESTION = {
  level: {
    type: "choice",
    instructions: "이 package 를 쓰는 쪽 입장에서 이 변경의 SemVer 수준",
    criteria: {
      major: "쓰는 쪽이 코드 · 설정 · 절차를 바꿔야 한다 (호환성 깨짐)",
      minor: "기존 사용을 깨지 않고 기능을 추가한다",
      patch: "버그 수정 · 내부 변경만",
    },
  },
}

type Judge = (request: unknown) => { ok: boolean; out: string; err: string }

const jev: Judge = (request) => {
  if (!which("jev")) return { ok: false, out: "", err: "jev CLI 없음" }
  return exec("jev", ["judge"], process.cwd(), JSON.stringify(request))
}

export function adviseBreaking(evidence: Evidence[], judge: Judge = jev): string[] {
  const warnings: string[] = []
  for (const e of evidence.filter((x) => x.level !== "major")) {
    const result = judge({ model: "jev-latest", state: `${e.subject}\n\n${e.body}`, questions: QUESTION })
    if (!result.ok) return [...warnings, `jev 실패: ${result.err.trim().split("\n")[0] ?? ""}`]
    const answer = (JSON.parse(result.out) as { answers?: { level?: { choice?: string; confidence?: number } } })
      .answers?.level
    if (answer?.choice === "major" && (answer.confidence ?? 0) >= CONFIDENCE)
      warnings.push(
        `${e.hash.slice(0, 7)} 호환성 깨짐 의심 (confidence ${answer.confidence?.toFixed(2)}). 맞으면 bump <name>@major 로 올린다: ${e.subject}`,
      )
  }
  return warnings
}
