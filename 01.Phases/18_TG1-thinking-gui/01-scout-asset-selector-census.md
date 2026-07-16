---
owner: 영호
milestone: TG1
phase: 01
title: 스카우트 재실측 · 공식 에셋 확보 · 셀렉터 영향 조사
status: pending
grade: 보통
loop_track: auto-gate
estimated: 1~2h
domain: cross
---

# Phase 01: 스카우트 재실측 · 공식 에셋 확보 · 셀렉터 영향 조사

> **상태**: pending
> **마일스톤**: TG1
> **등급**: 보통
> **담당**: coordinator 불요 — 조사 위임(renderer·qa 읽기) + 에셋 심부름은 secretary

---

## 🎯 목표

구현 착수 전 3대 불확실성을 제거한다. 브리프 4단원 renderer 좌표를 재실측해 최신화하고, Claude 공식 pinwheel 로고 에셋을 확보하고, `.msg` 등 셀렉터 변경이 어느 테스트에 영향을 주는지 전수 조사한다. **코드 무변경** — 조사 + 에셋 파일 1개 추가만.

---

## ⏪ 사전 조건

- [ ] 근거 브리프 정독 — `00.Documents/reports/NEXT-사고GUI-데스크톱스타일-공식로고-아바타-브리프.html` (특히 4단원 좌표, 5단원 셀렉터 명제)

---

## 📝 작업 내용

- [ ] **(a) renderer 좌표 재실측** — 브리프 4단원의 renderer 좌표를 2026-07-15 스카우트 기준에서 변동 여부 재확인하고 갱신 좌표표를 작성한다. 대상:
  - `Conversation.tsx` — WorkingIndicator(:173-211) · WORKING_PHRASES(:138-154) · ThinkingItem(:232-293, estimatedTokens 표시 :244-255·:277-279) · assistant 버블 인라인(:838-867) · thread.map(:813-979) · WorkingIndicator 마운트(:993-1004)
  - `Conversation.css` — `.thread` gap 24px(:27)
  - store `text.ts` — handleThinking(:139-179, 리셋 :115 handleText) · handleThinkingDelta(:192-223)
  - `PanelView.tsx` 자체 루프(:490-577)
  - `SubAgentChatStream.tsx`(.saf-msg--thinking :156-164)
- [ ] **(b) 셀렉터 census** — `.msg`·사고 관련 셀렉터를 `99.Others/tests` 전수 grep → 영향 테스트 파일·개수 census 표 작성(브리프 5단원 "96개 시각·라이브 테스트" 명제 실측 검증).
- [ ] **(c) 공식 에셋 확보** — Claude 공식 pinwheel 로고를 **Anthropic Newsroom press kit**에서 확보 → `02.Source/renderer/src/assets/brand/`에 배치(파일 추가만, import 배선은 P03). **자체 재현/추측 SVG 금지** — 공식 press kit 에셋을 정본으로.
- [ ] **(d) 산출물** — 본 폴더 `01-scout-report.md`에 좌표표 + census 표 + 에셋 출처 URL을 박제.

---

## ✅ 완료 조건

- [ ] `01-scout-report.md` 좌표표에 전 항목 실측 라인 기재(변동 시 갱신 라인 명시)
- [ ] census 표에 영향 테스트 파일 목록·개수 기재(브리프 96개 명제 대조)
- [ ] 에셋 파일이 `02.Source/renderer/src/assets/brand/`에 디스크 실재 + 출처 URL 박제
- [ ] 02.Source 편집 diff 0 (예외: `assets/brand/` 에셋 파일 1개 추가) — 조사 Phase, 코드 편집 없음

---

## 📚 학습 포인트

- **셀렉터 계약 = 테스트 스위트의 암묵적 API** — `.msg` 같은 CSS 셀렉터를 e2e/시각검증이 앵커로 쓰면, 그 구조 변경은 사실상 API 파괴다. 착수 전 census가 리스크 크기를 정량화한다.
- **좌표는 스냅샷이다** — 라인 번호는 스카우트 시점의 사진일 뿐 진실이 아니다. 재실측 없이 믿으면 다른 곳을 고친다(verify-fixes-empirically, LR1 교훈).

---

## ⚠️ 함정

- **라인 번호 맹신 금지** — 브리프 좌표는 2026-07-15 기준. 재실측 없이 그대로 믿으면 안 된다(LR1 교훈).
- **press kit 접근 불가 시 STOP** — 공식 에셋을 못 구하면 추측 재현 SVG로 대체하지 말고 영호에게 보고(상표 게이트 ③ — 에셋 정본은 press kit).
- **에셋 배치만, 배선 금지** — import 배선은 P03 몫. 여기서는 파일만 놓는다(코드 diff 0 유지).

---

## 담당 SubAgent

coordinator 불요. 좌표 재실측·셀렉터 census = renderer·qa 읽기 조사 위임. 공식 에셋 확보 심부름 = secretary. 산출물 `01-scout-report.md` 작성.
