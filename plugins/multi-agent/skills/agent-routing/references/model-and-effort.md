---
type: Reference
title: 모델과 추론 강도 선택 기준
description: 모델 ↑ 와 추론 강도 ↑ 중 무엇을 올릴지 판단하는 기준. run 커밋 분류의 배경
tags: [gnam, model, effort, multi-agent]
generated: { by: claude-code/claude-opus-5-5, at: 2026-09-26T00:00:00Z }
sources:
  - id: original
    resource: 5dda4f8:.claude/skills/gnam/references/model-and-effort-selection.md
    title: 이동 전 원본
    author: human:mark
---

# 모델과 추론 강도 선택 기준

LLM 작업에서 "더 큰 모델"과 "더 많은 추론 · 작업량" 중 무엇을 올릴지 판단하는 기준.
특정 제공자 설정법이 아니라 제공자 공통 개념 기준으로 정리. 제공자별 이름 · 기본값은 §6.
확인 시점: 2026-09.

## 1. 요약

```text
실패 원인 확인 순서: 맥락 · 프롬프트 → 작업량 부족 → 능력 부족
작업량 부족 (파일 누락 · 테스트 미실행 · 중도 포기)   → 추론 강도 ↑
충분히 조사 · 검증했는데 논리 자체가 틀림            → 모델 ↑
추론 강도 ↑ 는 단조 증가 아님. 과도하면 품질 하락 (과잉 사고)
단발 작업의 재시도 = 강도 먼저. 반복 운영 워크로드 = 평가 (eval) 로 조합 결정
```

## 2. 두 축의 정의

| 축 | 결정하는 것 | 바꿀 때 변하는 것 |
| --- | --- | --- |
| 모델 | 능력 상한. 학습으로 고정된 가중치 | 어려운 추론 · 모호한 요구 해석 · 도메인 지식 |
| 추론 강도 (effort · reasoning effort · thinking level) | 같은 모델이 실제로 쓰는 작업량 | 사고 토큰 길이, 도구 호출 수, 탐색 파일 수, 검증 단계 수 |

공통 사항

- 세 주요 제공자 모두 추론 강도를 이산 단계 (low · medium · high 등) 로 노출
- 추론 강도 = 엄격한 토큰 한도 아님. 행동 신호. 낮은 단계에서도 어려운 문제에는 일부 사고 발생
- 일부 제공자는 추론 강도가 사고 토큰뿐 아니라 도구 호출 수 · 응답 길이 · 설명량에도 영향 (Anthropic). 다른 제공자는 주로 추론 토큰 기준으로 설명 (OpenAI · Google)

## 3. 어느 쪽을 올릴지 판단

### 3.1 먼저 확인: 맥락 · 프롬프트

두 제공자 문서 공통 권고: 모델 · 강도 조정 전에 입력 품질 확인.

- 필요한 파일 · 문서가 맥락에 있었는가
- 목표 · 제약 · 출력 형식이 명시되었는가

OpenAI 는 추론 강도를 "품질 회복의 1차 수단이 아닌 조정 손잡이" 로 규정. 1차 수단 = 명확한 목표, 강한 제약, 명시적 출력 계약.

### 3.2 진단 질문

| 질문 | 아니오 → | 예 → |
| --- | --- | --- |
| Q1. 필요한 정보를 충분히 확인했는가 | 강도 ↑ | Q2 |
| Q2. 테스트 · 검증을 수행했는가 | 강도 ↑ | Q3 |
| Q3. 대안을 비교했는가 | 강도 ↑ | Q4 |
| Q4. 충분히 조사 · 검증했는데도 결론이 틀렸는가 | 원인 재검토 (맥락 · 과잉 사고) | 모델 ↑ |

한 줄 판단

```text
몰라서 틀림          → 모델 ↑
덜 찾고 덜 검증해서 틀림 → 강도 ↑
```

### 3.3 연구 근거: 추론 연산이 모델 크기를 대신하는 조건

Snell et al. (2024) 결과

- 문제 난이도에 맞춰 추론 시점 연산을 배분하면 best-of-N 대비 4배 이상 효율
- 작은 모델이 이미 어느 정도 맞히는 문제 (non-trivial success rate) 에서는 추론 연산 추가로 14배 큰 모델을 넘어섬
- 추론 연산 전략의 효과는 문제 난이도에 크게 좌우

실무 해석

```text
작은 모델이 가끔이라도 맞히는 문제 → 강도 ↑ 로 해결 가능성 높음
작은 모델이 거의 못 맞히는 문제   → 강도 ↑ 효과 제한. 모델 ↑
```

§3.2 의 "몰라서 vs 덜 해서" 구분과 같은 결론을 실험으로 뒷받침.

## 4. 올리는 순서

출처마다 권장 순서가 다름. 상황별로 구분.

| 상황 | 권장 순서 | 근거 |
| --- | --- | --- |
| 대화형 단발 작업 (코딩 에이전트에서 한 작업이 막힘) | 현재 모델 강도 ↑ → 그래도 실패하면 모델 ↑ | Anthropic 비용 글: 강도 한 단계 ↑ 비용 < 모델 교체 비용. 같은 문제로 최고 강도에서 2회 실패 시 모델 교체 |
| 반복 운영 워크로드 (API · 배치 · 제품 기능) | 가장 강한 모델에서 시작 → 평가로 품질 유지 확인하며 강도 · 모델 ↓ | Anthropic 모델 선택 글: 상위 모델이 더 적은 단계로 끝나 전체 비용이 낮을 수 있음 |
| 대량 요청 · 비용 최우선 | 약한 모델 먼저 → 품질 판정 → 실패분만 강한 모델로 (cascade · routing) | FrugalGPT: 최고 단일 모델 성능 유지하며 최대 98% 비용 절감. RouteLLM: 일부 조건에서 비용 2배 이상 절감 |

공통 조건

- 단계 전환 기준은 감이 아니라 측정 (자체 eval, 실패 재현)
- cascade 는 결과 품질 판정이 문제 풀이보다 쌀 때만 성립
- 모델을 바꾸면 이전 모델의 강도 설정을 그대로 쓰지 않고 다시 측정 (Anthropic 문서 명시)

## 5. 추론 강도의 한계: 과잉 사고

추론 강도 ↑ 가 항상 품질 ↑ 는 아님. 제공자 문서와 독립 연구 모두 확인.

- Ghosal et al. (NeurIPS 2025): 사고 길이를 늘리면 처음엔 정확도 ↑ 후 하락. 추가 사고가 실제 추론 개선보다 출력 분산 증가에 가까움. 같은 예산이면 병렬 사고 (여러 독립 추론 + 다수결) 가 긴 단일 사고보다 최대 20% 높은 정확도
- "When More Thinking Hurts" (2026): 높은 예산에서 한계 이득 급감. 긴 추론 중 이미 맞은 답을 버리는 현상
- OpenAI 문서: 높은 강도는 자동으로 더 낫지 않음. 측정된 품질 이득이 지연 · 비용을 정당화할 때만 ↑
- Anthropic 문서: 최고 단계는 대부분 작업에서 비용 대비 이득 작음. 구조화 출력 등 일부 작업에서 과잉 사고 유발

실무 기준

```text
최고 단계 = 기본값 아님. 측정으로 여유 (headroom) 가 확인될 때만
강도 ↑ 후에도 같은 오답 반복 → 강도 더 ↑ 대신 모델 ↑ 또는 병렬 시도 · 검증 단계 추가
```

## 6. 제공자별 명칭 · 기본값 (2026-09 확인)

| 제공자 | 파라미터 | 단계 | 기본값 | 문서 권고 요약 |
| --- | --- | --- | --- | --- |
| Anthropic | `output_config.effort` | low · medium · high · xhigh · max | 모델별. 대부분 high, 일부 medium | 작업 난이도별 동적 조정. 모델 변경 시 강도 재측정 |
| OpenAI | `reasoning.effort` | none · minimal · low · medium · high · xhigh · max (모델별 부분 지원) | 모델별. 다수 medium | 조정 손잡이로 취급. 1차 수단은 프롬프트. 측정 이득이 있을 때만 ↑ |
| Google | `thinking_level` (구 `thinking_budget`) | minimal · low · medium · high (모델별) | 다수 medium | 사실 조회 · 분류 = low, 비교 · 창작 = medium, 고급 코딩 · 수학 · 다단계 계획 = high. 비용 절감은 출력 토큰 한도 대신 thinking_level ↓ |

기본값 · 단계는 모델 판마다 바뀜. 적용 전 해당 문서 재확인.

## 7. 의사결정표

| 상황 | 모델 | 추론 강도 |
| --- | --- | --- |
| 단순 · 반복 작업, 하위 에이전트 조회 | 낮게 | 낮게 |
| 쉬운 문제지만 꼼꼼한 검증 필요 | 낮게 · 중간 | 높게 |
| 어려운 추론, 작업 범위 작음 | 높게 | 중간 |
| 복잡한 문제 + 대규모 탐색 · 검증 | 높게 | 높게 |
| 파일 · 테스트 누락으로 실패 | 유지 | ↑ |
| 충분히 조사했는데 해결책 자체가 틀림 | ↑ | 유지 |
| 강도 ↑ 후 같은 오답 반복 | ↑ | 유지 또는 병렬 시도 |
| 지연 민감 · 대량 요청 | 낮게 (필요 시 cascade) | 낮게 |

## 8. 저장소 적용

multi-agent 배정에 이 기준을 쓰는 형식 · 분류 (size S/M/L → effort, difficulty K1–K3 → 모델) · 판정 (cause · verdict) 은
[run 커밋](../../gnam-run/references/run.md). §3.2 진단 질문이 end 의 `cause` 값 (effort · capability) 이 된다.

## 9. 출처

제공자 문서

1. Anthropic, Choosing a Claude model and effort level in Claude Code. https://claude.com/blog/claude-model-and-effort-level-in-claude-code
2. Anthropic, Claude models explained: choosing the best model for your use case. https://claude.com/blog/claude-models-explained-choosing-the-best-model-for-your-use-case
3. Anthropic, What a task costs on Opus 5.5. https://claude.dev/blog/what-a-task-costs-on-opus-5-5/
4. Anthropic, Effort (API 문서). https://platform.claude.com/docs/en/build-with-claude/effort
5. OpenAI, Reasoning models (API 문서). https://developers.openai.com/api/docs/guides/reasoning
6. Google, Gemini thinking (API 문서). https://ai.google.dev/gemini-api/docs/thinking

연구

7. Snell, Lee, Xu, Kumar (2024). Scaling LLM Test-Time Compute Optimally can be More Effective than Scaling Model Parameters. https://arxiv.org/abs/2408.03314
8. Ghosal et al. (2025, NeurIPS). Does Thinking More always Help? Mirage of Test-Time Scaling in Reasoning Models. https://arxiv.org/abs/2506.04210
9. When More Thinking Hurts: Overthinking in LLM Test-Time Compute Scaling (2026). https://arxiv.org/abs/2604.10739
10. Chen, Zaharia, Zou (2023). FrugalGPT: How to Use Large Language Models While Reducing Cost and Improving Performance. https://arxiv.org/abs/2305.05176
11. Ong et al. (2024). RouteLLM: Learning to Route LLMs with Preference Data. https://arxiv.org/abs/2406.18665
