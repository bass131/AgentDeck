---
owner: 영호
milestone: LR1
phase: 01
title: resume 버그 재현 + 원인 확정 (RED 테스트 + 진단)
status: pending
grade: 보통
loop_track: auto-gate
domain: qa
summary: 프로세스 재시작(=PC 종료) 시뮬레이션으로 session_id 유실을 재현하는 실패 테스트 작성 + 2후보(snapshot flush 타이밍 / held-open resumeSessionId 미사용) 중 실제 원인을 코드 실측으로 확정.
---

# Phase 01: resume 버그 재현 + 원인 확정 (RED 테스트 + 진단)

> **상태**: pending
> **마일스톤**: LR1
> **등급**: 보통 (진단·테스트 — TDD RED 단계)
> **담당**: qa (테스트 작성) + 메인 세션 (코드 정독 진단)

---

## 🎯 목표

프로세스 재시작(= PC 종료/절전 후 앱 재시작)을 시뮬레이션했을 때 **session_id가 복원되지 않아 "새 대화처럼" 되는 버그를 재현하는 실패 테스트**를 작성한다. 동시에 원인 2후보 중 실제가 무엇인지 코드 실측으로 확정한다:
- **후보 ①**: `panelSession.ts:256/218` snapshot 저장·복원 설계는 있으나 디스크 flush 타이밍이 안 맞음.
- **후보 ②**: `sdkOptions.ts:189` resume 매핑이 **단발 경로에만** 적용 → held-open(현재 기본 `replMode:true`) 경로가 resumeSessionId를 미사용.

이 Phase가 끝나면: 버그를 캡처한 RED 테스트 + "원인은 ①/②/양쪽" 확정 노트.

---

## ⏪ 사전 조건

- [x] BF1 머지된 master (`88e7908`) 기준 `feature/loop-resume` 브랜치
- [x] 결정문 `_loop-session-decision.md`(P04) · `_adr-024-rethink-draft.md`(P05) 정독
- [ ] Explore 코드 맵의 line 번호 재확인 (stale 여부 — 파일 편집으로 이동했을 수 있음)

---

## 📝 작업 내용

- [ ] **재현 테스트 작성** (`99.Others/tests/main/persistent-session.test.ts` 확장 또는 신규):
  - session_id 저장 → 프로세스 재시작 시뮬(새 store 인스턴스 + 디스크에서 로드) → resume 안 됨을 assert (현재 fail = RED)
  - "재시작 시뮬"은 in-memory 상태를 버리고 **디스크 영속 파일에서만** 복원하는 경로로 구성 (held-open in-memory 세션에 의존하지 않게)
- [ ] **후보 ① 진단** — `panelSession.ts` snapshot flush 트리거 추적: `snapshotForPersist()`(:256)가 *언제* 디스크에 write되는가? sessionId 확정(SDK가 session_id 방출) 후 flush가 실제로 일어나는지.
- [ ] **후보 ② 진단** — `sdkOptions.ts:189` `...(req.resumeSessionId ? { resume: ... } : {})`가 `persistent:true` 경로(`_runPersistentPump`, claudeAgentRun.ts:533)에서 호출되는지, 아니면 단발(`_runPump`, :376)에서만인지 확인.
- [ ] **원인 확정 노트** — `_resume-bug-diagnosis.md`(짧게): 후보 ①/②/양쪽 중 무엇이 실제 원인인지 + Phase02/04 각각이 무엇을 고쳐야 하는지 매핑.

---

## ✅ 완료 조건

- [ ] RED 테스트 1개 이상 — 현재 **fail**로 버그를 캡처 (통과하면 버그 미재현 = false RED, 재작성)
- [ ] `npm run typecheck` 0 errors (테스트만 추가 → 기존 코드 불변)
- [ ] `npm run test` — 신규 RED 테스트만 fail, 나머지 green (회귀 0)
- [ ] `_resume-bug-diagnosis.md` — 원인 확정 (후보 ①/②/양쪽 명시 + Phase 매핑)

---

## 📚 학습 포인트

- **TDD RED-first** — 고치기 전에 버그를 *실패하는 테스트*로 못박는다. 이후 Phase02가 그 테스트를 green으로 만들면 "고쳤다"가 기계로 증명됨(헌법 TDD).
- **in-memory held-open vs file-based resume** — held-open은 세션을 프로세스 메모리에 붙잡음(프로세스 죽으면 증발). resume은 session_id를 디스크에 두고 매 입력마다 되살림(프로세스 죽어도 생존). PC 종료 시나리오의 근본 차이.
- **flush 타이밍** — "저장 코드가 있다"와 "제때 디스크에 써진다"는 다르다. write-through(즉시) vs write-back(지연/버퍼)의 함정.

---

## ⚠️ 함정

- **false RED** — 테스트가 실제 버그가 아니라 다른 이유로 fail하면 Phase02가 엉뚱한 걸 고침. 재현이 진짜 "재시작 후 resume 실패"인지 검증.
- **line 번호 stale** — Explore 맵의 line(sdkOptions:189, panelSession:256/218, system.ts:87)은 2026-07-01 기준. 파일 편집으로 이동했을 수 있으니 grep으로 재확인.
- **held-open 의존 오염** — 재시작 시뮬이 실제로 in-memory 세션을 재활용하면 버그가 안 보임. 반드시 디스크 경로만 태울 것.

---

## 담당 SubAgent

**qa** (테스트 작성 — `99.Others/tests/**` R/W) + **메인 세션** (코드 정독 진단 — 앱 코드 R only). 순수 진단·테스트라 위임 1개 + 메인 진단.
