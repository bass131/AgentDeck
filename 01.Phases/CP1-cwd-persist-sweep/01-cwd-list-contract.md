---
owner: 영호
milestone: CP1
phase: 01
title: command.list·skill.list root 파라미터 계약 (additive)
status: done
grade: 보통
risk: shared-contract, trust-boundary
loop_track: auto-gate
estimated: 1~3h
domain: shared-ipc
summary: command.list·skill.list 요청에 선택적 root 파라미터 additive + preload 노출 — 패널별 cwd 반영의 계약면.
---

# Phase 01: command.list·skill.list root 파라미터 계약 (additive)

> **상태**: done
> **마일스톤**: CP1
> **등급**: 보통
> **담당**: shared-ipc

---

## 🎯 목표

command.list/skill.list IPC 요청 타입에 `root?: string`(절대경로, untrusted) 파라미터가 additive로 추가되고 preload 화이트리스트를 통과한다. 기존 무인자 호출 거동은 불변(하위호환) — 패널별 cwd 반영을 위한 계약면을 연다.

---

## ⏪ 사전 조건

- [x] 없음 — 웨이브 1 병렬 착수 가능 (shared-ipc 도메인 단독).

---

## 📝 작업 내용

- [x] shared/ipc 타입 확장: command.list·skill.list 요청에 `root?: string` additive. JSDoc에 **untrusted — main 재검증 책임**을 명시.
- [x] preload 화이트리스트에서 root 파라미터가 통과되도록 배선.
- [x] 계약 골든 테스트 (요청 타입 shape 고정 + 무인자 호환).
- [x] `AgentRunRequest`는 이미 `workspaceRoot`를 보유 — 신규 계약 불요임을 **확인만** (중복 계약 생성 금지).

---

## ✅ 완료 조건

- [x] `npm run typecheck` (main+renderer) 0 errors — 양쪽 green
- [x] `npm run test` green (계약 골든 테스트 PASS)
- [x] `npm run lint` 0 problems
- [x] reviewer(shared-contract 필수) CRITICAL 0
- [x] 기존 무인자 호출 거동 불변(하위호환) 테스트로 입증

---

## 📚 학습 포인트

- **Additive 계약 변경** — 선택적 필드 추가는 기존 소비자를 깨지 않으므로 IPC 버전 bump가 아니다. 필수 필드 추가나 시맨틱 변경만이 breaking.
- **신뢰 경계와 계약 주석** — renderer는 untrusted. 계약에 "untrusted, main 재검증 책임"을 주석으로 명문화하여 다음 Phase(핸들러)가 검증 의무를 계약으로 인지하게 한다.

---

## ⚠️ 함정

- renderer가 보낸 root를 신뢰하지 말 것 — 계약 주석으로 **main 재검증 계약**을 명문화(실제 검증은 P02 몫).
- IPC 버전 bump 아님(additive) — bump로 오판 금지.
- `AgentRunRequest.workspaceRoot`가 이미 있으므로 run 계약에는 신규 필드를 추가하지 말 것(확인만).

---

## 담당 SubAgent

shared-ipc
