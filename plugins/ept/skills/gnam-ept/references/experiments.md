# ept — agent workflow 실험 기록

GNAM을 별도 스킬로 나누지 않고 제품의 plan/impl/merge·일반 작업 run·ept 기록을 구분한다. 설계·실행은 multi-agent/workflows/experiment.md, 기록과 형식 검사는 GNAM 소유. 일반 run 통계에 실험을 섞지 않는다.

## 보관과 검사

`experiments/agent-workflows/<id>/record.json`과 같은 실험 폴더의 증거 파일을 Git에 보관한다. 템플릿 소유 SCOPE 밖의 앱 고유 기록이다. 전체 transcript나 비밀정보 대신 실제 전달 prompt·입력·출력·검증의 필요한 snapshot을 보관한다. 비밀을 포함한 원본은 보관하지 않는다. 해시만으로 원문을 복원할 수 있다고 주장하지 않는다.

```sh
npx gnam run ept check experiments/agent-workflows/<id>/record.json
npx gnam verify          # 모든 record.json의 형식·참조·증거 해시 검사 (커밋 검사 포함)
```

실험 파일·증거의 추가/갱신은 `chore: <실험ID> <설계|관측|결과>`. 본문에 Goal·Scope·실험 경로·변경 이유. 제품 구현은 기존 plan/impl, 채택은 기존 merge 규약. 실험만 하면 제품 plan 불필요. 일반 run.start/end 빈 커밋이나 fit/under/over 판정으로 변환하지 않는다.
이력은 Git. events는 추기하고 오기는 changed와 참조로 정정하며 원 사건은 삭제하지 않는다. 확정 증거는 별도 파일로 저장하고 변경하지 않는다. 결론 정정은 새 커밋에 이유를 남긴다. 검사는 과거 기록 불변성·실제 권한·관측 진실·품질을 보장하지 않는다.

## record.json v1

ID는 종류별로 실험 내 유일한 비어 있지 않은 문자열. 실험 폴더명은 kebab-case. 시각은 ISO 형식. 미측정 값은 null. 아래 필드를 사용한다.

| 필드 | 내용 |
| -- | -- |
| schema_version / id / mode | 1 / 실험 ID (폴더명) / ept |
| status | proposed / ready / running / done / partial / aborted |
| request / question / hypothesis | 사용자 조건·출처 / 연구 질문 / 지지·불지지를 판단할 예상 |
| approval | proposed는 null. 나머지는 확정 조건·실행 요청의 근거. 재승인을 요구하기 위한 필드가 아님 |
| baseline | 기준 arm ID. 단독 탐색은 같은 arm을 지정하고 비교 미실시를 결론에 명시 |
| variables / controls / metrics | 변경 변수 / 고정 조건 / 평가 지표·측정 방법 (비어 있지 않은 문자열 배열) |
| limits | max_concurrency / max_attempts / max_wall_min: 양의 정수. stop: 중단 조건 |
| arms | id, structure, review, session_policy, order, isolation, exposure: 군별 구조·검토·세션·실행 순서·격리·기존 노출 (문자열) |
| tasks | id, arm, scope, completion, inputs (evidence ID 배열), depends_on (같은 arm의 task ID 배열) |
| agents | id, arm, role, parent (같은 arm agent ID 또는 null), report_to (동일), authority, session, model, effort. 마지막 3개는 미확보 시 null. root도 기록 |
| evidence | id, path (repo 상대·같은 실험 폴더 안), sha256. prompt·고정 입력·제출물·실제 응답·검증 등의 snapshot |
| events | id, at, arm, agent, task (task ID 또는 null), attempt (시도 ID 또는 null), kind, refs (앞선 event ID 배열), evidence (evidence ID 배열), note |
| results | 종료 전 빈 배열 가능. 종료 시 모든 arm에 arm, outcome, measures, evidence, limitations |
| conclusion | 종료 전 null 가능. 종료 시 decision (keep/change/inconclusive), reason, applicability, confounds |

사건 kind: assigned / dispatched / submitted / verified / accepted / rejected / blocked / changed / intervened / stopped.
submitted/verified/accepted에는 task·attempt·증거가 필요하다. accepted는 같은 arm/task/attempt의 submitted와 verified를 refs로 직접 참조한다. 검증 대상의 증거 ID·해시를 note에 명시해 작업자 보고와 독립 확인을 구분한다. 검사는 완료 경로의 존재를 확인하며 검증 의미·대상 동일성은 root가 대조한다.

limits.max_attempts는 모든 군을 합친 전체 시도 상한이다. 시도 ID는 실험 전체에서 유일하다. attempt ID는 한 업무 시도에만 사용. assigned로 시작하며 dispatched에는 실제 전달 관측을 남긴다. 재시도는 새 attempt ID로 assigned를 기록하고 refs에 이전 시도를 연결한다. parent/report_to/session의 변경은 changed에 변경 전 event·이유·새 값을 남겨 최초 배치와 실제 배치를 복원한다. 준비·기록·검수·예외 대응은 root의 intervened에 종류와 근거를 남긴다. 모든 poll을 별도 사건으로 만들 필요 없이 횟수·기간을 집계하고 근거를 보존한다.

results.outcome: done / partial / aborted / not_started. measures는 지표 이름 → 0 이상 수 또는 null. 각 arm의 최소 필드: wall_ms, agent_active_ms, root_active_ms, input_tokens, output_tokens, handoff_failures, rework_count. root 비용은 agent_active_ms에 포함하고 root_active_ms를 다시 더하지 않는다. 전체 wall은 병렬 arm 시간 합이 아니라 별도 관측. measures 추가 가능. limits 시간 단위는 분, measures 단위는 이름으로 명시한다.

done arm은 모든 task의 accepted 증거가 필요하다. 실험 status=done은 모든 arm이 done. 부분 실행·중단도 모든 arm을 적어 not_started를 누락하지 않는다. conclusion.confounds에는 순서·캐시·기존 경험·조건 변경·측정 누락을 기록 (없으면 '없음'). 성공률 등의 분모 0은 null로 두고 실측 0과 구분한다. 사용량 출처·측정 범위는 evidence/limitations에 명시. model/effort/session 필드는 요청값이고, 관측값은 증거와 사건에 별도 기록하여 불일치는 changed에 남긴다.

## 다음 판단에 연결

'누가 잘했나'보다 '어떤 조건에서 어떤 구조를 쓸까'를 결론으로 삼는다. task는 업무, attempt는 시도, agent는 책임, session은 실제 실행. 재배정·세션 교체의 대응을 events에 남긴다.
제출까지 시간·검수 대기·사람 대기·환경 장애·구조로 인한 충돌/재설명을 구분한다. 미측정 시간을 timestamp 차이만으로 활동 시간이라 부르지 않는다. 미확인 원인을 model/effort 부족으로 단정하지 않는다. reviewer 발견 수나 변경 줄 수만으로 품질을 평가하지 않는다.

공통 준비·설계·기록 비용은 한 번만 집계하고 어느 군에 귀속했는지 limitations에 명시한다. 군별 분리가 불가능한 공유 세션 사용량은 각 군에 중복 기입하지 않고 null과 공유 비용 근거를 남긴다. 하위 agent 사용량이 이미 포함된 transcript 합계를 다시 자식 비용과 더하지 않는다. 비용 전체를 측정하지 못한 비교는 관측 범위만으로 결론을 제한한다.

완료 작업의 사후 실험은 multi-agent plugin 의 replay (`.agents/skills/multi-agent/workflows/replay-experiment.md`). base/reference와 당시 입력·평가·환경·노출·결과 보존을 적은 replay-manifest.json을 evidence로 등록한다. 그 상세 내용과 Git 객체의 복원 가능성은 실행자가 확인하며 G19는 증거 파일의 존재·해시만 검사한다.
