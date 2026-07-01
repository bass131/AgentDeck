---
owner: 영호
milestone: LR1
title: 대화 기억 신뢰성 — 완료 보고 (-DONE)
status: done
grade: 대규모 (3+ 도메인)
date: 2026-07-02
pr: "#8 (feature/loop-resume → master)"
summary: "이전 대화 이어가면 기억 못 함" 실측 버그를 닫음. 직접 원인(단일채팅 sessionId drop)+폴백+ 라이브 반전 후 잔여(모델 거짓 disclaimer) 대응. resume 정상 라이브 확정.
---

# LR1 — 대화 기억 신뢰성 완료 보고

> PR **#8** · 브랜치 `feature/loop-resume` → `master` · 커밋 12 + 본 보고.

## ① 무엇을 / 왜
영호 실측 버그: **"단일채팅에서 이전 대화를 이어가면 Claude가 기억 못 한다."** 스크린샷·실데이터(`ebe0d616.json` = sessionId undefined, 12msg/2일)로 확인. 목표 = 대화 기억을 신뢰할 수 있게.

## ② 어떻게 (변경)
| 성격 | 커밋 | 내용 |
|---|---|---|
| fix | `fa9df22` | 단일채팅 `CONVERSATION_SAVE` 핸들러가 sessionId(+게이지)를 `store.save`로 forward — 3필드 대칭 복구 |
| feat | `d47664c`·`0dd99e5` | transcript 폴백(ADR-029): `buildModelContextPrompt` 순수함수·양 펌프 공용. sessionId 없는 옛 대화 안전망 |
| feat (a) | `e056fdb` | `MEMORY_CONTINUITY_GUIDE`: resume 세션 한정 systemPrompt 주입으로 거짓 disclaimer 억제(confabulation 방어 포함) |
| feat (b) | `981bcf9` | "맥락 복원됨" 배지: 복원 대화(sessionId+메시지≥1) UI 표시, 신규 대화와 구조 구분 |
| test | `9795821` | 라이브 격리·disclaimer probe 2종 + 진단서 §8 |
| docs | `70d61f5` | ADR-029 후속·ADR-024/REPL_TRANSITION 오진 정정·FEATURE_MAP |

## ③ 검증 (기계 게이트)
- 전체 **3869 test green** · typecheck green · lint 0 · build green.
- reviewer(opus): Phase 02 backend-contract 🔴0 · (a) backend-contract 🔴0.
- **라이브 e2e 실측**: 재시작 후 코드네임 직접회상 ✅(`lr1-resume-isolation-probe`, memory 파일 배제 → 출처=resume 단독) · 메타질문 disclaimer 억제 ✅(`lr1-disclaimer-suppression-probe`: "응, 기억나… MANGO88XR" + confabulation 방어).

## ④ 트레이드오프 / 미해결
- **(a)는 claude_code preset 순수충실(ADR-013)서 의도적 이탈** — resume 세션 한정, ADR-029 연장으로 기록. 프롬프트 기반(soft) 억제라 100% 보장 아님(confab 방어 문구로 균형).
- **known-gap**: resume "성공했으나 빈 세션"(만료·손상)은 트리거로 못 잡음("sessionId 있음 ≠ 맥락 복원") — ADR-029 §미해결.
- **백로그(이연)**: Phase 03 견고성 — session 이벤트 즉시저장(done 전 크래시 방어) · 폴더없는 단일채팅 cwd 안정화. 관측 버그 아닌 엣지 하드닝.
- **LR2 분리**: replMode 기본값 전환 · held-open 옵트인 배선 · loop 빌트인 GUI (영호 버그와 독립).

## ⑤ 다음
- PR #8 merge 후 master 반영. Phase 03·LR2는 백로그(`01.Phases/LR2-loop-replmode/`).

## 🎓 배운 것 (핵심 교훈)
1. **모델 자기보고 ≠ 시스템 진실.** "기억 못 한다"는 모델 말을 버그 신호로 오독할 뻔 → 디스크 포렌식·probe로 교차검증해 뒤집음.
2. **오진 2회 정정.** ADR-024 "held-open 증발"(메커니즘 오진) → LR1 "앱이 잊는다"(fa9df22 후엔 오진). 실측이 서사를 계속 교정.
3. **사용자 실사용 경로를 그대로 재현하라.** e2e는 늘 직접질문이라 disclaimer를 안 밟았고, 영호가 메타질문+memory도구를 밟아 진짜 증상을 드러냄 — "TDD만 통과" 인상의 근원.
4. **경로 비대칭 함정.** 멀티패널로 "resume 정상"을 검증하고 단일채팅 버그를 놓쳤음. 사용자가 실제 쓰는 화면부터 봤어야.

## 산출물
- 진단서: `_resume-bug-diagnosis.md`(§1-8). ADR: `ADR-029`(+후속). Phase: 01(done)·02(done)·03(deferred)·04(done, 배지)·05(e2e/docs 반영).
- 라이브 probe: `99.Others/tests/e2e/lr1-resume-isolation-probe.e2e.ts`·`lr1-disclaimer-suppression-probe.e2e.ts`(LIVE_SDK).
