---
owner: 영호
milestone: RF1-followup
phase: 04
title: 00_ipc/index.ts 추가 분리 + 테스트 copy 정리
status: done
grade: 복잡
risk: trust-boundary
loop_track: human-gate
estimated: 1.5~2.5h
domain: main-process
summary: ipc index.ts 191줄(>150) 추가 분리 + agent-runs.ts 검토 + 테스트 copy 정리
---

# Phase 04: 00_ipc/index.ts 추가 분리 + 테스트 copy 정리

> **상태**: pending
> **마일스톤**: RF1-followup
> **등급**: 복잡 (보통 + trust-boundary 상향)
> **담당**: main-process

---

## 🎯 목표

RF1 P10이 `ipc/index.ts`를 도메인 핸들러로 분해했지만 `00_ipc/index.ts`가 여전히 **191줄**(>150 기준 초과, work-pin 후속 P10). 등록/배선 책임을 추가 분리하고, P10에서 남은 "테스트 copy"(중복 테스트 흔적)를 정리한다. 거동 불변.

---

## ⏪ 사전 조건

- [ ] Phase 01 완료 (drift 봉합)
- [x] 실측: `00_ipc/index.ts` 191줄, `agent-runs.ts` 272줄, `handlers/fs.ts` 196줄. index는 핸들러 등록 오케스트레이션 추정
- [ ] **착수 전 index.ts 본문 확인** — 무엇이 191줄을 채우는지(등록 루프? 인라인 핸들러?)에 따라 분리 전략 결정

---

## 📝 작업 내용

- [ ] `00_ipc/index.ts` 191줄 구조 분석 — 분리 가능한 책임(도메인 등록 그룹화 / 인라인 핸들러 잔존 → handlers/로 이동) 식별
- [ ] 식별된 단위를 별도 모듈로 추출 (등록 헬퍼 또는 잔존 핸들러 → `handlers/`)
- [ ] `agent-runs.ts` 272줄도 과하면 검토 (필수 아님 — index 우선)
- [ ] "테스트 copy" 정리 — **실측 먼저**: `99.Others/tests/`에서 `00_ipc` 관련 중복/복사 테스트(`.bak`·`-copy`·중복 describe) 탐색. plan-auditor 사전 실측상 명백한 copy 아티팩트 **미발견** → **있으면 정리(qa 협조), 없으면 서브태스크 드롭 + 보고**(스코프 방어, 추측 삭제 금지)
- [ ] index.ts **150줄 이하** 목표

---

## ✅ 완료 조건

- [ ] `00_ipc/index.ts` **≤150줄** (또는 미달 사유 보고)
- [ ] `npm run typecheck` 0 errors
- [ ] `npm run test` green (시작값 대비 비감소 + 신규 fail 0)
- [ ] `npm run build` green
- [ ] `npm run lint` 0 problems
- [ ] (테스트 copy) 실측 대상 0이면 드롭 보고, 있으면 제거 후 `npm run test` green
- [ ] reviewer 통과 (trust-boundary — IPC 핸들러)
- [ ] **영호 GO** (human-gate — trust-boundary 변경은 사람 게이트)

---

## 📚 학습 포인트

- **오케스트레이션 vs 로직** — index.ts는 "누가 무엇을 핸들하나"를 배선하는 곳. 핸들러 *로직*이 여기 남아있으면 분리 신호.
- **trust-boundary가 왜 사람 게이트인가** — IPC 핸들러 등록 한 줄 실수가 renderer에 권한을 잘못 노출할 수 있다. 기계 검증(typecheck)으로 다 못 잡는 의미적 위험.

---

## ⚠️ 함정

- **trust-boundary** — `00_ipc/`는 신뢰 경계. 핸들러 등록 누락/오배선이 기능 소실 또는 권한 누수. reviewer + 영호 GO 필수.
- **risk-detector 훅 리터럴** — `.claude/hooks/risk-detector.sh`가 `*src/main/ipc/*` 패턴으로 검출(RF1 _milestone-plan 결함1 참조). 폴더명은 이미 `00_ipc`로 정착됐으니 *파일 이동*만 — 폴더 rename 금지.
- **테스트 copy 정리 범위** — qa 영역(`99.Others/tests/`)을 건드리면 도메인 경계. main-process는 앱 코드, 테스트 삭제는 qa 협조 또는 보고.

---

## 담당 SubAgent

`main-process` (`02.Source/main/**` R/W, agents 제외) + (테스트 정리 시) `qa` 협조
