# skills — plugin 이 쓰는 외부 스킬을 버전을 고정해 프로젝트에 함께 받는다

문제: plugin 에 필요한 외부 스킬을 사람마다 따로 설치해, 버전이 어긋나거나 clone 만으로는 작업 환경이 갖춰지지 않는다

plugin 이 GitHub 에 배포된 스킬에 의존할 때, `gnam plugin add` 가 그 스킬을 commit 으로 고정해 받아 **프로젝트에** 넣고 링크한다.
전역 (`~/.claude/skills` · `~/.agents/skills`) 은 건드리지 않는다. 받은 파일은 저장소에 커밋한다 (clone 만으로 복원).

## 선언 (plugin)

```js
export default definePlugin({
  id: "multirun",
  skillDeps: [{ name: "harness-execute", source: "github:obov/agent-skills/harness-execute", ref: "v1.2.0" }],
})
```

```text
name     링크 이름 (.claude/skills/<name>). 소문자 · 숫자 · -
source   github:<owner>/<repo>[/<경로>]. 경로 = 그 저장소 안의 SKILL.md 디렉터리. 없으면 저장소 루트
ref      tag · branch · commit sha. 어느 쪽이든 받은 시점의 commit 으로 잠근다
```

- `skillDeps` 형식 문제 (name 형식 · source 접두 · ref 빈 값) = plugin 문제 (pluginProblems)
- 같은 name 을 plugin 둘이 다른 source 로 선언 = plugin 문제 (add 거부)
- 같은 source 다른 ref = 먼저 잠긴 것 유지 · 경고
- gnam status 트리 plugin 객체에 `skillDeps` (name · source · ref)

## 잠금 (gnam.json)

```json
{
  "skills": {
    "harness-execute": {
      "source": "github:obov/agent-skills/harness-execute",
      "ref": "v1.2.0",
      "commit": "<40자 sha>",
      "sha256": "<64자 hex>",
      "by": ["multirun"]
    }
  }
}
```

```text
commit   ref 를 해석한 commit
sha256   받은 디렉터리의 내용 해시. 파일마다 '<sha256(내용)>  <상대 경로>' 줄을 경로순 정렬 · 이어서 sha256
by       이 스킬을 선언한 활성 plugin id
```

- `skills` 형식 문제 (키 누락 · commit 40자 hex · sha256 64자 hex · by 빈 배열) = configProblems
- `skills` 는 plugin id 로 쓸 수 없다 (gnam.json 설정 키 충돌). plugin 문제

## 저장 · 링크

```text
.gnam/skills/<name>/             받은 스킬 디렉터리. 커밋 대상
.claude/skills/<name>            → ../../.gnam/skills/<name> (상대 symlink). 커밋 대상
.agents/skills/<name>            → ../../.gnam/skills/<name> (상대 symlink). 커밋 대상
```

- 받은 디렉터리에 SKILL.md 가 없으면 받은 파일을 지우고 거부
- `.claude/skills/<name>` 가 저장소 소유 디렉터리 (링크 아님) 면 링크 생략 · 보고 (기존 linkSkills 규칙)
- `.claude/skills` 가 `.agents/skills` 링크면 한쪽만 (기존 skillDirs 규칙)
- `.git` 디렉터리 · symlink · 특수 파일은 받지 않는다 (저장소 밖을 가리키는 링크 차단). 실행 비트는 유지

## 받기

- `git` 로 받는다 (`--filter=blob:none`). 인증은 사용자의 git 자격 (비공개 저장소 포함), 대화형 자격 입력은 끈다. 경로가 있으면 sparse checkout 으로 그 디렉터리만
- ref 해석 순서: tag → branch → commit sha (축약 가능)
- 저장소 URL = `https://github.com/<owner>/<repo>.git`. 환경 변수 `GNAM_SKILL_GIT_BASE` 가 있으면 `<base>/<owner>/<repo>.git` (테스트 · 미러)
- 받은 내용은 `.gnam/skills/` 안 임시 디렉터리에서 sha256 계산 → `.gnam/skills/<name>/` 로 교체. 실패하면 기존 디렉터리 유지
- 네트워크는 `plugin add` · `skill update` 만 쓴다. `gnam link` · `gnam verify` · commit-msg 는 쓰지 않는다

## 수명

```text
plugin add <id>        선언된 스킬 중 잠금에 없는 것만 받는다. 있으면 by 에 id 추가. init --plugins 도 같다
plugin remove <id>     by 에서 id 제거. by 가 비면 .gnam/skills/<name> · 링크 · 잠금 항목 삭제
gnam link · sync       받지 않는다. 링크만 복구 (clone 후 postinstall)
```

- 잠금은 있는데 `.gnam/skills/<name>` 이 없으면 add 가 잠긴 commit 으로 다시 받고 sha256 이 다르면 거부
- 선언의 source 가 잠금과 다르면 (plugin 이 출처를 바꿈) add 가 새 source 로 다시 받아 잠근다
- 받기가 하나라도 실패하면 gnam.json 을 바꾸지 않고, 이번에 새로 받은 디렉터리를 지운다

## 명령

```text
gnam skill list               name · source · ref · commit 7자 · by
gnam skill update [<name>…]   ref 재해석. commit 이 바뀌면 파일 diff (git diff --no-index --stat) 출력, --yes 없으면 적용하지 않는다
                              ref = 선언한 plugin 의 ref (plugins 순서로 처음 것). 선언이 없으면 잠금의 ref
gnam skill verify             디스크 내용 sha256 ↔ 잠금 대조 · 링크 확인. 불일치 = 이름 · 문제 출력 · exit 1
```

- `gnam status` problems (source install) 에 `스킬 <name>  <문제>`: SKILL.md 없음 · 내용 해시 불일치 · 선언한 활성 plugin 없음 (by 의 id 비활성) · 선언은 있는데 잠금 없음

## 범위 밖

- Deferred: GitHub 외 출처 (GitLab · 임의 git URL · npm)
- Deferred: 전역 설치
- Deferred: 스킬 사이 의존 (스킬이 다른 스킬을 요구)
