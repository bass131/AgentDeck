# M03 Phase 2 — 유지 게이트 구멍 닫기

## Phase 2 — 유지 게이트 구멍 닫기 · 태그: `guard`·`harness` · 의존: Phase 1

**목표**: 위험 명령 가드의 회귀 2표면과 같은 파일의 이월 항목이 닫히고, 검증 기록 헤더 계약이 세 훅에서 같아지며, 계획 게이트가 편집 경로에 서고, 미실측 2표면(PowerShell·Workflow)이 닫히거나 실측 영수증을 갖는다. 역할 게이트는 이 Phase에서 건드리지 않는다.

Steps

1. 인수 대조 — Phase 1의 기록 줄, `git log`의 `M03-P1` 토큰, `git status`, hook-log의 관련 줄을 대조하고 확인 줄을 Phase 1 기록에 추기한다.
2. 가드 Red — 표 구동 테스트에 아래 행을 기대-실패 플래그로 먼저 올리고 실패를 관측한다. 가드를 spawn하는 테스트는 공통 격리 헬퍼를 쓴다.
   - 회귀 2표면: `bash -c "rm -rf dist"`, `env FOO=1 rm -rf dist` — 기대 판정은 차단이다 (M02 Backlog 10·3).
   - push 표면: `sh -c "git push origin main"` — 기대 판정은 승인 질의다 (헌법 10조).
   - 경로 접두: 디렉터리가 붙은 `git.exe`의 `reset --hard` — 기대 판정은 차단이다 (M02 Backlog 2).
   - 오탐 방어: 커밋 메시지나 `echo`의 인용문 안에 든 `bash -c "rm -rf x"` 서술 — 기대 판정은 통과다. 넓히는 만큼 오탐 표면이 느는 것을 양방향으로 고정한다.
3. 가드 수리 — 래퍼 연쇄가 플래그와 `VAR=값` 할당 토큰을 건너뛰게 하고, 셸 실행 파일의 `-c` 인자 문자열을 같은 파이프라인으로 다시 판정하게 한다. 머리 토큰의 git 판정은 basename으로 한다. 플래그를 떼고 전건 통과를 확인한다.
4. 헤더 계약 정합 — `33_tdd-guard.cjs`와 `40_pass-watcher.cjs`의 `countRecord`가 쓰는 접두사 판독을 `20_plan-gate.cjs`와 같은 제목 단독 줄 판독으로 바꾼다 (M02 Backlog 5). 위장 헤더 아래의 PASS 서술이 집계되지 않는 Red를 먼저 쓴다.
5. 편집 경로 계획 게이트 (안건 5 채택 시) — `20_plan-gate.cjs`의 판정부를 `_lib`로 추출하고, 편집 도구에 붙는 새 훅이 그것을 쓴다. Red를 먼저 쓴다.
   - 거부: 저장소 안이고 `01_Milestones` 밖인 대상에 대해 계획 문서 부재, FAIL 세 번, 결정 대장의 주도권 발동 상태.
   - 허용: 같은 대상에 유효한 계획, `01_Milestones` 안의 대상(계획 상태와 무관), 저장소 밖의 대상.
   - 라우팅 판정은 거부 사유에서 빼고 로그 필드로만 남긴다. 역할 신호는 읽지 않는다.
   - 스폰 자리의 기존 배선은 이 Phase에서 그대로 둔다 — 내리는 것은 Phase 4다.
6. PowerShell 표면 (안건 10) — 도구 이름과 deny 문법을 공식 문서로 확인한 뒤 `settings.json`의 `permissions.deny`에 올린다. `settings-matcher.test.mjs`에 그 항목의 정적 단정을 더한다.
7. Workflow 표면 (안건 2) — `00_분류표.md`의 결과별 처리표를 따른다. 프로브 영수증이 있으면 그 줄을 기록에 옮기고, 닫기로 정해졌으면 Step 6과 같은 방식으로 닫는다.
8. 배선 (최후 구현 편집) — 새 훅을 `settings.json`의 편집 도구 항목에 더한다. 배선 직후부터 이 워커 자신의 편집도 새 게이트를 지난다.
9. 유지 대장 — AD-02의 상태를 「실물화, 상환 판정 대기」로 고치고 PowerShell 표면을 존치 의제로 새로 올린다. AD-02의 상환은 Orca 경유로 뜬 세션의 첫 편집이 계획 부재 상태에서 거부되는 관측이 있을 때만 판정한다.
10. 종료 순서를 지킨다 — 마감 커밋의 메시지에 `M03-P2` 토큰을 넣는다.

DoD

- 가드의 새 행 전건이 구현 전 실패, 구현 후 통과로 관측되고 기대-실패 플래그가 0건이다. 기존 동등성 기준표 행은 전건 통과를 유지한다.
- 오탐 방어 행이 통과한다 — 인용문 안의 서술을 명령으로 읽지 않는다.
- 헤더 계약의 Red가 Green으로 뒤집히고, 세 훅의 헤더 판독 정규식이 같다.
- 편집 경로 게이트의 거부·허용 픽스처 전건이 기대 판정과 일치하고, 판정 줄이 hook-log에 남는다.
- `settings.json` 정적 단정이 통과한다 — 가드 matcher 앵커, PowerShell deny, 새 훅의 배선.
- Workflow 표면은 프로브 영수증 또는 닫힘 단정 가운데 하나를 갖는다.
- live hook-log에 테스트가 만든 합성 세션 줄이 없다.
- `settings.json` 편집이 이 워커의 마지막 구현 편집이다.
- 하드 게이트 다섯 종이 통과하고 `npm test`의 실패가 0이다.

검증 기록

- PASS 2026-11-11T06:21:00+09:00 — Step 1 인수 대조(워커 세션 b989a371-aa91-4684-be26-c1d2e4905e4f · agent_id ab8b8c7b6fa942aad · 실제 기동 모델 `claude-opus-5` · 기준 HEAD d441e1d29ecd4a2127a57d269b067137f442455d): Phase 1 마감 커밋 `d441e1d`(메시지 토큰 `M03-P1`), `git status --porcelain` 0줄, `gate-config.json` 두 키의 M03 좌표, 두 헌법 6·14·15줄 `diff` 0줄, `.claude/` 아래 변경 `gate.md` 한 건을 전건 실측하고 확인 줄을 Phase 1 기록에 추기했다. Phase 1 Step 6(기동 훅 실측)은 전환(06:11:24) 이후 `start-brief` 줄이 없어 **미관측**이며, 간접 영수증으로 1720행 plan-gate(06:19:59)의 `planFiles`가 M03 다섯 파일임을 확인했다.
- PASS 2026-11-11T06:24:33+09:00 — Step 2 가드 Red 관측(`cmd-guard-equivalence.test.mjs`, 격리 헬퍼 `_lib/guard-spawn.mjs` 경유): 신설 행 다섯이 전부 기대와 어긋났다 — GR-06 `C:\Tools\Git\bin\git.exe reset --hard`·GR-07 `/usr/bin/git reset --hard`(기대 deny)·WR-01 `bash -c "rm -rf dist"`(기대 deny)·WR-02 `env FOO=1 rm -rf dist`(기대 deny)·WR-03 `sh -c "git push origin main"`(기대 ask)의 실측이 전건 `allow`로, 러너 요약은 「통과 69 · 실패 0 · 기대-실패 플래그 잔여 5건」이었다(06:24:24). 오탐 방어 행 셋(OK-07 커밋 메시지 안의 `bash -c "rm -rf x"` 서술 · OK-08 `echo 'env FOO=1 rm -rf x'` · OK-09 `echo 'sh -c "git push origin main"'`)은 수리 전에도 `allow`였다. `--moodie` 교차 구동으로 신설 8행을 포함한 64행의 moodie 열 선언 불일치 0건을 실측했다(06:24:33).
- PASS 2026-11-11T06:30:55+09:00 — Step 3 가드 수리 Green: `dangerous-cmd-guard.mjs`에 ① 따옴표를 아는 토크나이저(인용부 밖 공백만 구분자, 인용 문자는 값에서 벗긴다), ② 래퍼 연쇄가 플래그·`VAR=값` 할당 토큰을 건너뛰게 넓힘, ③ 셸 실행 파일(`sh`·`bash`·`dash`·`zsh`·`ksh`·`ash`)이 **명령 위치**에 섰을 때만 `-c` 인자 문자열을 같은 파이프라인으로 재귀 판정(`contextsOf`, 깊이 상한 3), ④ git·셸 판정의 basename 정규화를 넣었다. 수리 직후 러너가 다섯 행을 「예상 밖 통과(플래그 제거 필요)」로 반려했고(06:30:36), 플래그를 떼자 「통과 69 · 실패 0 · 기대-실패 플래그 잔여 0건」 전부 통과였다(06:30:55). 기존 동등성 기준표 행과 오탐 불변식 행도 전건 유지다.
- PASS 2026-11-11T06:34:19+09:00 — Step 4 헤더 계약 정합 Red→Green(M02 Backlog 5): `plan-record-header.test.mjs`에 위장 헤더(「검증 기록은 아직 없음」)와 진짜 헤더를 쌍으로 둔 네 케이스를 먼저 올려 Red를 관측했다(06:33:45 — RH-01 tdd-guard가 기대 무발화 대신 `deny/green-증거-부재`, RH-03 pass-watcher가 기대 `무장전/기준선-부재` 대신 `장전/기준선-부재-보수적-장전`, RH-05 정적 단정 두 건 실패 · 러너 「통과 14 · 실패 4」). `33_tdd-guard.cjs`와 `40_pass-watcher.cjs`의 `countRecord` 접두사 판독을 `const RECORD_HEADER = /^검증 기록\s*$/`로 바꾼 뒤 네 케이스 전건 Green이고(06:34:10 — 회귀 불변식 RH-02·RH-04도 종전 판정 유지), `npm run test:hooks`가 exit 0이었다(06:34:19).
- PASS 2026-11-11T06:42:44+09:00 — Step 5 편집 경로 계획 게이트 Red→Green(안건 5 채택): `edit-plan-gate.test.mjs`를 먼저 올려 Red를 관측했다(06:37:38 — 거부·허용 픽스처 전건 무발화, 러너 「통과 2 · 실패 23」). 그다음 `20_plan-gate.cjs`의 판정부를 `_lib/plan-verdict.cjs`로 추출하고 새 훅 `31_edit-plan-gate.cjs`가 그것을 쓰게 했다 — 거부 다섯(EP-01 실패 카운터 · EP-02 주도권 문답분기 · EP-03 대장 부재 · EP-04 계획 규격 · EP-05 계획 문서 부재)과 허용 넷(EP-06 유효 실계획 · EP-07 `01_Milestones` 안 · EP-08 저장소 밖 · EP-09 Phase 9개에서 판정 ④만 걸릴 때 `allow/라우팅-로그전용`)이 기대와 전건 일치하고, 각 케이스가 hook-log에 판정 줄 1건을 남겼으며, 역할 신호(`agent_id`·`agent_type`)를 실어도 판정이 같고 evidence에 `role` 필드가 없음을 실측했다(EP-10, 06:39:28 — 「통과 25 · 실패 0」). 판정부 추출로 RH-05의 단정 대상이 `_lib/plan-verdict.cjs`로 옮겨 가 러너가 한 번 반려했고(06:42:11 exit 1) 단정을 고친 뒤 `npm run test:hooks` exit 0이었다(06:42:44 — 러너 15종 전부 통과, 실패 0 · 기대-실패 플래그 잔여 0건). 격리 단정 두 건(미러가 실저장소 밖 · live hook-log에 합성 세션 `edit-plan-gate-probe` 줄 0건)도 통과다.
- PASS 2026-11-11T06:44:40+09:00 — Step 6 PowerShell 도구의 문법 확인과 Red: 공식 문서 `https://code.claude.com/docs/en/permissions`의 「PowerShell」 절 원문이 「PowerShell permission rules use the same shape as Bash rules, and a bare `PowerShell` or `PowerShell(*)` matches every command」이고 deny 예시가 `"PowerShell(Remove-Item *)"`이다 — 도구 이름은 `PowerShell`, 도구 전체를 닫는 형태는 bare `PowerShell` 또는 `PowerShell(*)` 둘이다. 같은 문서가 「Claude Code parses the PowerShell AST」로 가드와 다른 판정기임을 명시해 안건 10의 「동등성을 증명할 수 없다」 근거도 문서로 확인됐다. 이 두 형태를 받는 정적 단정과 편집 게이트 배선 단정을 `settings-matcher.test.mjs`에 올려 Red를 관측했다 — 「PowerShell 도구가 permissions.deny로 닫혀 있다」 실패(실측 deny 다섯 항목에 없음)와 「편집 경로 계획 게이트가 settings.json에 배선돼 있다」 실패(0건), 러너 「통과 4 · 실패 2」.
- PASS 2026-11-11T06:45:20+09:00 — Step 7 Workflow 표면 영수증(안건 2 · 사용자 opt-in으로 코디네이터가 실행한 프로브를 이 워커가 hook-log에서 직접 재판독): 1715행 `{"ts":"2026-11-11T06:19:20+09:00","hook":"cmd-guard","event":"PreToolUse","agent_id":"a5fb34e8fb9d179d1","verdict":"allow","rule":null,"cmd":"echo m03-workflow-probe"}`, 1716행 `{"ts":"2026-11-11T06:19:22+09:00","hook":"role-gate","event":"PreToolUse","tool":"Write","role":"worker","roleSignal":"input:agent_id=a5fb34e8fb9d179d1 · agent_type=workflow-subagent","verdict":"allow","rule":"워커-허용"}`로, Workflow 하위 에이전트의 Bash 1건과 스크래치패드 Write 1건이 PreToolUse 훅을 지났다. 프로브 구간 1715~1719행에 `plan-gate` 줄은 없다 — Workflow의 스폰은 `^(Task|Agent)$` matcher에 걸리지 않았고, 안건 5 채택으로 스폰 자리의 첫째 질문은 의미를 잃는다(`00_분류표.md` 「Workflow 경유 하위 에이전트」). 판독은 처리표의 「도구 호출이 훅을 지난다 → 추가 작업 없음, 영수증을 Phase 2에 남긴다」에 해당하므로 Workflow 도구는 deny로 닫지 않았다.
- PASS 2026-11-11T06:50:20+09:00 — Step 9 유지 대장 갱신(배선보다 앞에 끝냈다): AD-02의 상태를 「진행 — 수리 방안 확정, 실물화 대기」에서 「진행 — 실물화, 상환 판정 대기」로 고치고 실물 경로 세 개(`31_edit-plan-gate.cjs`·`_lib/plan-verdict.cjs`·`edit-plan-gate.test.mjs`)와 상환 조건(Orca 경유로 뜬 세션의 첫 편집이 계획 부재 상태에서 거부되는 hook-log 관측)을 명시했다 — 격리 미러의 픽스처 Green은 그 관측을 대신하지 않는다고 적었다. PowerShell 표면은 **AD-04 (존치)**로 새로 등재했다.
- PASS 2026-11-11T06:50:40+09:00 — Step 6·8 배선 집행(이 워커의 최후 구현 편집): `settings.json`의 `permissions.deny`에 `"PowerShell"`을 올리고, PreToolUse 편집 도구 항목(`^(Edit|MultiEdit|Write|NotebookEdit)$`)의 `30_role-gate.cjs`와 `33_tdd-guard.cjs` 사이에 `31_edit-plan-gate.cjs`를 timeout 30으로 더했다 — 역할 게이트와 스폰 자리의 기존 배선은 건드리지 않았다(Phase 4의 몫). 정적 단정 Red가 전부 Green으로 뒤집혔다 — 「통과 8 · 실패 0」(PowerShell deny 실존 · 같은 도구의 allow·ask 규칙 0건 · 편집 게이트 배선 1건 · 이벤트 PreToolUse · matcher 앵커 형태).
- PASS 2026-11-11T06:51:00+09:00 — Step 10 종료 순서 ① 하드 게이트 다섯 종 전부 green과 `npm test` 실패 0(워커 세션 b989a371-aa91-4684-be26-c1d2e4905e4f · agent_id ab8b8c7b6fa942aad · 실제 기동 모델 `claude-opus-5` · 기준 HEAD d441e1d29ecd4a2127a57d269b067137f442455d): `npm run typecheck:node` exit 0 · `typecheck:web` exit 0 · `lint` exit 0 · `test:hooks` exit 0(러너 15종 전부 「전부 통과」, 실패 0 · 기대-실패 플래그 잔여 0건) · `build` exit 0(out/main 217.83 kB · out/preload 10.84 kB · out/renderer 산출). `npm test -- --no-color --reporter=dot`(파이프 없음)은 exit 0 · 「Test Files 411 passed | 6 skipped (417) · Tests 5465 passed | 12 skipped」로 실패 0이며 기준선과 차분 0이다. 계획 밖 발견 네 건은 `99_Backlog.md` 3~6번 관찰로만 올리고 고치지 않았다.
- PASS 2026-11-11T06:51:30+09:00 — 배선 직후의 live 발화 실측(격리 미러가 아닌 실저장소 hook-log): 새 훅이 배선 하나로 실제 세션들의 편집에서 발화한다. ① 06:48:30 — 다른 세션(세션 id 마스킹, 저장소 밖 사본 작업)의 `Write`가 대상 `C:\Dev\AgentDeck_Dashboard\public\index.html`에 대해 `verdict allow · rule 저장소-밖`을 받았다 — settings 핫로드가 세션 경계를 넘어 적용된 증거다. ② 06:50:26 — 이 워커의 `Edit`가 대상 `01_Milestones/M03_Harness_Refresh/02_Phase_2.md`에 대해 `verdict allow · rule 계획-표면`을 받았다(evidence의 `file`은 `01_milestones/m03_harness_refresh/02_phase_2.md`). 거부 경로의 live 발화는 이 저장소의 M03 계획이 유효하므로 관측되지 않는다 — 그 표면의 판정은 격리 픽스처 다섯 건(EP-01~05)이 소유한다.
- PASS 2026-11-11T06:52:00+09:00 — DoD 「live hook-log에 테스트가 만든 합성 세션 줄이 없다」 실측: live `hook-log.jsonl` 2006행 전수를 파싱해 이 Phase의 테스트가 쓰는 합성 식별자 열한 개(`synthetic-cmd-guard-p1`·`synthetic-agent-p1`·`plan-record-header`·`record-header-tdd`·`record-header-pw`·`edit-plan-gate-probe`·`ge`·`readout-worker-a`·`readout-coordinator-b`·`readout-first-write`·`readout-first-write-2`)를 `session`·`agent_id` **필드 동등 비교**로 셌다 — 0건이다(문자열 포함 검사가 아니다 — 가드 로그의 `cmd` 필드가 명령 원문을 실어 감사 명령 자체가 오염원이 되기 때문이다). 필드 일치가 1건 나온 유일한 줄은 1647행 `synthetic-m03-p1-pointer`이고, 이것은 Phase 1 Step 4 ③이 의도적으로 live 뿌리에서 돌린 재실측이라 Phase 2 테스트의 누출이 아니다.
- PASS 2026-11-11T07:09:10+09:00 — **Phase 3 워커의 인수 대조 확인 줄**(세션 b989a371-aa91-4684-be26-c1d2e4905e4f · agent_id af254de56017cb5be · 실제 기동 모델 `claude-opus-5` · 기준 HEAD ac4804b5f023f9770a2d490204ae878f7fb8155d): ① Phase 2 마감 커밋은 `ac4804b`이고 메시지에 `M03-P2` 토큰이 있다(18 files changed · 746 insertions · 180 deletions). ② `git status --porcelain`은 한 줄 — 코디네이터가 Phase 3 착수 문답 결과를 적은 미커밋 `_MilestonePreview.md`뿐이고, 이 변경은 Phase 3 마감 커밋에 함께 담는다. ③ `git diff d441e1d ac4804b -- .claude/settings.json`이 Phase 2 기록과 일치한다 — `permissions.deny`에 `"PowerShell"` 한 줄, PreToolUse 편집 도구 항목에 `31_edit-plan-gate.cjs`(timeout 30) 한 블록이다. ④ 같은 범위의 `02_Project/00_Source/` 차분은 0줄이다. ⑤ 편집 경로 게이트의 판정 줄이 Phase 2 종료 이후의 live에서도 계속 찍힌다 — 2127·2132행(07:05:29·07:05:31, 코디네이터의 `_MilestonePreview.md` 편집)이 `verdict allow · rule 계획-표면`이고, 저장소 밖 대상(세션 id 마스킹)은 `rule 저장소-밖`이다. 거부 경로의 live 발화는 이 저장소의 M03 계획이 유효해 여전히 미관측이며, 그 표면은 격리 픽스처 EP-01~05가 소유한다.
