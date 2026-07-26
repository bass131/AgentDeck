---
owner: 영호
milestone: NC
phase: 02
title: 루트 지도 신설 + 개명 매니페스트 확정
status: done
grade: 보통
risk: harness
loop_track: auto-gate
estimated: 2~3h
domain: cross
summary: 루트 16파일이 왜 루트에 있어야 하는지를 파일별 1줄 근거로 남기고, 후속 Phase가 건드릴 대상을 추정치가 아닌 이름 확정 목록으로 못 박는다.
---

# Phase 02: 루트 지도 신설 + 개명 매니페스트 확정

> **상태**: ✅ **done** (2026-07-26, 유지보수 창 1) — 산출물 = `00_Documents/ROOT_LAYOUT.md` + ADR-039 §5 매니페스트(24건 + 역산 표 4축)
> **마일스톤**: NC
> **등급**: 보통
> **담당**: 메인 직접 (판단) + `secretary` (전수 실측 심부름)

---

## 🎯 목표

이 Phase가 끝나면 ① **루트에 파일이 널려 있는 것이 방치가 아니라 계약이라는 사실**이 문서로 읽히고, ② 후속 Phase(03·05·07)가 손댈 대상이 **"18~22개"같은 추정이 아니라 이름이 확정된 목록**으로 존재한다.

---

## ⏪ 사전 조건

- [x] Phase 01 완료 — ADR-039의 「개명 매니페스트 부속 표」 자리가 만들어져 있어야 함
- [x] 유지보수 창 1 열린 상태 (ADR-039에 매니페스트를 써넣으므로)

---

## 📝 작업 내용

### 루트 지도

- [x] `00_Documents/ROOT_LAYOUT.md` 신설 (폴더 계약 = UPPER_SNAKE)
- [x] 루트 **16개 설정 파일 각각에 1줄 근거** — 왜 루트여야 하는가. 실측된 결론: **보정 없이 옮길 수 있는 것은 0개**
  - `dev.bat` — `%~dp0` 가 배치파일 **자기 위치**를 가리켜 이동 시 깨짐
  - `LICENSE` — 옮기면 GitHub 라이선스 **자동 인식**을 잃음
  - `tsconfig*.json`·`electron.vite.config.ts`·`vitest.config.ts`·`playwright.config.ts`·`.eslintrc.cjs` — 도구가 루트 기준으로 탐색하거나 상대경로 기준점이 됨
- [x] 루트 **생성물 폴더 3개**(`artifacts/`·`out/`·`test-results/`)가 왜 동결인지 — 어떤 설정도 `outDir`/`outputDir`를 지정하지 않아 **도구 기본값이 cwd 상대**로 떨어진다
- [x] `.claude`·`.codex`·`.agents`·`.env*` — 외부 도구가 **이름으로 탐색**한다(Codex 확인: `$CWD/.agents/skills` 등 3경로)

### 개명 매니페스트 (ADR-039 부속 표에 기입)

- [x] **폴더 개명 대상 전수** — `00_Documents/` 하위 7개 + `reports/` 하위 4개. 각각 현재명 → 신명
- [x] **파일 개명 대상 전수** — `02_Source` kebab **13개** 이름 확정 목록
- [x] **⭐ 역산 표: 각 개명 대상이 무엇에 걸려 있는가** — 이것이 Phase 03·05·06·07의 입력이다. **훅만이 아니라 「기계 소비자 전수」** 로 넓힌다

**① 훅 (fail-open — 개명 시 조용히 죽는다)**

| 개명 대상 | 걸리는 곳 | 판정 |
|---|---|---|
| `00_Documents/{adr,harness}` | `shell-policy.mjs:425` | **수정** |
| `00_Documents/reports` | `done-report-policy.mjs:76` **＋** `:144` | **수정** (원자 쌍) |
| `agent-events`·`ipc-contract` (스템) | `risk-detector.sh:26`·`:30` | **수정** |
| `98_Management/Harness_OpenGate` | `shell-policy.mjs:428`·`:704`, `supervisor-guard.sh:42-43` | ❄️ **개명 안 함 → 변경 0건 확인만** |
| `99_Others/tests` | `tdd-guard.sh:26` **＋** `:45` | ❄️ **동결 → 변경 0건 확인만.** 파일 스템은 `:43`이 동적 추출하므로 파생 테스트가 stem을 따라가면 자동 정합 — NC 개명 대상과 **무접점** |

**② 기계 소비자 (fail-visible — 개명 시 red로 드러나지만 목록에 없으면 놓친다)**

| 개명 대상 | 걸리는 곳 |
|---|---|
| `00_Documents/harness` | `00_Documents/harness/conformance-check.mjs:37` (`manifestRel` — **자기 자신이 사는 폴더**) |
| `00_Documents/harness` | `99_Others/tests/harness-conformance.test.ts:27` (`SCRIPT` 경로) |
| `00_Documents/harness` | `core-manifest.json` 내부 경로 필드 |

> ⚠️ **G2 게이트 자체가 P05의 개명 대상 폴더 안에 산다.** P05 이후 모든 Phase의 게이트 실행 경로가 바뀐다.

**③ 봉인층 문서 (창 없이는 못 고친다 — P07엔 창이 없다)** ⚠️ **이 축이 초안에서 통째로 빠져 있었다**

| 파일·줄 | 참조 |
|---|---|
| `.claude/agents/shared-ipc.md:16`·`:17`·`:33` | `ipc-contract.ts`·`agent-events.ts` |
| `.claude/agents/agent-backend.md:21` | `agent-events.ts` |
| `.claude/agents/main-process.md:31` | `ipc-contract.ts` |
| `.claude/policies/grade-and-risk.md:60`·`:61` | `agent-events*`·`ipc-contract*` ⚠️ **위험 깃발 도메인 정의표** — 실물과 갈라지면 `risk-detector`와 정책 문서가 서로 다른 말을 한다 |
| `.claude/commands/refactor-sweep.md:97` | `ipc-contract` |

> → **P06(창 2)에서 신·구 병기로 갱신**한다. P07은 창이 없어 손댈 수 없고, 그대로 두면 **이 마일스톤이 잡으려는 병(유령 포인터)을 봉인층에 신설**하고 즉시 차기 백로그가 된다.

**④ Codex 어댑터 (⚠️ Claude는 `.codex/**` 를 읽을 수 없다 — 아래는 Codex 교차 감사 보고를 옮긴 것이며 Claude가 검증할 수 없다)**

> ⭐⭐ **위험의 방향이 Claude와 반대다.** 초안은 *"Claude가 fail-open이니 Codex도 대칭이겠지"* 라고 추정했으나 **틀렸다** — Codex의 `isHarnessPath()` 는 `AGENTS.md`·`CLAUDE.md`·`.claude/**`·`.codex/**`·`.agents/skills/**` 만 봉인하고 **`00_Documents/{harness,adr}` 는 아예 보지 않는다**(ADR-037이 "Codex baseline은 봉인 밖"으로 이미 명시). 즉 개명이 Codex 봉인을 푸는 일은 **일어나지 않는다.** 대신 다른 것들이 깨진다.

| 개명 대상 | 걸리는 곳 (Codex 보고) | 실패 방향 |
|---|---|---|
| `00_Documents/reports` | `agentdeck-hook.mjs:81`·`:685` · `agentdeck-hook.test.mjs:60` | ⚠️ **fail-closed 과차단** — 신 `02_Reports` 가 검증 오류가 되어 PostToolUse가 완료 보고를 막는다 |
| `00_Documents/harness` | `harness-doctor.mjs:14`·`:18` — baseline 읽기 실패 시 `process.exit(1)` | ⚠️ **import 시 즉사** |
| 〃 (연쇄) | `harness-contract.test.mjs:9`·`:94` — doctor를 import + 옛 CORE 경로 단언 | 실행 전 종료 |
| `agent-events`·`ipc-contract` 스템 | `agentdeck-hook.mjs:439`·`:441` · `.test.mjs:329` | ⚠️ **fail-open 침묵사** — 미스 시 빈 `flags` 반환, 경고 0 |
| CORE 포인터 | `.codex/README.md:3` · `AGENTS.md:4` | 끊어진 포인터 |
| 리뷰 산출물 경로 | `.claude/commands/harness-review.md:69`·`:93` — 옛 `00_Documents/reviews` 에 쓰도록 지시 | 개명된 폴더 옆에 옛 폴더를 다시 만든다 |
| `.codex/state/**` · `config.toml` · `hooks.json` · `rules/` | **영향 없음** (전수 검색 0건) | — |

- [x] 🔴 **CRITICAL — 훅 digest**: Codex 훅은 본문 digest가 `hooks.json` 인자와 다르면 **모든 훅이 아무 출력 없이 return** 한다(fail-open no-op, 테스트로도 고정됨). 즉 **훅을 고치고 digest를 갱신하지 않으면 시크릿·파괴·비가역·하네스·TDD 차단이 전부 조용히 사라진다.** HR2에서도 브리프가 이걸 빠뜨릴 뻔했다 → **P04 핸드오프의 필수 항목**으로 고정한다

- [x] ❄️ **Codex 문서층 봉인은 이번에 추가하지 않는다**(영호 결정 2026-07-26) — 평시엔 `config.toml:22`·`:38` 의 기본 프로필 권한이 문서 쓰기를 막으므로 훅 봉인은 같은 문을 두 번 잠그는 것이다. **단 full-access 유지보수 세션에서는 문서층 방어가 0층**이며, 이는 개명이 만든 구멍이 아니라 **선재 구조**다 → **백로그 등재**(다음 창)

- [x] **동결 목록도 이름으로** — 무엇을 남기는지가 무엇을 바꾸는지만큼 명시적이어야 한다

### 이동 대상 실측 (Phase 05 입력)

- [x] `00_Documents/reports/` 루트에 분류 없이 남은 파일 **6개** 확정 (`INDEX.md` 제외)
- [x] `_Codex_Review` 하위 **6파일**의 참조처 전수 — `03_Reviews/Codex/` 통합 시 깨질 링크 확인

---

## ✅ 완료 조건

- [x] `00_Documents/ROOT_LAYOUT.md` 존재, **루트 16파일 전부**에 근거 1줄 이상
- [x] ADR-039 부속 표에 **폴더 11 + 파일 13 = 24건**이 현재명→신명으로 기입됨
- [x] 역산 표가 **4축 전부**를 덮음 — ① 훅 5종(수정 3 · 변경 0건 확인 2) ② 기계 소비자 3건 ③ **봉인층 문서 8줄** ④ **Codex 어댑터 6종 + digest**
- [x] ④축에 **Claude 검증 불가 표기**가 붙어 있음 (CORE-12 — 추정으로 채우지 않고 출처를 Codex 보고로 명시)
- [x] 각 항목에 **판정이 붙어 있음** — 「수정」인지 「변경 0건 확인」인지 「신·구 병기」인지. 판정 없는 항목은 실행자가 임의로 해석한다
- [x] 매니페스트의 모든 "현재명"이 **파일시스템에 실제로 존재**함 (전수 확인 — 유령 항목 0)
- [x] **게이트 G1·G2 green** (정본 = `_milestone-plan.md` 「🧪 회귀 게이트 정본」)

---

## 📚 학습 포인트

- **"이름 확정 목록"이 추정치보다 강한 이유** — 파괴적이거나 광범위한 조작에서 "N개쯤"은 실행 시점에 N±k가 된다. 목록은 실행 후 대조가 가능하지만 추정치는 대조할 것이 없다.
- **역산 표라는 도구** — "무엇을 바꾸나"에서 "그것이 무엇에 걸려 있나"를 뽑아두면, 이후 훅 수정이 *빠짐없이* 이뤄졌는지를 목록 대조로 판정할 수 있다. 이것이 없으면 grep에 안 보이는 정규식을 사람이 기억에 의존해 찾아야 한다.

---

## ⚠️ 함정

- **매니페스트를 "대충" 만들면 Phase 03이 통째로 헛돈다.** P03의 병행 수용은 이 목록을 입력으로 받으므로, 여기서 빠진 항목은 P05·P07에서 **조용히 봉인이 풀린 채** 통과한다.
- **루트 지도를 "설명"이 아니라 "변명"으로 쓰지 않는다** — 각 항목은 *왜 루트여야만 하는가*의 기술적 근거여야 하고, "관례라서"는 근거가 아니다.
- **`98_Management/Harness_OpenGate`를 매니페스트에 넣지 않는다** — 이미 규칙 적합이라 개명 대상이 아니고, 넣는 순간 **부트스트랩 자물쇠**(창을 여는 플래그 경로가 훅에 하드코딩)에 진입한다. 범위에서 빼는 것이 이 마일스톤의 최대 절약이다.

---

## 🧾 실행 기록 — 실측이 계획을 고친 것 (2026-07-26)

**⭐ ① `reviews` 폴더가 통째로 누락돼 있었다.** 설계 단계에서는 `_Codex_Review` 만 알고 있었는데, 실측하니 **소문자 `reviews/` 가 별도로 존재**했다(2파일). 게다가 이쪽이 **더 활성**이다 — `.claude/commands/harness-review.md:69`·`:93` 이 *"산출물을 `00_Documents/reviews/` 에 쓰라"* 고 **지시**한다. 매니페스트를 `03_Reviews/{Codex,Harness}/` 2갈래 통합으로 확정했고, 폴더 개명 대상이 6 → **7건**이 됐다(합계는 여전히 11 — `reports/` 하위 4개와 합산).

> 이것이 **P02 가 존재하는 이유**다. 설계는 아는 것으로만 짜이고, 매니페스트는 **있는 것**을 센다.

**⭐ ② `harness-review.md` 는 ④축이 아니라 ③축이다.** 초안이 이 둘을 Codex 어댑터 축에 넣었지만 `.claude/commands/**` 는 **Claude 봉인층**이다. 더 중요한 건 **판정이 다르다**는 것 — 나머지 봉인층 7줄은 *가리키는* 참조라 신·구 병기가 안전하지만, 이 둘은 *쓰라고 지시하는* 경로라 병기하면 **개명한 폴더 옆에 옛 폴더를 다시 만든다.** 지시 경로는 하나여야 한다 → **「수정」**.

**⭐ ③ 줄 번호 4곳이 어긋나 있었다.** 넷 다 ❄️ 동결·확인 대상이라 실행에는 영향이 없지만, **번호가 틀린 표는 다음 세션이 엉뚱한 줄을 고치게 만든다.**

| 항목 | 초안 | 실측 |
|---|---|---|
| `shell-policy.mjs` `HARNESS_MARKERS` | `:450-451` | **`:451-452`** |
| `tdd-guard.sh` 스템 동적 추출 | `:45` | **`:41-42`**(`basename`/`STEM`). `:45` 는 `for _rel in $TESTS_RELS` 루프 |
| `supervisor-guard.sh` 창 개방 시 `exit 0` | `:57-59` | **`:62`**(57-59 는 나이 계산부) |
| `shell-policy.mjs:428`·`:704` | `Harness_OpenGate` **리터럴** | **소문자 정규식** `98[._]management\/harness_opengate` |

**④ `core-manifest.json` 의 경로 문자열은 1건이다** — `00_Documents/harness` 1건, **`00_Documents/adr` 는 0건**. 초안은 복수의 "경로 필드"를 가정했다.

**⑤ `report_html` 유령 포인터는 12건이 아니라 15건이다** — 전체 `report_html` 53건 중 옛 `00.Documents`(점 표기)를 가리키는 것이 **15건**. → P06 문서에 반영했다.

**⑥ `_Codex_Review` 를 참조하는 코드·스크립트는 0건**이다(`.ts`/`.mjs`/`.sh`/`.json` 전수). 문서 6건뿐이고 그중 4건은 **이번 마일스톤 자신의 문서**다. 통합 이동의 기계 위험이 사실상 없다.

**⑦ `.env` 는 파일이 아니라 폴더다.** 헌법·정책이 `.env*` 글롭으로 쓰는 이유이며, 글롭이라 어느 쪽이어도 덮인다. ⚠️ CORE-03 상 **내용은 열지 않았다** — 존재만 기록.

**⑧ 루트 `artifacts/` 와 `00_Documents/Artifacts/` 는 서로 다른 것이다.** 전자는 도구 생성물(동결), 후자는 문서 자산(개명 → `04_Artifacts`). 이름이 비슷해 한쪽 규칙을 다른 쪽에 잘못 적용하기 쉬운 자리라 `ROOT_LAYOUT.md` §2-3 에 명시했다.

---

## 담당 SubAgent

**메인 직접**(루트 지도의 근거 문장·매니페스트 판정) + **`secretary`**(전수 실측 심부름 — 참조처 grep, 파일 존재 확인).
