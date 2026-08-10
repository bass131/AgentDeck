# M01 Phase 5 — 발화 실측

## Phase 5 — 발화 실측 · 태그: `verify` · 의존: Phase 4

**목표**: 켜진 훅이 실제 세션에서 기대대로 발화한다는 것이 로그로 증명된다. 문서에 적힌 설계가 아니라 이 세션의 session_id가 찍힌 hook-log 줄이 증거다.

Steps

1. 새 세션을 연다. 이 Phase는 반드시 Phase 4와 다른 세션에서 수행한다 — 병합한 세션이 자기 훅을 검사하면 활성화 시점이 섞인다.
2. 아래 프로브 체크리스트를 위에서부터 한 행씩 실행한다. 각 행의 합성 입력을 그대로 넣고 나온 판정을 기대 판정과 대조한다.
3. 행마다 hook-log에 이번 세션의 session_id로 기록이 남았는지 확인한다. 판정이 맞아도 로그가 없으면 그 행은 불통과다.
4. 불일치가 나오면 그 행의 복구 절차를 밟고 재프로브한다.

프로브 체크리스트

| # | 합성 입력 | 기대 판정 | 불일치 시 복구 절차 |
|---|---|---|---|
| 1 | 새 세션 기동 (SessionStart) | start-brief가 생존 문서 네 종을 실존으로 브리핑하고, 로그의 `source`가 `resume`이 아니다 | gate-config의 두 포인터가 실제 파일을 가리키는지 확인하고, 결손 항목의 절 제목 형식을 템플릿과 대조한다 |
| 2 | 메인 세션이 `02_Project` 아래 파일을 Edit | role-gate가 deny한다 | role-gate의 허용 디렉터리 목록과 메인 판정 신호를 확인한다. 메인이 워커로 오분류되면 이 행이 allow로 샌다 |
| 3 | Task 도구로 워커 스폰 | plan-gate가 allow한다 (무출력, 종료 코드 0) | 반려 사유 문자열을 읽고 해당 판정(필수 절·태그 표기·검증 기록·결정 대장·Phase 수)을 계획 문서에서 고친다 |
| 4 | Task로 스폰된 워커가 `01_Milestones` 밖 파일을 편집 | role-gate가 allow한다. 워커 판정 신호는 훅 입력의 `agent_id`다 | 훅 입력 페이로드를 덤프해 `agent_id` 필드 실존을 확인한다. 필드가 없으면 Claude Code 버전 회귀다 |
| 5 | `MOODIE_SESSION_ROLE=worker` 환경변수로 띄운 세션이 `01_Milestones` 밖 파일을 편집 | role-gate가 allow한다 | 환경변수가 자식 프로세스까지 전달되는지 확인한다. 이 탈출구는 사용자 전용이라 에이전트가 스스로 설정하면 안 된다 |
| 6 | 251줄짜리 마크다운 파일을 Write | line-limit이 초과를 알리는 피드백을 낸다. 편집 자체는 되돌리지 않는다 | 훅이 후처리 위치에 걸려 있는지, 줄 수 세는 기준이 250 초과인지 확인한다 |
| 7 | `npm test` 실행 | tdd-guard가 Green 상태를 채집해 로그에 남긴다 | 테스트 경로 접두사가 `02_project/01_testcode/`로 바뀌었는지 확인한다. Phase 4 수정표의 항목이다 |
| 8 | 계획 문서 검증 기록에 PASS 줄 추기 | pass-watcher가 마감 절차를 장전한다. 리셋 상태 파일은 생기지 않는다 | 리셋 장전 세 줄이 남아 있으면 소거가 덜 된 것이다. Phase 4 수정표를 다시 밟는다 |
| 9 | 세션 Stop 시도 (pin 미갱신 상태) | stop-gate가 차단한다. work-pin에 마감 요약과 스탬프를 넣은 뒤 재시도하면 통과한다 | 차단이 안 되면 stop-gate가 settings에 등록되지 않은 것이다. 등록 경로를 확인한다 |
| 10 | 두 세션이 동시에 상태 파일에 쓰기 | 각 세션의 기록이 서로를 덮어쓰지 않는다 (스코프 무손실) | 나중 쓰기가 앞선 기록을 지우면 last-write-wins 결함이다. 그 자리에서 수리 대상으로 올린다 |

DoD

- 열 행 전건의 실제 판정이 기대 판정과 일치한다.
- hook-log에 이번 세션의 session_id로 각 훅당 최소 한 건의 기록이 있다. 다른 세션의 기록으로는 대신할 수 없다.
- 2·4·5행이 모두 기대대로 나온다. 이 세 쌍이 메인과 워커의 구분을 증명한다.
- 10행의 동시 쓰기 프로브에서 손실된 기록이 0건이다.
- 불일치가 났던 행은 복구 후 재프로브해서 통과 줄이 남는다. 같은 행에서 FAIL이 세 번 쌓이면 전진을 멈추고 USER-INPUT 줄을 남긴 뒤 사용자 판단을 기다린다.

검증 기록

- PASS 2026-08-10T11:59+09:00 — 1행: 이 워커 세션(62b1ae37) 기동에서 start-brief가 `source":"startup"`(resume 아님)으로 발화했고 생존 문서 4종 체크가 전부 true다 — hook-log 11:54:48 줄이 증거다.
- PASS 2026-08-10T11:59+09:00 — 2행: 메인 판정 세션이 `02_Project/probe-role-gate-main.md`를 Write하자 role-gate가 `분업-1-구현-차단`으로 deny했고(roleSignal 신호-부재=메인), 파일은 생성되지 않았다 — hook-log 11:57:58 줄이 증거다.
- PASS 2026-08-10T11:59+09:00 — 3행: Agent 도구로 워커를 스폰하자 plan-gate가 `allow/통과`로 무출력 통과시켰다 — hook-log 11:58:16 줄이 증거다.
- PASS 2026-08-10T11:59+09:00 — 4행: 스폰된 워커가 `99_Others/probe-worker-edit.md`를 Write하자 role-gate가 `워커-허용`으로 allow했고, 판정 신호는 훅 입력의 `agent_id=a82f0bfca9c0cae01 · agent_type=general-purpose`다 — hook-log 11:58:22 줄이 증거이며 session은 메인과 동일한 62b1ae37로 찍힌다.
- PASS 2026-08-10T12:00+09:00 — 8행: 위 1·2·3·4·6행 PASS 추기(0→5)에 pass-watcher가 `장전/armedBy=auto`로 마감 게이트를 자동 장전했고, `reset-gate.state.json`은 생기지 않았다 — 장전은 `stop-gate.state.json`의 `sessions[62b1ae37]`에만 들어갔다.
- PASS 2026-08-10T12:02+09:00 — 7행: `npm test`(vitest run)가 410 파일·5463 테스트 통과, 실패 0으로 기준선과 동일했고 tdd-guard가 `green-채집/green-기록`으로 증거를 `tdd-guard.state.json`의 `sessions[62b1ae37].lastGreen`에 남겼다 — 테스트 경로 접두사 `02_Project/01_TestCode/`도 실측과 일치한다.
- PASS 2026-08-10T12:02+09:00 — 10행: 동시 쓰기 무손실 두 갈래로 실측했다. 실저장소 `stop-gate.state.json`에 코디네이터 세션(eaa74de0, 11:52:38 장전)과 이 세션(62b1ae37, 11:59:51 장전)의 엔트리가 동시에 살아 있어 나중 쓰기가 앞선 기록을 지우지 않았고, 미러에서 돈 race-scoping 러너의 `green`·`solo` 대본이 둘 다 exit 0(레이스 재현 0/3)이다.
- USER-INPUT 2026-08-10T12:20+09:00 — 5행 보류: `MOODIE_SESSION_ROLE=worker` 설정은 헌법 9조상 사용자 전용이라 워커가 직접 프로브할 수 없다. 코디네이터 경유로 사용자 직접 실행을 요청해 12:03부터 12:19까지 hook-log를 폴링했으나 env 신호 줄이 0건이었고, 코디네이터 판단으로 보류한다 — 사용자가 실행하면 코디네이터가 hook-log의 role-gate `allow` 줄(roleSignal이 `env:MOODIE_SESSION_ROLE=worker`)로 검증해 마감한다.
- PASS 2026-08-10T12:21+09:00 — 프로브 산출물 정리: `99_Others/probe-worker-edit.md`와 `99_Others/probe-251-lines.md`를 단건 `rm`으로 지웠고, 2행 프로브 대상은 deny되어 애초에 생성되지 않았다 — `git status`의 변경은 `01_Work_Pin.md`와 `05_Phase_5.md` 둘뿐이다.
- PASS 2026-08-10T12:22+09:00 — 9행 차단측: pin 미갱신 상태로 세션 Stop을 시도하자 stop-gate가 `block/마감-요약-미실측`으로 막고 3줄 작성을 지시했다 — hook-log 12:21:32 줄(장전 12:21:30 > 스탬프 12:16:06, 차단 1/3)이 증거다. 통과측은 아래 pin 갱신 뒤 이 세션의 다음 Stop에서 `allow/마감-요약-실측` 줄로 남는다.
- PASS 2026-08-10T11:59+09:00 — 6행: 251줄짜리 `99_Others/probe-251-lines.md` Write에 line-limit이 `발화`로 「251줄 > 상한 250줄」 피드백을 냈고 파일은 되돌려지지 않았다 — hook-log 11:58:41 줄이 증거다.
- PASS 2026-08-10T12:24+09:00 — 코디네이터 감사: 9행 통과측 `allow/마감-요약-실측` 줄(12:23:13)을 hook-log에서 실물 확인했고, 훅 7종 전부가 워커 세션 id로 발화(계 30건), 프로브 잔존물 0건, reset-gate 상태 파일 부재, 워커 모델 영수증 84턴 전량 claude-opus-5·effort high를 대조했다. 남은 것은 5행 하나이며 위 USER-INPUT 줄이 소유한다.
- PASS 2026-08-10T12:30+09:00 — 5행: 사용자가 직접 실행한 `MOODIE_SESSION_ROLE=worker` 세션(a8e4cc80)의 `99_Others/probe-row5.md` Write에 role-gate가 `워커-허용`으로 allow했고 판정 신호가 `env:MOODIE_SESSION_ROLE=worker`다 — hook-log 12:27:42 줄과 실제 생성된 파일이 증거이며, 파일은 확인 후 단건 rm으로 지웠다. 이로써 열 행 전건이 기대 판정과 일치해 Phase 5 DoD가 충족됐다.
- USER-INPUT 2026-08-10T13:38+09:00 — 10행 정정 (마감 검수 후속, 사용자 판정): 위 10행 PASS의 증거는 7분 간격의 순차 기록 관찰과 직렬(spawnSync) 재현 러너에 기댄 정황 수준으로, 진짜 동시 실행에서의 무손실을 엄밀히 증명하지 못한다 — Codex 교차 검수가 지적했고 감독 세션이 러너 구조 재확인으로 사실 판정했다. 무손실이 깨진 반례는 없으며, 사용자는 재실측 대신 이 증거 한계 명시를 채택했다. 엄밀 재실측은 stop-gate 스코프 개선(Backlog 6번)과 함께 다음 하네스 수리 의제다.
