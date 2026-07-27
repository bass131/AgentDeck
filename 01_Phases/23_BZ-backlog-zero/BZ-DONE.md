---
summary: BACKLOG 미해소 7건(14·15·16·21·23·24·25)을 전부 해소하고 신규 6건(26~31)을 정직하게 등재해 「알려진 것 전부가 해소됐거나 명시 등재된 상태」로 만든 7 Phase 마일스톤. ADR-040(conformance 어댑터 축 v2)·ADR-041(CHANGELOG 엔진 중립 이동)을 정본 반영했고, shell-policy 오탐을 역할 기반 귀속으로 재수리하며 reviewer(fable) 2회가 잡은 회귀까지 완주했다.
phase: BZ-milestone
work-id: bz-backlog-zero
status: done
grade: 대규모
gate_version: 1
owner: 영호
completed_at: 2026-07-28
commit: c23eb2f
---

# BZ — 백로그 제로 완료 박제

**소요 시간**: 2026-07-27 주간(P01·창 1) + 밤 자율 1회(P02~P05, 영호 승인 예외) + 2026-07-28 주간(P04-B·창 2 P06·P07) ≈ 2일

## TL;DR

BACKLOG.md 미해소 7건(14·15·16·21·23·24·25)을 커밋 해시 명기로 전부 해소하고, 의도적으로 미룬 것 6건(26~31)을 신규 등재했다 — "백로그 0"의 정의는 항목 0이 아니라 **숨은 이월이 없는 상태**다. 구조 변경 2건은 ADR로 먼저 세웠다: ADR-040(core-manifest v2 — 13조항 × 엔진별 `conformedVersion` + 「선언된 갭」 WARN 클래스)과 ADR-041(CHANGELOG를 `00_Documents/`로 이동, 옛 경로는 봉인된 포인터). 부수 성과로 shell-policy 오탐(백로그 14)을 역할 기반 귀속으로 재수리했는데, reviewer(fable) 2회가 수리 자체의 회귀 4계열을 실측으로 잡아내 골든 +13과 함께 완주했다.

## 5단계 보고

- 🎯 **무엇을 만들었나** — ① 홈 격리 globalSetup 게이트(`homeGuard.ts` — 테스트가 사용자 홈을 오염하면 exit 1) ② `getUserDataPath` 폴백 제거(비-electron 컨텍스트 throw) ③ `src/` 옛 경로 주석 66건 보수 치환(5도메인) ④ conformance v2(어댑터 준수 축 + WARN 클래스) ⑤ CHANGELOG 엔진 중립 이동(치환 15 + 좌표 9 + 병기 2 원자 커밋) ⑥ shell-policy 역할 기반 귀속 재수리(파이프 체인 귀속 + cwd 추적 통합 루프) ⑦ BACKLOG V4 전수 갱신(해소 7 + 신규 6).
- 🤔 **왜 필요한가** — 영호 결정: "백로그들 전부 마일스톤화해서 한번에 처리하자. 슬슬 개발로 넘어가고 싶은데." HR1→HR2→NC 내내 하네스 정비가 하네스 결함을 드러내는 자기 순환이 이어졌다 — 대장을 0으로 만들어야 개발 마일스톤 복귀가 선다.
- 🛠️ **어떻게 만들었나** — Phase 7개, 유지보수 창 2회(영호 개방), 커밋 12개. 확정 분기 4건(⚖️)은 재확인 없이 그대로 실행. Codex 교차 플랜 체크 4축을 계획에 선반영(인계문 실행 가능 명세·§C 방향 반전·정확 동등성 4클래스·allocator 정합). 코드 수정은 TDD(red 먼저 — conformance 신규 7케이스·shell-policy 골든 13), 검증 렌즈는 reviewer(fable) 2회(P04-B 28건 정독 🔴0 / shell-policy 재수리 2차에서 B∩C 교집합 회귀 적발 → 즉시 봉합).
- 🧪 **테스트 결과** — 아래 AC 검증 결과 절의 게이트 전종 원문 참조. 훅 122/122 · conformance PASS 13/13 + WARN 2(선언된 갭 가시화 — 설계 의도) · 단위 5,359 passed | 10 skipped(기준선 5,336 대비 +23 = P02·P06 증가분, 감소 0) · typecheck/lint 0 · e2e core-loop 4/4.
- ➡️ **다음 스텝** — **창 폐쇄 후(영호 `CLOSE-GATE.bat` → 다음 세션)**: V1(canary 봉인 생존 프로브) + V2(재봉인: flag 부재 + `settings.json ≡ SEALED`) + V3(백로그 14 오탐 3종 통과·양성 차단 라이브 재검증) + ADR-041 라이브 프로브(`.claude/CHANGELOG.md` 쓰기 → 훅 차단 확인) + `settings.json` 재봉인 미러 커밋(NC 선례 `5253d1c`). **영호 몫**: push·PR 실행(아래 조립 명령) / ev-test 잔해 54개 삭제(목록 = `07-closeout.md` 박제) / BACKLOG 30 애매 3부류 판정(추천 = 전부 불변) / **pin 이월 ② — `engine-config.json` `activeVersion: null` 덮임의 앱 확인**(영호가 앱에서 버전 재선택 필요할 수 있음) / 「선언된 갭」 WARN 클래스 설계 검토(아래 결정 흐름 ③). **Codex 세션(영호 기동)**: BACKLOG 26(CORE-10 갭)·27(CORE-11 갭 + ADR-041 대칭 — 실행 가능 인계문은 `07-closeout.md` 작업 내용 ⑤). **BZ 종결 = NC 몫 병행 수용 일몰 타이머 조건 충족** — 실행은 다음 마일스톤 창.

## AC 검증 결과

게이트 전종(G1~G6)은 secretary가 저장소 루트에서 재실행했고 판정 줄 원문을 그대로 박는다. V1·V2·V3는 창 폐쇄 후에만 성립하므로 다음 세션 몫(➡️절).

| 게이트 | 명령 | 판정 원문 줄 | exit | 기대 대비 |
|---|---|---|---|---|
| G1 훅 셀프테스트 | `npm run test:hooks` | `ℹ tests 122` / `ℹ pass 122` / `ℹ fail 0` | 0 | 일치 (기준선 120 → **122**, P01+P06 증가분) |
| G2 CORE conformance | `node 00_Documents/00_Harness/conformance-check.mjs` | `CONFORMANCE: PASS — 13/13 조항 (매핑·버전·impl 실재·verify 선언·준수 축 green · 선언된 갭 2건(위 WARN — red 아님))` | 0 | 일치 (PASS 13/13 + WARN 2) |
| G3 harness-conformance | `npx vitest run 99_Others/tests/harness-conformance.test.ts` | `Tests 19 passed (19)` | 0 | 일치 (기준선 12 → **19**, ADR-040 +7) |
| G4 단위 전체 | `npx vitest run` | `Test Files 396 passed \| 6 skipped (402)` / `Tests 5359 passed \| 10 skipped (5369)` | 0 | 일치 (기준선 5,336 → **5,359**, 감소 0) |
| G5 타입·린트 | `npm run typecheck && npm run lint` | 양쪽 무출력 | 0 / 0 | 일치 (0 / 0) |
| G6 e2e 핵심 | `npx playwright test 99_Others/tests/e2e/core-loop` | `4 passed (15.5s)` | 0 | 일치 (4/4) |

G2 WARN 2줄 원문 (선언된 갭 — 설계된 가시화, red 아님):

```
WARN CORE-10: codex 선언된 갭(conformedVersion 0) — BACKLOG 26 해소 전까지 이 조항의 codex 축은 미준수 상태다
WARN CORE-11: codex 선언된 갭(conformedVersion 0) — BACKLOG 27 해소 전까지 이 조항의 codex 축은 미준수 상태다
```

> 실행 환경 주기: 게이트는 유지보수 창 2 **개방 중**(훅 exit 0 상태)에 돌았다 — G1은 훅 로직의 단위 테스트라 창 상태와 무관하게 유효하지만, **라이브 봉인 발화 검증(V1·V3)은 창 폐쇄 후에만 성립**하므로 다음 세션 몫이다. `.claude/settings.json` dirty는 창 상태물(OPEN-GATE 산물)로 커밋 제외.

마일스톤 고유 검증 V4(백로그 대장 전수 대조):

```
$ grep -c "▪ ✅ **2026-07-28 해소" 00_Documents/BACKLOG.md
7        # 14·15·16·21·23·24·25 전건 커밋 해시 명기
$ grep -n "^2[89]\. \|^3[01]\. " 00_Documents/BACKLOG.md
74:28. / 76:29. / 78:30. / 80:31.        # 신규 4건 + P06 선등재 26·27 = 미해소 6건
# 번호 allocator = 32, 중복 0, 개행 혼합 0
```

## 결정 흐름 (회고 참고용)

- ① **conformance 1단계(선언 기반) vs 2단계(중립 receipt)** → 1단계 채택 — 2단계는 CORE-12 「검증 증거 예외」 ADR이 선행 조건이라 명시 보류(BACKLOG 29). 자기선언 한계는 ADR-040 §3이 소유(note 증발 재발 방지).
- ② **CHANGELOG 옛 경로 예외 존치 vs 제거** → 제거(방향 반전) — 이동 후 포인터는 고정 어댑터 파일 = CORE-11 봉인 대상. Codex 교차 리뷰가 원안의 방향 오류를 잡았다.
- ③ **⚠️ 영호 검토 대기 — 「선언된 갭」 제5클래스(세션 중 판단, ADR-040 §5 통합)**: Codex 부트스트랩 receipt가 CORE-10·11 선재 갭(`conformedVersion: 0`)을 드러냈는데, 이를 red로 만들면 게이트가 서지 않아 **값을 1로 위조할 압력**이 생긴다. `0 + gap`(BACKLOG 번호 참조) = WARN(가시화·비차단), gap 없는 0 = red로 설계했다. trade-off: 갭이 영구 WARN으로 눌러앉을 수 있다 — 대비 = BACKLOG 26·27이 해소 조건(Codex 자기 구현 + receipt + 자기 상향)을 명시.
- ④ **P04 치환 기준** → 보수(⚖️ 3 확정 그대로) — 명시 경로만 치환, 개념 호칭·예시·외부 원본 불변, 애매 3부류는 판정 이월(BACKLOG 30). 완료 증명 = 게이트 **등호**(주석 전용이므로 증가도 red).
- ⑤ **shell-policy B∩C 교집합 봉합** → 체인 귀속 루프와 cwd 추적 루프를 한 루프로 통합 — 두 루프가 각자 절반씩만 보던 정보(파이프 역할 / 현재 디렉토리)를 한 시야에 모아야 `cd .claude && echo settings.json | xargs rm`이 잡힌다.

## 막혔던 지점

- **reviewer(fable) 1차 리뷰가 재수리에서 회귀 3계열 적발**(치환 위장·cd 상대경로·파이프) → 골든 red 선행 후 재수리 → **2차 리뷰가 B∩C 교집합 재적발** → 통합 루프로 봉합. 검증 렌즈 승격(P01-E)이 첫 실전에서 값을 했다 — 수리의 회귀를 수리 당일 두 번 잡았다.
- **BACKLOG 일괄 삽입 스크립트가 CRLF에 죽음** — `'\n\n15. '` 문자열 앵커가 `\r\n\r\n15. `와 불일치(`end miss`). 정규식 `\r?\n` 앵커로 전환 + 삽입 텍스트 개행을 파일 스타일에 맞춰 해소. 개행 혼합 0 검산.
- **Codex 축 값 실측 불가(CORE-12)** → 부트스트랩 receipt(Codex job task-ms3t80xh-164img)를 영호 경유로 회수해 출처 명기로 기입 — 추정 기입 금지 규율 유지.

## 학습 일지 후보 키워드

- 선언된 갭(declared gap) 패턴 — 게이트가 선재 결함을 만나면 red가 아니라 WARN+등재로 값 위조 압력을 제거
- 파이프 체인 귀속·cwd 추적의 단일 루프 통합 (부분 시야 두 개 ≠ 전체 시야 하나)
- CRLF와 문자열 앵커 — 텍스트 처리는 개행 스타일 실측이 선행
- 백로그 0의 정의 = 숨은 이월 없음 (항목 0 아님)
- 제한 권한 세션 = 테스트 격리 결함 탐지 도구 (재확인)
