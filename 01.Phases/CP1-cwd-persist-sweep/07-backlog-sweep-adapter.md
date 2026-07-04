---
owner: 영호
milestone: CP1
phase: 07
title: 어댑터 소형 백로그 3건 스윕
status: done
grade: 보통
risk: shared-contract
loop_track: auto-gate
estimated: 1~3h
domain: agent-backend
summary: 어댑터 소형 백로그 3건 — 표시명·조기 배지·qa 케이스.
---

# Phase 07: 어댑터 소형 백로그 3건 스윕

> **상태**: done
> **마일스톤**: CP1
> **등급**: 보통
> **담당**: agent-backend

---

## 🎯 목표

어댑터 소형 백로그 3건을 처리한다 — 서브에이전트 표시명, 조기 모델 배지, ok:false qa 케이스. 라이브 픽스처 기반으로 합성 가정을 배제한다.

---

## ⏪ 사전 조건

- [ ] 없음 — 웨이브 1 병렬 착수 가능 (agent-backend 도메인 단독).

---

## 📝 작업 내용

- [ ] **① 표시명(displayName)** — SDK `AgentInput.name`(addressable 이름) 관찰 → `SubAgentInfo`에 `displayName?: string` additive. `name=subagent_type` 계약은 불변(NG-1 결정 유지), 표시는 renderer가 displayName 우선.
- [ ] **② 조기 배지** — Task input에 model 파라미터가 있으면 생성 시점 스냅샷에 반영(조기 배지 — assistant 관찰 도착 시 원시 ID로 갱신).
- [ ] **③ ok:false qa** — `ok:false`(is_error) 서브에이전트 tool_result 골든 케이스 추가.
- [ ] renderer 표시(displayName 소비)는 소형이면 포함, 커지면 P06으로 이관 보고.

---

## ✅ 완료 조건

- [x] `npm run typecheck` (main+renderer) 0 errors
- [x] `npm run test` green (①②③ 및 골든 케이스 PASS)
- [x] `npm run lint` 0 problems
- [x] reviewer 필수 (shared additive 1필드 — `displayName`)

> **후속 분리**: renderer 소비(displayName 표시·별칭 배지 처리)는 후속 소형으로 분리.

---

## 📚 학습 포인트

- **Additive + 계약 불변 공존** — `name=subagent_type` 계약을 유지하면서 표시용 `displayName`을 optional로 추가하면, 식별(name)과 표시(displayName)를 분리해 계약을 깨지 않는다.
- **라이브 픽스처** — 실제 관찰된 형상(ng1-ng2b 프로브)을 재사용하면 합성 가정으로 인한 거짓 통과를 막는다.

---

## ⚠️ 함정

- **라이브 픽스처 기반** — ng1-ng2b 프로브 실측 형상을 재사용, **합성 가정 금지**.
- `name=subagent_type` 계약을 바꾸지 말 것(NG-1 결정 유지) — displayName은 표시 전용 additive.
- renderer 소비가 커지면 P06으로 이관 보고(범위 밖 발견 시 보고 후 중단 원칙).

---

## 담당 SubAgent

agent-backend
