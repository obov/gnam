import { CONFIG_FILE } from "./config.ts"
import { RELEASE_TAG, normalize } from "./format.ts"
import { git, gitOrThrow, nulList } from "./git.ts"

/** push 이벤트의 검사 범위. before 가 0 (새 브랜치 · 첫 push) 이거나 저장소에 없으면 sha 의 전체 history */
export function pushRange(before: string, sha: string, exists: (rev: string) => boolean): string {
  if (before === "" || /^0+$/.test(before) || !exists(before)) return sha
  return `${before}..${sha}`
}

/**
 * 검사 경계: gnam.json 의 "format" 줄을 마지막으로 바꾼 커밋 (init · 규약 판 변경).
 * 그 이전 커밋은 gnam 도입 전이거나 이전 판 규약으로 작성됐다. 없으면 null
 */
export function boundaryOf(cwd: string, rev: string): string | null {
  const out = git(["log", "-1", "--format=%H", "-G", '"format"', rev, "--", CONFIG_FILE], cwd).out.trim()
  return out === "" ? null : out
}

/**
 * 기록 경계: gnam.json 의 "format" 줄을 처음 넣은 커밋 (init). 판 올림 (format 1 → 2) 뒤에도
 * 이전 판 커밋을 읽는다 (status · trace). 없으면 null
 */
export function firstBoundaryOf(cwd: string, rev: string): string | null {
  const out = git(["log", "--reverse", "--format=%H", "-G", '"format"', rev, "--", CONFIG_FILE], cwd).out.trim()
  return out === "" ? null : (out.split("\n")[0] ?? null)
}

/** rev-list 인자. 범위 (a..b) 는 그대로. 하나의 rev (전체 history) 는 경계 이전 커밋을 뺀다 */
export function historyArgs(range: string, boundary: string | null): string[] {
  if (range.includes("..") || boundary === null) return [range]
  return [range, "--not", `${boundary}^@`]
}

/**
 * 전체 history verify 에서 plan 의 Summary 검사 여부 (specs/human-summary.md '검사').
 * 조상 중 Summary: 가 있는 plan 커밋이 있으면 true. 그보다 앞선 plan 은 도입 전 기록이라 면제
 */
export function summaryRequirement(cwd: string, rev: string): (sha: string) => boolean {
  const out = git(["log", "--format=%H%x1f%s%x1f%b%x1e", "--grep=^Summary:", rev], cwd).out
  const plans = out
    .split("\x1e")
    .map((record) => record.trim().split("\x1f"))
    .filter(([sha, subject, body]) => sha !== undefined && sha !== "" && /^spec\.[A-Za-z0-9_-]+\.plan: /.test(normalize(subject ?? "", body ?? "").subject))
    .map(([sha]) => sha as string)
  return (sha) => plans.some((plan) => plan !== sha && git(["merge-base", "--is-ancestor", plan, sha], cwd).ok)
}

/** 커밋 하나의 검사 입력. root 는 빈 tree 대비 (--root), merge 는 첫 부모 대비 */
export function commitInput(cwd: string, sha: string) {
  const parents = gitOrThrow(["rev-list", "--parents", "-n", "1", sha], cwd).trim().split(" ").length - 1
  const message = gitOrThrow(["log", "-1", "--format=%B", sha], cwd).trim()
  const files = nulList(
    gitOrThrow(
      parents > 1
        ? ["diff", "--name-only", "-z", `${sha}^1`, sha]
        : ["diff-tree", "--root", "--no-commit-id", "--name-only", "-r", "-z", sha],
      cwd,
    ),
  )
  return { message, files, merge: parents > 1 }
}

/** 참조 조회. sha = 검사할 커밋 (CI). null 이면 hook: 새 커밋의 부모 = HEAD, 파일 = index */
export function gitLookup(cwd: string, sha: string | null) {
  const show = (hash: string, placeholder: string) => {
    const result = git(["log", "-1", `--format=${placeholder}`, `${hash}^{commit}`], cwd)
    return result.ok ? result.out.trim() : null
  }
  return {
    subjectOf: (hash: string) => show(hash, "%s"),
    bodyOf: (hash: string) => show(hash, "%b"),
    specExists: (topic: string) => git(["cat-file", "-e", `${sha ?? ""}:specs/${topic}.md`], cwd).ok,
    isAncestor: (hash: string) => git(["merge-base", "--is-ancestor", hash, sha ?? "HEAD"], cwd).ok,
    changesFiles: (hash: string) => git(["diff-tree", "--root", "--no-commit-id", "--name-only", "-r", hash], cwd).out.trim() !== "",
    released: (hash: string) =>
      git(["tag", "--contains", hash], cwd)
        .out.split("\n")
        .some((tag) => RELEASE_TAG.test(tag.trim())),
  }
}

/** git 의 기본 cleanup 과 같게 주석 줄과 scissors 이후를 버린다 */
export function cleanMessage(raw: string): string {
  const kept: string[] = []
  for (const line of raw.split("\n")) {
    if (/^# -+ >8 -+$/.test(line)) break
    if (!line.startsWith("#")) kept.push(line)
  }
  return kept.join("\n").trim()
}
