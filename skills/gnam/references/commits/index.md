# 커밋 형식

* [커밋 종류](kinds.md) - 제목 접두 spec.<topic>.<kind> · run.<topic>.* · release · chore · refactor 목록과 조회 명령
* [커밋 단위](commit-unit.md) - 결정 하나 또는 상태 전환 하나 = 커밋 하나. squash 금지

# 종류별

* [plan 커밋](plan.md) - spec 변경 + 구현 계획. 본문 필드 · 착수 가능 조건 · 계획 교체
* [수집 plan](collect-plan.md) - 흩어진 남은 일을 plan 하나로 모아 실행
* [impl 커밋](impl.md) - plan 실행 기록. Plan 필드 · 버그 수정 종류 · Deferred
* [spec chore 커밋](spec-chore.md) - 계획 없는 spec 정리
* [refactor 커밋](refactor.md) - 동작 유지 · 구조만 변경. Invariant 필드 · specs/ 변경 금지
* [마일스톤 종료 커밋](milestone-close.md) - 마일스톤 전체의 남은 일 회수
