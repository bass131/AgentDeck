# M03 Phase 1 — 착륙과 좌표 동기화

## Phase 1 — 착륙과 좌표 동기화 · 태그: `structure` · 의존: 없음

**목표**: 계획 승인 문답의 판정이 결정 대장에 등재되고, M03 pin이 서고, 좌표(`gate-config.json`과 두 헌법 파일의 정체 선언·계획·pin 포인터)가 안전 순서로 M03에 전환되며, 지침 감사가 지목한 사실 불일치 여덟 건이 정리된다.

Steps

1. 승인 반영 (코디네이터) — 계획 승인 문답의 판정을 `_MilestonePreview.md` 결정 대장에 [USER] 줄로 올린다. 채택된 [AI] 줄은 태그를 [USER]로 전환하고, **같은 편집에서** 발동 판정 실측 문장을 승인 후 값으로 갱신한다. 탈락한 안은 Preview·Phase 파일·`00_분류표.md`·`04_헌법-개정-문안.md`에서 채택안의 문면으로 정리한다. 전부 `01_Milestones` 아래 편집이다.
2. pin과 Backlog 신설 (코디네이터) — 같은 폴더에 `01_Work_Pin.md`와 `99_Backlog.md`를 만든다. pin에는 「좌표」와 「마감 요약」 두 절을 두고, 「노션 사례 보강」의 새 번호를 좌표에 적는다. M02 pin은 2026-11-10 마감 갱신본에서 더 고치지 않는다. `00_분류표.md`가 6조에 적은 관찰을 Backlog 첫 항목으로 옮긴다.
3. 작업 브랜치 생성 (코디네이터) — 승인된 이름으로 브랜치를 만든다. 옆 pane의 세션이 같은 작업 사본을 쓰므로, 사용자가 그 세션을 닫았음을 확인한 뒤에 한다.
4. 포인터 전환 (워커) — M02 Phase 1 Step 3의 순서를 그대로 쓴다.
   - **① 격리 선검증** — `CLAUDE_PROJECT_DIR`로 지정한 임시 미러에 `gate-config.json`을 M03 좌표로 두고 M03 계획 파일(Preview와 Phase 파일 넷)을 같은 상대 경로에 복사한 뒤, `20_plan-gate.cjs`를 합성 스폰 입력으로 단독 실행한다. 판정 4종이 전부 통과여야 한다. live 저장소는 아직 손대지 않는다.
   - **② live 전환** — 선검증이 통과일 때만 `gate-config.json`의 두 키와, 루트 `CLAUDE.md`·`AGENTS.md`의 6줄(H1)·14줄(H4)·15줄(pin 포인터)을 M03 좌표로 함께 바꾼다.
   - **③ live 재실측** — 같은 합성 입력으로 live 뿌리에서 실행한다. 판정은 종료 코드가 아니라 hook-log 마지막 plan-gate 줄의 `verdict`와 stdout JSON의 유무로 읽는다.
   - **④ 실패 시 복원** — 통과가 아니면 같은 워커가 그 자리에서 다섯 지점을 M02 값으로 되돌리고, 복원 뒤 통과가 회복됨을 실측한 다음 FAIL 줄을 남기고 끝낸다. 복원 기준값은 전환 전에 기록해 둔다.
5. 문면 정리 (워커) — `01_좌표-동기화-목록.md`의 H2·H3과 `gate.md`의 H5·M1·M2·M3을 반영한다. 감사가 낸 diff를 기준으로 하되 `gate.md`의 판정 기준과 숫자는 바꾸지 않는다. 두 헌법 파일의 조항 문면은 이 Phase에서 건드리지 않는다 — Phase 4의 몫이다.
6. 기동 훅 실측 (코디네이터) — 전환 뒤 hook-log의 다음 `start-brief` 줄에서 `planFiles`가 M03의 다섯 파일이고 `checks` 네 항목이 전부 참인지 읽는다. 새 세션이 열리지 않았으면 다음 Phase의 인수 대조가 대신 확인한다.
7. 종료 순서를 지킨다 (Preview 제약 절) — 마감 커밋의 메시지에 `M03-P1` 토큰을 넣는다.

DoD

- 결정 대장에 안건 1(「완화」 직접 확인)의 [USER] 줄이 있고, 채택된 안건의 태그가 전환돼 사용자 측 줄 수가 에이전트 단독 줄 수 이상이다. 발동 판정 실측 문장이 같은 편집에서 갱신돼 있다.
- M03 pin과 Backlog가 실물로 있고, M02 pin의 변경은 2026-11-10 마감 갱신 한 건뿐이다.
- 격리 선검증의 통과 영수증이 live 전환보다 앞선 시각으로, live 재실측의 통과 영수증이 전환보다 뒤 시각으로 있다. 통과가 아니었다면 복원 기록과 FAIL 줄이 있고 뒤따르는 워커는 뜨지 않았다.
- `gate-config.json`의 두 키와 두 헌법 파일의 6·14·15줄이 전부 M03 좌표를 가리키고, 두 헌법 파일의 해당 줄이 서로 같다.
- H2·H3·H5·M1·M2·M3이 반영돼 있고 `gate.md`의 판정 기준 문장과 숫자는 `git diff`에서 바뀌지 않았다.
- 워커의 실제 기동 모델과 세션 id, 기준 HEAD가 기록 줄에 있다.
- 하드 게이트 다섯 종이 통과한다.

검증 기록

- PASS 2026-11-11T06:08:49+09:00 — Step 1~3 인수 대조(워커 세션 b989a371-aa91-4684-be26-c1d2e4905e4f · agent_id a1bee78be108b3004 · 모델 claude-opus-5 · 기준 HEAD 67dcbde8cc30e46a903f4709b5b70216f1dd1c76): ① 결정 대장 실측 tally는 [USER] 11 · [AI] 3이고 안건 1의 「완화」 직접 확인 줄이 실존하며 발동 판정 문장도 「비가역 0 · 에이전트 단독 3 · 사용자 11 → 미발동」으로 갱신돼 있다, ② `01_Milestones/M03_Harness_Refresh/`에 열 파일(Preview·분류표·좌표 목록·헌법 문안·Phase 넷·pin·Backlog)이 실물로 있고 `git status`에서 미추적 폴더 한 건이다, ③ M02 pin의 변경은 2026-11-10T06:29:31 마감 갱신 한 건(8+/5-)뿐이다, ④ 브랜치는 `chore/m03-harness-refresh`에 HEAD 67dcbde로 Step 3과 일치하며 커밋은 없다.
- PASS 2026-11-11T06:10:04+09:00 — Step 4 ① 격리 선검증(live 전환 이전, live 저장소 무변경): 미러 뿌리 `C:\Users\bass1\AppData\Local\Temp\claude\09203b92aa1d0186\b989a371-aa91-4684-be26-c1d2e4905e4f\scratchpad\m03-mirror`에 M03 좌표 gate-config와 계획 다섯 파일을 복사(diff 전건 IDENTICAL)한 뒤 `CLAUDE_PROJECT_DIR`로 `20_plan-gate.cjs`를 합성 스폰 입력(session_id `synthetic-m03-p1-pointer`·tool Agent)으로 단독 실행 — exit 0 · stdout 0바이트 · 미러 hook-log 1행 `"verdict":"allow","rule":"통과"` 두 신호 일치, evidence 원문은 planPath `01_Milestones/M03_Harness_Refresh/_MilestonePreview.md` · planFiles 다섯 · humanOverview true · failCounts Phase 1~4 전부 0 · tally {"USER":11,"USER·위임":0,"AI":3,"AI·비가역":0} · routing {"tagKinds":["structure","guard","harness","policy"],"phaseCount":4,"independentPair":null,"route":"크로스 도메인 Worker 병렬"}이고, 실행 직후 live hook-log는 1627행·live `git status`는 선검증 전과 동일했다. 복원 기준값 다섯 지점은 전환 전에 저장소 밖 메모(`scratchpad\restore-baseline-m02.md`)로 확보했다.
- PASS 2026-11-11T06:11:24+09:00 — Step 4 ② live 전환 집행(선검증 allow 확인 후, H1·H4·pin 포인터): `gate-config.json`의 `planPath`·`workPinPath`를 `01_Milestones/M03_Harness_Refresh/_MilestonePreview.md`·`01_Work_Pin.md`로 바꾸고, `CLAUDE.md`·`AGENTS.md`의 6줄(H1 — M03 정체 선언)·14줄(H4 — 계획 원천을 M03 Preview와 Phase 파일 네 개로)·15줄(pin 포인터를 M03 pin으로)을 두 파일 동일 문안으로 갱신했다 — 전환 후 `sed -n '6p;14p;15p'` 대조는 두 파일 IDENTICAL이다. 부수 실측 — 이 워커(`worker` 하위 에이전트)의 다섯 편집 전건을 role-gate가 role `worker`·roleSignal `input:agent_id=a1bee78be108b3004 · agent_type=worker`·rule `워커-허용`·verdict `allow`로 통과시켰다(hook-log 1635·1637·1639·1641·1643행). H1의 대체 문장은 감사안(「다음 마일스톤은 계획 전」)이 아니라 M03의 이름과 목표를 쓰는 좌표 목록의 지시를 따랐다.
- PASS 2026-11-11T06:11:38+09:00 — Step 4 ③ live 재실측(전환 이후): 같은 합성 스폰 입력으로 live 뿌리(`CLAUDE_PROJECT_DIR` 미설정 = 저장소 뿌리)에서 `20_plan-gate.cjs`를 단독 실행 — exit 0 · stdout 0바이트 · live hook-log 1647행 `"verdict":"allow","rule":"통과"` 두 신호 일치, evidence 원문은 planPath `01_Milestones/M03_Harness_Refresh/_MilestonePreview.md` · planFiles 다섯 · humanOverview true · failCounts Phase 1~4 전부 0 · tally {"USER":11,"USER·위임":0,"AI":3,"AI·비가역":0} · routing {"tagKinds":["structure","guard","harness","policy"],"phaseCount":4,"independentPair":null,"route":"크로스 도메인 Worker 병렬","review":"리뷰어 1차 + codex 교차 모델 2차"}다 — Step 4 ④ 복원 분기는 발동하지 않았다.
- PASS 2026-11-11T06:13:13+09:00 — Step 5 문면 정리 여섯 건 반영: H2(`CLAUDE.md`·`AGENTS.md` 9~10줄)는 감사 diff대로 「`.claude/hooks/`의 훅이 기계로 집행 / 집행 방식이 다를 뿐 효력은 같습니다」로 두 파일 동일하게 바꿨고, H3(`CLAUDE.md` 18줄)은 「코어 일곱 종은 M01 Phase 4에서 실물화됩니다」 예고 문장을 지웠다(`AGENTS.md` 18줄은 Codex 스킬 거처 서술이라 해당 없음). `gate.md`는 M1(28~34줄 과거 실패 상태 서술 → 현재 기준선과 재발 시 절차), M2(「면책은 더 이상 없다」 → 「알려진 실패로 면책되는 테스트는 없다」), H5(「위 14개에 없다」 → 「전체 스위트에선 통과한다」), M3(삭제된 `orig-probe.e2e.ts` 이력 2줄 삭제)을 반영했다. 실측 대조 — `git diff .claude/commands/gate.md`에서 판정 기준 문장과 숫자(「기준선 = 0 실패」·400파일/6스킵/실패 0·「실패가 하나라도 나오면 → 회귀 후보」·`agents/`·`main/`·`shared/` 축·5초 타임아웃·e2e 기준선 1 실패·49파일 174테스트·1 실패/62 통과/111 스킵·「2건 이상이거나 `multi-agent-ops.e2e.ts` 아닌 파일」)는 전건 무변경이고, 두 헌법 파일의 `## 조항` 아래는 diff가 0줄이다. 줄 수는 `CLAUDE.md` 91 · `AGENTS.md` 91 · `gate.md` 69로 250줄 상한 안이며, `CLAUDE.md`·`AGENTS.md`·`gate-config.json`에 `M02_Hardening` 문자열은 0건이다.
- PASS 2026-11-11T06:15:51+09:00 — Step 7 ① 하드 게이트 다섯 종 전부 green (워커 세션 b989a371-aa91-4684-be26-c1d2e4905e4f · agent_id a1bee78be108b3004 · 실제 기동 모델 `claude-opus-5` · 기준 HEAD 67dcbde8cc30e46a903f4709b5b70216f1dd1c76): `npm run typecheck:node` exit 0 · `typecheck:web` exit 0 · `lint` exit 0 · `test:hooks` exit 0(러너 15종 전부 「전부 통과」, 실패 0 · 기대-실패 플래그 잔여 0건) · `build` exit 0(out/main 217.83 kB · out/preload 10.84 kB · out/renderer 산출). `npm test`는 하드 게이트가 아니라 이번 종료 순서에서 돌리지 않았다. 계획 밖 관찰 한 건은 `99_Backlog.md` 1번(`plan-record-header.test.mjs` PR-06이 M02 계획 경로를 고정)으로만 올리고 고치지 않았다.
- PASS 2026-11-11T06:21:00+09:00 — Phase 2 워커의 인수 대조 추기(세션 b989a371-aa91-4684-be26-c1d2e4905e4f · agent_id ab8b8c7b6fa942aad · 실제 기동 모델 `claude-opus-5` · 기준 HEAD d441e1d29ecd4a2127a57d269b067137f442455d): ① Phase 1 마감 커밋은 `d441e1d`이고 메시지에 `M03-P1` 토큰이 있다, ② `git status --porcelain`이 0줄(clean)이다, ③ `gate-config.json`의 `planPath`·`workPinPath`가 M03 좌표이고 `CLAUDE.md`·`AGENTS.md`의 6·14·15줄은 `diff`가 0줄로 동일하다, ④ `git show --name-only d441e1d -- .claude/`의 변경은 `.claude/commands/gate.md` 한 건뿐이다. Step 6(기동 훅 실측)은 **미관측** — 포인터 전환(06:11:24) 이후 hook-log에 `"hook":"start-brief"` 줄이 없다(마지막 start-brief는 1586행 06:06:53으로 전환 전이며 `planFiles`가 M02의 여섯 파일이다). 간접 영수증으로 1720행 plan-gate(06:19:59)의 `planFiles`가 M03의 다섯 파일(`_MilestonePreview.md`·`01_Phase_1.md`~`04_Phase_4.md`)이고 `verdict allow`임을 확인했다 — 전환이 훅 판독에 반영된 것은 맞으나 SessionStart 주입 자체는 다음 새 세션이 확인해야 한다.
- PASS 2026-11-11T07:55:00+09:00 — Step 6 기동 훅 실측(코디네이터 세션 b989a371-aa91-4684-be26-c1d2e4905e4f · 기준 HEAD 0b8bfdf · 마감 1차 검수의 지적으로 닫음): 포인터 전환(06:11:24) 뒤에 열린 새 세션의 `start-brief` 줄이 hook-log 1902행에 있다(06:40:52, 세션 07a43c5e-f306-44bc-8a52-4c63c73e4545, source startup). 그 줄의 `planFiles`는 `_MilestonePreview.md`와 `01_Phase_1.md`~`04_Phase_4.md` 다섯 파일이고 `checks` 네 항목이 전부 참이다. 위 「미관측」 줄은 이 줄로 대체된다.
- 정정 (판정 줄이 아니다, 2026-11-11T07:50:04+09:00 hook-log 실측 · 같은 세션): 바로 위 줄의 타임스탬프 07:55:00은 코디네이터가 추정으로 적어 실측보다 앞섰다. 그 줄을 쓴 직후 hook-log의 최신 줄 시각은 07:49:55였다. append-only 규율에 따라 줄을 고치지 않고 이 정정으로 기준점을 옮긴다.
