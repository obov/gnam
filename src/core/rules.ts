/**
 * 코어 검사 규칙 메타 (gnam status rules). 위반 생성은 commit.ts 에 그대로 두고, id · 이유만 여기 모은다.
 * 새 규칙을 추가하면 이 표에도 추가한다 (tests/status.test.ts 가 소스의 rule id 와 대조).
 */
import type { RuleMeta } from "./plugin.ts"

export const CORE_RULES: RuleMeta[] = [
  { id: "commit/no-co-author", why: "공동 작성자 줄 금지 (하네스 trailer 포함)" },
  { id: "commit/subject", why: "제목 접두가 history 검색 키. 활성 종류 중 하나" },
  { id: "commit/merge-kind", why: "merge 커밋으로 plan · impl · spec chore · refactor 규칙을 우회하지 않는다" },
  { id: "commit/refactor-files", why: "refactor 는 specs/ 를 바꾸지 않는다" },
  { id: "commit/refactor-body", why: "refactor 본문 Goal · Scope · Invariant" },
  { id: "commit/plan-files", why: "plan 은 spec 파일 하나 또는 빈 커밋" },
  { id: "commit/plan-body", why: "plan 본문 Goal · Plan · Blocking" },
  { id: "commit/plan-summary", why: "plan 마다 사람용 한 줄 Summary (120자 이하)" },
  { id: "commit/supersedes-ref", why: "Supersedes 는 먼저 커밋된 같은 topic plan" },
  { id: "commit/gather-topics", why: "수집 plan 의 Topics 는 대표 topic 포함 · specs/ 파일 이름" },
  { id: "commit/gather-files", why: "수집 plan 은 빈 커밋" },
  { id: "commit/gather-from", why: "수집 plan 단계마다 From: 출처" },
  { id: "commit/from-ref", why: "From · Spec 은 먼저 커밋된 출처" },
  { id: "commit/impl-plan", why: "impl 본문 첫 줄 Plan: <같은 topic plan 또는 수집 plan> <단계>" },
  { id: "commit/impl-ready", why: "Blocking 이 남은 plan 은 착수하지 않는다" },
  { id: "commit/chore-body", why: "spec chore 본문 Goal · Scope" },
  { id: "commit/gnam-trailer", why: "format 2: Gnam: trailer 는 하나" },
  { id: "commit/gnam-scope", why: "format 2: Gnam: spec.<topic>.* 의 topic = 제목 scope" },
  { id: "commit/gnam-type", why: "format 2: plan · spec chore = docs, impl = feat · fix" },
  { id: "commit/impl-type", why: "format 2: impl type 이 계산한 릴리스 수준 이상 (Breaking = !, 새 합의 = feat)" },
  { id: "commit/feat-plan", why: "format 2: feat 는 impl 에서만" },
  { id: "commit/chore-scope", why: "format 2: Gnam: 없는 커밋의 scope 는 spec topic 이 아님" },
  { id: "commit/chore-spec", why: "format 2: Gnam: 없는 커밋은 specs/ 를 바꾸지 않는다" },
  { id: "commit/trailer-field", why: "format 2: 한 줄 필드는 메시지 끝 trailer 단락" },
  { id: "commit/body-markup", why: "format 2: 본문에 '#' 줄 · '---' 줄 금지 (commit-msg 만)" },
]
