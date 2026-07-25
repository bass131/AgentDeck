---
owner: 영호
milestone: CP1
phase: 02
title: 핸들러 root 수용·재검증 + 전역 폴백
status: done
grade: 보통
risk: trust-boundary
loop_track: auto-gate
estimated: 1~3h
domain: main-process
summary: 핸들러가 root 파라미터 수용 — 재검증(절대경로·존재·디렉토리) 후 스토어에 전달, 실패·부재 시 전역 root 폴백.
---

# Phase 02: 핸들러 root 수용·재검증 + 전역 폴백

> **상태**: done
> **마일스톤**: CP1
> **등급**: 보통
> **담당**: main-process

---

## 🎯 목표

`settings.ts`의 command.list·skill.list 핸들러가 P01 계약의 root 파라미터를 수용하여 재검증(절대경로·존재·디렉토리) 후 스토어에 전달한다. root가 부재하거나 검증 실패면 전역 workspaceRoot로 폴백한다.

---

## ⏪ 사전 조건

- [ ] **P01** — command.list·skill.list root 파라미터 계약(additive) 완료.

---

## 📝 작업 내용

- [ ] `settings.ts` 두 핸들러(`:52`·`:108`)에 root 파라미터 배선 — 스토어 함수(`skills.ts:297`·`commands.ts:358`)가 이미 root 인자를 수용하므로 전달만.
- [ ] **root 소비처 2곳 모두 배선(감사 🟡)** — command.list 핸들러는 스토어 함수(`settings.ts:108`)와 `getBackend().listSupportedCommands`(`settings.ts:111` — `AgentBackend.ts:279`가 이미 root 인자 수용) **둘 다**에 root를 전달해야 한다. 한쪽만 바꾸면 패널-root와 전역-root 커맨드가 혼합 반환된다.
- [ ] `workspace.ts:55·74`의 검증 관례(절대경로·존재·디렉토리) 재사용 — **공통 헬퍼 추출 검토**.
- [ ] 폴백 경로: 검증 실패·부재 시 전역 `getCurrentWorkspaceRoot()`로 폴백.
- [ ] 폴백 경로 테스트 4케이스: 비절대 / 미존재 / 파일경로(디렉토리 아님) / 미전달.

---

## ✅ 완료 조건

- [x] `npm run typecheck` (main+renderer) 0 errors
- [x] `npm run test` green (폴백 4케이스 PASS)
- [x] `npm run lint` 0 problems
- [x] reviewer(trust-boundary 필수) CRITICAL 0
- [x] 검증 통과 root는 반영, 실패·부재는 전역 폴백됨을 테스트로 입증
- [x] **roots 레지스트리 멤버십 불요 판정 근거 명문화** — 스캔은 `.claude/skills|commands` 하위 한정 직접 읽기(`skills.ts:311`)로, 기존 전역 root와 동일 신뢰 수준의 구조 검증(절대경로·존재·디렉토리)으로 충분. 별도 roots 레지스트리(fs.read 게이트) 등록 불요.
- [x] **스캔 범위 `.claude` 하위 한정 불변식 테스트** — root 파라미터가 `.claude/skills|commands` 밖을 읽지 않음을 입증.

---

## 📚 학습 포인트

- **재검증(re-validation)** — untrusted 경계를 넘어온 값은 신뢰 경계 안쪽(main)에서 다시 검증한다. 계약 주석이 "믿지 말라"고 해도 실제 방어는 핸들러가 한다.
- **Graceful 폴백** — 잘못된 입력에 예외를 던지기보다 안전한 기본값(전역 root)으로 폴백하면 UX가 견고해진다.

---

## ⚠️ 함정

- **roots 레지스트리는 불요(판정 완료)** — 스캔은 `.claude/skills|commands` 하위 한정 직접 읽기(`skills.ts:311`)로 기존 전역 root와 동일 신뢰 수준의 구조 검증(절대경로·존재·디렉토리)으로 충분. 별도 roots 레지스트리(fs.read 게이트) 등록은 필요 없다. 단 스캔 범위가 `.claude` 하위를 벗어나지 않도록 불변식을 지킬 것(범위 확장 시 재판정).
- 검증 헬퍼 추출 시 `workspace.ts`의 기존 거동을 회귀시키지 말 것.

---

## 담당 SubAgent

main-process
