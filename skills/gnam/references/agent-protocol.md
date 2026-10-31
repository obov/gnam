---
type: Protocol
title: Agent 프로토콜
description: 세션 시작 · 작업 · 사용자 소통 (자율 진행) · 중단 · 재개 (인계 메모) 절차의 원본
tags: [gnam, protocol, handoff]
generated: { by: claude-code/claude-opus-5-5, at: 2026-09-26T00:00:00Z }
sources:
  - id: gnam
    resource: 5dda4f8:.claude/skills/gnam/references/git-native-agent-memory.md
    title: Git-Native Agent Memory (분할 전 단일 문서) §4
    author: human:mark
---

# Agent 프로토콜

이 절이 시작 · 작업 절차의 원본이다. 다른 문서 (`specs/README.md` · 추적 명령 문서) 는 여기를 따른다.

## 탐색과 컨텍스트 구성 의도

AGENTS.md를 읽은 에이전트는 GNAM 인덱스에서 처음 읽을 규약을 확인하고, 아래 시작 절차로 이번 작업의 맥락을 구성한다. 필수 규칙은 gnam 스킬의 자동 선택 여부에 의존하지 않는다.

```text
AGENTS.md → GNAM 인덱스 → 개요 · 커밋 종류 · 이 프로토콜
         → status · handoff · 최근 커밋 · specs · lore 인덱스
         → 관련 spec · 적용 조건이 맞는 lore · 필요한 Git history
         → 계획 · 구현 · 검증 · 커밋
```

spec · 코드 · 테스트는 현재 상태, 커밋은 변경 이유와 계획 · 대안 · 남은 일, lore는 근거가 있는 작업 노하우를 제공한다. handoff는 아직 커밋하지 못한 진행 상태만 보충한다. 전체 history나 모든 참조 문서를 처음부터 읽지 않는다.

스킬 description은 작업에 맞는 기능을 선택하는 신호다. gnam의 SKILL.md는 필요한 참조로 안내한다. 활성 plugin (gnam.json) 이 스킬을 더한다 (lore · run · multi-agent 등). 컨텍스트는 에이전트가 필요한 파일과 Git 기록을 읽으면서 구성한다. 시작 hook이 GNAM 전체를 주입하는 구조는 아니다.

hook · CI는 검사 가능한 규칙의 준수를 확인한다. 통과했다고 배경 이해까지 입증되는 것은 아니다. 저장소 AGENTS.md 의 저장소 전용 커밋 규칙이 있으면 아래 절차보다 우선한다.

## 시작

코드를 처음부터 읽지 않는다. 필요한 history만 필요할 때 읽는다.

```bash
git status
npx gnam status                   # 요약: 설치 · 문제 · 인계 메모 Next · 요청 · 진행 중 plan · Blocking · 미결 · plugin 상태
```

요약에서 이어 갈 곳을 고른 뒤 필요한 것만 읽는다.

```bash
npx gnam status handoff.content --format raw   # 인계 메모 전체 (아래 '중단 · 재개')
npx gnam status trace.topics.<topic> --format text   # topic 의 spec 표기 · plan 단계별 impl · 미해결
git log --oneline --decorate -20
cat lore/README.md 2>/dev/null    # 작업 노하우 인덱스 (lore plugin). 적용 조건이 맞는 파일만 읽는다
git show -s $(git log -1 -E --grep '^spec\.[^:]+\.chore: [A-Z][0-9]+ 완료' --format=%h)   # 직전 마일스톤 종료 — 남은 일 전체
cat specs/<topic>.md              # 현재 규칙
git log -p -- specs/<topic>.md    # 규칙이 바뀐 과정 + 당시 계획 (필요할 때만)
git log --oneline --grep '^spec\.<topic>\.plan:'   # 계획 목록 (빈 plan 커밋 포함)
git log -E --grep '^Topics:(.*[ ,])?<topic>([ ,]|$)' --oneline   # 다른 topic 에서 이 topic 을 포함한 수집 plan
git log -- <topic 관련 소스 경로>   # 아래 '소스 경로'
git show <commit>                # 결정 · 대안 · 남은 일
```

소스 경로는 가정하지 않고 실제 구조로 판단한다. 기본은 모노레포 `apps/<kind>/<name>/` · `packages/<name>/`.
시작 단계에서는 `apps/` 나 `packages/` 에 하나만 있거나 한쪽이 비어 있을 수 있다.
topic 관련 경로는 `ls apps packages` 로 구조를 보고, 그 topic impl 커밋의 변경 파일
(`git log --stat --grep='^spec\.<topic>\.impl:'`) 로 정한다.

더 깊은 추적 (줄 출처 · 개념 등장 시점 · 계획 → 실행) 은 [추적 명령](reference/git-commands.md).
요청 의도 · 반영 여부 분석과 개선안 · 후속 작업 제안은 [기록 분석](analysis.md).

## 작업

```text
1. spec 확인
2. 관련 history 확인
3. plan 커밋 (`spec.<topic>.plan:`). spec 변경 없으면 빈 커밋. commits/plan.md 착수 가능 조건 확인
4. 한 단위 구현
5. 검증
6. impl 커밋 (`spec.<topic>.impl:` + Plan 필드 + Deviation (계획과 다를 때))
7. 반복
```

커밋이 Agent 사이의 인계 지점이다.

## 사용자 소통 — 자율 진행

사용자의 관심사는 요구사항이 제대로 진행되는가다. 기록을 어떻게 남기는가 (git) 는 gnam 이 맡는 인프라다.
사용자는 git 을 몰라도 된다. 에이전트가 이 규약대로 커밋하면 무엇을 왜 했는지 전부 남는다.

```text
확인 없이 진행   plan · impl · spec chore · chore · refactor 커밋, 다음 plan 착수, 인계 메모 작성 · 삭제,
                hook · verify 가 거부한 메시지 수정 후 재커밋
                AGENTS.md 의 이 규칙이 사용자의 상시 커밋 요청이다 (하네스 기본값 "요청 시에만 커밋" 대체)
                "커밋할까요" · "다음 plan 착수할까요" 로 턴을 끝내지 않는다. 다음 행동이 기록 · 다음 단계면 보고 대신 실행
스테이징         자기 변경만 경로로 (git add <경로>). 작업 전부터 있던 미커밋 변경은 건드리지 않고 그대로 둔다. 묻지 않음
멈추고 묻기      요구사항 판단: 미결: 에 의존 · plan Blocking · 요구사항 해석이 둘 이상 (commits/impl.md)
                git 예외: 아래
보고            요구사항 기준 진행 상태 (된 것 · 남은 것 · 필요한 판단). 커밋 hash · 종류 · 순서는 요청 시만
```

git 예외 — 규약 안에서 풀리지 않거나, 되돌리기 어렵거나, 다른 작업에 닿는 경우만 묻는다.

```text
데이터 유실      미커밋 변경 폐기 (reset --hard · checkout -- · clean) · push 한 history 재작성 · force push
다른 작업 충돌    작업 전부터 있던 변경 · 다른 브랜치 · worktree 와 같은 파일이 겹쳐 분리할 수 없음
풀리지 않는 검사  hook · verify 실패가 규약대로 고쳐도 반복
push · 배포      저장소 규칙을 따른다. 규칙이 없으면 로컬 커밋까지 하고 묻지 않는다
```

### 반복 예외 → 규칙 개선

한 번 겪은 예외는 처리하고 끝낸다 (필요하면 lore 경험칙). 같은 패턴이 쌓이면 규칙으로 흡수할지 검토한다.
예외마다 plugin 을 만들지 않는다.

```text
신호       같은 원인의 예외 처리 · 수동 chore 가 반복 (기준: 3회)
확인       git log --oneline --grep '^chore:' · npx gnam run recall search <원인> (recall plugin)
흡수 순서   기존 plugin 개선 → 새 plugin (node_modules/@obov/gnam/README.md 'plugin 작성', 로컬 ./gnam-plugins/<id>)
           검사 · 명령으로 만들 수 없으면 lore · 스킬
알림       규칙 · plugin 을 바꾸면 사용자에게 한 줄: 무엇이 반복됐고 이제 무엇이 자동인지
```

## 중단 · 재개 — 인계 메모

커밋 사이에서 세션을 끊어야 할 때 (context 가 차서 clear, 세션 교체) 미커밋 상태를 인계 메모 하나에 남긴다.
커밋할 수 있는 단위면 메모 대신 커밋한다. 메모는 커밋이 담지 못하는 진행 중 상태만.

```text
위치     $(git rev-parse --git-path gnam/handoff.md)   git 디렉터리 안. 추적 안 됨 · worktree 별로 따로
개수     worktree 당 하나. 저장할 때마다 전체를 덮어쓴다. 누적 · 날짜별 파일 금지
작성     clear 직전. 다시 읽을 세션이 이 메모와 git 만으로 이어 갈 수 있게
본문     아래 필드 중 필요한 것만
삭제     다음 커밋에서 남길 내용 (Deviation · Decisions · Remaining · Deferred) 을 커밋 본문으로 옮긴 뒤
         작업 트리가 깨끗하고 남은 진행 상태가 없으면 삭제
금지     저장소 안 추적 파일 (plan.md 금지와 같은 이유). 커밋 · spec 에 이미 있는 내용 반복
```

본문 필드:

```text
Plan       따르는 plan hash + 단계 (없으면 생략)
State      끝난 것 · 진행 중인 것. 미커밋 변경 파일은 git status 가 보여 주므로 목적만
Next       재개 후 첫 행동 하나
Findings   시도 · 실패 · 가설. 커밋 Deviation · Alternatives 후보
Blocked    사람 확정을 기다리는 결정
```

```bash
f=$(git rev-parse --git-path gnam/handoff.md); mkdir -p "$(dirname "$f")"   # 저장 전
cat "$(git rev-parse --git-path gnam/handoff.md)" 2>/dev/null                 # 재개 시 (시작 절차 git status 다음)
rm -f "$(git rev-parse --git-path gnam/handoff.md)"                           # 인계 끝
```
