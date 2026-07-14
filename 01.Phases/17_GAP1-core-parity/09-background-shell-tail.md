---
owner: 영호
milestone: GAP1
phase: 09
title: 백그라운드 셸 라이브 테일 — run_in_background 배지 · 증분 tail · 태스크 정지 제어
status: done
grade: 대규모
risk: backend-contract·ui-visual
loop_track: human-visual
estimated: 5~12h
domain: cross
summary: 감사가 "GUI가 일상 드라이버가 못 되는 결정적 이유"로 지목한 앵커(T-01) — (1) run_in_background 플래그 인지 + 배경 셸 배지(현재 토큰 0회), (2) task_notification+tool_result 스트림 소비 기반 증분 tail(호스트측 폴링 메서드 없음 실측), (3) 백그라운드 태스크 정지 제어(stopTask). 계약 타입은 P03 선정의분 사용. tail 스트림 모델 ADR 후보.
---

# Phase 09: 백그라운드 셸 라이브 테일

> **상태**: pending
> **마일스톤**: GAP1
> **등급**: 대규모
> **담당**: cross (main-process + agent-backend + renderer) + reviewer 통합

---

## 🎯 목표

'dev 서버/테스트 워쳐를 백그라운드로 돌리고 로그를 지켜보며 iterate'하는 일상 코딩 루프를 GUI 안에서 성립시킨다 — 감사가 지목한 배포 게이트의 핵심 앵커. 끝나면: run_in_background 명령이 배경 셸 배지로 구분되고, SDK가 방출하는 task_notification+tool_result 스트림을 소비해 증분 로그가 라이브로 붙고, 정지 버튼(stopTask)으로 종료된다. 지금은 백그라운드 bash가 포그라운드와 동일 렌더라 결국 별도 터미널로 이탈하게 된다.

---

## ⏪ 사전 조건

- [ ] **P03 완료 (hard)** — tail 스트림 타입(task_notification+tool_result 기반) + 태스크 정지 요청/결과 이벤트가 `02.Source/shared`에 정의됨
- [ ] **P02 완료 (hard)** — TaskStop/KillShell 명칭 정본·MUTATING 재분류 공유(P09 정지 제어가 P02 정본에 의존)
- [ ] **P04 완료 (hard)** — persistent-run liveness 공유(활성 background task 존재 시 idle-close 금지 정합)
- [ ] 근거 = GAP1 감사 T-01 (tools-rendering high, 일상 드라이버 결정적 앵커)
- [ ] 현행: run_in_background 토큰이 02.Source 전역 **0회** 등장(입력 플래그 미인지) · BashOutput은 이름 정규화로 우연히 'bash' kind에 맞을 뿐 shell-id/증분 tail 모델 없음(`toolKind.ts:23`) · KillShell 부재 + MUTATING 세트 stale 'KillBash'(`permissionCoordinator.ts:42` — P02와 조율)

---

## 📝 작업 내용

- [ ] **(a) run_in_background 플래그 인지 + 배지** — Bash 도구 입력의 run_in_background 플래그를 읽어 배경 셸로 구분 + 배경 셸 배지 렌더(현재 포그라운드와 동일 렌더)
- [ ] **(b) 증분 tail 모델 (스트림 소비)** — **실측(sdk.d.ts 0.3.201): Query는 stopTask(taskId)·backgroundTasks(toolUseId)·close()만 노출, 호스트측 출력 폴링 메서드 없음.** tail은 SDK가 방출하는 **task_notification + tool_result 스트림 소비**로 구성한다(P03 probe ④ 캡처 결과 기반) → dev 서버/테스트 워쳐 로그를 라이브 증분으로 표시. **스트림만으로 tail 불가 판명 시 정지 후 ADR로 전략 결정.** 계약 타입은 **P03 선정의분 사용**. tail 모델 확정 후 세부 필드는 여기서 **additive 추가로 확장 — P03 계약 재-bump 금지**(P03은 최소 선정의만, P04 탈출구와 동형)
- [ ] **(c) 백그라운드 태스크 정지 제어** — 엔진 중립 stop: renderer 정지 버튼 → preload → shared IPC → main → AgentBackend 어댑터 → `Query.stopTask(taskId)`. 정지 요청/결과 이벤트는 **P03 계약에 포함**. TDD 필수. (TaskStop 자체 모니터 UI는 기존 백로그 유지 — 정지 경로만 이 Phase 소유. KillShell↔TaskStop 명칭 정본은 P02와 조율)
- [ ] **(d) 성능** — tail 폴링 주기·버퍼 관리(장시간 dev 서버 로그 누적 시 메모리·렌더 성능)
- [ ] **(e) 수명 정책 조율 지점 문서화** — 기존 '백그라운드 태스크 수명 정책' 백로그(유휴 종료 vs 잔존·고아 정리)와 **조율 지점만 문서화**(수명 정책 자체는 이 Phase 범위 밖). goal 유예 흡수가 pending 백그라운드 태스크를 몰라 조기 ended 오판하는 실측(2026-07-13)과 인접
- [ ] **(f) TDD + ADR 후보** — 실패 테스트 선행. tail 모델은 소규모 ADR 후보(control-request 아닌 폴링 모델 결정)

---

## ✅ 완료 조건

- [ ] `npm run typecheck` (main+renderer) 0 errors — **양쪽 필수(계약 소비)**
- [ ] `npm run test` Vitest 전체 green + TDD(실패 테스트 선행)
- [ ] `npm run lint` 0 problems
- [ ] run_in_background 배지 구분(단정) · 스트림 소비 증분 tail 라이브 표시(단정) · 태스크 정지 stopTask(단정) · 장시간 로그 버퍼 성능 확인
- [ ] 활성 background task 존재 시 idle-close 금지(claudeAgentRun idle-close 예약과 정합) + 세션 종료/앱 종료 시 background task 정리. 전체 고아 정리 정책은 백로그 잔류
- [ ] 영호 육안 병행 (ui-visual — 무인 commit X, 라이브 tail 육안 확인)
- [ ] reviewer 통과 (backend-contract + 대규모 통합 = 무조건)

---

## 📚 학습 포인트

- **백그라운드 프로세스 라이프사이클** — 백그라운드 셸은 시작·실행·종료·고아(orphan)라는 수명을 갖는다. 이걸 추적·표시·제어하지 못하면 GUI가 터미널을 대체할 수 없다.
- **증분 tail(스트림 소비) 모델** — 호스트가 출력을 폴링하는 게 아니라(SDK에 폴링 메서드 없음) SDK가 방출하는 task_notification+tool_result 스트림에서 '새로 늘어난 부분'만 이어붙인다. 로그가 계속 자라는 dev 서버에서 필수인 모델.
- **버퍼 성능** — 장시간 로그는 무한히 자란다. 버퍼 상한·가상화 없이 그대로 렌더하면 메모리·렌더가 무너진다.

---

## ⚠️ 함정

- **최대 비용 + 조율 지점 최다** — P03 계약 + claude-stream 배선(P04~P06 레인) + P02 KillShell 교정이 전부 겹침 → **최후순 배치**.
- **backend-contract·ui-visual 이중** — 계약 소비(양쪽 typecheck) + 라이브 tail 시각(영호 육안) 둘 다.
- **CORE-01 신뢰 경계** — 태스크 제어(stopTask·backgroundTasks 조회)는 main 프로세스 단독(CORE-01), tail 스트림은 기존 AgentEvent IPC 채널 재사용 — 신규 raw `00_ipc` 핸들러 신설 금지(신설 필요해지면 trust-boundary 격상 + 정지·영호 게이트).
- **수명 정책 범위 절단** — 유휴 종료 vs 잔존·고아 정리는 이 Phase 범위 밖(백로그). 조율 지점만 문서화, 정책 결정을 여기서 하지 않음(범위 밖 발견 시 보고 후 중단).
- **tail 폴링 주기** — 너무 잦으면 부하, 너무 뜸하면 라이브감 손실. 버퍼 상한 필수.

---

## 담당 SubAgent

coordinator 경유 — main-process Worker(태스크 라이프사이클·stopTask 제어) + agent-backend Worker(run_in_background 인지·task_notification+tool_result 스트림 정규화) + renderer Worker(배지·라이브 tail·정지 버튼) + reviewer 통합 무조건(backend-contract·대규모). ui-visual이라 영호 육안 병행.
