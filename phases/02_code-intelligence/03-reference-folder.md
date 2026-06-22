# Phase 03: reference-folder (읽기전용)

## 목표
워크스페이스 외 **읽기 전용 보조 폴더**를 등록해 탐색·뷰어로 참조. AgentCodeGUI "Reference folder support (read-only supplementary folders)" 복제.

## 담당 도메인 / 에이전트
shared-ipc + main-process + renderer. 등급: 복잡.

## 의존 Phase
01 (뷰어 + fs.read).

## 위험 깃발
**trust-boundary** (추가 루트 — 각 레퍼런스 루트에 대해 독립적 경로 탈출 방어) → reviewer 무조건.

## 변경 대상
- `src/shared/ipc-contract.ts` — `reference.add`(폴더 등록), `reference.list`, `reference.tree` 채널. fs.read에 *루트 식별자* 추가(어느 루트 기준 상대경로인지). preload 노출.
- `src/main/` — 레퍼런스 루트 레지스트리(읽기전용 플래그). 모든 읽기는 **해당 루트 기준 resolveSafe**(루트별 독립). 레퍼런스는 쓰기/에이전트 변경 대상 아님.
- `src/renderer/` — 탐색기에 레퍼런스 폴더 섹션(읽기전용 시각 구분). 클릭 → 뷰어(읽기전용 표시).

## 작업 단계
1. shared: reference 채널 + read 계약에 루트 식별자.
2. main: 레퍼런스 루트 레지스트리 + 루트별 resolveSafe(워크스페이스 루트와 분리, 각각 containment). 읽기전용 강제.
3. renderer: 탐색기 레퍼런스 섹션 + 읽기전용 인디케이터 + 뷰어 연동.
4. 신뢰경계: 각 루트 독립 검증(한 루트 경로로 다른 루트/시스템 접근 불가).

## 완료조건 (AC)
- [ ] typecheck green · test PASS · build OK.
- [ ] 루트별 경로 탈출 독립 거부 테스트(레퍼런스 루트 경로로 워크스페이스/시스템 접근 불가).
- [ ] 레퍼런스는 읽기전용(쓰기 경로 없음) 확인.
- [ ] renderer fs 직접 0 · 채널 하드코딩 0.
- [ ] e2e: 레퍼런스 폴더 등록(env 우회 키 **`AGENTDECK_E2E_REFERENCE`** — M1 `AGENTDECK_E2E_WORKSPACE` 패턴 정합) → 탐색기 표시 → 파일 뷰어.

## 참조
docs/ARCHITECTURE.md(신뢰경계 표) · CLAUDE.md · M1 resolveSafe.
