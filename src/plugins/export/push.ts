/**
 * 배포 저장소 push · 태그 (specs/export.md 내보내기). force push 없음.
 *
 * 1. 배포 저장소 branch 를 refs/gnam/export-remote/<id> 로 fetch
 * 2. 로컬 배포 브랜치가 원격 끝을 포함하면 그대로, 아니면 원격 끝 위에 같은 원본으로 다시 build
 *    (원격 끝이 배포 커밋이 아니거나 더 새 원본에서 나갔으면 exit 1)
 * 3. push (fast-forward 만)
 * 4. tag: version 파일 값의 태그가 없으면 만든다. 있는데 배포 history 밖 커밋을 가리키면 exit 1
 */
import { build, gitIn, gitOk, isAncestor, resolve, sourceOf, versionAt } from "./build.ts"
import { branchOf, type ExportTarget, isVersion, tagName } from "./config.ts"

const remoteRefOf = (id: string) => `refs/gnam/export-remote/${id}`

/** ls-remote 한 ref 의 hash (태그는 peeled 커밋). 없으면 null */
function remoteRef(cwd: string, repo: string, ref: string): { sha: string; peeled: string } | null {
  const out = gitOk(cwd, ["ls-remote", repo, ref, `${ref}^{}`])
  const rows = out
    .split("\n")
    .filter(Boolean)
    .map((l) => l.split("\t"))
  const direct = rows.find(([, name]) => name === ref)?.[0]
  if (direct === undefined) return null
  return { sha: direct, peeled: rows.find(([, name]) => name === `${ref}^{}`)?.[0] ?? direct }
}

/** release: 커밋의 'Package: export:<id> <version>' 절 본문. 없으면 null */
export function releaseNotes(cwd: string, id: string, version: string): string | null {
  const result = gitIn(cwd, ["log", "--no-merges", "-E", "--grep", "^release: ", "--format=%B%x1e", "HEAD"])
  if (!result.ok) return null
  const header = `Package: export:${id} ${version}`
  for (const body of result.out.split("\x1e")) {
    const lines = body.split("\n")
    const start = lines.findIndex((l) => l.trim() === header)
    if (start < 0) continue
    const rest = lines.slice(start + 1)
    const end = rest.findIndex((l) => /^Package:[ \t]/.test(l))
    const notes = (end < 0 ? rest : rest.slice(0, end)).join("\n").trim()
    if (notes !== "") return notes
  }
  return null
}

/** 주석 태그 객체 (tagger = 원본 커밋 committer) */
function tagObject(cwd: string, commit: string, name: string, message: string, source: string): string {
  const tagger = gitOk(cwd, ["log", "-1", "--date=raw", "--format=%cn <%ce> %cd", source]).trim()
  return gitOk(cwd, ["mktag"], { input: `object ${commit}\ntype commit\ntag ${name}\ntagger ${tagger}\n\n${message}\n` }).trim()
}

export class PushError extends Error {}

/** push 결과 줄. 실패는 PushError */
export function push(cwd: string, id: string, target: ExportTarget): string[] {
  const log: string[] = []
  const branch = branchOf(id)
  let local = resolve(cwd, branch)
  if (local === null) throw new PushError(`${branch} 없음. 먼저 gnam run export build ${id}`)
  const localSource = sourceOf(cwd, local)
  if (localSource === null) throw new PushError(`${branch} 끝 커밋에 Export-Source 없음`)

  const remoteBranch = `refs/heads/${target.branch}`
  const remote = remoteRef(cwd, target.repo, remoteBranch)
  if (remote !== null) {
    gitOk(cwd, ["fetch", "-q", "--no-tags", target.repo, `+${remoteBranch}:${remoteRefOf(id)}`])
    if (!isAncestor(cwd, remote.sha, local)) {
      const remoteSource = sourceOf(cwd, remote.sha)
      if (remoteSource === null)
        throw new PushError(
          `${target.repo} ${target.branch} 끝 ${remote.sha.slice(0, 7)} 에 Export-Source 없음 (배포 저장소에 직접 커밋됨).\n` +
            "그 변경을 원본 저장소로 옮긴 뒤 배포 저장소에서 되돌린다. gnam 은 덮어쓰지 않는다",
        )
      if (resolve(cwd, `${remoteSource}^{commit}`) === null)
        throw new PushError(
          `배포 저장소의 원본 커밋 ${remoteSource.slice(0, 7)} 이 이 저장소에 없음 (shallow clone 이면 전체 history 로 다시 받는다: actions/checkout fetch-depth: 0)`,
        )
      if (!isAncestor(cwd, remoteSource, localSource))
        throw new PushError(
          `배포 저장소가 ${remoteSource.slice(0, 7)} 에서 나갔다. 내보낼 원본 ${localSource.slice(0, 7)} 의 조상이 아니다 (더 새 원본이거나 다른 갈래)`,
        )
      local = build(cwd, id, target, localSource, remote.sha).commit ?? remote.sha
      log.push(`${target.branch}: 배포 저장소 끝 ${remote.sha.slice(0, 7)} 위에 다시 build → ${local.slice(0, 7)}`)
    }
  }
  if (remote?.sha === local) log.push(`${target.branch}: 변경 없음 (${local.slice(0, 7)})`)
  else {
    const pushed = gitIn(cwd, ["push", "-q", target.repo, `${local}:${remoteBranch}`])
    if (!pushed.ok) throw new PushError(`git push ${target.branch} 실패\n${pushed.err.trim()}`)
    log.push(`${target.branch}: ${remote === null ? "새 브랜치" : remote.sha.slice(0, 7)} → ${local.slice(0, 7)}`)
  }

  if (target.tag === null) return log
  const version = versionAt(cwd, localSource, target.version)
  if (version === null || !isVersion(version))
    throw new PushError(`${target.version}: ${localSource.slice(0, 7)} 의 값 ${JSON.stringify(version)} 이 MAJOR.MINOR.PATCH 아님`)
  const name = tagName(target, version) ?? ""
  const existing = remoteRef(cwd, target.repo, `refs/tags/${name}`)
  if (existing !== null) {
    const inHistory = resolve(cwd, `${existing.peeled}^{commit}`) !== null && isAncestor(cwd, existing.peeled, local)
    if (!inHistory)
      throw new PushError(`태그 ${name} 가 배포 history 밖 커밋 ${existing.peeled.slice(0, 7)} 을 가리킨다. 덮지 않는다 (버전을 올리거나 태그를 사람이 정리)`)
    log.push(`태그 ${name} 있음 (${existing.peeled.slice(0, 7)})`)
    return log
  }
  const notes = releaseNotes(cwd, id, version)
  const object = notes === null ? local : tagObject(cwd, local, name, notes, localSource)
  const pushed = gitIn(cwd, ["push", "-q", target.repo, `${object}:refs/tags/${name}`])
  if (!pushed.ok) throw new PushError(`git push 태그 ${name} 실패\n${pushed.err.trim()}`)
  log.push(`태그 ${name} 생성 (${local.slice(0, 7)}${notes === null ? "" : ", release 절 본문"})`)
  return log
}
