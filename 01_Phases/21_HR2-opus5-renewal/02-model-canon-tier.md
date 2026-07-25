---
owner: 영호
milestone: HR2
phase: 02
title: 모델 정본 갱신 + 티어 4층 재정의
status: done
grade: 복잡
risk: harness
loop_track: human-gate
estimated: 3~5h
domain: cross
summary: 별칭 대신 full ID로 전환하고(별칭 opus는 4.8로 스폰) 모델 티어를 Opus 5 기준 4층으로 재정의 — 21파일 40지점.
---

# Phase 02: 모델 정본 갱신 + 티어 4층 재정의

> **상태**: ✅ done (2026-07-25)
> **마일스톤**: HR2
> **등급**: 복잡 (risk: harness)
> **담당**: 메인 직접

---

## 🎯 목표

`CLAUDE.md`에 Opus 5를 등재하고, **모델 지정을 별칭에서 full ID로 전환**하며, `execution-owner.md` §3 모델 티어 표를 4층으로 교체한다. 끝나면 "문서가 말하는 모델"과 "실제로 스폰되는 모델"이 일치한다.

---

## ⏪ 사전 조건

- [x] P01 완료 (ADR-033 개정 — 모델명 유지 결정 뒤집기)
- [x] OpenGate 개방 (`.claude/**`·`CLAUDE.md` 봉인)
- [x] 모델 ID는 **`claude-api` 스킬 정본**에서 확인 (헌법 CRITICAL — 기억으로 답하지 않음)

---

## 📝 작업 내용

- [x] `CLAUDE.md` 최신 모델 목록에 **Opus 5(`claude-opus-5`)** 추가 (행 번호는 P01 편집으로 :56→:68 이동 — **앵커 문구로 찾았다**)
  - ⭐ **불일치 1건 추가 발견·정정**: `claude-haiku-4-5-20251001` → **`claude-haiku-4-5`**. `claude-api` 스킬 정본이 *"never append date suffixes"* 로 명시한다. **날짜 접미사 금지** 규칙을 그 자리에 1줄로 박아 재발을 막았다.
- [x] **별칭 → full ID 전환** — `.claude/agents/*.md` **9개 전부**(sonnet 4 → `claude-sonnet-5` / opus 5 → `claude-opus-5`). 별칭 잔존 **0**.
- [x] ⭐ **회귀 테스트로 고정** (ADR-010 개정 1이 요구) — `99.Others/tests/agents/agent-model-canon.test.ts` 신설, 5 테스트:
  ① 정의 파일 발견 0건이면 red(경로 드리프트 = fail-open 차단) ② 별칭 잔존 0 ③ full ID 형식 + 날짜 접미사 금지 ④ 역할별 티어 문자열 일치 ⑤ **티어 표 미등록 에이전트 0**(신설 시 `execution-owner.md` 갱신 강제)
  - ⚠️ **green이 의미 있는지 양방향 검증** — `renderer.md`를 일부러 `sonnet` 별칭으로 되돌리자 **3개 테스트가 red + 파일명 지목**, 복구 후 green. 정규식이 아무것도 안 잡으면서 통과하는 fail-open이 아님을 실측했다.
  - `chief-tech-operator`는 기대 맵에 미리 넣되 **파일이 없으면 건너뛴다** → P03 신설 시 자동으로 검사 대상이 된다.
- [x] `execution-owner.md` §3 표 **전체 교체** (49행 "기계 잡무=하위 티어(secretary 기본)"도 이미 `secretary.md:5`(opus)와 모순인 거짓 서술 — 50행만 고치면 안 됨):

| 층 | 대상 | 모델 |
|---|---|---|
| 메인 세션 | 판단·조율·위임 | Opus 5 |
| 최상위 판단 | `chief-tech-operator` ⚠️*(P03에서 신설 — P02 시점엔 파일 없음)* | Fable 5 (영호 승인 발동) |
| 도메인 Worker | 구현 | Sonnet 5 / 위험 깃발·대규모 시 Opus 5 |
| 판정 렌즈·격리 | reviewer·plan-auditor·coordinator·qa·secretary | Opus 5 |

- [x] ⚠️ **"문서≠실재"를 새로 만들지 않는다** → **선택: 주석을 남긴다**(행 이관 X).
  - 근거: 티어 표의 목적은 **층 구조를 보이는 것**인데 한 층을 빼면 4층이 3층이 되어 구조 자체가 안 보인다. 그리고 P02→P03은 **같은 창 안에서 연속**이라 공백이 짧다.
  - 표기: `⚠️*(P03 신설 예정 — 그때까지 이 행은 계획)*`
  - ⚠️ **P03 완료 조건에 "이 주석 제거"를 넣어야 한다** — 안 그러면 그 주석이 영구 잔존해 **또 다른 "문서≠실재"** 가 된다(아래 P03 인계).
- [x] **Worker frontmatter 실편집** — 정책(`execution-owner.md` §3)을 고쳤다. 다만 실측 결과 **초안 서술보다 상황이 나빴다**: 옛 표 3행 중 1행("기계 잡무=하위 티어(secretary 기본)")은 `secretary.md:5`가 `opus`였으므로 **처음부터 거짓**이었고, 2행("Fable 상속 방지")은 **전제가 소멸**했다. 철회 2건을 표 아래 취소선으로 박아 재기재를 막았다.
- [x] **Claude↔Codex 짝 표 동반 갱신** — 15지점 실측 후 갱신. 원칙 = **표의 모델 칸은 full ID**(기계 값), **산문은 세대 이름**("Opus 5").
  - `subagent-routing.md` 표 9행 + `:98`·`:118` / `_routing.md:27-28` / `_escalation.md:9,17` / `coordinator.md:17,102-103`
  - ⚠️ **`subagent-routing.md:179`는 의도적 미수정** — "2026-07-10 —"으로 시작하는 **변경 이력**이라 산문 미수정 원칙 적용(역사 기록).
- [x] **커밋 서명 주체 규범** — `secretary.md`의 `Co-Authored-By: Claude Fable 5` 처리.
  - ⭐ **값을 고치지 않고 출처를 규정했다.** 새 값을 박으면 **지금 `Fable 5`가 stale인 것과 똑같은 일이 재발**한다. 그래서 *"메인이 지정한 값을 그대로 쓴다 — 네가 모델명을 만들어 넣지 않는다. 안 줬으면 묻는다"* 로 규정하고, **왜 하드코딩하지 않는지**를 그 자리에 적었다.
- [x] **저장소 밖 자산 동반** — 4건 전부 갱신 + `MEMORY.md` 인덱스 3줄 동반.
  - `fable-delegates-opus-executes` → **철회 표기**(비용 비대칭 소멸·대필세 역측정·위임 경로 런타임 소멸 3근거). ⚠️ **삭제하지 않은 이유** = `verify-lens-agents-use-opus`가 링크로 참조하고, 옛 믿음이 되살아날 때 여기서 막히게 하려는 것.
  - `verify-lens-agents-use-opus` → ⭐ **이 메모리가 틀린 값을 지시하고 있었다** — `model: "opus"`가 곧 4.8로 스폰되는 별칭이다. `"claude-opus-5"`로 정정. 지침 자체는 존치(근거만 교체: "Fable 상속 방지" → "세션 기본이 무엇이든 렌즈 티어 고정").
  - `fable-safeguard-defensive-security` → **적용 범위 축소**. 메인이 Opus 5인 지금은 무증상(2026-07-25 P01에서 봉인 우회 벡터를 상세히 다뤘으나 발동 0건 실측). ⚠️ 다만 **`chief-tech-operator`가 Fable 5이고 그 소임이 "막힌 문제 진단"** 이라, 보안 훅이 막혔을 때 부르면 재발 가능 — 그 조합 때문에 살려 뒀다.
  - `Report-YYH-Style/SKILL.md` → `"opus"` → `"claude-opus-5"` + 티어 3층 → **4층**. ⚠️ 글로벌 스킬이라 다른 프로젝트에도 로드되므로, *"세션 기본이 무엇이든 고정"* 으로 서술해 메인이 Fable인 저장소에서도 성립하게 했다.

---

## ✅ 완료 조건

- [x] `.claude/agents/*.md` 전 파일의 `model:` 값이 의도한 모델과 **문자열로 일치**(별칭 잔존 0) — **회귀 테스트가 기계로 고정**(양방향 검증 완료)
- [x] `execution-owner.md` §3 표에 `secretary.md`와 모순되는 행 0
- [x] `grep -rn "Fable"` 결과 중 "메인 세션 = Fable" 전제 서술 0 — 잔존은 ① 모델 목록(사실) ② 철회 표기(취소선) ③ CTO 배정(존치) 뿐
- [x] Claude/Codex 짝 표 **15지점** 전부 갱신 — 한쪽만 바뀐 표 0 (`:179` 변경 이력은 의도적 미수정)
- [x] `npm run typecheck` 0 · `npm run test` green · `npm run lint` 0
  - **게이트 결과**: typecheck 0 / **test 395 파일 · 5,330 passed · 10 skipped** / lint 0
  - 기준선(P01: 394 파일 · 5,325) 대비 **정확히 +1 파일 / +5 테스트** = 신설 회귀 테스트분. **다른 회귀 0**
- [x] 글로벌 메모리 3건 + `Report-YYH-Style/SKILL.md` 갱신 완료 (+ `MEMORY.md` 인덱스 3줄 동반)

---

## 📮 P03 인계 (P02에서 발견했으나 범위 밖 — 헌법 "범위 밖 발견 시 보고")

- [ ] ⚠️ **`execution-owner.md` §3의 `⚠️*(P03 신설 예정 …)*` 주석 제거** — `chief-tech-operator` 파일이 생기는 순간 이 주석 자체가 stale이 된다. **P03 완료 조건에 넣을 것**.
- [ ] **`subagent-routing.md`의 "9역할" 숫자** — 표가 1~9로 번호 매겨져 있다. 10역할이 되면 전부 밀린다(P03 숫자 스윕 대상).
- [ ] ⚠️ **Codex 짝 표기 자체가 stale** — `subagent-routing.md` 표는 Codex 쪽에 `Terra medium`·`Sol high` 같은 **워커 함대 티어**를 적고 있으나, **ADR-033 개정 1(2026-07-12)이 그 함대를 철회**했다(custom agent 9→2, reviewer·plan-auditor만). 즉 Codex에는 `main-process` Worker가 **없다**. P02는 Claude 쪽 티어만 고쳤으므로 짝 구조는 깨지지 않았지만, **Codex 칸은 존재하지 않는 역할을 가리키고 있다.** 범위상 P03(역할 재편) 또는 P10에서 정리.
- [ ] **메모리 `coordinator-longrun-visibility`** — *"Agent 도구 유지(영호 2026-07-11)"* 가 ADR-010 개정 1(반납)로 stale. P03에서 갱신.

---

## 📚 학습 포인트

- **별칭(alias)과 버전 고정** — `opus`는 "현재 Opus 계열"을 가리키는 이동 표적이라, 특정 버전을 원하면 full ID를 써야 한다. C#의 `PackageReference Version="*"` vs 정확한 버전 고정과 같은 트레이드오프 — 별칭은 자동 최신화를 얻고 재현성을 잃는다.
- **짝으로 박제된 문서** — 같은 결정이 두 곳에 적혀 있으면 한쪽만 고쳤을 때 조용히 어긋난다. 이번엔 저장소와 **글로벌 스킬**에 짝이 있어 더 잘 안 보인다.

---

## ⚠️ 함정

- **모델 ID를 기억으로 쓰기** — 헌법 CRITICAL. `claude-api` 스킬 정본을 반드시 참조.
- **정책만 고치고 frontmatter를 안 고치기** — 실측상 정책과 구현이 이미 어긋나 있었다. 문서는 실행되지 않는다.
- **글로벌 자산을 빼먹기** — 메모리는 **매 세션 주입**되므로 stale이면 계속 잘못된 방향으로 유도한다. 저장소만 고치면 다음 세션이 옛 전제로 되돌린다.

---

## 담당 SubAgent

**메인 직접** (하네스 = 영호 단독 통제 대행). 전수 확인이 필요한 grep 심부름은 `secretary` 위임 가능.
