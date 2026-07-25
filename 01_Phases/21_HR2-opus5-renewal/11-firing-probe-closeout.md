---
owner: 영호
milestone: HR2
phase: 11
title: 발화 프로브 + 회귀 게이트 + 재봉인 마감
status: pending
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

- [ ] **① 봉인 차단** — 새 경로 `00_Documents/harness/CORE.md` Edit 시도 → **차단**되는가
- [ ] **② 실행 경계** — `02_Source/**` 파일 Edit 시도 → **Worker 위임 차단** 메시지가 뜨는가
- [ ] **③ OpenGate 통과 로그** — OPEN 후 봉인 파일 Edit → `guard-blocks.log`에 open-gate 통과 기록이 남는가
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
- [ ] ⚠️ **P07에서 이관된 검증** — CLOSE 직후 `.claude/settings.json`의 deny 블록이 **새 경로 4줄**(`Edit(00_Documents/harness/**)` 등)을 보유하는지 확인. 창이 열린 동안에는 원리상 확인 불가였다(그때 settings.json은 OPEN 사본). 여기서 안 보이면 `settings.SEALED.json` 갱신이 누락된 것
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
00_Documents/harness/CORE.md                      → sealed
00_Documents/adr/ADR-010.md                       → sealed
98_Management/Harness_OpenGate/gate-open.flag     → sealed
tee 00_Documents/harness/CORE.md                  → 차단
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
| `node 00_Documents/harness/conformance-check.mjs` | **13/13 PASS** |
| e2e `core-loop` | ⚠️ **3 failed / 1 passed** — §C |

### B. 창을 닫아야 실측 가능한 것 (영호 게이트)

- **프로브 ①** 봉인 차단 (새 경로 Edit)
- **프로브 ②** 실행 경계 (`02_Source/**` Edit → Worker 위임 차단)
- **프로브 ③** OpenGate 통과 로그 (`guard-blocks.log`의 `open-gate`)
- **P07 이관 검증** — CLOSE 직후 `.claude/settings.json` deny에 **새 경로 4줄**이 복원되는가. 창이 열린 동안 그 파일은 OPEN 사본이라 원리상 확인 불가였다.

⇒ `CLOSE-GATE.bat` 실행은 **영호 단독**(ADR-038). 영호 판단(2026-07-25): *"아직 열어두고 다른 작업 더"*.

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

### D. P10 — Codex 세션에 위임 (영호 승인)

CORE-12로 Claude가 수행 불가한 영역이라, 영호 승인 하에 **Codex 서브에이전트에 위임**했다(2026-07-25).
대상 `.codex/**` 7파일 **42건** + 별건 2:
- `config.toml`의 rescue write 루트 2줄이 **옛 폴더명** → Codex가 새 폴더에 아무것도 못 쓰는 상태(**Codex판 부트스트랩 자물쇠**)
- `harness-contract.test.mjs:132`가 coordinator의 `Agent` 보유를 기계 강제 → P03 반납으로 **현재 red**

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
