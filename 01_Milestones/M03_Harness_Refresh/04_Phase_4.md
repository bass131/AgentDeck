# M03 Phase 4 — 헌법 개정과 역할 게이트 내림

## Phase 4 — 헌법 개정과 역할 게이트 내림 · 태그: `policy`·`harness` · 의존: Phase 3

**목표**: 승인된 2·3·9조 문안이 두 헌법 파일에 같게 반영되고, 기동 훅의 resume 문구가 새 2조와 맞으며, 역할 게이트와 스폰 자리의 계획 게이트 배선이 내려가고, 그 결과가 hook-log로 실측된다. 이 Phase가 하네스 편집의 마지막이다.

Steps

1. 인수 대조 — Phase 3의 기록 줄, `M03-P3` 토큰, `git status`, hook-log를 대조하고 확인 줄을 Phase 3 기록에 추기한다.
2. ADR-002 (워커) — `98_Management/00_ADR/`에 2·3·9조 개정과 역할 게이트 내림의 결정 기록을 쓴다. 근거로 `00_분류표.md`의 F1 실측을 싣고, 출처로 Second Brain의 2026-09-18 합의와 2026-11-10 결정 노트를 연결한다.
3. 헌법 문면 (워커) — `04_헌법-개정-문안.md`의 승인 문안을 루트 `CLAUDE.md`와 `AGENTS.md`에 같게 반영한다. 조항 번호는 바꾸지 않는다. 9~10줄의 H2 문장이 개정 뒤에도 사실인지 다시 읽고, 어긋나면 같은 편집에서 맞춘다.
4. 기동 훅 문구 — `10_start-brief.cjs` 73줄과 76줄의 문구를 문안 파일의 「함께 고치는 문면」대로 바꾼다. smoke 테스트의 문구 단정을 먼저 Red로 쓴다. 생존 문서 4종 확인과 시각·pin 주입의 동작은 바꾸지 않는다.
5. 테스트와 참조 정리 — `smoke.test.mjs`의 역할 게이트 케이스 다섯 건을 내리고, `MOODIE_SESSION_ROLE`을 읽는 분기를 `40_pass-watcher.cjs`와 테스트 헬퍼·픽스처에서 정리한다. `40_pass-watcher.cjs`의 `role` 로그 필드는 `agent_id` 유무만으로 채운다. 정리 뒤 `npm run test:hooks`가 통과해야 한다.
6. 배선 내림 (최후 구현 편집) — `settings.json`에서 역할 게이트 항목과 스폰 자리(`^(Task|Agent)$`)의 계획 게이트 항목을 지운다. `settings-matcher.test.mjs`의 단정을 같은 편집 묶음에서 맞춘다.
7. 내림 실측 (코디네이터) — 메인 세션이 `01_Milestones` 밖의 무해한 편집 한 건을 시도한다. hook-log에 그 편집의 `role-gate` 줄이 없고, 편집 경로 게이트 줄이 통과로 찍혀야 한다. 이어서 격리 미러에서 계획 문서를 치운 상태의 같은 편집이 거부되는지 본다.
8. 파일 처분 — `30_role-gate.cjs`의 삭제 명령 한 줄을 사용자에게 제시하고 사용자가 직접 실행한다. 워커와 코디네이터는 삭제를 집행하지 않고, 삭제 뒤 `npm run test:hooks`의 통과만 실측한다.
9. 종료 순서를 지킨다 — 마감 커밋의 메시지에 `M03-P4` 토큰을 넣는다. 이 뒤는 Preview의 마감 절차가 소유한다.

DoD

- 2·3·9조의 문면이 두 헌법 파일에서 같고, 승인 문안과 글자 단위로 일치한다. 조항 번호 1~10이 그대로다.
- ADR-002가 실물로 있고 출처 두 건이 연결돼 있다.
- 기동 훅 문구의 Red가 Green으로 뒤집히고, 기동 훅의 `checks` 네 항목 판정은 바뀌지 않았다.
- `settings.json`에 `30_role-gate.cjs`와 스폰 자리의 `20_plan-gate.cjs` 항목이 없고, 편집 경로 게이트 항목은 남아 있다.
- 내림 뒤 메인 세션 편집의 hook-log 줄에 `role-gate` 판정이 없고 편집 경로 게이트의 통과 줄이 있다. 계획 부재 상태의 거부 줄이 격리 미러의 로그에 있다.
- 저장소의 `.claude/hooks/`에서 `MOODIE_SESSION_ROLE`을 읽는 코드가 없다. 에이전트가 이 변수를 설정한 흔적도 없다.
- `30_role-gate.cjs`가 사용자 실행으로 삭제됐고, 그 뒤의 `npm run test:hooks`가 통과한다.
- `settings.json` 편집이 이 워커의 마지막 구현 편집이다.
- 하드 게이트 다섯 종이 통과하고 `npm test`의 실패가 0이다.

검증 기록

- (기록 없음)
- PASS 2026-11-11T07:30:34+09:00 — Step 1 인수 대조(워커 세션 b989a371-aa91-4684-be26-c1d2e4905e4f · agent_id ab8ba741bed37f0d6 · 실제 기동 모델 `claude-opus-5-5`(이 워커 transcript의 `model` 필드 전건) · 기준 HEAD 5f16298c6455a3eb94e2f1b5f16945c99df48d45): Phase 3 기록 줄, `5f16298`의 `M03-P3` 토큰, `git status`(코디네이터 미커밋 세 파일), 두 transcript의 `model` 필드, 재시험 복제본, hook-log의 장전·해제·스폰 판정 줄을 대조했고 어긋남이 없다. 확인 줄은 `03_Phase_3.md` 기록 07:23:49에 있다. 코디네이터 지시로 포함한 Backlog 11번 한 칸 수리(라우팅 정책 25줄)의 확인 줄도 같은 기록 07:24:08에 있다.
- PASS 2026-11-11T07:30:34+09:00 — Step 2 · DoD 「ADR-002가 실물로 있고 출처 두 건이 연결돼 있다」(같은 세션·agent_id·모델·기준 HEAD): `98_Management/00_ADR/ADR-002-헌법-개정과-역할-게이트-내림.md`를 ADR-001 형식으로 썼다 — 결정 넷(2조 낮춤 · 3조 보호 표면 · 계획 게이트 이동과 역할 게이트 내림 · 9조 대상 교체)과 각 대안의 기각 이유, 근거로 `00_분류표.md` F1 두 건을 hook-log 원문과 다시 대조해 실었고(1484~1486줄 `source: resume`·`verdict: allow` · 1494줄 `agent_type=fork`·`rule: 워커-허용`), 「출처」 절에 Second Brain의 2026-09-18 합의 노트와 2026-11-10 결정 노트를 경로로 연결했다.
- PASS 2026-11-11T07:30:34+09:00 — Step 3 · DoD 「2·3·9조 문면이 두 헌법 파일에서 같고 승인 문안과 글자 단위로 일치한다. 조항 번호 1~10이 그대로다」(같은 세션·agent_id·모델·기준 HEAD): 문안 파일의 개정안 인용 블록에서 `> `를 떼고 「<승인일>」을 2026-11-11로 채운 텍스트와 두 파일의 해당 조항 절을 bash `diff`로 대조해 여섯 쌍 전부 「일치」(2조 8줄 · 3조 8줄 · 9조 6줄)였고, 두 파일의 「## 조항」 절 전체 `diff`도 차분 0이며, `### ` 표제는 1~10 열 개 그대로다. `git diff -U0 HEAD -- CLAUDE.md`의 hunk는 2·3·9조 범위 안에만 있다. 9~10줄 H2 문장(「일부는 훅이 기계로 집행, 나머지는 규범」)은 개정 뒤에도 사실이라 고치지 않았다 — 3조 넷째 줄이 기계 집행분과 규범분을 스스로 가른다.
- PASS 2026-11-11T07:30:34+09:00 — Step 4 · DoD 「기동 훅 문구의 Red가 Green으로 뒤집히고 `checks` 네 항목 판정은 바뀌지 않았다」(같은 세션·agent_id·모델·기준 HEAD): `smoke.test.mjs`에 문구 단정 넷과 resume 기동의 `checks` 네 항목 참 단정 하나를 먼저 더해 `node .claude/hooks/smoke.test.mjs`가 exit 1 · FAIL 4건(머리 줄 두 건 · resume 안내 두 건)이었고, `10_start-brief.cjs` 73줄을 「재개의 정본은 문서다 (헌법 2조)」로, 76줄을 「문맥을 이어받았어도 통과 여부는 기억이 아니라 검증 기록 줄에서 다시 읽어라 (헌법 2조)」로 바꾼 뒤 exit 0으로 뒤집혔다. `git diff -U0`의 hunk는 73·76줄 두 개뿐이라 `checks` 계산·생존 문서 확인·시각·pin 주입 코드는 그대로이고, smoke의 allow·결손·resume checks 단정이 전부 ok다.
- PASS 2026-11-11T07:30:34+09:00 — Step 5 테스트와 참조 정리(같은 세션·agent_id·모델·기준 HEAD): smoke의 역할 게이트 케이스 다섯 건을 내렸고, `40_pass-watcher.cjs`의 `role`을 `input.agent_id` 유무만으로 채우며 환경변수 분기를 지웠고, 테스트 헬퍼·픽스처 여섯 곳(`smoke.test.mjs` 두 곳 · `_lib/gate-harness.mjs` · `_lib/guard-spawn.mjs` · `state-race.test.mjs` · `state-seam.test.mjs` · `fixtures/race-concurrent/run.cjs` · `fixtures/race-scoping/run.cjs`)의 `delete env.MOODIE_SESSION_ROLE`을 정리했다. 정리 뒤 `npm run test:hooks` exit 0(러너 15종 「전부 통과」). `.claude/hooks/`에 그 변수명이 남은 곳은 삭제 예정인 `30_role-gate.cjs`와 「읽지 않는다」는 `31_edit-plan-gate.cjs` 15줄 주석뿐이라, DoD 「읽는 코드가 없다」는 Step 8 삭제 뒤에 닫힌다. 이 워커의 Bash 호출 27건(hook-log cmd-guard 줄)에 그 변수·`AGENTDECK_STATE_SEAM`의 대입이나 `release` 실행은 0건이다. 저장소 안의 `30_role-gate.cjs`를 실행하거나 단정하는 테스트는 남지 않았다(`git grep` — settings-matcher의 「배선 없음」 단정만 파일명을 문자열로 쓴다).
- PASS 2026-11-11T07:30:34+09:00 — Step 6 · DoD 「`settings.json`에 `30_role-gate.cjs`와 스폰 자리의 `20_plan-gate.cjs` 항목이 없고 편집 경로 게이트 항목은 남아 있다」·「`settings.json` 편집이 이 워커의 마지막 구현 편집이다」(같은 세션·agent_id·모델·기준 HEAD): `settings-matcher.test.mjs`에 내림 단정 넷(역할 게이트 배선 0 · `20_plan-gate.cjs` 배선 0 · `^(Task|Agent)$` 항목 0 · 유지 훅 여덟 종 배선 실존)을 먼저 더해 「통과 9 · 실패 3」 Red를 보고, `settings.json`에서 두 항목만 지워(17줄 삭제, 추가 0) 「통과 12 · 실패 0」으로 뒤집었다. 그 편집(hook-log 07:28:09 edit-plan-gate allow/통과 · 07:28:10 role-gate 워커-허용)이 이 워커의 마지막 구현 편집이고, 그 뒤의 편집은 이 기록·`99_Backlog.md`·pin뿐이다.
- PASS 2026-11-11T07:30:34+09:00 — 종료 순서 ① · DoD 「하드 게이트 다섯 종이 통과하고 `npm test`의 실패가 0이다」(같은 세션·agent_id·모델·기준 HEAD, 배선 내림 뒤 실측): `typecheck:node` exit 0 · `typecheck:web` exit 0 · `lint` exit 0 · `test:hooks` exit 0(러너 15종 「전부 통과」) · `build` exit 0(out/main 217.83 kB · out/preload 10.84 kB · renderer 산출), `npm test -- --no-color --reporter=dot`(파이프 없음)은 Test Files 411 passed · 6 skipped(417), Tests 5465 passed · 12 skipped(5477), 실패 0이다. 덧붙여 규율 이탈 한 건을 적는다 — Step 5의 첫 `test:hooks` 실행에서 출력을 셸 리다이렉트로 저장소 밖 `C:\Users\bass1\AppData\Local\th.txt`에 남겼다. 저장소와 판정 장치 밖이고 삭제는 이 워커에게 금지라 그대로 두었다.
- 미수행 (코디네이터·사용자 몫 — 판정 줄이 아니다): Step 7 내림 실측은 코디네이터, Step 8 `30_role-gate.cjs` 삭제는 사용자 몫이다. DoD 「내림 뒤 메인 세션 편집의 hook-log 줄에 `role-gate` 판정이 없고 편집 경로 게이트 통과 줄이 있다 · 계획 부재 거부 줄이 격리 미러 로그에 있다」와 「`30_role-gate.cjs`가 사용자 실행으로 삭제됐고 그 뒤 `npm run test:hooks`가 통과한다」는 이 워커가 주장하지 않는다.
- PASS 2026-11-11T07:32:10+09:00 — 덤으로 관측된 핫로드 영수증(같은 세션·agent_id·모델·기준 HEAD — Step 7을 대신하지 않는다, 이 편집 주체는 메인이 아니라 하위 에이전트다): hook-log의 마지막 `role-gate` 줄은 2401행(07:28:10, `settings.json` 편집 자신)이고, 내림 뒤 이 워커의 첫 편집(07:31:05 `04_Phase_4.md`)에는 edit-plan-gate allow/계획-표면 · tdd-guard · line-limit · pass-watcher 줄만 있고 `role-gate` 줄이 없다. 그 pass-watcher 줄의 `role`은 `worker`, `roleSignal`은 `input:agent_id=ab8ba741bed37f0d6 · agent_type=worker`로 Step 5의 agent_id 판독이 live에서 찍혔다.
- 정정 (판정 줄이 아니다, 2026-11-11T07:31:54+09:00 · 같은 세션·agent_id·모델·기준 HEAD): 바로 위 줄의 타임스탬프 07:32:10은 실측 시각보다 앞서 적혔다. 그 줄은 hook-log 2420행(pass-watcher 07:31:44)의 편집으로 추기됐고, 담은 관측은 그 시각까지의 것이다. append-only 규율에 따라 줄을 고치지 않고 이 정정으로 기준점을 옮긴다.
