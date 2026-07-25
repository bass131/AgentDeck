---
owner: 영호
milestone: HR2
phase: 07
title: 훅·봉인 경로 선행 — 부트스트랩 자물쇠 해소
status: pending
grade: 복잡
risk: harness, trust-boundary
loop_track: human-gate
estimated: 3~5h
domain: cross
summary: 개명보다 먼저 훅의 경로 매칭을 새 이름까지 받아들이게 만든다 — 순서가 뒤집히면 창을 열어도 안 열린다.
---

# Phase 07: 훅·봉인 경로 선행 — 부트스트랩 자물쇠 해소

> **상태**: pending
> **마일스톤**: HR2
> **등급**: 복잡 (risk: harness · trust-boundary)
> **담당**: 메인 직접

---

## 🎯 목표

폴더 개명 **전에** 훅·봉인·권한의 경로 매칭을 새 이름까지 인식하도록 바꾼다. 이 Phase가 P08보다 앞서지 않으면 **개명 순간 봉인이 조용히 풀리고, 창을 열 수도 없게 된다.**

---

## ⏪ 사전 조건

- [ ] P05 완료 (훅 보안 봉합 — 같은 파일을 두 번 건드리지 않도록 순서 고정)
- [ ] OpenGate 개방
- [ ] 개명 매핑표 영호 확정 승인 (파괴 작업 = 이름 확정 목록 원칙)

---

## 📝 작업 내용

### ⚠️ 부트스트랩 자물쇠 (이 Phase의 존재 이유)
`supervisor-guard.sh:30`의 `GATE_FLAG="${CLAUDE_PROJECT_DIR:-.}/98.Management/Harness_OpenGate/gate-open.flag"`가 폴더명을 **하드코딩**한다.
- `98.Management`를 먼저 옮기면 훅이 flag를 못 찾아 **창이 즉시 닫힌 것처럼 동작** → 남은 봉인 파일을 그 자리에서 고칠 수 없다.
- 반대로 개명 직후엔 그 폴더가 sealed 분류에서 빠져 **에이전트가 `gate-open.flag`를 직접 만들 수 있다**(자기 개방 = 봉인 소멸).
- `OPEN-GATE.bat:9,13`은 `%HERE%` 상대라 flag를 새 폴더에 쓰므로 훅과 어긋난다.

### ⚠️ GATE_FLAG만은 선택지가 없다 — **구·신 2경로 OR 검사 강제**

다른 경로는 "신·구 병행 수용"이든 "상수 일원화"든 택할 수 있지만, `supervisor-guard.sh:30`의 `GATE_FLAG`는 **일원화가 금지**다.

새 경로로 일원화하면 P08 전이라 폴더는 아직 `98.Management` → flag 미발견 → 즉시 봉인 복귀 → 남은 봉인 파일을 그 자리에서 편집 불가. **P07이 막으려는 사고를 P07이 스스로 일으킨다.**

- [ ] `supervisor-guard.sh:30` GATE_FLAG — **구·신 두 경로를 OR로 검사**(둘 중 하나라도 존재하면 개방)
- 다른 정규식(`shell-policy.mjs:220~223,244`)은 일원화해도 "차단이 늦게 걸릴 뿐"이라 회복 가능하다. GATE_FLAG는 **회복 경로 자체를 끊는다** — 이 비대칭이 핵심

### 경로 매칭 갱신 (원칙: 신·구 이름 **병행 수용**)
- [ ] `shell-policy.mjs:220` `/^00\.documents\/(?:harness|adr)(?:\/|$)/`
- [ ] `shell-policy.mjs:221` `rel === '00.documents/adr.md'`
- [ ] `shell-policy.mjs:223` `/^98\.management\/harness_opengate(?:\/|$)/`
- [ ] `shell-policy.mjs:244` `HARNESS_CANDIDATE_RE` (후보 추출기 — 여기가 빠지면 앞의 3개가 무의미)
- [ ] `supervisor-guard.sh:89-90` case 글롭 `*/02.Source/*`·`*/99.Others/tests/*`
- [ ] ⚠️ `tdd-guard.sh:27-31`(대상 판정) **와** `:37-40`(테스트 탐색) — **반드시 짝으로**. `:30`만 고치면 대응 테스트를 영영 못 찾아 전 파일 과차단(fail-closed), `:37-40`만 고치면 여전히 fail-open. **부분 수정이 가장 나쁘다**
- [ ] `tdd-guard.sh:44` 차단 메시지 문구 (사용자에게 옛 경로를 안내하게 됨)
- [ ] `risk-detector.sh:22-30` · `reviewer-auto-trigger.sh:22-24` · `convention-size-guard.sh:21` · `done-report-policy.mjs`(htmlTarget `00\.Documents\/reports\/`)
- [ ] ⚠️ `done-report-policy.test.mjs:13` — **픽스처가 `00.Documents/reports/…`**. mjs만 고치면 `test:hooks`가 red가 된다

### ⚠️ ADR-038 canonical은 `settings.SEALED.json` — `.claude/settings.json`은 **파생물이라 손대지 않는다**

실측(2026-07-25): `OPEN-GATE.bat:9` = `copy /Y settings.OPEN.json → .claude\settings.json` · `CLOSE-GATE.bat:10` = `copy /Y settings.SEALED.json → .claude\settings.json`. 즉 **`settings.json`은 창을 열고 닫을 때마다 통째로 덮어써지는 사본**이다.

- [ ] **편집 대상 = `98.Management/Harness_OpenGate/settings.SEALED.json:54-57` 단독**
- [ ] `settings.OPEN.json`은 **무변경** — 경로 deny가 애초에 없다(실측: deny 블록이 curl·wget·env·env.*·secrets 6줄뿐)
- [ ] ⚠️ **`.claude/settings.json`을 직접 고치면 두 번 실패한다**:
  - ① 창이 열린 동안 거기엔 경로 deny 4줄이 **없다**. 도로 써 넣으면 **permission 계층은 gate flag로 우회되지 않으므로**(flag는 `supervisor-guard` 훅만 통과시킨다) 그 즉시 자기 세션이 잠겨 **P07을 끝낼 수 없다**
  - ② 설령 성공해도 `CLOSE-GATE.bat`이 SEALED로 덮어써 편집이 사라진다
- [ ] `settings.json`에 새 deny가 실제로 반영됐는지는 **P11의 `CLOSE-GATE.bat` 실행 후** 확인한다(AC를 P11로 이관)

### 훅 테스트의 옛 경로 단언 동반
- [ ] `shell-policy.test.mjs:158-184` · `hook-exit.test.mjs:105-176`
- [ ] ⚠️ **정규식과 테스트가 둘 다 옛 경로면 테스트는 계속 통과한다**(false green). 새 경로로 봉인이 걸리는지 검증하는 **신규 케이스**를 추가해야 한다

---

## ✅ 완료 조건

- [ ] **발화 프로브** — 새 이름 경로(`00_Documents/harness/CORE.md` 등)를 대상으로 Edit 시도 시 **차단**(폴더가 아직 없어도 경로 판정은 동작해야 함)
- [ ] 옛 이름 경로도 여전히 차단(개명 전이므로 회귀 없음)
- [ ] `npm run test:hooks` green — **신규 케이스가 새 경로 차단을 검증**(기존 케이스 통과만으로는 불충분)
- [ ] `tdd-guard`의 두 지점이 짝으로 갱신됐음을 diff로 확인
- [ ] **P07 적용 직후에도 창이 살아 있다** — `guard-blocks.log`에 open-gate 통과 기록이 계속 쌓인다(GATE_FLAG OR 검사가 동작한다는 증거)
- [ ] `settings.SEALED.json`의 deny 블록이 **새 경로 4줄을 보유**. `settings.OPEN.json`·`.claude/settings.json`은 **무변경**(후자는 P11 CLOSE 후 검증)
- [ ] `npm run typecheck` 0 · `npm run test` green · `npm run lint` 0

---

## 📚 학습 포인트

- **부트스트랩 자물쇠** — 잠금을 여는 열쇠가 잠긴 방 안에 있는 상황. 코드로는 못 풀고 **순서로만** 풀린다.
- **fail-open의 방향성** — 정규식이 "실패"하는 방향이 곧 "봉인 해제" 방향일 때, 오타 하나가 보안 사고다. 그래서 정적 grep이 아니라 발화 프로브로 확인한다.
- **false green** — 검사 대상과 검사 코드가 같은 가정을 공유하면 테스트는 아무것도 보장하지 않는다.

---

## ⚠️ 함정

- **`98.Management`를 먼저 옮기기** — 이 Phase 전체가 그것을 막기 위해 존재한다.
- **GATE_FLAG를 새 경로로 일원화** — 위 함정의 변종이고, 폴더를 안 옮겨도 똑같이 창이 죽는다.
- **`tdd-guard` 한쪽만 고치기** — 과차단 또는 fail-open. 둘 다 나쁘다.
- **`.claude/settings.json`을 직접 고치기** — 그건 파생물이다. 자기 세션을 잠그거나, CLOSE 때 사라지거나, 둘 다다. canonical은 `settings.SEALED.json`.
- **테스트 green을 완료 조건으로 삼기** — 새 경로 검증 케이스가 **존재하는지**가 조건이다.

---

## 담당 SubAgent

**메인 직접** (훅·settings = 하네스, 영호 단독 통제 대행).
