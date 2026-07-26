---
owner: 영호
milestone: NC
phase: 05
title: 문서 폴더 개명 전수 — 00_Documents 하위 + reports 하위 + 리뷰 통합
status: pending
grade: 복잡
risk: harness
loop_track: human-gate
estimated: 3~5h
domain: cross
summary: 영호가 불평한 바로 그 화면을 고친다 — 뒤섞인 폴더 이름 11개를 NN_PascalCase로 통일하고, 성격이 같은 리뷰 폴더 둘을 합치고, 분류 없이 루트에 남은 파일 6개를 제자리로 보낸다.
---

# Phase 05: 문서 폴더 개명 전수

> **상태**: pending
> **마일스톤**: NC
> **등급**: 복잡 (risk: harness — `00_Documents/{adr,harness}` 는 CORE-11 봉인)
> **담당**: 메인 직접(판정) + `secretary`(대량 치환 실행)

---

## 🎯 목표

이 Phase가 끝나면 `00_Documents/` 를 열었을 때 **폴더 이름이 하나의 규칙으로 읽힌다.** 이것이 영호가 *"대충 방에 쓰레기 던져놓은 것마냥"* 이라고 말한 화면의 실물이다.

**Before**
```
_Codex_Review  adr  Artifacts  assets  harness  reports  reviews
```
**After**
```
00_Harness  01_Adr  02_Reports  03_Reviews  04_Artifacts  05_Assets
```

---

## ⏪ 사전 조건

- [ ] **Phase 04 프로브 green** — 훅이 신·구 양쪽에서 발화함이 실측됨 (red면 진행 금지)
- [ ] **Codex 훅 대칭 완료** — 아니면 개명 직후 Codex 봉인이 fail-open
- [ ] **유지보수 창 2 개방**

---

## 📝 작업 내용

### `00_Documents/` 하위 폴더 개명 (읽는 순서 = CLAUDE.md 문서 지도)

- [ ] `harness` → `00_Harness` ⚠️ **CORE-11 봉인** — P03 병행 수용 선행 필수
- [ ] `adr` → `01_Adr` ⚠️ **CORE-11 봉인**
- [ ] `reports` → `02_Reports`
- [ ] `reviews` → `03_Reviews/Harness/` ⭐ **하위로 한 단계 내려간다** (아래 「리뷰 폴더 통합」)
- [ ] `Artifacts` → `04_Artifacts` (이미 PascalCase — 번호만)
- [ ] `assets` → `05_Assets`

> 번호는 알파벳순이 아니라 **읽는 순서**다. 번호의 값어치는 정렬이 아니라 *"먼저 읽어야 할 것이 먼저 보이는 것"* 에 있다.

### 리뷰 폴더 통합 — `03_Reviews/{Codex,Harness}/` 대칭 (P02 실측 반영)

- [ ] `_Codex_Review/` **6파일** → `03_Reviews/Codex/`
- [ ] `reviews/` **2파일**(`2026-07-11-harness-review-all.md`·`2026-07-17-harness-review-all.md`) → `03_Reviews/Harness/`
- [ ] 둘 다 "어떤 시점의 검토 기록"으로 성격이 같다 — 폴더 목록이 **두 줄** 줄고 분류는 살아남는다
- [ ] Phase 02에서 실측한 **참조처 전수**를 따라 링크 갱신 (⚠️ `_Codex_Review` 참조는 **코드·스크립트 0건**, 문서 6건뿐이고 그중 4건은 이번 마일스톤 자신의 문서다)
- [ ] ⚠️ **`Codex`·`Harness` 에는 번호를 붙이지 않는다** — 엔진별 **병렬 분류**라 순서 개념이 없다. 억지 번호는 *"0번이 1번보다 먼저"* 라는 없는 의미를 주장한다(ADR-039 §1)

> ⭐ **왜 `reviews` 를 `03_Reviews` 그 자체로 두지 않는가**: 그러면 `03_Reviews/` 루트에 harness 리뷰 2파일이 **직접 놓이고** Codex 만 하위 폴더가 되어 비대칭이 된다. 그 구조는 **정확히 `reports/` 루트가 앓던 병**(분류 폴더 루트에 산출물이 널림)이고, 이 Phase가 아래에서 6파일을 옮기며 고치는 것과 같은 병이다. **같은 병에 같은 처방을 쓰지 않으면 규칙이 규칙으로 읽히지 않는다.**

### `02_Reports/` 하위 폴더 개명

- [ ] `milestones` → `00_Milestones`
- [ ] `guides` → `01_Guides`
- [ ] `manuals` → `02_Manuals`
- [ ] `next` → `03_Next`
- [ ] 동반 갱신 3종: `done-report-policy.mjs` 정규식 / 저장소 밖 참조(글로벌 스킬·프로젝트 메모리) / `INDEX.md` 링크

### `reports/` 루트에 분류 없이 남은 6파일 → `00_Milestones/`

- [ ] `LP1-01-대상선정.md` · `LP1-02-doc-maintainer-손실행.md` · `LP1-03-P0-매트릭스-초안.md` · `LP1-지표-원장.md`
- [ ] `LP-루프-이식-확정안-순서와-시스템.html` · `UPSTREAM-원본대조-엔진자유도-실측.html`
- [ ] `INDEX.md` 는 인덱스라 **루트 유지**
- [ ] 이동 후 `INDEX.md` 링크 전수 갱신

### 경로 리터럴 전수 치환

- [ ] 저장소 전체에서 구 경로 문자열 검색 → 신 경로로 치환
- [ ] ⚠️ **산문은 미수정, 경로 리터럴은 예외 없이 수정** — HR2 P08이 확립한 판정 기준(*"독자가 가서 읽을 용도인가 vs 그때 무슨 일이 있었나의 서술인가"*)
- [ ] `CLAUDE.md` 문서 지도(`:4`·`:23`) · `AGENTS.md:4` · `.claude/policies/**` · ADR 상호 참조
- [ ] ⭐ **transitive 소비처** — 스킬 브리지가 *읽어 들어가는* 파일들이다. 스킬 자체는 개명 대상이 아니지만 그 안의 경로가 stale해지면 브리지가 **잘못된 위치로 유도**한다:
  - `.claude/commands/harness-review.md:69`·`:93` — 산출물을 옛 `00_Documents/reviews` 에 쓰도록 **지시**한다. 고치지 않으면 개명된 `03_Reviews` 옆에 **옛 폴더를 다시 만든다**. ⚠️ **신 경로 = `00_Documents/03_Reviews/Harness/`** (한 단계 깊어진다). ⭐ **판정이 「신·구 병기」가 아니라 「수정」인 이유**: 나머지 봉인층 7줄은 *가리키는* 참조라 병기가 안전하지만, 이 둘은 *쓰라고 지시하는* 경로다 — **지시 경로는 하나여야 한다**
  - `.codex/README.md:3` — CORE 포인터. ⚠️ **Codex root 담당**(CORE-12로 Claude는 손댈 수 없다)

---

## ✅ 완료 조건

- [ ] `ls 00_Documents` 출력이 **`NN_PascalCase` 6개 + `.md` 8개**로만 구성 (소문자 시작 폴더 0, 언더스코어 시작 폴더 0). ⚠️ **`.md` 는 7개가 아니라 8개다** — P02가 `ROOT_LAYOUT.md` 를 신설했다
- [ ] `ls 00_Documents/03_Reviews` 출력이 `Codex`·`Harness` **두 폴더만** (루트에 직접 놓인 파일 0)
- [ ] `ls 00_Documents/02_Reports` 출력에 소문자 폴더 0 + 분류 안 된 산출물 파일 0 (`INDEX.md` 제외)
- [ ] ⭐ **구 경로 리터럴이 「활성 포인터 문맥」에서 0건** — ⚠️ **전역 0건은 원리적으로 달성 불가다**(아래 참조). 검사 범위를 한정하되 **폴더 11건 각각을 따로** 센다:
  - ⚠️ **초안은 `adr|harness|reports/milestones` 세 패턴만 봐서 `reviews`·`assets`·`Artifacts`·`_Codex_Review`·`reports` 일반 소비처를 통째로 놓쳤다.** 개명한 것마다 검사한다
  - **대상**: `CLAUDE.md` · `AGENTS.md` · `.claude/policies/**` · `.claude/commands/**` · `00_Documents/**` 의 ADR 상호참조·`INDEX.md` 링크 — 즉 *"독자가 가서 읽을 용도"* 의 포인터
  - **판정 방식**: live consumer는 **0건**, 역사 보존 목록은 **기대 건수·파일 목록 일치**(0건이 아니라 "예상대로 남아 있는가")
  - ❄️ **제외(보존 확정 — 지우면 오히려 파괴다)**:
    - `settings.SEALED.json` 구 deny 라인 → **P03 AC가 존치를 요구**한다(타이머 만료 전)
    - 훅 골든 픽스처의 신·구 쌍(`shell-policy.test.mjs`·`hook-exit.test.mjs`) → **P03이 오히려 증설**한 것이다
    - `01_Phases/**` 과거 마일스톤 기록 산문 → 이 Phase 자신의 「산문은 미수정」 원칙
    - `supervisor-guard.sh`·`dangerous-cmd-guard.sh` 주석의 사건 서술 → 기록
- [ ] **게이트 G1·G2·G4·G5 green** (정본 = `_milestone-plan.md` 「🧪 회귀 게이트 정본」). ⚠️ **G2는 이 Phase가 개명한 폴더 안에 산다** — 신 경로 `00_Documents/00_Harness/conformance-check.mjs` 로 실행
- [ ] G1이 **신 경로 봉인 픽스처로** 통과 (구 경로 픽스처도 병행 수용으로 여전히 green)
- [ ] **V4 매니페스트 목록 대조** — 폴더 11건이 **전부** 개명됨. 10건이면 실패다

---

## 📚 학습 포인트

- **`git mv` 와 대소문자** — 이 저장소는 `core.ignorecase = true`다. 대소문자만 바뀌는 개명은 `git mv` 한 번으로는 **조용한 no-op**이고 typecheck도 green으로 남는다(파일시스템이 대소문자를 무시해 import가 계속 해석됨). 그래서 이번 범위에서는 **대소문자 전용 개명을 아예 제외**했다.
- **개명이 안전장치를 푸는 메커니즘** — 훅의 경로 정규식이 옛 이름으로 이스케이프돼 있으면, 폴더를 옮기는 순간 그 경로가 "봉인 밖"으로 떨어진다. 에러도 로그도 없다. HR2에서 실제로 4곳이 동시에 무력화됐다.

---

## ⚠️ 함정

- **P04 프로브를 건너뛰고 여기 들어오는 것** — 병행 수용이 실제로 작동하는지 모른 채 개명하면 HR2 사고가 그대로 재현된다.
- **산문까지 치환하는 것** — 과거 보고서의 *"그때 `00.Documents/adr` 를 고쳤다"* 같은 서술은 **기록**이다. 고치면 기록이 거짓이 된다.
- ⚠️⚠️ **「구 경로 0건」을 전역으로 요구하는 것** — 초안이 이 함정에 빠졌다. `git grep` 은 **30파일**을 매치하는데 그중 다수가 이 마일스톤이 스스로 *남기라고 명령한 것들*이다(P03이 존치를 요구한 SEALED 구 deny, P03이 증설한 신·구 병행 픽스처, 이 Phase가 미수정 원칙을 선언한 산문). 문자 그대로 이행하면 **기록과 픽스처를 파괴해야 통과**한다. 완료 조건이 서로를 부정하면 실행자는 둘 중 하나를 임의로 버린다.
- **`INDEX.md` 를 잊는 것** — 파일을 옮기고 인덱스를 그대로 두면 유령 포인터가 새로 생긴다. 이 마일스톤이 고치려는 병(P06)을 스스로 만드는 셈이다.
- **저장소 밖 참조** — 글로벌 스킬과 프로젝트 메모리에도 `reports/milestones` 경로가 박혀 있다. 저장소 안만 고치면 다음 세션이 없는 경로를 읽는다.

---

## 담당 SubAgent

⚠️ **치환까지 메인 직접** — 대상에 ADR·`AGENTS.md`·`.claude/policies/**` 가 포함되는데 이들은 **`secretary` 의 편집 금지 구역**이다(`_routing.md:83`). `secretary` 에는 **read-only 인벤토리**(참조처 grep·파일 존재 확인·목록 대조)만 맡긴다.

> 📌 초안은 "대량 치환 = 기계 실행 = secretary" 로 판단했는데, 잡무 기준 v1의 *기계/판단* 축만 보고 **경로 소유권 축을 빠뜨렸다.** 두 축은 AND다 — 기계적이면서 동시에 소유 가능한 경로여야 위임된다.

`.codex/**` 대응분은 **Codex root 전담**(CORE-12).
