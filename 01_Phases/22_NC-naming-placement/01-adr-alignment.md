---
owner: 영호
milestone: NC
phase: 01
title: ADR 3건 정합 — 039 신설 · 027 개정2 · 013 개정
status: pending
grade: 복잡
risk: harness
loop_track: human-gate
estimated: 3~5h
domain: cross
summary: 명명 규범의 정본(ADR-039)을 신설하고, 미이행 상태로 done 처리된 ADR-027을 정정하며, AgentCodeGUI를 "원본"에서 "참고용 프로젝트"로 재분류한다 — CORE-08상 코드보다 ADR이 먼저다.
---

# Phase 01: ADR 3건 정합 — 039 신설 · 027 개정2 · 013 개정

> **상태**: pending
> **마일스톤**: NC
> **등급**: 복잡 (risk: harness — `00_Documents/adr/**` 봉인)
> **담당**: 메인 직접 (판단이 살아 있는 산출물)

---

## 🎯 목표

이 Phase가 끝나면 **"어떤 폴더가 어떤 파일 명명 계약을 갖는가"가 저장소에 단 하나의 정본으로 존재**하고, 후속 Phase가 무엇을 개명하고 무엇을 동결할지를 **추정이 아니라 문서에서 읽어** 판정할 수 있다.

---

## ⏪ 사전 조건

- [ ] `_milestone-plan.md` 존재 (이 Phase의 입력 = 확정 규범·동결 경계·반증 6건)
- [ ] **유지보수 창 1 개방** — `00_Documents/adr/**`·`CLAUDE.md` 는 CORE-11 봉인이라 창 없이는 편집 불가
- [ ] 현재 브랜치 = `chore/nc-naming-docs`

---

## 📝 작업 내용

### ADR-039 신설 (명명 규범 정본)

- [ ] `00_Documents/adr/ADR-039-naming-convention.md` 신설
- [ ] **원칙 절** — *"전역 규칙은 폴더 이름 층이 소유하고, 파일명은 각 폴더의 계약이 소유한다"*
- [ ] **폴더별 파일 계약 표** — `00_Documents/` 루트(UPPER_SNAKE) / `01_Adr`(ADR-NNN-kebab) / `02_Reports`(코드-한글서술) / `01_Phases`(NN-kebab) / `.ts`(camel) / `.tsx`(Pascal 또는 훅=camel)
- [ ] **`.ts` camelCase 근거 2축** — 저장소 다수파(camel 82 vs kebab 13) + import 노출 시 타입 오독. AgentCodeGUI는 **각주 데이터포인트로 강등**
- [ ] **동결 경계 절** — `_milestone-plan.md` 「🧊 동결 경계」 표를 근거와 함께 이식. ⚠️ **보고서의 한글 서술 파일명은 *의도된 규약*이며 예외가 아니라 별도 계약**임을 한 줄 박제(미래 세션이 "정리 대상"으로 오인하는 것을 막는다)
- [ ] **4축 판정 프레임** — 축0 통제권 > 축1 기계계약(fail-open 가중) > 축2 생성주체 > 축3 포인터/기록 > 축4 기존규약
- [ ] **개명 매니페스트 부속 표** — Phase 02에서 채울 자리를 만들어 둔다(추정치가 아니라 **이름 확정 목록**이 들어갈 곳)

### ADR-027 개정 2 (미이행 정정)

- [ ] `docs/` 항목의 실행 범위를 확정하고, `02_Source/{main,preload,renderer,shared}` 명시 제외를 재확인
- [ ] **루트 `.md` 7개는 번호를 붙이지 않는다**를 예외로 명문화 (영호 결정)
- [ ] ⚠️ `01_Phases/00_RF1-cleanup/08-docs-prefix-renumber.md` 의 **frontmatter `status: done` ↔ 본문 `pending` 모순 정정**. 실제 구현이 0건이므로 `status`를 사실에 맞추고, 이번 마일스톤이 이월받았음을 본문에 남긴다

### ADR-013 개정 (AgentCodeGUI 위상 — 영호 정정 2026-07-26)

- [ ] "원본(upstream)" → **"참고용 소프트웨어 프로젝트"** 로 재분류. **무조건 Copy는 하지 않는다**를 명시
- [ ] `CLAUDE.md` 「기술 스택」 절의 *원본 일치 vs AgentDeck 확장* 이분법 재서술 — "변경 재량이 좁다"의 근거가 사라졌으므로 그 문장이 무엇을 뜻하는지 다시 쓴다
- [ ] ⚠️ **범위를 재분류로 엄격히 자른다** — 업그레이드 정책·ADR-014 충실도 클론의 위상 같은 파생 결정은 **이번에 설계하지 않는다**(그건 명명 마일스톤이 아니다)

### ⭐ CORE.md의 stale 어댑터 서술 정정 (Codex 교차 감사 발견)

- [ ] `00_Documents/harness/CORE.md:49` 가 *"Codex는 아직 CORE-06 v1"* 이라고 적고 있으나 **사실과 다르다** — Codex execpolicy `agentdeck.rules:4` 는 이미 `forbidden` 이고, HR2가 대칭 해소를 완료 기록했다(`HR2-DONE.md:151`)
- [ ] ⚠️ **방치하면 두 방향으로 해롭다**: ① P04가 stale 경고를 근거로 **이미 끝난 Codex 작업을 다시 설계**한다 ② `harness-review` 스킬이 CORE와 실제 어댑터의 불일치를 **결함으로 보고**하거나 **잘못된 v1 복원을 유도**한다
- [ ] ⚠️ 이 항목은 **Codex 보고로 알게 된 것**이며 Claude는 `.codex/rules/agentdeck.rules` 를 읽어 검증할 수 없다(CORE-12). 정정 근거를 `HR2-DONE.md:151`(Claude가 읽을 수 있는 기록)에 둔다

### 인덱스 정합

- [ ] `00_Documents/ADR.md` 인덱스에 ADR-039 추가 + 027·013 개정 표기
- [ ] ADR 상호 참조 정합 — 027·028이 ADR-039를 가리키고, 039가 둘의 제외 규칙을 인용

---

## ✅ 완료 조건

- [ ] **게이트 G1·G2·G3 green** — 정본 = `_milestone-plan.md` 「🧪 회귀 게이트 정본」. ⚠️ **명령을 여기 복제하지 않는다**(복제본은 갈라진다 — 초안이 실재하지 않는 명령 2종을 7곳에 복제한 것이 이 규칙의 유래다)
- [ ] ADR-039가 존재하고 **폴더별 계약 표에 6개 구역이 전부 채워짐**
- [ ] `08-docs-prefix-renumber.md` 의 frontmatter `status` 가 본문 서술과 **일치**
- [ ] `ADR.md` 인덱스에서 039·027·013 세 줄이 실제 파일명을 정확히 가리킴 (경로 실재 확인)
- [ ] `CLAUDE.md` 에 "원본"이라는 표현이 AgentCodeGUI를 가리키는 자리에 남아 있지 않음 (grep 0건)

---

## 📚 학습 포인트

- **"규칙이 없다"와 "규칙이 안 지켜진다"는 다른 병이다.** 전자는 규범을 만들어야 하고 후자는 이행과 강제를 만들어야 한다. 이번 진단은 후자였고, 그래서 이 Phase 뒤에 훅(P03)이 온다.
- **거짓 green의 구조** — frontmatter와 본문이 서로 다른 말을 하면 기계는 frontmatter를 읽고 사람은 본문을 읽는다. 둘이 갈라지는 순간 "완료"가 아무 뜻도 갖지 않는다.

---

## ⚠️ 함정

- **CORE-11 봉인** — `00_Documents/adr/**`·`CLAUDE.md` 는 창이 열려 있어야 편집된다. 창 없이 시도하면 훅이 exit 2로 자른다(설계대로 작동한 것이므로 우회 금지).
- **ADR-013 범위 확산** — "원본 → 참고" 정정은 파장이 큰 결정이라 파생 논의로 번지기 쉽다. **재분류 한 문단만** 하고 나머지는 별도 결정으로 남긴다.
- **인덱스 드리프트** — `ADR.md`는 인덱스일 뿐 정본이 아니다. 본문 파일과 어긋나면 미래 세션이 인덱스를 믿고 잘못된 파일을 읽는다.

---

## 담당 SubAgent

**메인 직접** — ADR 본문·개정 문안은 잡무 기준 v1의 *"판단이 살아 있는 산출물"* 이다. 위임하면 대필세만 남는다.
사전 검증은 `plan-auditor`(**Fable 5**), 커밋 전 점검은 `reviewer`(**Fable 5**).
