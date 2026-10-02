---
name: agent-routing
description: 에이전트 작업의 난이도·범위·검증량과 실측 정책으로 model·effort를 배정한다. multi-agent 착수와 실패 후 재배정에 사용한다.
---

# agent-routing

model·effort 선택의 SoT. [선택 근거](references/model-and-effort.md)와 [배정 정책](references/allocation-policy.md)을 필요에 따라 읽는다.

사용자가 지정한 값을 우선한다. 하네스·모델이 지원하는 단계인지 실행 전에 확인한다. 모델 ID와 effort가 지정되지 않았으면 정책과 같은 조건의 실측을 확인해 배정하고 이유를 기록한다. Claude 모델 ID를 Codex에 전달하지 않는다.

출력 계약: 각 역할의 하네스, 모델 ID, effort, 배정 근거, 명시값인지 기본값인지. 별칭을 썼다면 실제 해석된 모델 ID를 확인한다. 실제값을 확인할 수 없으면 요청값을 사실처럼 기록하지 않는다.

상위 multi-agent가 배정 결과를 gnam run.start에 기록하고 harness-execute에 전달한다. 배정 기록의 형식과 실측은 ../gnam-run/SKILL.md, CLI 변환은 ../harness-execute/SKILL.md가 소유한다.

ept에서는 multi-agent/workflows/experiment.md가 정한 비교 조건을 우선한다. 구조 비교의 모델·effort를 자동 변경하거나 하향 탐색하지 않는다. 요청·관측값은 GNAM 실험 기록에 남기며 일반 run 통계와 분리한다.
