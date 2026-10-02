# 배정 정책

## 작업 분류

규모는 effort의 초기 추정, 난이도는 모델 선택의 출발점이다. 착수 전 예상 · end 의 실측 모두 같은 기준.

```text
size        S  변경 ≤ 100줄
            M  변경 ≤ 400줄 그리고 파일 ≤ 15
            L  그 이상
            변경 = 추가 + 삭제, lockfile 제외. S를 먼저 판정하고 그다음 M/L을 판정한다.

difficulty  K1  Decisions expected 0 · Scope 모듈 1 · 참조 spec 규칙에 미결: 0 · 선례 있음
            K2  Decisions expected 1 또는 Scope 모듈 2. 선례 있음
            K3  그 이상 · 새 의존 · 선례 없음
            모듈 = apps/<kind>/<name> · packages/<name>
            선례 = 같은 경로를 바꾼 impl 이 있음 (git log --oneline --grep '^spec\.' -- <Scope 경로>)
```

정책 커밋이 없을 때의 출발점. 정책 커밋이 있으면 그쪽이 우선.

```text
difficulty → 모델    K1 하위 등급 · K2 하위 등급 effort ↑ 또는 상위 등급 · K3 상위 등급
size → effort        S low · medium · M medium · high · L high · xhigh
```

plan 단계 세분화 — 예상이 M 이하 · K2 이하 · 완료: 가 실행 가능한 검증 ([plan 커밋](../../gnam/references/commits/plan.md) 착수 가능 조건 2) 이 될 때까지 나눈다.
S 보다 잘게 나누지 않는다 (에이전트마다 맥락을 다시 읽고 merge 가 늘어 비용이 더 든다).
크기 상한의 예외는 same-task-compare의 L Step이다. 화면·상호작용 전체를 함께 비교해야 해 분할하면 비교 기준을 잃는 경우에만 L로 유지하고, plan에 이유와 비교 기준을 적는다. K2 이하와 실행 가능한 완료: 조건은 그대로 적용한다.


## 적용 순서

1. 사용자 명시값을 확인한다. 같은 하네스와 모델에서 유효한 값만 전달한다.
2. 최신 run.<topic>.policy와 동일 조건의 실측을 확인한다. 없으면 위 출발점으로 배정한다.
3. size는 diff 규모의 초기 추정이다. 탐색 범위·검증 단계·맥락 복원량이 크면 effort를 함께 조정한다. 최고 단계는 자동 기본값이 아니다.
4. 실패 시 맥락·지시·환경을 먼저 확인한다. 조사·검증 부족은 effort, 충분히 검증해도 논리가 틀리면 모델 상향을 검토한다.
5. 모델·effort 변경은 실제값과 이유를 run 기록에 남긴다. 별칭만으로 제공자나 모델 판을 추정하지 않는다.

reviewer 수에 사용하는 size 정의도 이 문서가 원본이다. 코드에서의 계산은 gnam run plugin (classification.ts) 이 같은 정의를 쓴다.
fanout과 종합 runner에도 같은 정책을 적용한다. 역할만으로 sonnet/opus를 고정하지 않는다.
탐색 배정과 정책 갱신의 기록 형식은 [run](../../gnam-run/references/run.md)을 따른다.
