---
type: Commit Type
title: run 커밋
description: multi-agent 배정 · 실측 · 판정 기록. start · end · 분류 · 판정 · 탐색 · 정책 · 조회
tags: [gnam, commit, run, multi-agent]
generated: { by: claude-code/claude-opus-5-5, at: 2026-09-26T00:00:00Z }
sources:
  - id: gnam
    resource: 5dda4f8:.claude/skills/gnam/references/git-native-agent-memory.md
    title: Git-Native Agent Memory (분할 전 단일 문서) §2.6
    author: human:mark
---

# run 커밋 — multi-agent 배정 기록

이 형식은 **일반 작업**의 배정 기록이다. `ept` 실험은 ept plugin (`.agents/skills/gnam-ept/references/experiments.md`)의 파일 기록과 `chore:` 커밋을 사용한다. 실험군을 이 형식으로 억지 변환하지 않고 gnam run run stats 일반 배정 집계에서 분리한다.

multi-agent 로 plan 을 실행할 때 남는 meta 정보 (누구에게 어떤 모델 · effort 를 왜 배정했고, 실제로 얼마나 들었고, 배정이 맞았는가).
작업 내용은 기존대로 plan · impl · merge 커밋이 기록한다. run 커밋은 다음 배정 판단 (자원 배분) 의 근거로만 쓴다.
분류 기준의 배경은 multi-agent plugin 의 agent-routing (`.agents/skills/agent-routing/references/model-and-effort.md`).

```text
spec.<topic>.plan
  run.<topic>.start     배정한 에이전트 전부의 예상. 첫 에이전트 시작 전
    runner 브랜치의 impl 커밋들
    spec.<topic>.merge  ×N
  run.<topic>.end       에이전트 전부의 실측 · 판정. 마지막 merge 뒤, 또는 중단 시
```

```text
단위        작업 (multi-agent 실행 한 번) 당 start · end 한 쌍. 에이전트별 커밋이 아니다
파일 수     0 (빈 커밋, main). merge 로 만들지 않는다
에이전트    한 줄 'Agent: <이름> key=value …'. 본문 마지막 문단에 모으고 그 문단에는 Agent 줄만
            git 검색이 줄 단위라 여러 조건을 한 정규식으로 건다. %(trailers:key=Agent) 로도 읽힌다
키 순서     role from step model effort size difficulty explore session est_min est_out firstpass retries blocked
            cause noise verdict lines active_min out impl_min impl_out wall_min input cache_write cache_read
            requests api_errors harness area. 적는 키만 이 순서로 (commit-msg 검사)
이유        에이전트마다 'Why: <이름> <이유>' 한 줄 (start: 배정 이유, end: 판정 이유). reviewer 는 선택
reviewer    평가하지 않는다 (놓친 결함을 잴 수 없음). 비용 (active_min · out) 만 남긴다
            수는 .agents/skills/multi-agent/SKILL.md '크기' 표로 정해져 Why 불필요. 표와 다르게 배정했을 때만 Why
모델        정확한 ID (claude-opus-5-5). 별칭 (opus · sonnet) 금지 — 판이 바뀌면 다른 데이터
측정 못 한 값  na. 추정치로 채우지 않는다
```

## start

```text
run.workspace.start: S2-S3 병렬 구현

Plan: a1b2c3d S2-S3
Reference: 9f8e7d6 4c5d6e7

Why: runner-1 인터페이스 · 테스트 단언 정해짐 (K1), 예상 M → sonnet · high. 참고 run 실측 18분

Agent: runner-1 role=runner step=S2 model=claude-sonnet-5 effort=high size=M difficulty=K1 explore=no session=6f1e… est_min=20 est_out=150000
Agent: reviewer-1 role=reviewer step=S2 model=claude-opus-5-5 effort=medium session=0a2b…
```

```text
Plan        따르는 plan hash + 단계. 같은 topic plan 또는 이 topic 을 포함한 수집 plan
            '없음' = plan 없는 실행 (템플릿 저장소의 multi-agent workflows/clone.md). 재작업 집계에서 빠진다
Reference   추정에 참고한 run.end hash (여러 개 가능) 또는 '없음'
Notes       (선택) 특이 사항
Agent 키    role (runner · reviewer · delegator) · step · model · effort · size · difficulty · explore (yes · no)
            session (에이전트 CLI 세션 id. 모르면 na) · est_min (예상 활동 분) · est_out (예상 출력 토큰)
reviewer    role · step · model · effort · session 만. size · difficulty · explore · est_* 는 적지 않는다
```

## end

```text
run.workspace.end: S2-S3 결과

Run: 1a2b3c4
Outcome: done
Merges: 5d6e7f8 9a0b1c2

Why: runner-1 reviewer 막음 1건, 테스트 누락 → effort 부족
Why: runner-2 runner-1 이 두 번 실패해 opus 로 상향. 첫 시도 통과

Agent: runner-1 role=runner model=claude-sonnet-5 effort=high size=M difficulty=K2 explore=no firstpass=no retries=2 blocked=1 cause=effort noise=none verdict=under lines=0 active_min=31 out=210000 impl_min=22 impl_out=160000 harness=2.1.282 area=packages/workspace
Agent: runner-2 role=runner from=runner-1 model=claude-opus-5-5 effort=high size=M difficulty=K2 explore=no firstpass=yes retries=0 blocked=0 cause=none noise=api verdict=fit lines=286 active_min=14 out=95000 impl_min=12 impl_out=88000 area=packages/workspace
Agent: reviewer-1 role=reviewer model=claude-opus-5-5 effort=medium noise=none active_min=7 out=38000
```

```text
Run         run.start hash
Outcome     done · partial · aborted. 중단해도 end 를 쓴다 (빠지면 성공률이 부풀려진다)
Merges      이 run 의 merge hash 또는 '없음'
Corrects    (선택) 교정할 이전 run.end. 원래 end 는 고치지 않고, 집계는 교정 end 만 본다
Notes       (선택) 특이 사항
```

초안: `npx gnam run run stats end <run.start hash>`. start 의 에이전트마다 transcript 측정 키를 채운 Agent 줄과 추정 대비표를 출력한다.
판정 · 분류 키는 `?` 로 나오고, 채우기 전에는 commit-msg 검사가 막는다. 대비표는 커밋에 넣지 않는다.

end 의 Agent 키. start 의 에이전트는 전부 다시 적는다. 상향 (새 세션) 은 새 줄 + `from=<원래 에이전트>`.

```text
role · model · effort · explore   실제 값. model · effort 는 npx gnam run run usage 가 transcript 에서 읽는다
size · difficulty   실측 분류. size 는 npx gnam run run stats lines <merge>
firstpass    yes · no · na. 첫 보고가 조정자 검사를 통과하고 reviewer 막음 0 이면 yes
retries      반영 지시 · 검사 실패 재시도 횟수
blocked      reviewer 막음 수 (runner 줄에 적는다)
cause        실패 원인 (아래). 실패 없으면 none
noise        데이터 오염 요인 (아래). 없으면 none. 여러 개면 쉼표
verdict      배정 판정 (아래)
lines        merge 된 변경 줄 수 (npx gnam run run stats lines). merge 안 된 에이전트는 0
active_min · out   활동 분 · 출력 토큰, 세션 전체 (npx gnam run run usage)
impl_min · impl_out   구현 구간만. '리뷰 결과 반영 지시' 프롬프트부터 다음 '작업 지시' 전까지 (반영 · rebase) 를 뺀 값
             (roles/runner.md 템플릿 첫 줄로 구분). 추정 (est_*) 과 비교 · over 판정 · 추정 비율은 이 값. runner · delegator 만
선택         wall_min · input · cache_write · cache_read · requests · api_errors · harness (gnam run run usage 출력 그대로)
             area (gnam run run stats lines 출력) · session · step
reviewer     role · model · effort · noise · active_min · out (+ 선택 키). 판정 · 분류 키 (size · difficulty · explore ·
             firstpass · retries · blocked · cause · verdict · lines · impl_min · impl_out) 는 적지 않는다. gnam run run stats 판정 · 추정 비율에서 빠진다
```

## 배정 기준

배정과 분류 기준은 multi-agent plugin 사용 시 agent-routing (`.agents/skills/agent-routing/references/allocation-policy.md`)이 소유한다. 이 문서는 기록 형식과 판정을 소유한다.

## 판정 · 원인 · 노이즈

```text
cause       none        실패 없음
            context     필요한 파일 · 문서가 지시에 없었음 → 지시 보강. 모델 · effort 문제 아님
            effort      파일 누락 · 테스트 미실행 · 중도 포기 → effort ↑
            capability  충분히 조사 · 검증했는데 논리가 틀림 → 모델 ↑
            plan        완료 조건 · Scope 등 plan 결함 → 새 plan
            env         설치 · 네트워크 · 머신 → noise 도 적는다

verdict     fit    배정이 맞음. cause=none 이고 over 아님
            under  cause 가 effort · capability (배정이 낮았음)
            over   결과는 fit 인데 impl_min · impl_out 둘 다 추정 (est_min · est_out) 의 절반 미만 — 한 단계 낮은 배정으로
                   충분했을 가능성. 하나만 미만이면 fit (토큰만 적은 건 추정 오차). gnam run run stats end 대비표의 'over 후보'
            na     cause 가 context · plan · env 라 배정을 판단할 수 없음, 또는 aborted

noise       wait    사람 응답 · 권한 확인 대기
            api     API 오류 · 재시도 (gnam run run usage api_errors > 0)
            load    머신 부하 (동시 세션 · 무거운 검사)
            flaky   flaky 테스트 · 설치 실패
            human   사람이 중간에 방향을 바꿈
            rebase  병렬 merge 로 rebase 충돌
            cache   캐시 없이 시작 (토큰만 영향)
```

노이즈가 있는 줄도 지우지 않는다. 집계는 기본으로 noise=none 만 본다.

## 탐색

선택한 배정의 결과만 쌓이면 더 싼 배정이 통하는지 끝내 알 수 없다.
정책 커밋이 있으면 runner 배정 10 번 중 1 번은 정책보다 한 단계 낮은 모델 또는 effort 로 하고 `explore=yes`.
정책 커밋이 없으면 탐색 규칙 없음. same-task-compare 는 같은 작업을 두 배정으로 돌린 짝 데이터다.

## 정책 커밋

집계를 매번 하지 않도록 조합별 기본 배정을 요약한다. 급한 배정은 이 커밋 하나만 읽는다.

```text
제목    run.README.policy: <요약>
파일 수  0 (빈 커밋)
Basis   집계 명령과 범위 (npx gnam run run stats table --by size,difficulty,model --min 30)
Policy  조합별 배정 + 근거 (n · firstpass 구간 · active_min p90). 표본 기준 (--min) 을 통과한 칸만
시점    end 가 수십 건 쌓일 때 · 모델 판이 바뀔 때
```

## 조회

```bash
npx gnam run run stats table --by model,effort --where size=M,difficulty=K2   # 조합별 첫 시도 성공률 [95% 구간] · 활동 분 p50 · p90
npx gnam run run stats adopted                                                # 주로 반영된 model · effort (merge 줄 수)
npx gnam run run stats health                                                 # end 없는 start · 미측정 · 노이즈 · 판정 · 추정 정확도 · 재작업
npx gnam run run stats end <run.start hash>                                   # end 초안 + 추정 대비표
git show -s $(git log -1 --grep '^run\.[^.]*\.policy:' --format=%h)       # 최신 배정 정책
git log --oneline -E --grep '^Agent: .*model=claude-sonnet-5 .*verdict=under'   # 한 줄 조건 결합 (키 순서대로)
```

조건 여러 개는 `gnam run run stats --where` 가 키 순서와 무관하게 건다. git 정규식은 줄 안 키 순서를 따라 써야 한다.

검색은 줄 시작 (`^run\.` · `^Agent: `) 을 고정한다. 고정하지 않으면 impl 본문의 모델 언급까지 걸린다.
칸마다 표본이 작다 (1000 run 도 칸이 100개면 칸당 수십 건). 구간이 겹치는 차이는 우연일 수 있다. `--min` 미만 칸은 판단 보류.
