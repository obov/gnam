---
type: Reference
title: 스킬 의존
description: plugin 이 선언한 GitHub 스킬 (.gnam/skills) 의 확인 · 갱신 · 커밋. 원본 규칙은 specs/skills.md (gnam 저장소)
tags: [gnam, skills, reference]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-03T00:00:00Z }
---

# 스킬 의존

plugin 이 `skillDeps` 로 GitHub 스킬을 선언하면 `gnam plugin add` 가 ref 를 commit 으로 잠가 프로젝트에 받는다.
전역 (`~/.claude/skills` · `~/.agents/skills`) 은 건드리지 않는다.

```text
.gnam/skills/<name>/                      받은 스킬. 커밋 대상
.claude/skills/<name> · .agents/skills/<name>   → ../../.gnam/skills/<name>. 커밋 대상
gnam.json skills.<name>                   source · ref · commit · sha256 · by
```

## 명령

```bash
npx gnam skill list                    # name · source · ref · commit · by
npx gnam skill update [<name>…]        # 선언한 ref 재해석 → diff --stat. 적용은 --yes
npx gnam skill verify                  # SKILL.md · 내용 해시 · 선언 대조. 불일치 exit 1
```

`gnam status` problems 에 `스킬 <name>  <문제>` 로도 나온다.

## 커밋

```text
plugin add · skill update --yes 뒤    .gnam/skills · 링크 · gnam.json 을 한 커밋에. chore:
커밋 전                               받은 SKILL.md 와 스크립트를 읽는다 (에이전트가 따를 지시문)
.gnam/skills 아래 파일                 직접 고치지 않는다. 고치면 verify 가 해시 불일치로 막는다
```

## 문제와 처리

```text
내용 해시 불일치              로컬 수정 → git checkout -- .gnam/skills/<name>
SKILL.md 없음                git checkout 또는 gnam plugin add <선언한 plugin> (잠긴 commit 으로 복원)
선언한 활성 plugin 없음       gnam.json skills.<name>.by 의 plugin 이 꺼짐 → gnam plugin remove 로 정리
잠금 없음                     선언은 있는데 받지 않음 → gnam plugin add <plugin> 다시
'잠금 X 유지' 경고 (add 때)    plugin 들이 다른 ref 를 선언 → gnam skill update <name>
```

자격이 필요한 비공개 저장소는 사용자의 git 자격을 쓴다. 대화형 입력은 끄므로 자격이 없으면 실패로 끝난다.
