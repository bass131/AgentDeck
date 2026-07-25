---
owner: 영호
milestone: TG1
phase: 09
title: Provider 기준 브랜드 로고 단일소스 — Welcome 히어로·엔진 표시 3곳·대화 아바타 수렴
status: done
grade: 복잡
risk: ui-visual
loop_track: human-visual
domain: renderer
summary: provider→브랜드 로고 단일 매핑 모듈(Claude→Spark·Codex→OpenAI 로고·미지 provider→자체 폴백) 신설 후 Welcome 히어로·SettingsModal 엔진 탭/현재 엔진 카드·GitModal AI 커밋 버튼·대화 아바타 하드코딩 분기를 전부 이 모듈 소비로 수렴
---

# Phase 09: Provider 기준 브랜드 로고 단일소스 — Welcome 히어로·엔진 표시 3곳·대화 아바타 수렴

> **상태**: done
> **마일스톤**: TG1 (P09 — 마감 후 편입, 영호 GO 2026-07-17 · P08·GAP1 P16 선례)
> **등급**: 복잡 (ui-visual → reviewer 통합·human-visual)
> **담당**: renderer (+reviewer 무조건)

---

## 🎯 목표

> provider→브랜드 로고 단일 매핑 모듈(Claude→Spark·Codex→OpenAI 로고·미지 provider→자체 폴백)을 신설하고, Welcome 히어로·SettingsModal 엔진 탭/현재 엔진 카드·GitModal AI 커밋 버튼·대화 아바타에 흩어진 하드코딩 분기를 전부 이 모듈 소비로 수렴한다.

영호 GO 2026-07-17 — **상표 게이트 확장**(대화 아바타 한정 → provider 기준 엔진 표시 전반, 앱 아이덴티티 금지 불변). P06 reviewer 🟡 "엔진-아바타 이중 소스" 백로그 동시 해소.

---

## ⏪ 사전 조건

- [ ] **P06 완료** — 아바타 표면 동형화(단일챗·패널 턴 헤더·MessageBubble 공유 리프 Spark 적용)
- [ ] **아바타 전수 감사 완료** — 화자 3대 표면 Spark 확인·라이브 미적용 1건 봉합(커밋 `4dda236`)
- [ ] **OpenAI 공식 에셋 착지** — 병행 스카우트가 GPT/OpenAI 공식 로고 착지 중, **착수 전 착지 확인**

---

## 📝 작업 내용

> 복잡 등급 — RED 선행(TDD) → 매핑 모듈 → 소비처 수렴 → 하네스 채증 순.

- [ ] **(1) provider→브랜드 매핑 lib 모듈 신설(RED 선행)** — `02.Source/renderer/src/lib/`에 순수 함수·컴포넌트 매핑. 미지/미래 provider는 **자체 폴백 아이콘**(잘못된 로고 오귀속 금지). 실패 테스트를 먼저 기술한 뒤 구현.
- [ ] **(2) 대화 아바타 수렴** — 기존 엔진 분기(`Conversation.tsx` 턴 헤더 :807-812 부근 · `MessageBubble.tsx` :128-129 공유 리프 — **착수 시 재실측**)를 모듈 소비로 수렴. Claude 거동 불변(Spark 유지). **셀렉터 정본 = `01-scout-report.md` §2.2 위험 상위 3** · '턴당 `.ava.ai` 정확히 1개' 불변식 테스트(`tg1-p06-messagebubble-avatar.test.tsx`·`conversation.test.tsx`) 비회귀 필수 · census 밖 셀렉터 변경 발견 시 **STOP**.
- [ ] **(3) Welcome 히어로 provider 바인딩** — `Conversation.tsx:114-116` `.wc-mark`를 provider에 바인딩. **provider 결정 소스는 실측**(활성 대화 엔진 vs 전역 기본 엔진 — 뭐가 존재하는지 확인 후 채택·근거 기록).
- [ ] **(4) 엔진 표시 3곳 수렴** — SettingsModal 엔진 탭·현재 엔진 카드(:53·:117 부근) · GitModal AI 커밋 버튼(:635 부근)의 구 `IconClaude`를 모듈 소비로 교체. **Codex→OpenAI 매핑은 lib 모듈 내부에 잠재(dormant)로만 두고 단위 테스트로만 exercise한다.** Track 1 라이브 소비처(Welcome·SettingsModal 엔진 카드/탭·GitModal·대화 아바타)는 전부 Claude 항목만 렌더하며, P09는 **Codex 엔진 항목/나열 UI를 신설하지 않는다**(그건 Track 2 X1 전환 UI). 실측: 현 SettingsModal에 Codex 항목 부재(:53 탭 'Claude Code'·:116-117 단일 엔진 카드).
- [ ] **(5) TG1SHOTS p09 컷 채증** — 옵트인 채증 하네스에 p09 장면 추가(Welcome·SettingsModal 엔진 탭 **최소 2컷**).

---

## 🧩 설계 지침

> 매핑 모듈의 책임 경계 — descriptor 반환 vs 렌더.

- **매핑 모듈은 순수 descriptor 반환**(에셋 src·테마 변형·alt·표시명), JSX 렌더는 소비처/공통 컴포넌트에 남긴다.
- **OpenAI Blossom은 재채색 금지**(가이드라인 'DON'T add any colors')라 모듈이 **테마 입력을 받아 black(라이트)/white(다크)를 선택** — Claude Spark는 Clay 단색이라 테마 무관 공용.
- **에셋 정본 = `assets/brand/openai-blossom-{black,white}.{svg,png}`**(sha256 = SOURCE.md), 자체 재현 금지.

---

## ✅ 완료 조건

> 객관적·정량적. done 판사 = CI 회귀 게이트.

- [ ] `npm run typecheck` (main+renderer) 0 errors
- [ ] `npm run test` Vitest 전량 green (기존 비감소) — **신규 단언 = 매핑 모듈 3분기 각각 단언(claude→Spark / codex→OpenAI Blossom[dormant] / 미지 provider→자체 폴백) + OpenAI 테마 2변형(black=라이트/white=다크) 선택 단언 + 턴당 `.ava.ai` 1개 불변식 비회귀**
- [ ] `npm run lint` 0 problems
- [ ] TG1SHOTS p09 컷 채증(Welcome·SettingsModal 엔진 탭 최소 2컷) `ScreenShot/` 착지
- [ ] reviewer 통합 통과
- [ ] 육안 = 사람 트랙(영호 · human-visual · 무인 통과 처리 금지)
- [ ] **[인계 노트] M5 배포 전 Anthropic·OpenAI 양사 Trademark/Brand Guidelines 일괄 재확인**(SOURCE.md 마커와 연동)

---

## 🖼 육안 체크포인트 (영호 · human-visual)

> 일반 ui-visual 판정에 뭉뚱그리지 않고 별도 명시 판정할 지점.

- **Welcome 히어로 상표 오인 판정** — '어느 엔진이 활성인가(엔진 표시)'로 읽히는가 **vs** 'AgentDeck = Claude 제품(제휴 오인)'으로 읽히는가. 전자로 읽혀야 지명 사용(nominative use) 안전.

---

## 📚 학습 포인트

> 학부생 시각에서 새로운 개념.

- **단일소스화(SSOT — Single Source of Truth)** — 같은 매핑(provider→로고)이 여러 곳에 하드코딩되면 하나만 바꿔도 나머지가 어긋난다. 매핑을 한 모듈로 못박고 전 소비처가 그것만 참조하면 분기 흩어짐이 사라진다.
- **지명 사용(nominative use) 상표 원칙** — 타사 상표를 "그 제품을 가리키기 위해" 쓰는 건 허용되는 지명 사용이다(엔진 식별 목적의 아바타·라벨). 앱 자체를 그 상표로 사칭(아이덴티티)하는 것과 구분된다.
- **폴백 설계(미지 값에 안전)** — 매핑에 없는 provider가 들어와도 시스템이 깨지거나 남의 로고를 잘못 붙이지 않도록, 기본값(자체 폴백 아이콘)을 설계에 내장한다.

---

## ⚠️ 함정

> 이 영역에서 자주 하는 실수.

- **① 공식 에셋만** — 자체 재현(재그리기) 금지 · 색 변조 조항 확인(각사 `SOURCE.md`/브랜드 가이드라인 준수).
- **② 셀렉터 계약 불변** — `.ava`·`.msg` 등 셀렉터 계약은 그대로. census 밖 변경 발견 시 **STOP**.
- **③ Welcome provider 소스 실측 선행(LR1)** — 활성 대화 엔진인지 전역 기본 엔진인지 실측으로 확정하고 근거를 기록한 뒤 바인딩.
- **④ 미지 엔진 폴백 유지** — 매핑에 없는 provider는 폴백 아이콘. 잘못된 로고 오귀속 금지.
- **⑤ Track 1 동안 Welcome은 항상 Claude Spark** — Codex 백엔드 배선 전이라 Welcome은 항상 Claude Spark로 보인다(정상 — provider 바인딩의 현재 값).

---

## 담당 SubAgent

renderer 주도(매핑 모듈·소비처 수렴·테스트·shot 채증). reviewer 무조건 통합(ui-visual 복잡).

---

> **plan-auditor 2026-07-17**: 🔴1(작업4 scope creep 문리 모호) 옵션 A 즉시 봉합 · 🟡4 전건 반영 · 분할 불필요(단일 Phase 적정) 판정.
