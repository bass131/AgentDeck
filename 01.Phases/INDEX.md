# 01.Phases — 마일스톤 연대기 목차 (Chronological Index)

> **목적**: 마일스톤 폴더가 알파벳/접두 혼재로 쌓여 시간 흐름을 한눈에 못 읽는 문제를 해소하는 **연대기 항법도**. 각 폴더의 최초 커밋일(`git log --diff-filter=A`) 기준으로 정렬했다.
>
> **리네임 완료(2026-07-11)**: 영호 매핑 승인으로 폴더를 시간순 `NN_` 접두(00~14)로 `git mv` 리네임했다(이력 보존). 아래 "현재 폴더명" 열이 실제 폴더 구조이며, "옛 폴더명"은 리네임 전 이름이다. 과거 문서 내 옛 경로 표기는 소급 수정하지 않으므로 이 INDEX가 항법 기준이다.

---

## 마일스톤 표 (최초 커밋일 순)

| # | 옛 폴더명 (리네임 전) | 현재 폴더명 (리네임 후) | 기간(최초~최종 커밋) | 상태 | 한 줄 요약 |
|---|---|---|---|---|---|
| 00 | `RF1-cleanup` | `00_RF1-cleanup` | 2026-06-30 ~ 07-01 | ✅ done | 위생 잠금·아티팩트/데드코드 스윕·NN 접두 규약(ADR-027)·거대파일 분해(IPC·backend·appStore·composer). 15 Phase. |
| 01 | `RF1-followup` | `01_RF1-followup` | 2026-07-01 | ✅ done | RF1-cleanup 후속 — drift 정합·desc DRY·claude-backend/IPC index 분해·큐 메시지 dedup·배럴 아키 문서. 6 Phase. |
| 02 | `BF1-interrupt-loop` | `02_BF1-interrupt-loop` | 2026-07-01 | ✅ done¹ | 채팅 Interrupt 수정 + Loop 동작 기준 확정. interrupt 트랙 DONE, 결정 트랙은 ADR-024 재고로 LR2 승계. |
| 03 | `LR1-loop-resume` | `03_LR1-loop-resume` | 2026-07-01 ~ 07-02 | ✅ done² | "옛 대화 기억 못 함" 실불편 → resume 신뢰성 + transcript 폴백(ADR-029)·복원 배지. 5 Phase(LR1-DONE). |
| 04 | `LR2-loop-replmode` | `04_LR2-loop-replmode` | 2026-07-01 ~ 07-02 | ✅ done² | resume 기본 전환 + loop 빌트인 GUI(ADR-024 구현)·held-open resume·sessionKey 안정화. |
| 05 | `switch-continuity` | `05_switch-continuity` | 2026-07-02 | 📄 진단만 | 전환-연속성 버그 진단서 — phase 미생성, LR 트랙으로 흡수됨. |
| 06 | `LR3-loop-ux` | `06_LR3-loop-ux` | 2026-07-02 ~ 07-03 | ✅ done² | 앱 타이머 /loop 폐기(빌트인 전환)·AUTO 세션 수명(held-open)+금색 표시등·멀티패널 연속성. P05(자연어 가이드) dropped. |
| 07 | `BF3-backlog-sweep` | `07_BF3-backlog-sweep` | 2026-07-03 | ✅ done | 비차단 🟡 백로그 일괄 수리 + 권한 UX 인라인 카드 전환. 7 Phase(BF3-DONE). |
| 08 | `RMW1-single-writer` | `08_RMW1-single-writer` | 2026-07-03 | ✅ done³ | 멀티패널 저장 race → 단일 writer·공유 커맨드 계약·main merge 의미. 5 Phase(RMW1-DONE). |
| 09 | `UC1-ultracode-redesign` | `09_UC1-ultracode-redesign` | 2026-07-03 ~ 07-04 | ✅ done | ultracode(동적 권한 게이트) 턴 오케스트레이션 재설계·토글 단일 권한·denied 이벤트 계약. 10 Phase(UC1-DONE). |
| 10 | `FB1-ui-feedback` | `10_FB1-ui-feedback` | 2026-07-03 ~ 07-04 | ✅ done | 영호 실사용 피드백 스윕(스트림 렌더 패리티·줌 IPC·서브에이전트 챗뷰). 6 Phase. |
| 11 | `FB2-ui-feedback2` | `11_FB2-ui-feedback2` | 2026-07-04 | ✅ done | 실사용 피드백 2차(interrupt·줌 setter·슬래시·서브에이전트 모델 라벨·goal 배너). 8 Phase. |
| 12 | `CP1-cwd-persist-sweep` | `12_CP1-cwd-persist-sweep` | 2026-07-04 ~ 07-05 | ✅ done | 멀티패널 cwd 정합 + 서브에이전트 영속 + 백로그 스윕. 7 Phase(PR#18 머지). |
| 13 | `LR4-session-stability` | `13_LR4-session-stability` | 2026-07-05 ~ 07-11 | 🔄 진행 중 | REPL/goal 세션 안정성 + 세션별 토글 — 688ms idle-close 창 봉합 트랙. 7 Phase(P01·P02·P04 done, P03 진행, P05~07 pending). |
| 14 | `H1-codex-harness-hardening` | `14_H1-codex-harness-hardening` | 2026-07-10 ~ 07-11 | ✅ done | Codex Harness 실행 계약·permission profile·비용 계층(Sol/Terra/Luna)·doctor live 보강. 7 Phase(H1-DONE). |

**상태 각주**
- ¹ BF1: interrupt 트랙 `_interrupt-track-DONE.md` 완료. loop-decision 트랙(04·05) phase frontmatter는 `pending`으로 남았으나 산출물(ADR-024 재고 초안)은 LR2가 승계 — 실질 종결.
- ² 라이브 e2e/사람 육안 게이트가 phase 단위로 일부 미실행(frontmatter `in-review`/`pending` 잔존)이나 마일스톤 DONE 또는 최종 phase DONE 존재 → 실질 완료.
- ³ RMW1-single-writer 자체는 DONE. RMW lost-update 후속은 별건 백로그(pin "잔여 별건")로 분리 추적.

---

## 리네임 실행 메모

- **실행 완료**: 폴더 `NN_` 접두 리네임은 LR4 P03 커밋(`07b3dcc`) 직후 `git mv`로 15종 전부 실행 완료(2026-07-11, 이력 보존). FB1 untracked ScreenShot도 새 경로 `10_FB1-ui-feedback/ScreenShot/`에 보존.
- **소급 미수정**: 과거 문서(`-DONE.md`·ADR·CHANGELOG·pin 이력) 안의 옛 폴더 경로 표기는 **소급 수정하지 않는다**(git 이력 추적성 보존, M5 배포 전 일괄 정리 권고).
- **정렬 근거**: 동일 날짜 폴더는 최초 커밋 타임스탬프(시각)로 tie-break — 07-03(BF3→RMW1→UC1→FB1), 07-04(FB2→CP1) 순.
