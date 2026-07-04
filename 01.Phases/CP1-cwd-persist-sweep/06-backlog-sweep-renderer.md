---
owner: 영호
milestone: CP1
phase: 06
title: renderer 소형 백로그 6건 스윕
status: done
grade: 보통
risk:
loop_track: human-visual
estimated: 1~3h
domain: renderer
summary: renderer 소형 백로그 6건 일괄.
---

# Phase 06: renderer 소형 백로그 6건 스윕

> **상태**: done
> **마일스톤**: CP1
> **등급**: 보통
> **담당**: renderer

---

## 🎯 목표

renderer 소형 백로그 6건을 일괄 처리한다. 각 건은 독립적이며 테스트를 동반한다.

---

## ⏪ 사전 조건

- [ ] 없음 — 웨이브 1 병렬 착수 가능 (renderer 도메인 단독).

---

## 📝 작업 내용 (각 건 테스트 동반)

- [ ] **① Esc 일관성** — `Shell.tsx:244-253` onEscape를 `decideStopAction` 경유로 변경(정지 버튼과 판정 일관). **거동 변화**: repl 일반 턴에서 Esc가 interrupt로(정지 버튼과 일관화) — **영호 육안 확인 항목**, NG 시 원복 용이(키바인딩 1점).
- [ ] **② AgentPanel 맵 프루닝** — `lastSeenRef`·`timersRef` 프루닝(subagents 배열 교체 시 stale entry 제거).
- [ ] **③ 대화 전환 재노출 봉합** — 대화 전환 시 done 카드 완만 재노출 엣지 봉합(전환 감지 시 `lastSeenRef` 초기화).
- [ ] **④ reduced-motion opacity** — SubAgentModelBadge reduced-motion에 opacity 폴백(OrchestrationCard 선례 동형).
- [ ] **⑤ loopDisplayRegistry** — 주석 정직화 + detail 타입 추가(테스트 동반으로 tdd-guard 통과).
- [ ] **⑥ modelLabel 상수 단일화** — modelLabel↔pickerOptions 패밀리 상수를 renderer 내 단일화.

---

## ✅ 완료 조건

- [x] `npm run typecheck` (main+renderer) 0 errors
- [x] `npm run test` green (6건 각 테스트 PASS)
- [x] `npm run lint` 0 problems
- [x] reviewer 권장
- [x] ①의 거동 변화(repl 일반 턴 Esc→interrupt)를 테스트로 명시
- [x] **🟡4 봉합·displayName 소비 4지점·조기 별칭 배지 graceful 포함**

---

## 📚 학습 포인트

- **판정 일관성** — 같은 의도(정지)의 두 진입점(Esc·버튼)이 다른 코드 경로를 타면 거동이 갈린다. 단일 판정 함수(`decideStopAction`)로 수렴시켜 일관성 확보.
- **Ref 프루닝** — React ref에 쌓인 stale 엔트리를 소스 배열 교체 시 정리하지 않으면 메모리·표시 누수가 생긴다.

---

## ⚠️ 함정

- **①은 거동 변화** — repl 일반 턴에서 Esc가 interrupt로 바뀐다. **의도임을 테스트로 명시**(회귀로 오인 방지).
- ⑤ 주석 정직화 시 detail 타입 추가는 tdd-guard 통과를 위해 테스트 동반 필수.

---

## 담당 SubAgent

renderer
