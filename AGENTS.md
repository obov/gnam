<!-- gnam:begin -->
<!-- gnam sync 가 생성. 이 블록 안은 직접 고치지 않는다 -->

## gnam (Git-Native Agent Memory)

파일에는 현재 상태, 커밋에는 상태가 변한 이유. 규약 원본 `.agents/skills/gnam/references/index.md`

```sh
git status
npx gnam status    # 설치 · 문제 · 인계 메모 · 요청 · plan 진행 · Blocking · 미결 (경로 · --json 으로 데이터)
```

```text
커밋 형식   제목 Conventional Commits + 메시지 끝 trailer 단락 (gnam.json format 2)
커밋 종류   docs(<topic>) + Gnam: spec.<topic>.plan · feat|fix(<topic>) + Gnam: spec.<topic>.impl · docs(<topic>) + Gnam: spec.<topic>.chore
            Gnam 없음 = spec 무관 (fix · chore · build · ci · docs · test …) · refactor:  (<topic> = specs/<topic>.md, feat 는 impl 만)
            format 1 저장소는 제목 접두 spec.<topic>.<kind>: (.agents/skills/gnam/references/commits/kinds.md 'format 1 대응')
작업 순서   spec 확인 → plan 커밋 (trailer Summary: 사람용 한 줄) → 한 단위 구현 → 검증 → impl 커밋 (trailer Plan: <plan hash> <단계>)
금지        공동 작성자 줄 · squash · plan.md 같은 별도 계획 파일
강제        commit-msg hook (.githooks) · CI 는 npx gnam verify
업그레이드  npx gnam outdated → 업그레이드 명령 실행 → 출력된 이전 항목 수행 (gnam link 도 업그레이드 직후 한 번 출력)
```

### 자율 진행 (사용자 확인 없음)

```text
진행        커밋 (plan · impl · chore · refactor) · 다음 plan 착수는 확인 없이 바로. 이 규칙이 상시 커밋 요청
            "커밋할까요" · "다음 plan 착수할까요" 로 턴을 끝내지 않는다. 다음 행동이 기록 · 다음 단계면 실행
보고        요구사항 진행 상태 (된 것 · 남은 것 · 필요한 판단). git 방법 · 커밋 목록은 요청 시만
질문        요구사항 판단 (미결: · Blocking) · git 예외만 (.agents/skills/gnam/references/agent-protocol.md '사용자 소통')
```

### multirun (같은 plan 변형 실행 · 비교)

```text
흐름      gnam run multirun start <plan> -n N → Gnam: multirun.<topic>.start → 변형 세션 (clone 마다) → sync → 요약 → Gnam: multirun.<topic>.report → 사용자 결정 (Multirun: 필드) → close
스킬      .agents/skills/gnam-multirun (조정자 절차 · roles/variant.md · roles/summarizer.md). 세션 실행 harness-execute
보존      tag multirun/<run-id>/vN/… 는 지우지 않는다. close 는 보존 확인 통과 clone 만 지운다
상태      npx gnam run multirun status [<run-id>]
```

### harness (에이전트 세션 실행)

```text
스킬      .agents/skills/harness-execute (원시 동작 prepare · start · prompt · wait · read · close, adapters/)
시작 인자 bash .agents/skills/harness-execute/claude-args.sh (프로젝트 .gnam/claude-args > 전역 > 기본값)
```

### multi-agent (병렬 에이전트 작업)

```text
흐름      작업 분류 → agent-routing 배정 → Gnam: run.<topic>.start → harness-execute 실행 → 구현 · 리뷰 · 통합 (Gnam: spec.<topic>.merge) → Gnam: run.<topic>.end
스킬      .agents/skills/multi-agent · agent-routing. 세션 실행 harness-execute 는 harness plugin
상태      npx gnam run multi-agent status [<run-id>]
```

### run (에이전트 배정 · 실측 기록)

```text
chore(<topic>): … + Gnam: run.<topic>.<start|end|policy>   빈 커밋. 에이전트마다 'Agent: <이름> key=value …' 한 줄 + 'Why: <이름> <이유>' (본문)
format 1: 제목 run.<topic>.<start|end|policy>:
측정 · 집계                         npx gnam run run usage <session> · npx gnam run run stats table|health|end
규약                                .agents/skills/gnam-run/references/run.md
```

### merge (브랜치 통합 커밋)

```text
chore(<topic>): … + Gnam: spec.<topic>.merge   runner 브랜치 통합. merge 커밋에서 plan · impl · refactor 금지 (.agents/skills/gnam-merge/references/merge.md)
format 1: 제목 spec.<topic>.merge:
```

<!-- gnam:end -->
