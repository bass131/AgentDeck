---
owner: 영호
milestone: RF1
phase: 03
title: dead code · 미사용 export 스윕
status: done
grade: 보통
loop_track: auto-gate
estimated: 1.5h
domain: cross
summary: ts-prune+eslint+고아파일 진단 → 코드베이스 클린(안전 제거 0). ts-prune 멀티-tsconfig false-positive 박제.
---

# Phase 03: dead code · 미사용 export 스윕

> **상태**: done (2026-06-27)
> **마일스톤**: RF1-cleanup (트랙 A · 위생)
> **등급**: 보통
> **담당**: 메인 직접

---

## 🎯 목표

코드베이스의 미사용 export·도달 불가 코드·루트 잡파일·고아 파일을 식별하고, *안전하게 증명된 것만* 제거한다.

---

## 🔬 실측 결과 (2026-06-27) — 클린, 제거 0

| 진단 | 결과 |
|---|---|
| 루트 잡파일(`*.tsbuildinfo`·`*.log`·tmp) | **0개** (이미 gitignored/정리됨) |
| eslint 미사용 var/import (`src/**`) | **0건** — 경고는 전부 `tests/**`의 의도적 `_` placeholder·타입전용 바인딩(qa 도메인) |
| ts-prune 미사용 export | **전부 false positive** — web tsconfig 단독 분석이라 main/preload cross-target 사용 못 봄. 표본 5개(BACKEND_LABELS·WORKSPACE_ROOT_ID·WorkspaceOpenRequest·AgentRunResponse·WindowBounds) 모두 4~28곳 실사용 확인 |
| 고아 파일(import 0회) | 후보 2개 — **둘 다 의도적 keep** (아래) |

**고아 후보 = 의도적 keep (삭제 X)**:
- `src/renderer/src/components/SubAgentModal.tsx` — `AgentPanel.tsx:319` **"삭제 금지(F10-02 시각자산 보존)"** 명시 + 테스트 2개(global-shortcuts-p6·agentpanel-detail) 동작 검증.
- `src/renderer/src/lib/gitSampleData.ts` — 자체 docstring "GitModal 단위 테스트용 mock 데이터". CHANGELOG의 *SampleData keep 선례(composerSampleData·f14SampleData·run-args.ts=실측 참조)와 동일 범주.

**결론**: 안전 제거 대상 **0**. 코드베이스가 이미 클린(하네스 이식 STAGE0 정리 + 지속 관리). 코드 변경 없음 → 회귀 baseline 불변.

---

## ⏪ 사전 조건

- [x] Phase 02 완료 (artifacts 정리)

---

## 📝 작업 내용

- [x] ts-prune(web tsconfig) — 미사용 export 후보 진단 → false positive 확인
- [x] eslint no-unused — `src/**` 0건 확인
- [x] 루트 잡파일 점검 — 0개
- [x] 고아 파일 진단(basename import 0회) → 후보 2개 실 참조/보존표식 확인 → keep
- [x] keep 판정 박제 — 두 파일 모두 *기존 주석/docstring으로 self-documented* (추가 불요), 본 plan에 결과 기록

---

## ✅ 완료 조건

- [x] 제거 후보별 "참조" 증거 기록 (5/5 ts-prune 표본 + 2/2 고아 = 전부 사용/보존)
- [x] 코드 변경 0 → `typecheck`/`test`/`lint` baseline 불변(회귀 무관)
- [x] 다음 스윕 오판 방지 — 결과 박제

---

## 📚 학습 포인트

- **ts-prune 멀티-tsconfig 함정** — 3-타깃 Electron(main/preload/renderer)에서 ts-prune를 *한 tsconfig*로 돌리면, 다른 타깃에서 쓰는 export가 "미사용"으로 잘못 잡힌다. 진짜 미사용 = 전 타깃·테스트에서 0. 단일 tsconfig 출력은 *후보*일 뿐.
- **클린 스윕도 유효한 결과** — dead code를 *만들어서라도* 지우려는 충동 금지. "훑었더니 깨끗"이 정직한 결론. 삭제 = 증명된 것만.

---

## ⚠️ 함정

- ts-prune "unused"를 그대로 삭제 → IPC 계약 타입(main이 import) 삭제 사고. cross-target 확인 필수.
- `*SampleData`·"삭제 금지" 표식 파일을 고아로 오인 삭제 — keep 선례·주석 확인.

---

## 담당 SubAgent

> 메인 직접 (진단·검증).
