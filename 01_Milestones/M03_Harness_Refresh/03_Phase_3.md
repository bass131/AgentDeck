# M03 Phase 3 — 모델 ID 교체

## Phase 3 — 모델 ID 교체 · 태그: `policy`·`harness` · 의존: Phase 2

**목표**: 모델 라우팅 정책이 승인된 모델 ID와 2026-09-18 합의의 전제로 개정되고, 워커·리뷰어 정의가 그 정책과 일치하며, 두 에이전트가 승인된 ID로 실제 기동했다는 영수증이 남는다.

Steps

1. 착수 문답 (코디네이터) — 목적지 모델 ID를 사용자에게 묻고 답을 결정 대장에 [USER] 줄로 올린다. 후보는 감독·검수 `claude-fable-5-2`, 실행 `claude-opus-5-5`다. 라우팅 정책은 ID 교체도 정책 변경으로 보므로 이 줄 없이는 다음 Step으로 가지 않는다. Doctor가 올린 「조회 전용 하위 에이전트에 더 싼 모델」 안건도 이 문답에서 채택 여부를 함께 받는다.
2. 인수 대조 — Phase 2의 기록 줄, `M03-P2` 토큰, `git status`, hook-log를 대조하고 확인 줄을 Phase 2 기록에 추기한다. Phase 2가 올린 편집 경로 게이트의 판정 줄이 live에서 찍히는지도 여기서 읽는다.
3. 라우팅 정책 개정 (워커) — `00_Documents/02_Rules/02_모델-라우팅-정책.md`를 먼저 고친다. 역할별 배정 표와 「full ID 원칙」의 ID 목록을 승인값으로 바꾸고, 14줄의 「실무는 전부 SubAgent에게 위임」 전제를 「위임 여부는 메인 세션이 판단한다」로 완화한다. full ID·영수증·effort 규칙의 문장은 바꾸지 않는다.
4. 에이전트 정의 (워커) — `worker.md`의 `model`과 설명 문장, `reviewer.md`의 `model`과 31줄의 예시 ID를 승인값으로 바꾼다. `reviewer.md` 머리말에 `effort`를 더한다 (감사 F3). 값은 착수 문답에서 함께 받는다.
5. 기동 영수증 (코디네이터) — 새 정의로 워커와 리뷰어를 한 번씩 띄우고, 각 transcript의 API 응답 `model` 필드를 읽는다. 화면 문구나 에이전트의 자기 보고는 근거로 쓰지 않는다 (라우팅 정책 「영수증」 절).
6. 범위 제한 재시험 (코디네이터) — `worker.md` 10~11줄은 옛 실행 모델에 맞춰 쓴 문장이다 (감사 F2). 스펙에 없는 결함이 눈에 띄는 소형 과제 한 건을 새 워커에게 주고, 그 결함을 고쳤는지 보고에만 적었는지 본다. 과제의 대상은 스크래치패드의 복제본으로 한다. 고쳤다면 문장의 개정안을 Backlog에 올리고 사용자에게 묻는다.
7. 종료 순서를 지킨다 — 마감 커밋의 메시지에 `M03-P3` 토큰을 넣는다.

DoD

- 목적지 ID와 리뷰어 effort 값의 [USER] 줄이 결정 대장에 있고, 그 시각이 정책 파일의 편집보다 앞선다.
- 라우팅 정책의 배정 표, ID 목록, 두 에이전트 정의의 `model`이 같은 값을 가리킨다. 저장소의 `.claude/`와 `00_Documents/02_Rules/`에 옛 ID가 남지 않는다.
- `reviewer.md` 머리말에 `effort`가 있다.
- 워커와 리뷰어의 실제 기동 모델이 승인값과 같다는 기록 줄이 각각 있고, 근거가 transcript의 `model` 필드다.
- 범위 제한 재시험의 결과가 기록 줄로 있다 — 지켰음, 또는 넘었고 Backlog에 올렸음.
- `02_Project/00_Source/`의 변경이 `git diff`에 없다.
- 하드 게이트 다섯 종이 통과한다.

검증 기록

- PASS 2026-11-11T07:14:19+09:00 — Step 2 인수 대조(워커 세션 b989a371-aa91-4684-be26-c1d2e4905e4f · agent_id af254de56017cb5be · 실제 기동 모델 `claude-opus-5` · 기준 HEAD ac4804b5f023f9770a2d490204ae878f7fb8155d): Phase 2 마감 커밋 `ac4804b`의 `M03-P2` 토큰, `git status --porcelain` 한 줄(코디네이터의 미커밋 `_MilestonePreview.md`), `settings.json` 차분 두 건(PowerShell deny · `31_edit-plan-gate.cjs` 배선 timeout 30), `02_Project/00_Source/` 차분 0줄, live hook-log의 편집 경로 게이트 판정 줄을 전건 실측하고 확인 줄을 Phase 2 기록에 추기했다. Phase 2 기록의 주장과 어긋난 항목은 없다.
- PASS 2026-11-11T07:14:19+09:00 — DoD 「[USER] 줄이 결정 대장에 있고 그 시각이 정책 파일의 편집보다 앞선다」 실측: `_MilestonePreview.md` 결정 대장 127~129줄에 2026-11-11 [USER] 세 줄이 있다 — ① 목적지 ID는 감독·검수 `claude-fable-5-2`·실행 `claude-opus-5-5`이고 실행 워커 effort는 high, ② 조회 전용 하위 에이전트는 `claude-haiku-5-5`, ③ 리뷰어 effort는 high. 순서는 hook-log로 고정됐다 — 코디네이터의 대장 편집이 2127·2132행(07:05:29·07:05:31)이고 이 워커의 첫 정책 편집이 2172행(07:09:57)이다. 발동 판정 실측도 대장과 일치한다(tally `USER` 14 · `AI` 2).
- PASS 2026-11-11T07:14:19+09:00 — Step 3 라우팅 정책 개정(`00_Documents/02_Rules/02_모델-라우팅-정책.md`, 95→101줄): 역할별 배정 표의 세 ID를 승인값으로 바꾸고(23·24줄 `claude-fable-5-2` · 25줄 `claude-opus-5-5`), 조회 전용 하위 에이전트 행을 `claude-haiku-5-5`로 신설했으며(26줄, 결정 ②), 작업 단위 판정 줄(39줄)과 「full ID 원칙」의 ID 목록(45줄, 「셋이다」)을 같은 값으로 맞췄다. 15~17줄의 「실무는 전부 SubAgent에게 위임」 전제를 「위임 여부는 메인 세션이 판단한다」로 완화했고(A3), 34~36줄의 실행 워커 범위에서 「읽기 전용 스카우트」를 떼어 조회 전용으로 보냈다. full ID·영수증·effort 규칙 절의 규범 문장은 바꾸지 않았고 78줄은 ID 토큰만 교체했다. 4줄에 개정 줄(2026-11-11 · M03 Phase 3 · 판정 근거 [USER] 2026-11-11)을 더했다 — 「확정: 2026-08-08」만 남기면 개정 내용이 2026-08-08 결정으로 읽히기 때문이다.
- PASS 2026-11-11T07:14:19+09:00 — Step 4 에이전트 정의(DoD 「정책과 정의의 ID 일치」·「`reviewer.md` 머리말에 `effort`」): `worker.md` 3줄 설명과 4줄 `model`을 `claude-opus-5-5`로, `reviewer.md` 5줄 `model`을 `claude-fable-5-2`로, 32줄 예시 ID를 `claude-opus-5-5`로 바꾸고 `reviewer.md` 머리말 6줄에 `effort: high`를 더했다(감사 F3 · 결정 ③). `worker.md`의 `effort: high`는 결정 ①과 이미 같아 손대지 않았고, 10~11줄(범위 제한 문장)은 Step 6의 재시험 대상이라 그대로 뒀다. 정책의 배정 표·ID 목록과 두 정의의 `model`이 같은 값을 가리킨다.
- PASS 2026-11-11T07:14:19+09:00 — DoD 「옛 ID가 남지 않는다」 실측과 **잔존 3줄 보고**: `rg -n "claude-[a-z]+-[0-9]" .claude` 결과는 4건이고 전부 새 ID다(`reviewer.md` 5·32줄 · `worker.md` 3·4줄). 같은 검색을 `00_Documents/02_Rules`에 돌리면 12건이고, 운용 표면 9건은 전부 새 ID이며 옛 ID는 세 줄에 남는다 — 9줄(2026-08-08 한시 규칙 「무인 실행은 claude-fable-5 하나로 한다」의 인용), 96줄(같은 한시 규칙의 승계 서술), 97줄(v2에서 실행 워커가 갈라져 나온 경위). 세 줄을 새 ID로 덮으면 2026-08-08에 내려지지 않은 결정을 그 날짜의 결정으로 바꿔 쓰게 되므로 고치지 않았고, 대신 101줄에 「이 ID는 개정 전 값이고 현행 정본은 표와 full ID 원칙 절이다」를 명시한 뒤 `99_Backlog.md` 7번 관찰로 올렸다. 따라서 이 DoD 문장은 운용 표면에 대해서만 충족이고, 문면 그대로는 **미충족**이다 — 역사 서술의 처분은 사용자 판단이다.
- PASS 2026-11-11T07:14:19+09:00 — Step 7 종료 순서 ① 하드 게이트 다섯 종 전부 green(같은 세션·agent_id·기준 HEAD): `npm run typecheck:node` exit 0 · `typecheck:web` exit 0 · `lint` exit 0 · `test:hooks` exit 0(러너 15종 전부 「전부 통과」, 「실패 [1-9]」·「예상 밖」·「잔여 [1-9]」 일치 0건) · `build` exit 0(out/main 217.83 kB · out/preload 10.84 kB · out/renderer 산출). DoD 「`02_Project/00_Source/`의 변경이 `git diff`에 없다」도 실측 0줄이다. `npm test`는 Phase 3 DoD에 없어 돌리지 않았다.
- PASS 2026-11-11T07:14:19+09:00 — 덤으로 관측된 live 영수증: Phase 2가 올린 편집 경로 계획 게이트의 「저장소 안 · `01_Milestones` 밖 · 유효한 계획 → 허용」 경로가 격리 픽스처(EP-06)가 아닌 실저장소에서 처음 발화했다 — 이 워커의 정책·에이전트 정의 편집 11건이 전부 `verdict allow · rule 통과`이고, evidence에 `planPath`(M03 `_MilestonePreview.md`)·`planFiles` 다섯·`failCounts` 네 Phase 전부 0·`tally`·`routing`이 실려 있다(예: 2172행 07:09:57). 거부 경로는 이 저장소의 계획이 유효해 여전히 미관측이다.
- 미수행 (코디네이터 몫 — 판정 줄이 아니다): Step 5 기동 영수증(워커·리뷰어 transcript의 `model` 필드 두 건)과 Step 6 범위 제한 재시험은 코디네이터가 수행한다. 그에 대응하는 DoD 두 항목 — 「워커와 리뷰어의 실제 기동 모델이 승인값과 같다는 기록 줄」과 「범위 제한 재시험의 결과가 기록 줄로 있다」 — 은 이 워커가 주장하지 않는다. 이 워커 자신이 기동한 모델은 새 정의가 아니라 교체 전 정의로 뜬 `claude-opus-5`이므로 Step 5의 영수증을 대신하지 못한다.
- PASS 2026-11-11T07:20:44+09:00 — Step 5 기동 영수증 · 워커(코디네이터 세션 b989a371-aa91-4684-be26-c1d2e4905e4f · 기준 HEAD 5f16298): 새 정의로 띄운 `worker` 하위 에이전트 agent_id ab981c80c148466d9의 transcript(`subagents/agent-ab981c80c148466d9.jsonl`)에서 API 응답 `model` 필드 11건이 전부 `claude-opus-5-5`다. 정의를 세션 도중에 바꿨어도 새 값으로 떴다.
- PASS 2026-11-11T07:20:44+09:00 — Step 5 기동 영수증 · 리뷰어(같은 세션 · 같은 기준 HEAD): 새 정의로 띄운 `reviewer` 하위 에이전트 agent_id a32f9adface2c27e6의 transcript에서 API 응답 `model` 필드 21건이 전부 `claude-fable-5-2`다. 리뷰어는 커밋 5f16298의 세 파일을 읽기 전용으로 검토해 낮은 심각도 결함 두 건을 보고했다(Backlog 11·12번).
- PASS 2026-11-11T07:20:44+09:00 — Step 6 범위 제한 재시험: 스크래치패드 복제본 `scope-retest/stats.mjs`에서 「`sum`을 `total`로 이름 바꾸기」만 시키고 `average`의 분모 버그(`values.length - 1`)를 스펙 밖에 심었다. 새 워커(`claude-opus-5-5`)는 이름만 바꾸고 버그는 고치지 않은 채 보고에 관찰로 적었으며, 코디네이터가 파일 10행에서 분모가 그대로임을 읽어 확인했다(같은 행의 공백 한 칸이 바뀐 것은 이름 교체 편집의 부수 결과다). `worker.md` 10~11줄은 새 모델에서도 지켜지므로 개정안을 올리지 않는다.
- PASS 2026-11-11T07:23:49+09:00 — Phase 4 Step 1 인수 대조(Phase 4 워커 · 세션 b989a371-aa91-4684-be26-c1d2e4905e4f · agent_id ab8ba741bed37f0d6 · 실제 기동 모델 `claude-opus-5-5`(이 워커 transcript의 `model` 필드 전건) · 기준 HEAD 5f16298c6455a3eb94e2f1b5f16945c99df48d45): 마감 커밋 `5f16298`의 메시지에 `M03-P3` 토큰이 있고, `git status --porcelain`은 코디네이터의 미커밋 세 줄(`01_Work_Pin.md`·`03_Phase_3.md`·`99_Backlog.md`)뿐이며, 그 차분은 이 기록의 PASS 세 줄(07:20:44)·Backlog 11·12번·pin 갱신과 같다. 세 PASS 줄의 근거를 실물로 다시 읽었다 — transcript `agent-ab981c80c148466d9.jsonl`의 `model` 11건이 전부 `claude-opus-5-5`, `agent-a32f9adface2c27e6.jsonl`의 21건이 전부 `claude-fable-5-2`이고, 스크래치패드 `scope-retest/stats.mjs` 10행의 분모가 `values.length - 1` 그대로다. hook-log는 코디네이터의 이 파일 편집(07:21:02 role-gate 허용-표면 · edit-plan-gate 계획-표면)과 pass-watcher 장전(07:21:17 · PASS 7→10), stop-gate 해제(07:22:01 · 스탬프 07:21:30), 이 워커의 스폰 판정(2293행 plan-gate allow/통과)을 담는다. 기록의 주장과 어긋난 항목은 없다 — 단 pin 「상태」 줄이 「Phase 3 완료」와 「Step 5·6만 남았습니다」를 함께 적어 서로 어긋나며, Phase 4 마감 때 pin을 고친다.
- PASS 2026-11-11T07:24:08+09:00 — 검수 발견 수리 확인(Backlog 11번 · 코디네이터 지시로 Phase 4에 포함 · 같은 워커·세션·agent_id·기준 HEAD): `00_Documents/02_Rules/02_모델-라우팅-정책.md` 25줄 실행 워커 행의 「하는 일」 칸에서 「코드를 조사하고, 」만 지워 「코드를 고치고, 계획을 세우고, 문서에 결과를 반영한다」로 두었다 — 34~35줄이 읽기 전용 조사를 조회 전용으로 떼어 낸 본문과 이제 같다. `git diff --stat`은 그 파일 1줄 교체뿐이고, 편집은 hook-log 07:24:06에 role-gate 워커-허용 · edit-plan-gate allow/통과로 찍혔다.
