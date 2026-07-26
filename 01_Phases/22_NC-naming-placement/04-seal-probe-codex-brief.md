---
owner: 영호
milestone: NC
phase: 04
title: 창 폐쇄 후 봉인 발화 프로브 + Codex 핸드오프
status: in-review
grade: 보통
risk: harness
loop_track: human-gate
estimated: 1~2h
domain: cross
summary: 창을 닫아야만 성립하는 중간 게이트 — 훅이 신·구 양쪽에서 실제로 발화하는지 로그로 실측하고, 그것이 green일 때만 개명에 들어간다. 동시에 Codex 어댑터 대칭을 브리프로 넘긴다.
---

# Phase 04: 창 폐쇄 후 봉인 발화 프로브 + Codex 핸드오프

> **상태**: 🟡 **in-review** (2026-07-26) — **프로브 green · 브리프 완성**, **Codex receipt 대기 중**. 회수 전에는 P05를 시작하지 않는다(hard gate).
> **마일스톤**: NC
> **등급**: 보통 (그러나 **이 마일스톤의 중간 게이트**)
> **담당**: 메인 직접 + 영호(창 폐쇄·Codex 세션)

---

## 🎯 목표

이 Phase가 끝나면 **"훅을 고쳤다"가 자기보고가 아니라 실측으로 증명된다.** 그리고 Codex 엔진 쪽 봉인도 개명 전에 신 경로를 인식하게 된다.

---

## ⏪ 사전 조건

- [x] Phase 03 완료 (훅 병행 수용 + 골든 픽스처 green)
- [x] **유지보수 창 1 폐쇄** — 영호가 `CLOSE-GATE.bat` 실행

> ⭐ **창을 닫아야만 프로브가 성립한다.** `supervisor-guard.sh:57-59` — 창이 열려 있으면 flag 검사를 통과해 **훅 전체가 exit 0**이 된다. 즉 창 안에서는 봉인 발화를 실측할 방법이 원리적으로 없다.

---

## 📝 작업 내용

### 봉인 생존 프로브 (창 폐쇄 후)

- [x] ⭐ **canary 경로로 프로브한다** — 실물이 아니라 **존재하지 않는 가짜 경로**(예: `00_Documents/01_Adr/__canary__.md`)에 쓰기를 시도한다. red여도 정본이 다치지 않는다(HR2 P11 선례)
- [x] 이것이 성립하는 이유: `shell-policy.mjs:382` `normalizeAbsolute` 가 소문자 통일 후 정규식 대조를 하므로 **판정이 파일 존재와 무관한 순수 문자열 분류**다. 따라서 개명 *전*에 아직 없는 신 경로 문자열로 프로브해도 개명 *후* 동작과 **논리적으로 등가**다
- [x] **신 경로 canary** → 훅이 차단하는지 **로그로** 확인
- [x] **구 경로 canary** → 병행 수용이 살아 있는지 확인
- [x] ⚠️ **판정은 훅 출력이 아니라 로그로** — 병렬 발화 시 화면엔 하나만 뜬다. 음성 판정(발화 안 함)은 로그로만 확인 가능하다
- [x] 재봉인 실측 — Edit deny 라인 복귀 · `$comment` 봉인판 · `gate-open.flag` 삭제
- [x] `.claude/settings.json` 이 `settings.SEALED.json` 의 복사본으로 갱신됐는지 (P03의 SEALED 수정이 정본에 실렸는지)

### Codex 핸드오프 브리프 작성

- [x] `01_Phases/22_NC-naming-placement/NC-codex-handoff.md` 신설 (HR2의 `A-sprint-codex-handoff.md` 형식 재사용)
- [x] **기동 조건 게이트** 포함 — 조건 미충족 시 Codex가 아무것도 건드리지 않고 멈추게 (HR2에서 실제로 작동한 장치)
- [x] **수리 대상 = P02 역산 표 ④축 전수** (엔진 중립 매니페스트로 첨부)

### 🔴 CRITICAL — digest·재신뢰를 브리프 필수 항목으로

- [x] `hooks.json` 의 **command / commandWindows 8개 필드 digest 동기화**
- [x] ⚠️ **왜 critical인가**: 훅 본문 digest가 `hooks.json` 인자와 다르면 **모든 훅이 아무 출력 없이 return** 한다(fail-open no-op). 즉 **경로는 고쳤는데 훅 자체가 안 도는** 반쪽 수정이 되고, 그 상태에서 시크릿·파괴·비가역·하네스·TDD 차단이 **전부 조용히 사라진다.** HR2에서도 브리프가 이걸 빠뜨릴 뻔했다
- [x] **trusted 새 세션에서 `/hooks` 재신뢰** — ⚠️ 파일 갱신은 Codex root, **재신뢰는 영호가 실행**
- [x] 신 이름 **live canary** 로 실제 발화 확인 (계약 테스트 green ≠ 활성)

### 운영 제약 3항목 (초안은 개수만 요구하고 내용을 정의하지 않았다)

- [x] ① **Codex receipt 회수 전에는 P05·P07을 개시하지 않는다** (hard gate)
- [x] ② **P05의 부분 이동 구간에는 Codex 세션을 돌리지 않는다** (트리가 중간 상태일 때)
- [x] ③ **Codex는 `.claude/hooks/**`·`.claude/state/**` 를 읽지 않는다** — 첨부된 **엔진 중립 매니페스트만** 사용한다 (CORE-12 대칭)
- [x] **무수정 중단 조건** — 예상 밖 범위가 드러나거나 baseline 판정이 변하면 **아무것도 고치지 않고 보고 후 멈춘다**

### 증거(receipt) 형식 — 이게 없으면 P05를 시작하지 않는다

- [x] 변경 파일 목록 또는 diff 식별자
- [x] hook / contract 테스트 **출력 원문**
- [x] `harness-doctor` 출력
- [x] **digest 동기화 확인** + `/hooks` 재신뢰 결과
- [x] **신·구 canary 로그** (양성·음성 양쪽)
- [x] **`harness-review` 스킬 교차 감사** 결과 — Claude 정본 ↔ Codex 어댑터 대조

### 검증 비대칭 기록

- [x] CORE-12로 Claude가 확인할 수 없는 영역을 **명시적으로 열거** — 이것이 격리의 대가이며, 숨기지 않고 기록하는 것이 유일한 정직한 처리다

---

## ✅ 완료 조건

- [x] 창 폐쇄 상태에서 **봉인 발화 로그가 신·구 양쪽 경로 모두에 존재**
- [x] `.claude/settings.json` 의 deny 목록이 `settings.SEALED.json` 과 **일치** (재봉인이 정본을 실었음)
- [x] `gate-open.flag` **부재** 확인
- [x] `NC-codex-handoff.md` 존재 + 기동 조건 게이트 + ④축 매니페스트 첨부 + **운영 제약 3항목이 내용까지 정의됨** + digest·재신뢰 필수 항목 포함
- [ ] ⭐ **Codex receipt 회수 완료** — 위 「증거 형식」 6항목이 **전부** 도착. ⚠️ **브리프 작성만으로 이 Phase를 닫지 않는다**(초안은 그게 가능했다 — Codex 변경 0건인 채로 green이 나온다)
- [ ] 🚦 **receipt가 없으면 P05를 시작하지 않는다** (hard gate — 체크박스가 아니라 진입 조건)
- [x] **게이트 G1·G2 green** (정본 = `_milestone-plan.md` 「🧪 회귀 게이트 정본」) — **창 폐쇄 후** 재실행
- [x] **V1 봉인 생존 프로브 · V2 재봉인 상태 확인** 통과 (정본 = 같은 절 「이 마일스톤 고유 검증」)

> 🚦 **이 Phase가 red면 Phase 05로 진행하지 않는다.** 예비 창 1회를 열어 P03을 보완한 뒤 프로브를 재실행한다.

---

## 📚 학습 포인트

- **"게이트가 열려 있으면 게이트를 시험할 수 없다"** — 안전장치를 검증하려면 그 장치가 활성인 상태여야 한다. 유지보수 창은 편의를 위해 방어를 끄는 장치이므로, 창 안에서의 green은 방어에 대해 아무것도 말해주지 않는다.
- **음성 판정은 출력으로 못 한다** — "차단됐다"는 화면에 보이지만 "차단 안 됐다"는 아무것도 안 보이는 것과 구별되지 않는다. 그래서 로그가 필요하다.

---

## ⚠️ 함정

- **프로브를 창 안에서 돌리는 것** — 전부 green으로 보이고 아무것도 검증되지 않는다. 이 마일스톤에서 가장 하기 쉬운 실수다.
- **Codex 세션 순서 역전** — Codex 훅 대칭이 P05 개명보다 **늦으면**, 개명 직후 Codex 엔진의 봉인이 새 경로에서 fail-open이 되고 CORE-12 때문에 Claude는 **검증조차 못 한다.**
- **자기보고를 증거로 받는 것** — Codex가 "36/36 통과"라 보고해도 Claude는 그 실행을 확인할 수 없다. 세션 로그를 받고, 확인 불가 영역은 **확인 불가라고 쓴다.**

---

## 🧾 프로브 실측 결과 (2026-07-26, 창 폐쇄 직후) — **중간 게이트 GREEN**

판정은 **출력이 아니라 로그**(`.claude/state/guard-blocks.log`)로 했다. 기준선 4,292줄 → 프로브 후 **block 3줄 추가**.

| # | 벡터 | canary 경로 | 기대 | 결과 |
|---|---|---|---|---|
| ① | Bash `>` | `00_Documents/harness/PROBE.tmp` (구) | 차단 | ✅ `supervisor-guard \| block` |
| ② | Bash `>` | `00_Documents/00_Harness/PROBE.tmp` (신) | 차단 | ✅ `supervisor-guard \| block` |
| ③ | Bash `>` | `00_Documents/PROBE.tmp` (봉인 밖) | **통과** | ✅ 통과 후 즉시 정리 — **과봉인 아님** |
| ④ | Write 도구 | `00_Documents/00_Harness/` | 차단 | ✅ permission deny |
| ⑤ | Write 도구 | `00_Documents/harness/` | 차단 | ✅ permission deny |
| ⑥ | Write 도구 | `00_Documents/02_Harness/` (재정렬 가정) | 차단 | ✅ **훅 단독 차단** — 로그에 기록 |

**부작용 0** — `find . -name PROBE.tmp` = 0건, `00_Documents/02_Harness/` 폴더 미생성.

### ⭐⭐ 프로브 ⑥이 P03의 설계 판단을 실증했다

`.claude/settings.json` 의 permission deny 는 **나열식**이라 `00_Harness`·`01_Adr` 만 안다. `02_Harness`(번호가 재정렬된 가정)는 **그 목록에 없다.** 그런데 차단됐다 — **훅 정규식 `(?:\d{2}_)?` 가 단독으로 잡은 것**이고, 로그가 그 사실을 남겼다(`supervisor-guard | block | 하네스 편집(…/02_Harness/PROBE.tmp)`).

P03에서 *"특정 번호를 하드코딩하지 않는다"* 를 고른 이유가 **가정이 아니라 실측으로 확인**됐다: 번호는 「읽는 순서」라 문서가 하나 끼어들면 재정렬되는데, **나열은 재정렬을 못 따라가고 정규식은 따라간다.** 그리고 여기서 층의 값어치도 드러난다 — 권한 1층이 놓친 것을 훅 2층이 받았다.

### 재봉인 실측 (V2)

- `gate-open.flag` **부재** ✅
- `.claude/settings.json` deny = **22줄**(SEALED판) ✅ — 창 안에서는 5줄(OPEN판)이었다
- ⭐ **P03이 SEALED에 추가한 신 경로 2줄이 라이브에 실렸다** ✅ (`Edit(00_Documents/00_Harness/**)`·`Edit(00_Documents/01_Adr/**)`) — 창 폐쇄가 정본을 실어 나른다는 실증
- ⚠️ **permission deny 에 `Write(...)` 규칙은 0건**인데, `Edit|Write` matcher 에 `supervisor-guard` 가 걸려 있어 훅 층이 Write 도구를 받는다. 프로브 ④⑤가 permission 에서 잡힌 것으로 보아 `Edit(...)` deny 가 파일 쓰기 전반에 적용되는 것으로 보이나, **그 정확한 의미론은 확인하지 못했다**(추정). 어느 쪽이든 2층이라 결과는 차단이다

### 🟡 남은 것 — Codex receipt

브리프 = **`NC-codex-handoff.md`**(신설). 기동 조건 게이트 4항목 · 엔진 중립 매니페스트(폴더 11 + 파일 스템 2) · 🔴 digest CRITICAL · 운영 제약 3항목(내용까지 정의) · receipt 6항목 · 검증 비대칭 정직 선언.

⚠️ **이 Phase 는 브리프 작성으로 닫히지 않는다.** receipt 6항목이 전부 도착해야 `done` 이고, 그때까지 **P05 는 시작하지 않는다**(hard gate).

---

## 담당 SubAgent

**메인 직접**(프로브 판정·브리프 문안 — 판단이 살아 있음) + **영호**(창 폐쇄·Codex 세션 실행).
