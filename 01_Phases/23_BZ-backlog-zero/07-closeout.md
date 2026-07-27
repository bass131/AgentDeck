---
owner: 유영호
milestone: BZ
phase: 07
title: 종결 — 백로그 대장 0 확인 + BZ-DONE + push/PR
status: pending
grade: 보통
loop_track: human-gate
domain: cross
estimated: 1~1.5h
summary: 백로그 전 항목 해소 마킹(V4) + 신규 등재(CI 제한 권한·e2e 게이트·receipt 예외 ADR) + ev-test 목록 확정 + BZ-DONE 박제 + push/PR 조립.
---

# Phase 07: 종결 — 대장 0 확인 + BZ-DONE + push/PR

> **등급**: 보통 · **담당**: 메인 직접(판단 산출물) + `secretary`(게이트 재실행) · **문**: push·PR·merge = 영호 `!` 직접

## 🎯 목표

`00_Documents/BACKLOG.md`의 기존 미해소 7건이 전부 해소 마킹(커밋 해시 명기)되고, 이 마일스톤이 의도적으로 미룬 것들이 **신규 항목으로 정직하게 등재**되며, BZ-DONE + PR까지 사람 게이트 앞에 선다.

## ⏪ 사전 조건

- [ ] Phase 01~06 전부 done

## 📝 작업 내용

- [ ] **V4 — 백로그 대장 전수 갱신**: 14·15·16·21·23·24·25 각각에 해소 서술 + 커밋 해시. 21의 미해소 곁가지(②폴백→P03 해소·③w6→P02 해소·④잔해→아래)와 24의 qa 후속(→P02) 회수 확인
- [ ] **신규 등재 (의도된 이월 — 숨기지 않는다)**: ① CI 제한 권한 실행(21 게이트의 사전 차단 층 — 영호 확정 「둘 다」의 후반부. **P02 스냅샷 대조의 구조 한계(생성→삭제·원상복구 미탐 — Codex 축 4) 병기**) ② e2e(playwright)는 globalSetup 게이트 밖(P02 함정 절) ③ CORE-12 「검증 증거 예외」 ADR + conformance 2단계 receipt(ADR-040 보류분) + **`adapterRevision`/digest 드리프트 축**(Codex 축 3 — `conformedVersion`은 CORE 의미 버전 누락만 잡는다) ④ P04·P05 애매 목록 잔여(있으면) ⑤ **Codex 대칭 작업 — 실행 가능한 인계문으로 등재** (Codex 교차 리뷰 축 1·2 반영 2026-07-27. CORE-12로 Claude는 실측·수정 불가 — 아래 좌표는 전부 **Codex 자기 보고 인용**): 옛 CHANGELOG 예외의 실소유 = `agentdeck-hook.mjs` `isHarnessPath()`(`:381`) + 셸 허용 목록(`:419`) 코드 분기 2곳, 본문 변경 시 `hooks.json` SHA-256 캐시버스터 8개 갱신 동반. 정책 방향 = P06 §C와 대칭(옛 포인터 봉인·신 중립 CHANGELOG 허용)의 독립 구현. 인계문 필수 요소: `AGENTDECK_HARNESS_MAINTENANCE=1` + `:danger-full-access` 기동 / 수정 파일 = 훅 본문·훅 테스트·`hooks.json` / 검증 = `node --test .codex/hooks/agentdeck-hook.test.mjs .codex/harness-contract.test.mjs` + `harness-doctor` 정적·실행 + 새 세션 `/hooks` 재신뢰 / `AGENTS.md`·`.codex/README.md` 문서 지도에 신 CHANGELOG 위치 추가(🟡 — 현재 두 문서에 CHANGELOG 위치 부재) / 완료 이력 = 신 `00_Documents/CHANGELOG.md`에 [H]. ⚠️ P07의 G1~G6은 Codex 훅 테스트를 실행하지 않는다(`test:hooks`는 Claude 몫만) — 이 인계가 검증 공백의 정직한 기록이다
- [ ] **ev-test 잔해 목록 확정**: `%TEMP%/ev-test-*` 전수 이름 목록 작성(조회만) → 영호 승인 대기 표시. **삭제는 영호 직접** (파괴 작업 — 이름 확정 목록 규율)
- [ ] pin 이월 ②(activeVersion 앱 확인) 리마인드를 BZ-DONE ➡️절에 명기
- [ ] **BZ-DONE.md** — 필수 H2 4종(TL;DR / 5단계 보고 / AC 검증 결과 / 학습 일지 후보 키워드) ⚠️ P01이 백로그 25를 고쳤으므로 **갱신된 템플릿 그대로** 쓰면 훅 통과 — 그 자체가 25 수리의 실사용 검증
- [ ] 게이트 전종 재실행(secretary — G1~G6 + V1·V2, 출력 원문 박제) + work-pin 종결 리셋
- [ ] push / PR 명령 조립 (영호 `!` 실행). ⚠️ 단일 브랜치·단일 PR — NC #30 사고(스택 base 삭제) 재발 구조 없음
- [ ] Second Brain 축적 후보 식별만 (제안은 마일스톤 종결급 규율 — 세션 상한 확인 후)

## ✅ 완료 조건

- [ ] BACKLOG.md 기존 7건 전부 ✅ + 커밋 해시 / 신규 등재 4건± 명기 (V4)
- [ ] **번호 allocator 정합** (Codex 축 4): 신규 등재는 **26부터** 배정 + 등재 후 「현재 다음 번호」(현행 `:80` = 25로 이미 stale — 25 실재)를 최종+1로 갱신 + 전체 번호 중복 0 검사
- [ ] BZ-DONE.md — phase-gate-validator 통과 (수리된 템플릿 경유)
- [ ] 게이트 전종 green — 기준선 변동(테스트 증가분) 최종 수치 박제
- [ ] PR 생성 완료 (영호) — 머지 후 **NC 몫 일몰 조건 충족**을 pin에 기록

## 📚 학습 포인트

- "백로그 0"의 정직한 정의: 항목 0이 아니라 **알려진 것 전부가 해소됐거나 명시적으로 등재된 상태** — 숨은 이월이 없는 것

## ⚠️ 함정

- 해소 마킹하며 항목 본문을 지우지 않는다 — 18·19의 선례(기록 존치: "이 항목을 지우면 수리 동기의 절반이 사라진다")
- ev-test 목록을 뽑는 조회와 다른 쓰기 작업을 같은 Bash 호출에 섞지 않는다 (P01 수리 후에도 이중 안전)

## 담당 SubAgent

메인 직접(DONE·대장·pin — 판단 산출물) + secretary(게이트 전종 실행·ev-test 목록 조회).
