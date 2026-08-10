# M02 Phase 2 — 가드 우회면 수리·테스트 격리

## Phase 2 — 가드 우회면 수리·테스트 격리 · 태그: `guard` · 의존: Phase 1

**목표**: 위험 명령 가드가 Moodie 원본이 잡던 표면 전부와 Backlog 9번의 확대 표면까지 잡고, heredoc은 본문이 표준 출력으로만 소비될 때 면제하며 pipeline 어디서든 실행되거나 파일로 저장되면 계속 차단한다. 가드를 spawn하는 테스트가 전부 실저장소에서 분리되고, 가드의 판정이 로그 줄로 남는다.

Steps

1. **Phase 1 마감 인수** (인수 대조 절) — ① Phase 1 검증 기록의 마지막 줄들에서 결과·세션 id·기준 HEAD를 읽는다. ② `git log`로 HEAD가 그 기준에서 전진했고 새 커밋 메시지에 `M02-P1` 토큰이 있는지 대조한다. ③ `git status`가 clean인지 확인한다. ④ hook-log에서 Phase 1 세션 id를 가진 stop-gate 줄을 찾아 `allow`였는지 눈으로 확인한다 — 줄이 없거나 판독이 애매하면 그대로 적고 코디네이터 판단을 받는다. ⑤ 코디네이터가 같은 실물(①~④)을 대조한다. 확인이 모이면 Phase 1 검증 기록에 확인 줄을 append한다. 이어 자기 세션 id와 기준 HEAD를 읽어 둔다. 마지막으로 Phase 1 기준표의 기대-실패 플래그를 재실행해 Red를 재관측한다.
2. Moodie 초과 표면(Backlog 9번)의 테스트를 먼저 쓴다 (Red) — `git.exe`·대문자 `Git` 머리 토큰, `git branch --delete --force`와 그 순서·결합·축약 변형(`-d -f`·`-df`·`-fd` 포함), `git stash drop`·`clear`, `git checkout .`.
3. heredoc 세그먼트 오인을 **pipeline 하류 전수 소비자 판별**로 수리한다.
   - 판별 계약: heredoc이 붙은 명령이 속한 pipeline 전체(`|`로 연결된 모든 단계)를 소비자 집합으로 본다. 실행 소비자(`bash`·`sh`·`zsh`·`pwsh`·`powershell`·`node`·`python`·`xargs`·`sh -c` 류)가 **하나라도** 있으면 본문 스캔을 유지한다.
   - **파일 sink는 데이터 소비자가 아니다** — `tee FILE`, 리다이렉트(`> f`·`>> f`), `dd of=`·`sponge f` 류는 전부 판별 불가로 분류해 스캔을 유지한다. 본문이 파일로 남으면 뒤이은 `bash run.sh`에는 위험 원문이 없어 가드가 잡을 수 없다. 면제 대상은 `git commit -F -`, operand 없는 `cat`, operand 없는 `tee`뿐이다.
   - fail-closed: 판별 불가 소비자가 하나라도 있으면 스캔 유지다.
   - 양방향 픽스처를 먼저 쓴다. 면제 방향(Red→Green): ⓐ `git commit -F - <<'EOF'` 본문의 `git push` 원문, ⓑ `cat <<'EOF'` 단독 본문의 `git reset --hard` 원문. 차단력 유지 방향: ⓒ `bash <<'EOF'`, ⓓ `cat <<'EOF' | bash`, ⓔ `cat <<'EOF' | grep -v x | sh`, ⓕ `cat <<'EOF' > run.sh`, ⓖ `cat <<'EOF' | tee run.sh` — 본문은 모두 `git reset --hard`다.
4. 인용 처리를 수리한다 (Backlog 3번) — scanSegments의 인용부 통째 드롭을 Moodie식 「따옴표 벗긴 토큰 스캔」으로 교체해 `git reset "--hard"` 류 인용 우회 차단을 회복하되, 인용문 오탐은 머리 토큰 판정으로 계속 막는다.
5. rm 재귀 판정을 정규식 세그먼트 판정에서 토큰 판정으로 바꿔 Moodie RE_RECURSE(-R·--recursive·후치 위치) 동등 이상을 만들고, gh·npm 규칙도 같은 토큰 판정으로 통일한다 (Backlog 1번).
6. 오탐을 해소한다 (Backlog 10번) — 읽기 전용 `git config --global --get` 통과의 오탐 회귀 테스트를 Red로 먼저 쓰고 수리한다.
7. **가드를 spawn하는 테스트 전건을 격리한다** (Step 8의 선행 조건) — 기존 `dangerous-cmd-guard.test.mjs`는 임시 뿌리 없이 가드를 수십 번 spawn하고 payload에 session·agent도 넣지 않는다. 이 테스트를 Phase 1이 만든 **공통 격리 헬퍼**(`mkdtemp` 임시 미러 + 별도 GateState + `CLAUDE_PROJECT_DIR` 주입 + 합성 `session_id`·`agent_id`)로 옮기고, 미러는 종료 시 정리한다. **이후 가드를 spawn하는 어떤 테스트도 이 헬퍼를 거치지 않고 직접 spawn하지 않는다** — 이 규칙을 러너 차원의 검사로 둔다(가드 spawn 호출부가 헬퍼를 경유하는지 검사하는 테스트 1건).
   - 판정: 격리의 판정은 **「live hook-log에 합성 `session`·`agent_id`를 가진 줄이 0건」** 하나다. live 로그의 줄 수 차분이나 byte 차분으로 판정하지 않는다 — 외부 `npm run test:hooks` 호출 자체가 가드·tdd-guard 줄을 남기므로 차분은 안정된 판정 표면이 아니다.
8. **가드 판정 로그를 신설한다** (Backlog 10번) — allow·deny·ask 각 판정이 로그 줄로 남는지 검사하는 실패 테스트를 먼저 쓰고(Red) 구현한다. 필드는 `hook`·`event`·`session`·`agent_id`·`verdict`·`rule`(발동 규칙 id 또는 null)이다. 로거는 `CLAUDE_PROJECT_DIR` 기준으로 경로를 잡는다(공용 로거 모듈이 없으므로 기존 훅과 같은 스키마의 독립 로거로 만든다).
   - Red 픽스처: 세 판정 각 1건(줄 존재와 `verdict` 일치), payload에 `session_id`·`agent_id`가 없을 때 null로 기록되는 1건, 격리 미러 뿌리에 기록되고 live 로그에는 남지 않는 1건.
9. 가드 테스트의 heredoc 본문이 오탐 표면을 실제로 겨누도록 수리한다 (Backlog 14번의 가드 테스트 부분) — 면제 대상 heredoc의 본문 머리 줄에 위험 명령 원문을 둔다.
10. 수리 완료분의 기대-실패 플래그를 제거해 일반 판정으로 뒤집고(Green 증명), 기존 가드 테스트 전량 무회귀를 확인한다.
11. `settings.json`의 cmd-guard matcher 앵커가 정확 일치인지 단정하는 실패 테스트를 먼저 쓴다 (Red) — settings.json을 파싱해 matcher 문자열을 대조하는 테스트라 배선 상태와 무관하게 판정 가능하다.
12. 배선 편집 — matcher 앵커 수정(Backlog 10번)을 이 세션의 **최후 구현·설정 편집**으로 수행하고, 직후 `npm run test:hooks`로 회귀를 확인한다. 이 편집 이후 허용되는 편집은 자기 Phase 검증 기록 추기와 work-pin 마감 둘뿐이다.
13. 종료 순서를 지킨다 — ① 하드 게이트 다섯 종과 `npm test` 기준선 차분, ② 검증 기록 추기(게이트 결과·세션 id·기준 HEAD까지만), ③ work-pin 마감 요약·스탬프, ④ 마감 커밋(`M02-P2` 토큰), ⑤ `git status` clean 확인, ⑥ Stop. 구현·설정 파일은 ① 이후 더 건드리지 않는다.

DoD

- 동등성 기준표의 기대-실패 플래그가 0건이고 전건 통과다 — 완료선 둘째 조항의 기계 증명. 공통 한계 구획은 집계 제외다.
- Moodie 초과 표면·heredoc 판별·가드 판정 로그·matcher 단정 테스트가 각각 구현 전 Red·구현 후 Green이다.
- heredoc 양방향 픽스처 일곱이 전건 통과한다 — 면제 방향 ⓐⓑ가 통과로 뒤집히고, 차단력 유지 방향 ⓒⓓⓔⓕⓖ가 수리 후에도 exit 2로 차단된다.
- 오탐 회귀 테스트(인용문·커밋 메시지 속 위험 단어, 표준 출력 전용 heredoc 본문, `git config --global --get`)가 통과한다.
- **가드를 spawn하는 테스트 전건이 공통 격리 헬퍼를 경유하고(헬퍼 미경유 spawn 검사 테스트 통과), live hook-log에 합성 `session`·`agent_id` 줄이 0건이다.**
- 가드 판정 로그 픽스처 다섯이 통과하고, 세 판정(allow·deny·ask)이 각각 로그 줄로 관측된다.
- 배선 편집이 이 Phase의 최후 구현·설정 편집이고, 그 이후 편집은 검증 기록 추기와 pin 마감뿐이다.
- Phase 1 검증 기록에 이 Phase 시작 인수 Step의 확인 줄(커밋 전진 + `M02-P1` 토큰·clean·stop-gate 줄 확인)이 append돼 있다.
- 하드 게이트 다섯 종 green과 `npm test` 기준선 차분 0의 영수증이 최후 구현·설정 편집 뒤 실행분으로 있다.
- 자기 세션 id와 기준 HEAD가 검증 기록 줄에 등재돼 있다.
- 마감 커밋·clean·정상 Stop은 이 Phase 안에서 판정하지 않는다 — Phase 3 시작 인수 Step의 확인 줄로 판정한다.

검증 기록

- PASS 2026-08-10T19:40:13+09:00 — 기동 전 plan-gate 직접 구동 영수증(Phase 2 워커용, 코디네이터 세션 eaa74de0-49ab-4e39-b734-12e4f73f93ea): 합성 스폰 입력 단독 실행, exit 0·stdout 무출력·hook-log 마지막 plan-gate 줄 verdict "allow"(planPath M02 Preview) — 두 신호 일치, 기동 자격 확인. 코디네이터 선행 실물 대조 — Phase 1 마감 커밋 01d4cd2(메시지 접두 "feat(m02-p1)" — 소문자 표기이나 사람 감사 기준 M02-P1 토큰 동일 판정)·git status clean·stop-gate allow(스탬프 19:37:15 ≥ 장전 19:36:43)·신규 산출물(_lib 러너·guard-spawn·cmd-guard-equivalence.test.mjs·02_동등성-기준표.md) 실존 확인.
- PASS 2026-08-10T19:46:00+09:00 — Step 1 인수 집행(워커 세션 675d6d46-1343-4624-bc7d-65feb631cc2c, 기준 HEAD 01d4cd2afdb362736abd89f44aa384f400315cba): 절차 ①~⑤의 확인 줄을 01_Phase_1.md 검증 기록에 append했고, 이어 기준표 러너를 재실행해 통과 61·실패 0·기대-실패 플래그 잔여 18건으로 Red를 재관측했다.
- PASS 2026-08-10T20:07:00+09:00 — Step 2 Red 선관측: .claude/hooks/cmd-guard-surface.test.mjs를 구현 전에 두고 실행해 통과 25·실패 27을 관측했고, 실패 id는 초과 표면 15건(SX-01·02·03·04·06~11·16·17·18·21·22)·heredoc 7건(ⓐ·ⓑ·HD-11·12·18·19·20)·읽기 전용 오탐 5건(CFG-01~05)이다.
- PASS 2026-08-10T20:07:00+09:00 — Step 3·4·5·2·6 수리 Green: dangerous-cmd-guard.mjs를 heredoc 본문 면제(pipeline 전수 소비자 판별 — 면제는 `git commit -F -`·operand 없는 `cat`·operand 없는 `tee` 셋뿐이고 리다이렉트·`tee FILE`·`dd of=`·`sponge`는 판별 불가로 스캔 유지)·인용부 통째 드롭 폐기(따옴표 벗긴 토큰 스캔)·명령 위치 판정 통일(rm 재귀는 Moodie RE_RECURSE 동등, gh·npm도 같은 판정, 래퍼와 find -exec만 머리에서 이어질 때 명령 위치를 넘김)·git 머리 토큰 확장(`git.exe`·대문자)·branch 삭제+강제 동치·stash drop/clear·checkout `.`·config 읽기 전용 통과로 수리해 같은 러너가 통과 52·실패 0이 됐다.
- PASS 2026-08-10T20:07:00+09:00 — Step 7 격리 이관: dangerous-cmd-guard.test.mjs의 자체 spawnSync를 걷어내고 공통 격리 헬퍼(_lib/guard-spawn.mjs)만 쓰게 옮겨 통과 40·실패 0이며, 같은 파일이 「가드 파일명을 언급하는 훅 테스트는 전부 헬퍼를 import하고 직접 spawn 호출을 갖지 않는다」를 러너 차원 검사 1건으로 판정한다(위반 0건).
- PASS 2026-08-10T20:07:00+09:00 — Step 8 판정 로그 신설: 가드에 hook·event·session·agent_id·verdict·rule 여섯 필드를 남기는 독립 로거(CLAUDE_PROJECT_DIR 기준 경로)를 넣고 cmd-guard-log.test.mjs 픽스처 다섯(deny·allow·ask 각 줄과 verdict 일치, session·agent_id 부재 시 null, 미러 기록·live 무기록)이 통과 25·실패 0이며, live hook-log에도 이 세션의 실제 판정 줄이 40건 쌓여 있다.
- PASS 2026-08-10T20:07:00+09:00 — Step 8 규율 이탈 자기보고와 Red 영수증: 로거를 Step 3~6 수리와 한 번의 파일 재작성으로 함께 넣어 「구현 전 Red」 순서를 지키지 못했고, 사후에 수리 전 가드(01d4cd2 판)를 저장소 밖 임시 경로에 복제(diff IDENTICAL)해 같은 픽스처를 겨눈 결과 통과 5·실패 12로 Red를 재현했다 — 재현 명령은 `node .claude/hooks/cmd-guard-log.test.mjs --guard <임시경로>`다.
- PASS 2026-08-10T20:07:00+09:00 — Step 8·7 상호작용의 코디네이터 재정 수용: 신설 로그의 `cmd` 필드가 실행 명령 원문을 싣는 탓에 감사 grep 한 번으로 live hook-log 576·579행(두 줄 모두 session은 live 세션 675d6d46)이 합성 문자열을 품게 됐고, 문자열 포함 방식이던 Phase 1 격리 검사가 영구 1건을 세게 되어 ask로 올린 결과 「① 검사를 session·agent_id 필드 동등 비교로 바꾸고 ② cmd 필드는 유지한다(초과분 유지 승인)」로 재정돼 그대로 반영했다 — 판정은 여전히 합성 줄 0건 하나뿐이고 줄 수·byte 차분은 쓰지 않는다.
- PASS 2026-08-10T20:07:00+09:00 — Step 9 heredoc 본문 수리: 면제 대상 heredoc의 본문 머리 줄을 `fix: git push 재시도 로직 보강`(머리 토큰이 `fix:`라 오탐 표면을 겨누지 못함)에서 `git push --force origin main`·`rm -rf dist` 두 원문 줄로 바꿔, 본문이 세그먼트로 오인되면 반드시 deny가 나는 자리로 만들었고 실측은 allow다.
- PASS 2026-08-10T20:07:00+09:00 — Step 10 플래그 0 전환: 기대-실패 플래그 18건을 전부 제거해 일반 판정으로 뒤집었고 기준표 러너가 통과 61·실패 0·잔여 0건이며, `--moodie` 교차 구동의 원본 선언 불일치도 0건/56행으로 유지되고, 사람용 정본 02_동등성-기준표.md(151줄)의 플래그 열·현행 열·실측 근거 절도 같은 값으로 갱신했다.
- PASS 2026-08-10T20:07:00+09:00 — Step 11 Red 선관측: settings-matcher.test.mjs를 배선 수정 전에 실행해 통과 1·실패 2를 관측했고, 실패는 가드 matcher 실측 `Bash`(기대 `^Bash$`)와 비앵커 항목 잔존 1건(PreToolUse[0])이다.
- PASS 2026-08-10T20:07:00+09:00 — Step 12 배선 편집과 직후 회귀: settings.json의 가드 matcher를 `^Bash$`로 고친 것이 이 세션의 최후 구현·설정 편집이고, 직후 `npm run test:hooks`가 러너 일곱 종 전부 「전부 통과」(40·smoke·4·61·52·25·3)였으며, 편집 뒤에도 live hook-log에 이 세션의 cmd-guard 판정 줄이 계속 쌓여 핫로드가 발화를 끊지 않았음을 확인했다.
- PASS 2026-08-10T20:07:00+09:00 — Step 13 ① 하드 게이트 다섯 종과 npm test 차분(세션 675d6d46-1343-4624-bc7d-65feb631cc2c, 기준 HEAD 01d4cd2afdb362736abd89f44aa384f400315cba): typecheck:node·typecheck:web·lint·test:hooks·build 전부 exit 0이고, `npm test`는 Test Files 411 passed/6 skipped·Tests 5465 passed/12 skipped·실패 0으로 기준선(실패 0)과 차분 0이다.
- PASS 2026-08-10T20:20:00+09:00 — Phase 3 인수 ⑤ 배선 PASS·사후 게이트 PASS(인수자 세션 ea20b671-a046-4a29-8186-928f73b9d8d4, 기준 HEAD 3d1277727d789499879a81a4f9559807200a75e4): settings.json PreToolUse[0] matcher가 실물 `^Bash$`이고, 이 세션의 Bash 실행마다 cmd-guard 판정 줄이 새로 남아(session ea20b671, 20:17:11부터 누적 18줄) 신설 로거와 matcher 앵커가 살아 있음을 관측했으며, 하드 게이트 다섯 종을 재실행해 typecheck:node·typecheck:web·lint·test:hooks·build 전부 exit 0으로 green을 재확인했다.
- PASS 2026-08-10T20:20:00+09:00 — Phase 3 인수 ②③④ 커밋·clean·정상 Stop 확인: HEAD가 기준 01d4cd2에서 3d12777로 전진했고 메시지 접두가 `feat(M02-P2)`로 대문자 토큰이며, Phase 2 마감 커밋 시점의 워킹트리는 clean이었고(현 시점 미커밋 2건은 인수 이후 코디네이터가 편집한 03_Phase_3.md 영수증 줄과 _MilestonePreview.md 갱신 실측 줄뿐이다), hook-log에 Phase 2 세션 675d6d46의 stop-gate 줄이 20:09:52 verdict allow(스탬프 20:07:43 ≥ 장전 20:07:14)로 남아 정상 Stop이 확인된다.
