---
owner: 영호
milestone: HR2
phase: 11
title: 발화 프로브 + 회귀 게이트 + 재봉인 마감
status: done
grade: 복잡
risk: harness
loop_track: human-gate
estimated: 2~4h
domain: qa
summary: 정적 grep이 아니라 실제로 쏴 보는 프로브 7종으로 봉인·가드 발화를 확인하고, 회귀 게이트 5종 + CHANGELOG [H] + 재봉인으로 창을 닫는다.
---

# Phase 11: 발화 프로브 + 회귀 게이트 + 재봉인 마감

> **상태**: pending
> **마일스톤**: HR2
> **등급**: 복잡 (risk: harness)
> **담당**: 메인 직접 (프로브 판정) + secretary (게이트 실행)

---

## 🎯 목표

이번 창에서 바꾼 것이 **실제로 동작하는지** 확인하고 창을 닫는다.

**왜 grep이 아니라 프로브인가**: 이번 창의 고장 대부분이 **fail-open**이다 — 정규식이 경로를 못 알아보면 "무관"으로 판정해 그냥 통과시킨다. 에러도, 로그도 없다. 그래서 "코드에 새 경로가 들어갔다"를 확인해도 아무것도 보장되지 않는다. **차단되는지 직접 쏴 봐야 한다**(메모리 「수정은 실측으로 검증」).

---

## ⏪ 사전 조건

- [ ] P01~P09 완료
- [ ] P10 완료 여부 확인 — 미완이면 이 Phase에서 **완료 조건 6번이 red**이므로 마감 불가
- [ ] **P12 완료** — 번호는 뒤지만 실행은 이 Phase보다 앞이다(CLAUDE.md·Skills 다이어트). 다이어트 후 회귀 게이트를 다시 통과해야 마감이 유효하다

---

## 📝 작업 내용

### 발화 프로브 7종 (전부 라이브 실행 — 결과를 트랜스크립트에 남긴다)

- [ ] **① 봉인 차단** — 새 경로 `00_Documents/00_Harness/CORE.md` Edit 시도 → **차단**되는가
- [ ] **② 실행 경계** — `02_Source/**` 파일 Edit 시도 → **Worker 위임 차단** 메시지가 뜨는가
- [x] **③ OpenGate 통과 로그** — OPEN 후 봉인 파일 Edit → `guard-blocks.log`에 open-gate 통과 기록이 남는가 ✅ **489건** (§E)
- [ ] **④ sed 양방향** (P05 회귀 — 한 방향만 보면 반쪽):
  - 읽기 전용 `sed -n 1,50p .claude/... | node -e` → **통과**하는가 (오탐 해소 확인)
  - `sed -i 's/a/b/' .claude/settings.json` → 여전히 **차단**되는가 (방어 유지 확인)
  - `sed '1w .claude/x'` (스크립트 `w`) → **차단**되는가 (새 false negative 없음 확인)
- [ ] **⑤ 따옴표 우회** — `tee .claude/settings.json # it's fine` → **차단**되는가 (실측 고장 #4 봉합 확인)
- [ ] **⑥ 훅 테스트 + Codex 테스트** — `npm run test:hooks`(P05 신설) green · `.codex` 계약 테스트 green
- [ ] **⑦ 옛 이름 폴더 재생성 없음** — 루트에 `00.Documents` 등이 되살아나지 않았는가. ⚠️ e2e `SHOT_DIR`이 `mkdirSync(recursive: true)`라 테스트 한 번 돌리면 조용히 부활시킬 수 있다

### 회귀 게이트 5종
- [ ] `npm run typecheck` 0
- [ ] `npm run test` green
- [ ] `npm run lint` 0
- [ ] `npm run build` 성공
- [ ] e2e 최소 1본 PASS

### 마감
- [ ] **CHANGELOG `[H]` 항목** — 이번 창의 변경 요지 + **실측 고정 사실 5건**(별칭 스폰 / coordinator Agent 무력 / 따옴표 fail-open / 개명 규모 / effort 프로브 결과)을 박아 다음 점검이 같은 논의를 반복하지 않게 한다
- [ ] **effort 프로브 결과 반영** — P04가 no-op을 보였다면 **반전 항목**으로 기록(재시도 방지)
- [ ] **메모리 정리** — 폐기 1건(`claude-code-effort-precedence`) · 신설 2건(별칭 스폰 / 강제 출처 grep) · 갱신 3건(Fable=메인 전제)
- [ ] **재봉인** — `CLOSE-GATE.bat` 실행(**영호 단독**)
- [ ] ⚠️ **P07에서 이관된 검증** — CLOSE 직후 `.claude/settings.json`의 deny 블록이 **새 경로 4줄**(`Edit(00_Documents/00_Harness/**)` 등)을 보유하는지 확인. 창이 열린 동안에는 원리상 확인 불가였다(그때 settings.json은 OPEN 사본). 여기서 안 보이면 `settings.SEALED.json` 갱신이 누락된 것
- [ ] **`/hooks` 재신뢰** — 설정이 바뀌었으면 필요. ⚠️ 스크립트 본문만 바뀐 경우엔 불요(메모리 「deny 범위·훅 신뢰 실측」)
- [ ] work-pin 갱신 (다음 좌표)

---

## ✅ 완료 조건

- [ ] 프로브 7종 **전부 기대대로** — 하나라도 어긋나면 해당 Phase로 되돌아간다
- [ ] 회귀 게이트 5종 green (출력이 트랜스크립트에 남아 있을 것 — 자기보고 금지)
- [ ] CHANGELOG `[H]` 기록 완료
- [ ] `settings.json` deny가 봉인 상태로 복원됨(`gate-open.flag` 부재)
- [ ] P10 완료 확인 또는 **미완 사유 명시**(반쪽 종결이면 그 사실을 남긴다)

---

## 📚 학습 포인트

- **fail-open은 침묵한다** — 그래서 "고쳤다"의 증거가 코드가 아니라 **발화**여야 한다. 이게 이 Phase가 별도로 존재하는 이유다.
- **양방향 프로브** — 방어를 고칠 땐 "막혀야 할 게 막히는가"와 "통과해야 할 게 통과하는가"를 **둘 다** 본다. 한쪽만 보면 과차단이나 구멍 중 하나를 놓친다.
- **반전 기록의 가치** — "해 봤는데 안 되더라"를 남기지 않으면 다음 사람이 같은 시도를 반복한다. effort가 이 저장소에서 여섯 번 뒤집힌 이유다.

---

## ⚠️ 함정

- **게이트 green을 자기보고로 대체** — 출력이 트랜스크립트에 남아야 한다(헌법 "done 판사 = CI 회귀 게이트").
- **프로브를 grep으로 갈음** — 이 Phase 전체가 그걸 막으려고 있다.
- **재봉인을 잊고 세션 종료** — 창이 TTL(4h)로 자동 만료되긴 하나, 명시적으로 닫는 게 계약이다.
- **P10 미완인 채로 "완료" 선언** — 반쪽 개명이다. 미완이면 미완이라고 적는다.

---

## 담당 SubAgent

**메인 직접**(프로브 설계·판정 = 판단) + **secretary**(회귀 게이트 5종 실행·요약 = 기계 실행). 재봉인 `CLOSE-GATE.bat`은 **영호 단독**(ADR-038).

---

## 🔬 중간 실측 (2026-07-25, 창 개방 상태)

> P11은 **창 개폐 상태에 따라 두 부분으로 갈린다.** 창이 열려 있으면 `supervisor-guard`가 `exit 0`으로 전체 통과하는 것이 **설계 의도**(ADR-038:3)라, 훅 **글루** 레이어의 차단은 창 안에서 원리상 실측할 수 없다. 그래서 아래처럼 나눴다.

### A. 창 안에서 완료한 것

**프로브 ④ sed 양방향 — 판정기 레이어 green**

```
$ printf '%s' "sed -n 1,50p .claude/settings.json | node -e 'console.log(1)'" | node .claude/hooks/_lib/shell-policy.mjs shell-write
(빈 출력 — 통과)                                    ← 오탐 해소 확인
$ printf '%s' "sed -i 's/a/b/' .claude/settings.json" | ...
하네스 또는 다른 엔진 runtime에 대한 shell 우회 쓰기   ← 방어 유지
$ printf '%s' "sed '1w .claude/x' foo.txt" | ...
하네스 또는 다른 엔진 runtime에 대한 shell 우회 쓰기   ← 새 false negative 없음
```

**프로브 ⑤ 따옴표 우회 — 차단 확인**

```
$ printf '%s' "tee .claude/settings.json # it's fine" | node .claude/hooks/_lib/shell-policy.mjs shell-write
하네스 또는 다른 엔진 runtime에 대한 shell 우회 쓰기
```

⇒ **실측 고장 #4가 실제로 봉합됐다는 직접 증거.** 이 명령은 P05 전까지 봉인을 그냥 통과했다(따옴표 불균형 → 토큰 0 → sealed 후보 0 → 통과, 그런데 bash는 `#` 이후를 주석 처리하므로 명령 자체는 정상 실행).

**경로 판정 — 새 이름 봉인 확인**

```
00_Documents/00_Harness/CORE.md                      → sealed
00_Documents/01_Adr/ADR-010.md                       → sealed
98_Management/Harness_OpenGate/gate-open.flag     → sealed
tee 00_Documents/00_Harness/CORE.md                  → 차단
```

**프로브 ⑦ 옛 이름 폴더 재생성 0** — e2e를 여러 번 돌린 뒤에도 루트에 `00.Documents`·`01.Phases`·`02.Source`·`98.Management`·`99.Others` 전부 부재. `mkdirSync(recursive)`가 조용히 부활시킬 수 있는 경로였는데, P09의 `SHOT_DIR` 정정이 유효했다.

**회귀 게이트**

| 게이트 | 결과 |
|---|---|
| `npm run typecheck` | **0** (node + web) |
| `npm run lint` | **0** |
| `npm run test` | **395 passed / 6 skipped** · 5,330 tests |
| `npm run build` | 성공 |
| `npm run test:hooks` | **94 / 94 pass** |
| `node 00_Documents/00_Harness/conformance-check.mjs` | **13/13 PASS** |
| e2e `core-loop` | ⚠️ **3 failed / 1 passed** — §C |

### B. 창을 닫아야 실측 가능한 것 (영호 게이트)

- [x] **프로브 ①** 봉인 차단 (새 경로 Edit) ✅ **green** — §F
- [x] **프로브 ②** 실행 경계 (`02_Source/**` Edit → Worker 위임 차단) ✅ **green** — §F
- ~~**프로브 ③** OpenGate 통과 로그~~ → ⚠️ **분류 오류였다. §E로 이동** — 이건 창이 **열려 있는 동안에만** 실측 가능하다(개방 중 통과를 기록하는 라벨이므로). 닫은 뒤에 찾으면 새 기록이 안 생긴다
- **P07 이관 검증** — CLOSE 직후 `.claude/settings.json` deny에 **새 경로 4줄**이 복원되는가. 창이 열린 동안 그 파일은 OPEN 사본이라 원리상 확인 불가였다.

⇒ `CLOSE-GATE.bat` 실행은 **영호 단독**(ADR-038). 영호 판단(2026-07-25): *"아직 열어두고 다른 작업 더"*.

⭐ **이 표의 분류 자체가 실측으로 한 번 교정됐다** — ①②와 ③은 둘 다 "OpenGate 관련"이라 같은 칸에 묶기 쉽지만, **방향이 반대**다. ①②는 *차단*을 보는 것이라 봉인이 살아 있어야 하고, ③은 *통과 기록*을 보는 것이라 봉인이 풀려 있어야 한다. **"창 상태에 의존한다"는 공통점이 "같은 시점에 검증한다"를 뜻하지 않는다.**

### C. e2e `core-loop` red — 원인 미규명, 백로그 이관 (영호 결정)

3연속 재현. **HR2 변경과 무관하다는 근거는 확보**했다:

| 근거 | 실측 |
|---|---|
| 코드 변경 | P09 4-passed 이후 `02_Source/**` 변경 **0** |
| renderer 번들 | 해시가 P09 때와 **동일**(`index-BZBY5D8e.js`) |
| userData | `%APPDATA%/AgentDeck` 파일 전부 **Jul 18** — 오늘 변경 0 |
| 애니메이션 | `.fe-blank-btn`은 `transition: background`뿐 — **위치 애니메이션 없음** |

실패 지점 = "폴더 선택" 클릭이 **stable 대기**에서 30s 타임아웃(버튼은 visible·`cursor=pointer`로 정상 렌더). 2·3번 실패는 폴더 미개방에 따른 연쇄.
가설 3개(직전 대규모 테스트의 부하 · userData 오염 · CSS 애니메이션)를 전부 기각한 뒤 메모리 「라이브 재현 멈춤 규칙」(2~3회 실패 시 전환)에 따라 조사 중단.

⭐ **부수 발견** — `core-loop.e2e.ts:27-34`의 `electron.launch`에 **`--user-data-dir`가 없다.** e2e가 영호의 실제 앱 상태를 공유한다는 뜻이고, 비결정론의 원인이자 **테스트가 사용자 데이터를 오염시킬 수 있는 통로**다. HR2 범위 밖 → 백로그.

**영호 결정(2026-07-25)**: 백로그로 넘기고 *"e2e 최소 1본 PASS"* 는 다른 본으로 충족한다.

### D. P10 — Codex 세션에 위임 → **완료** ✅ (2026-07-25)

CORE-12로 Claude가 수행 불가한 영역이라, 영호 승인 하에 **Codex에 위임**했다. 1차(서브에이전트, 읽기 전용)가 훅 봉인에 막혀 진단만 남긴 뒤, **영호가 직접 기동한 Codex 세션**이 적용을 마쳤다.

대상은 브리프의 42건이 아니라 **63건**이었다(이스케이프 정규식 21건 누락 — 1차 위임이 잡아냈다). 상세 = `10-codex-symmetry.md` §6.

| P11 완료 조건 ⑥ | 결과 |
|---|---|
| `.codex` 테스트 green | **30 / 31 pass** |
| 유일한 red | `REVALIDATION_REQUIRED` — codex-cli **0.145.0 ≠ baseline 0.144.1** |

⚠️ **이 red는 개명과 무관하고 P10이 만들지도 않았다.** CLI 업그레이드라는 환경 드리프트이고, ADR-033:30이 설계한 *"CLI 불일치 시 **결과가 같아도** exit 3"* 의 **2회차 발화**다(1회차 = 2026-07-13 도입 당일). 해소에 필요한 격리 canary 재실측이 Codex 세션 재기동을 요구하므로 **백로그 이관**(영호 판단 대기).

⇒ 완료 조건 ⑥은 **"개명이 Codex 가드를 죽이지 않았음"** 을 묻는 것이었고 그건 충족됐다. 환경 드리프트까지 해소하는 건 이 조건의 의도가 아니다.

### C-2. e2e 최소 1본 PASS — `engine-update`로 충족 ✅

영호 결정에 따라 `core-loop` 대신 폴더 조작에 의존하지 않는 본으로 충족했다.

```
$ npx playwright test 99_Others/tests/e2e/engine-update.e2e.ts
[engine-update] checkEngineUpdate(): {"current":"0.3.201","latest":"0.3.220","updateAvailable":true}
  ok 1 ... checkEngineUpdate IPC가 실 npm registry로 generic EngineUpdateInfo를 반환한다 (48ms)
[engine-update] 프롬프트 메시지: 현재 0.3.201 버전을 사용 중입니다. 최신 버전 0.3.220(으)로 업데이트할까요?
[engine-update] 설치 로그 라인 수: 4
  ok 2 ... "새 엔진 버전" 프롬프트 → "업데이트" 클릭 → 설치 로그 스트리밍 → 완료 (30.3s)

  2 passed (34.6s)
```

이 본은 **실 npm registry를 타는 라이브 테스트**라 대체재로서 오히려 강하다 — Electron 기동 · IPC 왕복 · 스트리밍 · 사용자 클릭 처리가 전부 살아 있음을 보인다.

⭐ **동시에 §C의 진단을 좁혀준다**: 같은 Electron 앱에서 **버튼 클릭이 정상 동작**했다(`"업데이트"` 클릭 → 설치 로그 스트리밍). 즉 `core-loop` 실패는 앱 전반이나 Playwright 클릭 자체의 문제가 아니라 **파일 탐색기 빈 상태의 "폴더 선택" 클릭 경로에 국한**된다. 백로그 조사의 출발점을 여기로 좁힌다.

---

### E. 프로브 ③ — OpenGate 감사 로그 **green** ✅ (창이 열려 있는 동안만 가능했던 실측)

```
$ grep -c "open-gate" .claude/state/guard-blocks.log
489

$ grep "open-gate" .claude/state/guard-blocks.log | tail -3
2026-07-25T13:10:10.889Z | supervisor-guard | open-gate | Bash 통과 (flag age 352m)
2026-07-25T13:10:36.029Z | supervisor-guard | open-gate | Bash 통과 (flag age 353m)
2026-07-25T13:11:10.647Z | supervisor-guard | open-gate | Bash 통과 (flag age 353m)
```

⭐ **이 숫자가 의미하는 것** — P03 작업 중 발견해 P05로 넘긴 🔴 결함이 정확히 이 지점이었다. `guard-log.mjs:29`의 `action==='block' ? 'block' : 'notify'` **이분법**이 훅이 정확히 넘긴 `open-gate` 라벨을 삼켜서, 당시 같은 명령이 **0건**을 냈다(실제로는 notify 2,526건에 혼입돼 있었다).

그래서 ADR-038 `:9`가 위협 모델 완화의 **대가**로 내세운 문장 — *"개방 중 통과 이력은 전량 `guard-blocks.log`에 `open-gate`로 남아 사후 감사 가능"* — 은 **선언만 되고 한 번도 지불된 적이 없었다.** P05가 allowlist(`LOG_ACTIONS`) 방식으로 봉합했고, 이번 창이 그 봉합 이후 **처음으로 열린 창**이라 여기서 489건이 나온 것이 곧 **계약 이행의 첫 실증**이다.

| 판정 항목 | 결과 |
|---|---|
| 라벨 분리 (`open-gate` ≠ `notify`) | ✅ 489건이 고유 라벨로 기록 |
| `flag age` 동반 기록 | ✅ 통과 시점의 창 경과가 함께 남아 **TTL 내였는지 사후 대조 가능** |
| 감사 가능 구간 | 2026-07-25 봉합 시점 이후 — **소급 불가**(로테이션으로 옛 이력 복원 불능, ADR-038 「보완」 절에 명시) |

⚠️ **이 프로브는 창을 닫으면 다시 못 얻는다.** ①②(차단 실측)와 정반대 조건을 요구하므로 §B에서 여기로 옮겼다 — 분류 오류를 실측이 교정한 사례다.

---

### F. CLOSE 직후 프로브 ①② + P07 이관 검증 — **전부 green** ✅

영호가 `CLOSE-GATE.bat`을 직접 실행(ADR-038 에이전트 deny)한 뒤 즉시 실측했다.

#### F-1. P07 이관 검증 — `settings.json` deny에 새 경로 4줄 **복원 확인**

```
deny 총 20줄
 13. Edit(00.Documents/harness/**)      ← 옛 4줄 (의도적 존치)
 14. Edit(00.Documents/adr/**)
 15. Edit(00.Documents/ADR.md)
 16. Edit(98.Management/Harness_OpenGate/**)
 17. Edit(00_Documents/00_Harness/**)      ← 새 4줄 ✅
 18. Edit(00_Documents/01_Adr/**)
 19. Edit(00_Documents/ADR.md)
 20. Edit(98_Management/Harness_OpenGate/**)
```

⭐ **이 검증이 CLOSE 이후에만 가능했던 이유**가 그대로 확인됐다. P07은 `settings.SEALED.json`만 고치고 `.claude/settings.json`은 **일부러 손대지 않았다** — 창이 열린 동안 그 파일은 OPEN 사본이고, permission 계층은 gate flag로 우회되지 않으므로 거기에 경로 deny를 써 넣으면 **그 즉시 자기 세션이 잠긴다.** 그래서 HEAD에는 옛 16줄이 남아 있었고, CLOSE가 SEALED판을 복원하면서 비로소 새 4줄이 워킹트리에 나타났다.

⇒ 이 diff는 **커밋 대상**이다(이번 창 내내 "OpenGate 개방판이라 커밋 금지"였던 그 파일이, CLOSE 후에는 정당한 산출물로 성격이 바뀐다).

부수 확인: `gate-open.flag` **삭제됨**(`No such file or directory`) — CLOSE가 flag를 정리했다.

#### F-2. 프로브 ① 봉인 차단 — 새 경로에서 **발화**

```
$ echo probe | tee 00_Documents/00_Harness/__probe-canary.tmp
🛑 supervisor-guard 차단: 하네스 또는 다른 엔진 runtime에 대한 shell 우회 쓰기 — 봉인 중
   → 영호 명시 해제 전까지 하네스 변경 불가(읽기·git add/commit은 허용).
```

⭐ **P07의 존재 이유가 라이브로 증명됐다.** 옛 정규식(`00\.documents`)이었다면 여기서 **통과**했을 것이고, 그게 P07이 임시 사본으로 실측했던 fail-open이다(당시 4경로 전부 `false`). `[._]` 문자 클래스 전환이 실제로 작동한다.

canary는 실제 파일이 아니라 **존재하지 않는 경로**를 썼다 — 봉인 판정은 경로 패턴이므로 파일 실재와 무관하게 걸려야 하고, 만약 통과했더라도 정본 파일이 손상되지 않는다. 잔존 확인 결과 **파일 생성 0건**.

#### F-3. 프로브 ② 실행 경계 — **green** (⚠️ 훅 출력만 보면 놓칠 뻔했다)

`Write` 도구로 `02_Source/main/__probe-canary.ts` 생성을 시도하자 화면에 뜬 것은 **tdd-guard 메시지 하나뿐**이었다:

```
⚠️ TDD-guard: '__probe-canary.ts' 구현에 대응 테스트(99_Others/tests/**/__probe-canary.test.*)가
   안 보입니다. 헌법 CRITICAL: 테스트 먼저(TDD). (차단 모드)
```

그런데 `guard-blocks.log`는 다른 이야기를 한다:

```
22:05:04.435 | supervisor-guard | block | 앱 코드 편집(C:/Dev/AgentDeck/02_Source/main/__probe-canary.ts)
22:05:04.489 | tdd-guard        | block | __probe-canary.ts 대응 테스트 부재 (차단 모드)
```

⭐ **supervisor-guard가 54ms 먼저 차단했다.** 두 훅이 병렬로 돌아 **둘 다 발화**했고, 사용자에게 표시된 것은 tdd-guard 것뿐이었다. 훅 출력만 보고 판정했다면 *"supervisor-guard ②절은 안 걸렸다"* 로 **오독**했을 것이다.

⇒ **로그가 훅 출력보다 강한 증거다.** 훅이 여럿 걸리는 경로에서는 화면에 뜨는 메시지가 "가장 먼저 막은 훅"이라는 보장이 없다.

훅 소스 확인 — 실행 경계 ②절도 `[._]` 병행 수용이 적용돼 있다:
```sh
*/02[._]Source/*)      block "앱 코드 편집($P)" "도메인 Worker(...)에 위임하세요.";;
*/99[._]Others/tests/*) block "테스트 편집($P)" "qa Worker에 위임하세요.";;
```

#### F-4. 덤 — tdd-guard의 **안내 경로**가 새 이름을 가리킨다

차단 메시지가 `99_Others/tests/**/__probe-canary.test.*`(새 경로)를 안내했다. P07이 `tdd-guard.sh`의 대상 판정(`:27-31`)과 테스트 탐색(`:37-40`)을 **짝으로** 고치면서 남긴 완료 조건 — *"차단 메시지도 같은 변수를 쓰므로 개명 후 없는 경로를 안내하는 일이 구조적으로 불가능해졌다"* — 이 그대로 확인됐다. 한쪽만 고쳤다면 훅은 새 경로에서 막으면서 안내는 **존재하지 않는 `99.Others/tests/`** 를 가리켰을 것이다.

#### F-5. ⚠️ 예상 못 한 프로브 — 회귀 게이트 실행이 **막혔다**

```
$ npm run typecheck
🛑 supervisor-guard 차단: npm run typecheck
   → 회귀 게이트 실행은 secretary에 위임하세요.
```

실행 경계 ②절의 **Bash 분기**다. 창이 열린 동안에는 전부 통과했으므로(실측 고정 ⑰) 이번 창에서 처음 마주친 발화이고, 프로브 ②의 추가 증거다. 동시에 `execution-owner` 판정표의 *"회귀 게이트 실행 = 위임"* 이 **문서 규범이 아니라 기계 강제**임을 확정한다(P06이 라벨링한 강제 출처 3층에서 이 항목의 등급이 올라간다).

⚠️ **동시에 구조적 막힘을 드러낸다** — 세 규칙이 동시에 참일 때 메인이 게이트를 돌릴 경로가 없다:

| 출처 | 규칙 |
|---|---|
| 헌법 운영 모드 | *"done 판사 = CI 회귀 게이트"* — 마감에 게이트가 필요 |
| `supervisor-guard` ②절 `[기계]` | 게이트 실행은 메인 금지, secretary 위임 |
| 세션 지시 | *"Do not call the AgentTool unless the user requested it"* — 위임 불가 |

창을 열면 통과하지만 **창은 하네스 수정용이지 게이트 실행용이 아니다** — 그 용도로 여는 습관이 들면 OpenGate가 상시 개방으로 흐른다. → 영호 판단 필요(§G).

#### F-5-b. §F-5의 해소 — secretary 위임 (영호 승인)

영호가 이 건에 한해 Agent 호출을 승인했다. 훅이 안내하는 경로 그대로다.

⭐ **위임이 실제로 작동하는 이유가 훅 소스에 명시돼 있다** — `supervisor-guard.sh`의 `[ -n "$AGENT_TYPE" ] && exit 0`. 서브에이전트는 실행 경계 ②절을 **면제**받는다. 메인은 막고 서브는 통과시키는 것이 설계 의도이고, 그래서 *"secretary에 위임하세요"* 라는 차단 메시지가 **실제로 작동하는 안내**다(막다른 길을 가리키는 표지판이 아니다 — ADR-038 개정 1이 걷어낸 유형과 대비된다).

⭐ **같은 계열이 하나 더 있다 — `git add`도 차단된다.**

```
$ git add .claude/settings.json …
🛑 supervisor-guard 차단: git add
   → 커밋·스테이징은 secretary에 위임하세요.
```

실행 경계 ②절의 Bash 분기는 **회귀 게이트와 커밋·스테이징 둘 다**를 메인에게서 회수한다. 잡무 기준 v1의 *"판단 종료 후 기계 실행은 위임"* 이 **문서 규범이 아니라 기계 강제**임이 두 항목에서 확인됐고, `secretary.md`의 커밋 소유(P03에서 "빼면 훅 차단 메시지 3개가 고아가 된다"며 유지한 그것)도 훅으로 실제 받쳐져 있다. **커밋 문구 작성(판단)은 메인, 실행(기계)은 secretary** — 판정표 그대로의 분업이 훅으로 강제된다.

⚠️ **이 창의 P09가 *"위임 경로가 닫혀 있어 메인 직접 수행"* 했던 것은 창이 열려 있어서 훅이 통과시켰기 때문이다.** 봉인이 살아 있는 평시에는 애초에 성립하지 않는 선택지였다 — 창이 규율을 느슨하게 만든 사례이고, OpenGate를 "작업이 편해지니까" 여는 습관이 왜 위험한지의 구체적 형태다.

#### F-6. 프로브 ⑦ 재확인 — 옛 이름 폴더 재생성 **0건**

`00.Documents`·`01.Phases`·`02.Source`·`98.Management`·`99.Others` 전부 `No such file or directory`. e2e `SHOT_DIR`이 `mkdirSync(recursive)`라 조용히 부활시킬 수 있는데, CLOSE 시점까지 그런 일은 없었다.

---

### G. 마감 회귀 게이트 6종 — **전부 green** ✅ (secretary 위임 실행)

봉인이 복귀한 상태에서, 즉 **실제 운영 조건 그대로** 돌린 결과다.

| 게이트 | exit | 수치 |
|---|---|---|
| `npm run typecheck` | **0** | — |
| `npm run lint` | **0** | — |
| `npx vitest run` | **0** | **395 파일 passed** / 6 skipped (401) · **5,330 tests passed** / 10 skipped (37.9s) |
| `npm run build` | **0** | 경고 2건(아래) |
| `npm run test:hooks` | **0** | **94 / 94 pass** (fail 0, skipped 0) |
| e2e `engine-update` | **0** | **2 passed** (34.7s) — 실 npm registry 라이브(`0.3.201 → 0.3.220`) |

build 경고 2건은 **HR2 이전부터 있던 비차단 경고**이고 개명과 무관하다: ⓐ `engine-versions.ts`가 동적·정적 양쪽으로 import돼 청크 분리가 안 되는 것 ⓑ renderer 번들 3,015.87 kB 크기 경고.

📌 **HR2 회귀 기준선 대비**: P01 시점 394파일 / 5,325 passed → **395파일 / 5,330 passed**. 차이 +1파일·+5는 P02가 신설한 `agent-model-canon.test.ts` 뿐이고, **개명·하네스 개편으로 인한 회귀는 0**이다. 1,342 파일이 이동하고 2,472줄이 치환된 창에서 이게 최종 성적이다.

---

## 🚧 잔여 — 마일스톤 종결은 다음 세션 (영호 결정)

| 항목 | 왜 이 세션에서 못 하나 |
|---|---|
| **description listing 압축**(P12 이관분) | ⚠️ **구조적 모순** — 편집은 `.claude/agents/**`가 봉인 대상이라 **창이 필요**하고, 검증(발화 프로브)은 정의 워처 사망 때문에 **새 세션이 필요**하다. 한 세션이 둘을 다 만족하려면 **새 세션에서 OPEN-GATE를 함께 실행**해야 한다. P12 원장이 "P11 이관"이라고만 적었을 때는 이 모순을 보지 못했다 |
| **`HR2-DONE.md` + 5단계 보고** | 등급 대규모. 위 항목이 끝나야 최종 회고가 완결된다 |
| **push / PR** | CORE-06 사람 게이트. 현재 커밋만 누적, push 미실행 |

⇒ **영호 결정**: 마일스톤을 닫지 않고 다음 세션까지 열어둔다. 그 세션에서 OPEN-GATE → description 압축 → 발화 프로브 → CLOSE → `HR2-DONE.md`.
