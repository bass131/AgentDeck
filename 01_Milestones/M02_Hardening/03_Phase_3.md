# M02 Phase 3 — 게이트 판독·증거 강도 수리와 동시성 재실측

## Phase 3 — 게이트 판독·증거 강도 수리와 동시성 재실측 · 태그: `harness` · 의존: Phase 2

**목표**: tdd-guard의 증거 채집과 게이트 세 종의 판독이 문면 그대로의 강도를 갖고, 상태 파일 동시 쓰기가 두 모드 테스트 seam으로 결정론화된 진짜 동시 실행으로 재실측되며 손실이 확인되면 상태 저장이 수리돼 무손실이 증명된다 — 완료선 셋째 조항.

Steps

1. **Phase 2 마감·배선 인수** (인수 대조 절) — ① Phase 2 검증 기록에서 결과·세션 id·기준 HEAD를 읽는다. ② `git log`로 HEAD가 그 기준에서 전진했고 새 커밋 메시지에 `M02-P2` 토큰이 있는지 대조한다. ③ `git status`가 clean인지 확인한다. ④ hook-log에서 Phase 2 세션 id의 stop-gate 줄이 `allow`인지 눈으로 확인한다. ⑤ **배선 확인** — Phase 2가 마지막에 고친 matcher 앵커와 신설 가드 판정 로그가 실제로 살아 있는지, Bash 1건을 실행해 가드 판정 줄이 이번 세션 id로 새로 남는지 관측하고, 하드 게이트 다섯 종을 재실행해 green을 재확인한다. ⑥ 코디네이터가 같은 실물을 대조한다. 확인이 모이면 Phase 2 검증 기록에 배선 PASS·사후 게이트 PASS와 커밋·clean·정상 Stop 확인 줄을 append한다. 이어 자기 세션 id와 기준 HEAD를 읽어 둔다.
2. tdd-guard Green 판별을 수리한다 (Backlog 11번 잔여) — 단건 vitest 통과를 전체 Green으로 채집하는 fail-open을 겨누는 실패 테스트를 먼저 쓰고(Red), 전체 실행만 증거로 인정하게 수리한다. lastGreen.evidence의 ANSI 제어 문자 제거(Backlog 7번)도 Red 선작성으로 함께 수리한다.
3. stop-gate의 판정 계약을 고정해 수리한다 (Backlog 12번) — 판정은 「마감 요약 3줄의 라벨(바뀐 것·내린 결정·봐야 할 것) 실존 + 각 값 비어 있지 않음」이며, 라벨 누락·빈 값·잘못된 라벨 각각을 반려하는 픽스처를 Red로 먼저 쓴다. **동일 초 경계 픽스처 1건을 함께 둔다** — pin 스탬프가 장전 시각과 같은 초일 때 **통과**해야 한다 (현행 계약은 `stampMs >= armedMs`이며 초 단위 시각이다). pass-watcher의 세션 첫 Write 기준선 부재 무장전도 Red 선작성으로 수리한다.
4. plan-gate의 「검증 기록」 절 판독 계약을 고정해 수리한다 (Backlog 12번) — 허용 헤더를 `^검증 기록\s*$`(제목 단독 줄)로 고정하고, `검증 기록은 아직 없음` 류 위장 헤더를 반려하는 픽스처를 Red로 먼저 쓴다. partition 픽스처 3종에 사람용 개요 절을 넣어 원래 겨눴던 검사(Phase 구획·태그·검증 기록 부재)에 도달하게 한다 (Backlog 2번) — 도달 검증은 스모크로 한다.
5. pin 스탬프 비교의 세션 스코프화를 수리한다 (Backlog 6번) — 코디네이터의 pin 갱신이 워커 장전을 간섭하는 교차 세션 시나리오를 재현하는 실패 테스트를 먼저 쓰고(Red), 간섭하지 않는 설계를 정해 수리한다. 설계 판단은 결정 대장 [AI] 줄로 남긴다.
6. **seam의 선행 테스트를 구현 전에 쓴다** — Red 자격이 있는 것과 없는 것을 나눈다.
   - **구현 전 Red 3건** (현행 33·40·50에는 seam 코드가 없으므로 전부 실패한다): ① `post-read` 모드에서 read 직후 `ready.<pid>`가 생기고 `go` 출현 전까지 write가 일어나지 않는다, ② `pre-lock` 모드에서 잠금 획득 시도 **전**에 `ready.<pid>`가 생기고 `go` 출현 전까지 잠금 시도가 일어나지 않는다, ③ `go`가 오지 않으면 timeout(기본 10초) 뒤 비정상 종료한다.
   - **선행 특성화·회귀 불변식 1건** (Red가 아니다): 환경변수 미설정 시 무동작. seam이 없는 현행 코드에서도 이미 통과하므로 구현 전 Green이며, seam 도입 뒤에도 계속 통과해야 하는 회귀 불변식으로 유지한다.
7. seam을 구현해 Red 3건을 Green으로 만들고 불변식 1건의 무회귀를 확인한다 — 발동은 테스트 전용 환경변수(예: `AGENTDECK_STATE_SEAM=post-read:<장벽 디렉터리>` 또는 `pre-lock:<장벽 디렉터리>`)로만 하고 미설정이면 코드 경로가 무동작이다. **두 모드로 나누는 이유**는 교착 회피다 — 배타 잠금 아래에서 post-read 장벽을 쓰면 첫 프로세스가 잠금을 쥔 채 `go`를 기다리고 둘째는 잠금에 막혀 `ready`를 못 내 러너가 영원히 대기한다. 러너는 `spawnSync`를 비동기 `spawn` 두 건 동시 기동으로 바꾸고, 두 `ready` 관측 뒤에 `go`를 생성하며, 각 프로세스의 read 시작·잠금 획득·write 시작·rename 완료 시각을 단조 고해상도 시각으로 기록한다.
8. 동시성 충돌을 결정론적으로 재현한다 (Red) — `post-read` 모드 대본에서 Red 성립 조건은 두 가지가 함께다: 보호 없는 read→write 임계구간의 겹침 실측, 그리고 마지막-쓰기-승으로 인한 상대 세션 엔트리 손실. 프로세스 생존 구간 겹침만으로는 증거로 인정하지 않는다. 손실이 재현되는지는 실행 중 확정 항목이다 (Preview 동명 절).
9. 상태 저장을 수리하고 Green을 실측한다 — 33·40·50 공통의 상태 파일 쓰기 경로에 아래 둘 중 하나를 공유 헬퍼로 도입한다. 방식 선택 근거는 결정 대장 [AI] 줄로 남긴다.
   - 안 A 배타 잠금: 잠금 파일을 `wx` 플래그(O_EXCL)로 원자 생성해 획득하고, 획득 실패 시 재시도하며, 획득 timeout과 stale-lock 복구(잠금 파일의 나이·기록된 pid 생존 여부로 고아 판정 후 회수)를 갖춘다.
   - 안 B 원자 CAS: 상태에 버전 스탬프를 두고 「read한 버전 == 현재 파일의 버전」을 확인한 직후 원자 교체(tmp+rename)를 수행하되, 확인과 교체 사이를 잠금 또는 `wx` 생성으로 닫는다. 불일치면 재읽기 후 재시도하고, 재시도 상한과 timeout을 둔다.
   - 단순 재읽기-병합은 허용하지 않는다 — 두 프로세스가 같은 구상태를 재읽으면 다시 마지막-쓰기-승이다.
   - Green 실측은 `pre-lock` 모드 대본으로 한다. 성립 조건: 프로세스 생존 구간(잠금 대기 포함)은 여전히 겹치되, 보호 임계구간(잠금 보유 중 read→write)은 겹치지 않고(직렬화 실측), 상태 파일 전 스코프가 무손실이다.
10. 종료 순서를 지킨다 — ① 하드 게이트, ② 검증 기록 추기(관측된 결과·세션 id·기준 HEAD까지만), ③ pin 마감, ④ 마감 커밋(`M02-P3` 토큰), ⑤ `git status` clean 확인, ⑥ Stop. ④⑤⑥ 확인은 Phase 4 시작 인수 Step이 append한다.

DoD

- 각 수리 항목의 테스트가 구현 전 Red·구현 후 Green이다.
- 판독 계약 픽스처 전건(위장 헤더, 라벨 누락, 빈 값, 잘못된 라벨, partition 3종, 동일 초 경계)이 각자의 **기대 판정과 일치**한다 — 앞의 여섯은 반려, 동일 초 경계는 통과가 기대값이다.
- seam의 구현 전 Red는 3건이고 전부 구현 전 실패가 관측된다. 환경변수 미설정 무동작은 Red로 세지 않고, 구현 전 통과와 구현 후 통과가 함께 기록된 회귀 불변식으로 남는다.
- `post-read`·`pre-lock` 두 모드의 장벽 위치와 timeout 초과 실패가 각각 실측된다.
- race 러너가 `spawn` 동시 기동으로 두 프로세스를 함께 들여보내고, 산출물이 Red와 Green을 상충 없이 분리해 담는다 — Red(`post-read`): 보호 없는 임계구간 겹침 + 엔트리 손실, Green(`pre-lock`): 생존 구간 겹침 유지 + 보호 임계구간 비겹침 + 전 스코프 무손실. Green 대본이 교착 없이 완주한다.
- 상태 저장 수리가 안 A 또는 안 B 중 하나이고(단순 재읽기-병합 아님), 잠금·CAS 구간이 원자 primitive로 닫혀 있으며, 획득 timeout 값과 stale-lock 복구 절차가 구현·테스트로 실측된다. 선택 근거의 [AI] 줄이 있다.
- Phase 2 검증 기록에 배선 PASS(가드 판정 줄 새 관측 + matcher 확인)·사후 게이트 PASS와 커밋(HEAD 전진 + `M02-P2` 토큰)·clean·정상 Stop 확인 줄이 append돼 있다.
- 이 Phase의 세션 id와 기준 HEAD가 검증 기록 줄에 등재돼 있다.
- test:hooks green이고, `npm test` 기준선이 실패 0으로 유지되며, 하드 게이트 다섯 종이 전부 green이다.
- 마감 커밋·clean·정상 Stop은 이 Phase 안에서 판정하지 않는다 — Phase 4 시작 인수 Step의 확인 줄로 판정한다.

검증 기록

- PASS 2026-08-10T20:11:52+09:00 — 기동 전 plan-gate 직접 구동 영수증(Phase 3 워커용, 코디네이터 세션 eaa74de0-49ab-4e39-b734-12e4f73f93ea): 합성 스폰 입력 단독 실행, exit 0·stdout 무출력·hook-log 마지막 plan-gate 줄 verdict "allow"(판정 4종 통과, [AI] 1 등재 후에도 미발동) — 두 신호 일치, 기동 자격 확인. 코디네이터 선행 실물 대조 — Phase 2 마감 커밋 3d12777(`M02-P2` 대문자 토큰)·git status clean·stop-gate allow(세션 675d6d46, 스탬프 20:07:43 ≥ 장전 20:07:14)·`npm run test:hooks` 코디네이터 직접 재구동 러너 일곱 종 전부 통과에 기대-실패 플래그 잔여 0건·settings matcher `^Bash$` 실물·Phase 1 인수 확인 줄(19:46:00)과 Backlog 관찰 3건(2~4번) 실존 확인.
- PASS 2026-08-10T20:20:00+09:00 — Step 1 인수 집행(워커 세션 ea20b671-a046-4a29-8186-928f73b9d8d4, 기준 HEAD 3d1277727d789499879a81a4f9559807200a75e4): 절차 ①~⑤를 집행해 배선 PASS·사후 게이트 PASS·커밋·clean·정상 Stop 확인 줄 두 개를 02_Phase_2.md 검증 기록에 append했다. 배선 관측은 settings PreToolUse[0] matcher 실물 `^Bash$`와 이 세션 Bash 실행마다 새로 쌓이는 cmd-guard 판정 줄(session ea20b671, 20:17:11 시작)이고, 하드 게이트 다섯 종 재실행은 전부 exit 0이다. 역할 신호는 `agent_type=worker`로 실려 role-gate가 워커-허용을 냈다.
- PASS 2026-08-10T20:28:00+09:00 — Step 2 tdd-guard Green 판별 Red→Green: `tdd-green-evidence.test.mjs`를 구현 전에 두고 실행해 통과 3·실패 6(GE-02 단건 파일 실행·GE-03 이름 필터·GE-04 파이프 절단·GE-05 test:hooks가 전부 green-기록으로 오채집, GE-06b·c 증거에 ANSI 혼입)을 Red로 관측했고, 33_tdd-guard에 전체 실행 판별(`npm test`·`npm run test`·`(npx) vitest run` + 출력 형태 인자만 허용, 파이프·리다이렉트·명령 치환은 판정 불능)과 ANSI 제거를 넣어 같은 러너가 통과 9·실패 0이 됐다.
- PASS 2026-08-10T20:38:00+09:00 — Step 3·5 게이트 판독 계약 Red→Green: `gate-readout.test.mjs`를 구현 전에 두고 실행해 통과 6·실패 6(SG-02 라벨 누락·SG-03 빈 값·SG-04 잘못된 라벨이 전부 allow, PS-01 타세션 pin 갱신이 allow, PW-01·PW-01b 세션 첫 Write 무장전)을 Red로 관측했다. 동일 초 경계(SG-05)는 구현 전에도 allow로 기대값과 일치했고 수리 후에도 그대로다. 수리는 stop-gate의 마감 요약 3줄 계약(라벨 3종 실존 + 값 비어 있지 않음, 절 추출을 헤더 경계 기준으로 교체)과 pass-watcher의 기준선 부재 보수적 장전(PASS 실존 시 장전, PASS 0건은 종전대로 무장전), 그리고 pin 갱신 증인 귀속이며 같은 러너가 통과 13·실패 0이다.
- PASS 2026-08-10T20:36:00+09:00 — Step 4 plan-gate 절 판독 계약 Red→Green: `plan-record-header.test.mjs`를 구현 전에 두고 실행해 통과 6·실패 5(PR-01·PR-01b 위장 헤더 `검증 기록은 아직 없음`이 allow, PR-02b·03b·04b partition 3종이 사람용 개요 반려에서 먼저 걸려 원래 검사에 미도달)를 Red로 관측했다. 허용 헤더를 `^검증 기록\s*$`로 고정하고 partition 3종 Preview에 사람용 개요 절을 넣어 같은 러너가 통과 11·실패 0이며, 반려 사유 스모크로 세 픽스처가 각각 「Phase 구획이 없다」·「도메인 태그·의존성 표기 부재」·「검증 기록 절 부재」에 도달함을 확인했다.
- PASS 2026-08-10T20:40:00+09:00 — Step 6 seam 선행 테스트 Red 3건 + 불변식 1건: `state-seam.test.mjs`를 구현 전에 두고 실행해 통과 5·실패 9를 관측했고, 실패는 Red 3건에 정확히 대응한다 — ① post-read 장벽 부재(SM-01·01b·01d), ② pre-lock 장벽·잠금 획득 시각 부재(SM-02·02b·02d), ③ go 부재 timeout 비정상 종료 부재(SM-03·03b·03c). 환경변수 미설정 무동작(SM-04·04b·04c)은 구현 전 Green으로 관측돼 Red로 세지 않고 회귀 불변식으로 남긴다.
- PASS 2026-08-10T20:44:00+09:00 — Step 7 seam 구현 Green: `_lib/state-store.cjs`를 신설해 두 모드 장벽(ready.<pid> 생성 후 go 대기, timeout 초과 시 timeout.<pid> + exit 97)과 단조 고해상도 타임라인(read·lock·write·rename)을 넣고 33_tdd-guard의 상태 저장을 이 헬퍼로 옮겨, 같은 러너가 통과 14·실패 0이 됐다 — Red 3건 전부 Green이고 미설정 무동작 불변식도 무회귀다.
- PASS 2026-08-10T20:48:00+09:00 — Step 8 동시성 충돌 Red 실측: 신설 러너 `fixtures/race-concurrent/run.cjs`가 비동기 spawn 2건을 동시 기동하고 두 ready를 관측한 뒤 go를 만들어 함께 들여보냈다(readyObserved 2). `post-read` 대본에서 보호 없는 read→rename 임계구간이 31ms 겹쳤고 최종 상태 파일 생존이 `["race-concurrent-seed","race-concurrent-a"]`, 손실이 `["race-concurrent-b"]`로 마지막-쓰기-승 엔트리 손실이 함께 성립했다 — 생존 구간 겹침(84ms)만으로 성립시키지 않았다.
- PASS 2026-08-10T20:52:00+09:00 — Step 9 상태 저장 수리·Green 실측: 안 A(배타 잠금)를 33·40·50 공통 헬퍼로 도입해 잠금 파일 `wx`(O_EXCL) 원자 생성·획득 timeout 5초·stale-lock 회수(나이 15초 초과 또는 기록된 pid 사망)를 갖췄고, 세 훅에 자체 tmp+rename 경로가 남지 않음을 러너 검사로 판정했다(WR-33·40·50 각 2건). `pre-lock` 대본은 교착 없이 완주해 생존 구간 86ms 겹침·보호 임계구간 -14ms(비겹침)·전 스코프 무손실(생존 3종 + global)이고, 잠금 절차 단위 실측 7건(획득 timeout 250ms 상한 준수, 죽은 pid·나이 초과 잠금 회수 후 획득, 해제 시 잠금 파일 소멸)도 통과해 `state-race.test.mjs`가 통과 21·실패 0이다.
- PASS 2026-08-10T20:55:00+09:00 — Step 10 ① 하드 게이트 다섯 종과 npm test 차분(세션 ea20b671-a046-4a29-8186-928f73b9d8d4, 기준 HEAD 3d1277727d789499879a81a4f9559807200a75e4): typecheck:node·typecheck:web·lint·test:hooks·build 전부 exit 0이고, test:hooks는 러너 열두 종(신설 다섯 종 포함) 전부 「전부 통과」에 기대-실패 플래그 잔여 0건이다. `npm test`는 Test Files 411 passed/6 skipped·Tests 5465 passed/12 skipped·실패 0으로 기준선(실패 0)과 차분 0이다.
- PASS 2026-08-10T20:56:00+09:00 — 규율 이탈·부수 수리 자기보고 4건: ① Step 7의 seam 구현에 안 A 잠금 획득까지 함께 넣었다 — Step 7 문면의 교착 회피 근거와 Red ②(「잠금 획득 시도 전」 장벽)가 잠금의 실존을 전제하므로 잠금 없이는 Red ②를 Green으로 만들 수 없었고, Step 9는 그 위에서 stale·timeout 실측과 pre-lock Green을 완결했다. ② `post-read` 모드는 잠금을 우회하는 명시적 무보호 분기이며 이 Phase 수리 이전 33·40·50의 쓰기 의미론과 같은 경로다 — Step 8의 Red는 그 경로를 겨눈 재현이다. ③ 33_tdd-guard의 `saveOwn` 호출부 한 곳(들여쓰기가 달라 일괄 치환에서 빠진 246행)을 못 바꿔 실저장소 `tdd-guard.state.json`에 상태가 통째로 중첩되는 오염을 냈고, 호출부를 고친 뒤 상태 파일을 정상 구조로 되돌렸다(다른 세션 엔트리 4종 보존, 증거 문자열의 ANSI는 제거본으로 적었다). ④ `02_Project/01_TestCode/hooks/tdd-guard-hook-test-recognition.test.ts`의 미러에 `_lib` 복사를 더한 것은 내 헬퍼 도입이 만든 회귀(require 실패로 훅 크래시)의 수리다.
- PASS 2026-08-10T21:07:00+09:00 — Phase 4 인수 확인(워커 세션 56fabb25-7bfc-4606-b2ac-7698adbbaf20): 커밋 전진과 마감 실물이 확인됐다. HEAD가 기준 3d1277727d789499879a81a4f9559807200a75e4에서 b972fb5f9889c203bcf6dd1fe058cb72c6aba7f1로 전진했고 메시지 접두가 `feat(M02-P3)` 대문자 토큰이다. `git status`의 유일한 미추적 변경은 Phase 4 파일의 코디네이터 PASS 줄(21:01:23) 한 줄뿐이고 그 줄은 Phase 3 마감 커밋 **이후**에 쓰였다 — Phase 3 마감 시점 clean이 성립한다. hook-log의 stop-gate 줄(21:00:13, 세션 ea20b671-a046-4a29-8186-928f73b9d8d4)이 verdict `allow`·rule `마감-요약-실측`·스탬프 20:58:30 ≥ 장전 20:57:31이다. 하드 게이트 다섯 종 재실행은 전부 exit 0이고 `npm run test:hooks` 러너 열두 종 전부 「전부 통과」에 기대-실패 플래그 잔여 0건이다.
