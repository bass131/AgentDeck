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

- (기록 없음)
