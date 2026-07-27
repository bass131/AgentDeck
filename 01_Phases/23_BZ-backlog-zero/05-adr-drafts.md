---
owner: 유영호
milestone: BZ
phase: 05
title: ADR-040·041 초안 + 백로그 16 역참조 실측
status: done
grade: 보통
loop_track: human-gate
domain: cross
estimated: 1.5~2h
summary: conformance 어댑터 준수 축(ADR-040)과 CHANGELOG 엔진 중립 이동(ADR-041)의 초안을 스크래치패드에 작성하고, 이동의 본체인 역참조 스윕 대상을 전수 실측한다. 승인은 영호(아침).
---

# Phase 05: ADR-040·041 초안 + 역참조 실측

> **등급**: 보통 · **담당**: **메인 직접** (ADR = 판단 산출물) · **문**: 초안은 없음(스크래치패드), **정본 반영은 P06 창 2**
> ⚠️ 밤 계약: ADR 정본(`00_Documents/01_Adr/**` — 봉인층)은 밤에 쓰지 않는다. 산출물 = 스크래치패드 초안 2건 + 실측 표.

## 🎯 목표

아침에 영호가 읽고 GO/수정만 판단하면 되는 완성도의 ADR 초안 2건 + 백로그 16 이동의 역참조 전수 실측이 준비된다.

## ⏪ 사전 조건

- [x] 백로그 15 — Codex 교차 감사의 2단계 설계 회수 완료 (BACKLOG.md 15 ▪절: 1단계 선언 기반 / 2단계 중립 receipt)
- [x] 백로그 16 — 근본안 확정 기록 (CHANGELOG를 `00_Documents/`로, `.claude/`엔 포인터)
- 없음 — P02~04와 독립 (밤 순차 실행 무방)

## 📝 작업 내용

**A. ADR-040 초안 — conformance 어댑터 준수 축 (백로그 15)**

- [ ] **범위 캡 = 1단계(선언 기반)만 채택**을 본문에 명시: 조항별 `claude.conformedVersion`·`codex.conformedVersion`을 `core-manifest.json`에 두고 `conformance-check.mjs`가 조항 `v`와 대조 — 갱신 누락 = red. **자기선언 한계를 정직하게** 기록(맹점 절 — 백로그 15의 "맹점 고백이 note 교체로 사라졌다" 재발 방지: 이번엔 ADR 본문이 맹점을 소유)
- [ ] 2단계(엔진 중립 receipt)는 **채택 보류 + 선행 조건 명시**(CORE-12 「runtime이 아닌 검증 증거」 예외 ADR이 먼저) — 백로그 신규 항목으로 P07에서 등재
- [ ] trade-off: 1단계로 얻는 것(갱신 누락 red — 백로그 10 재발 방지) / 잃는 것(선언≠실제 — 2단계 전까지 남는 갭)
- [ ] **수명주기 계약 명시** (Codex 교차 리뷰 축 3 반영, 2026-07-27 — 초기 필드 추가만으론 이후 조항 개정 때 누가·언제·어느 값을 올리는지 없다): ① 각 어댑터는 **자기** `conformedVersion`만 승인(Claude가 codex 값을 올리지 않는다 — CORE-12) ② 갱신 전제 = 해당 엔진의 구현·검증 receipt ③ 한쪽만 완료된 중간 상태는 G2 red **유지**(중간 green 금지) ④ manifest 마감 주체(두 유지보수 세션 사이 이어가기 vs receipt 받은 중립 마감) 결정 ⑤ P06 초기값은 **Codex 부트스트랩 receipt**(13개 조항별 현행 버전·근거) 요청 후 기입 — 현행 NC receipt(백로그 19·22·digest 검증)는 조항별 선언 근거가 아니다
- [ ] **게이트 의미의 정확한 한계 명시**: "갱신 누락 = red"가 잡는 것은 **CORE 의미 버전 상승에 대한 누락뿐**(CORE.md — 경로 표기 변경은 조항 버전을 올리지 않는다). 경로·구현 드리프트(예: P06의 CHANGELOG 이동 후 Codex 옛 예외 잔존)는 못 잡는다 → `adapterRevision`/digest 축은 후속안으로 P07 백로그 등재
- [ ] **대조 검사 = 정확 동등성**: `누락`·`낮음`·`높음`·`문자열/비정수` 각각 red (단순 `<` 구현은 `undefined < v === false`라 필드 누락이 통과) + `manifestVersion` 1→2 상향 여부(필수 스키마 필드 추가) 명시

**B. ADR-041 초안 — CHANGELOG 엔진 중립 이동 (백로그 16)**

- [ ] 이동안: `.claude/CHANGELOG.md` → `00_Documents/CHANGELOG.md` + `.claude/CHANGELOG.md`는 한 줄 포인터로 존치(하위 호환 — 옛 참조가 죽지 않게)
- [ ] **역참조 전수 실측** (이 Phase의 본체 — "이관 자체보다 역참조 스윕이 본체", BACKLOG 16 실측 교훈): `CHANGELOG` 문자열 grep 전수 → 참조처 표(파일:줄 · 봉인층 여부 · **판정** · 수정 방식). ⚠️ 백로그 5 전례: "3곳" 추정이 크게 벗어났다 — **추정 금지, 전수만** (plan-auditor 선행 실측: 단어 197건/85파일 · 경로형 47건/38파일 · 살아 있는 지시문 ≈ 20파일)
- [ ] **판정 열 기준 (🔴4 봉합 — ⚖️ 3 미러링, 밤에 새 설계 분기를 만들지 않는다)**: `치환`(살아 있는 지시문 — 헌법·agents·commands·policies·skills·hooks·HARNESS_PORT_MANIFEST·98_Management·agent-model-canon.test.ts) / `불변`(과거 기록 — 옛 Phase 문서·DONE·아카이브 패치·리포트 HTML·ADR 본문 인용: **"과거 문서의 표기는 그 시점의 기록이라 고치지 않는다"** 원칙) / `Codex 이월`(`.codex/hooks/agentdeck-hook.mjs`·`.test.mjs` 각 1건 — CORE-12로 Claude 수정 불가) / `애매`
- [ ] **줄 좌표 참조 별도 치환 열** (Codex 교차 리뷰 축 4 실측 6건, 2026-07-27): `.claude/CHANGELOG.md:NN` 류 줄 좌표는 포인터 파일화 후 **판정과 무관하게 전부 죽는다** — `불변` 판정 문서라도 경로+좌표는 신 위치로 기계 치환한다(역사적 *판단 내용* 불변 원칙과 양립 — 좌표는 판단이 아니라 포인터다). Codex 실측: `agent-model-canon.test.ts` 1건 + ADR-010 2건 + 과거 Phase 문서 3건. 실측 표에서 이 6건 재확인
- [ ] trade-off: 엔진 중립 위치 획득 vs 참조 스윕 비용 + `supervisor-guard`의 `.claude/changelog.md` allowed 예외(`shell-policy.mjs:415`)의 **방향 판정은 P06 §C로 확정 반영**(Codex 축 2 — 이동 후 포인터는 봉인 대상, 예외 제거) — ADR-041 본문에도 이 봉인 의미 전환을 소유시킨다

**C. 산출 위치**

- [x] 스크래치패드 `adr-040-draft.md` · `adr-041-draft.md` + 실측 표 `adr-041-backref-survey.md`. pin에 경로 기록 완료 (아침 영호 열람 경로)

**산출 결과 요약 (2026-07-27 밤)**: ADR-040 초안 = 1단계 채택 + 수명주기 계약 5불릿 + 정확 동등성 4클래스 + 한계 2종 본문 소유 + manifestVersion 2 제안. ADR-041 초안 = 이동 + 포인터 봉인 전환(Codex 축 2) + 원자 커밋. 역참조 실측(secretary 전수) = 경로형 46건/36파일 · **줄 좌표형 9건**(Codex 사전 6건 대비 +3 — bare 좌표 1·봉인층 2 추가 발견) · 서술형 208건(스윕 무관 — 파일명 불변). 판정 = 치환 15 · 좌표 치환 9 · 픽스처 반전 3 · 불변 15 · Codex 이월 2 · 애매 2(ADR-025:5·ADR-028:25 — 영호 검토). ⭐ 실측이 잡은 함정: `shell-policy.mjs:415`는 **소문자 리터럴**이라 대문자 grep 불포착.

## ✅ 완료 조건

- [x] 초안 2건 — ADR 정본 형식(ADR-039 구조 준거) 완비
- [x] ADR-041 역참조 표 — grep 전수 결과와 건수 일치 (표에 grep 명령 원문 10종·총 건수·사전 실측 대비 어긋남 규명 병기)
- [x] **P05에 기인한** 저장소 변경 0 (산출물 3건 전부 스크래치패드 — 이 문서의 완료 마킹은 Phase 운영 기록으로 별개, 🟡h)

## 📚 학습 포인트

- ADR의 "채택 보류"도 결정이다 — 2단계를 안 하기로 한 게 아니라 **선행 조건을 명시하고 미룬 것**을 문서가 소유하면, 다음 세션이 같은 논의를 반복하지 않는다

## ⚠️ 함정

- 초안을 봉인층(`00_Documents/01_Adr/`)에 쓰면 supervisor-guard 차단 + 밤 계약 위반 — 산출은 스크래치패드만
- ADR-041의 참조처 중 `.claude/policies/**`·헌법은 봉인층 — 수정 방식 열에 「P06 창」 표기 필수 (평시 수정 불가를 계획에 선반영)

## 담당 SubAgent

메인 직접 (판단 산출물). 역참조 grep 전수는 secretary 위임 가능(새 재료 실측 — 잡무 기준 v1 ②).
