---
owner: <본인>                                          # 솔로 — 미래 합류자 대비 필드 유지
milestone: M5 | M6 | ...
phase: NN
title: Phase 제목
status: pending | in-progress | done | blocked
grade: 단순 | 보통 | 복잡 | 대규모
risk: (옵션) trust-boundary | backend-contract | irreversible | ui-visual
loop_track: (옵션) auto-gate | human-visual | human-gate   # 루프 버킷 (work-judge.md)
estimated: 1~3h (단순/보통) | 2~5h (복잡) | 5~12h (대규모)
domain: main-process | agent-backend | renderer | shared-ipc | qa | cross
---

# Phase NN: [Phase 제목]

> **상태**: pending | in-progress | done | blocked
> **마일스톤**: M5 / M6 / ...
> **등급**: (frontmatter `grade:` 정합)
> **담당**: (frontmatter `domain:` → SubAgent 정합)

---

## 🎯 목표

> 이 Phase가 끝나면 무엇이 동작해야 하는가? 한두 문장으로.

_(예: 설정 모달에서 백엔드 엔진을 Claude/Codex로 전환하면 다음 run부터 선택된 어댑터가 호출된다.)_

---

## ⏪ 사전 조건

- [ ] _(예: Phase 01 — AgentBackend registry 완료)_
- [ ] _(예: shared IPC 계약에 backend.select 채널 정의됨)_

---

## 📝 작업 내용

> 의미 있는 단위로. 등급별 분량:
> - 단순: 1~3 체크리스트, 1 파일
> - 보통: 3~7 체크리스트, 2~3 파일
> - 복잡: 7~15 체크리스트, 2 도메인
> - 대규모: TaskCreate로 내부 분해 권장 (Team SubAgent 동원)

- [ ] _(예: registry에 selectBackend(id) 추가)_
- [ ] _(예: settings 모달에 엔진 셀렉터 배선 — renderer)_

---

## ✅ 완료 조건

> 객관적·정량적. "잘 작동한다" 같은 모호 표현 X. done 판사 = CI.

- [ ] `npm run typecheck` (main+renderer) 0 errors
- [ ] `npm run test` green (관련 테스트 N PASS)
- [ ] `npm run lint` 0 problems
- [ ] _(기능 완료조건 — 예: 엔진 전환 후 run이 선택 어댑터로 라우팅됨, e2e 1 PASS)_

---

## 📚 학습 포인트

> 학부생 시각에서 새로운 개념 (있으면).

- _(예: 어댑터 패턴 — 구체 엔진을 공통 인터페이스 뒤로 숨기기)_

---

## ⚠️ 함정

> 이 영역에서 자주 하는 실수.

- _(예: renderer에서 직접 백엔드 호출 — 신뢰 경계 위반. IPC 경유 필수)_

---

## 담당 SubAgent

> main-process / agent-backend / renderer / shared-ipc / qa 또는 메인 직접 (단순)
