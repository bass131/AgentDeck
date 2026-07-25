# 01.Phases — 마일스톤 연대기 목차 (Chronological Index)

> **목적**: 마일스톤 폴더가 알파벳/접두 혼재로 쌓여 시간 흐름을 한눈에 못 읽는 문제를 해소하는 **연대기 항법도**. 각 폴더의 최초 커밋일(`git log --diff-filter=A`) 기준으로 정렬했다.
>
> **리네임 완료(2026-07-11)**: 영호 매핑 승인으로 폴더를 시간순 `NN_` 접두(00~14)로 `git mv` 리네임했다(이력 보존). 아래 "현재 폴더명" 열이 실제 폴더 구조이며, "옛 폴더명"은 리네임 전 이름이다. 과거 문서 내 옛 경로 표기는 소급 수정하지 않으므로 이 INDEX가 항법 기준이다.
>
> **완료 폴더는 지우지 않는다** (영호 2026-07-03 — *"빈 폴더 원칙" 폐기*). 완료된 마일스톤 폴더는 `-DONE.md`·`ScreenShot/`을 포함해 **기록·참고용으로 보존**한다. 다음 마일스톤이 "그때 왜 그렇게 했나"를 되짚는 1차 재료이고, git 이력만으로는 스크린샷·조판 산출물이 복원되지 않기 때문이다. <!-- HR2 P12에서 CLAUDE.md 「명령어」 절 폐지와 함께 이관 — 그 전까지 이 결정의 유일 소유자가 헌법이었다 -->
>
> **새 Phase 산출 경로**: `/work-plan`이 `01_Phases/{NN}_{milestone-slug}/`에 Phase 정의를 만든다(work-pin 시드 + plan-auditor 검증). 절차 정본 = [`.claude/skills/work-plan/SKILL.md`](../.claude/skills/work-plan/SKILL.md).

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
| 15 | — (신설) | `15_HR1-harness-renewal` | 2026-07-12 ~ 07-13 | ✅ done | 하네스 전면 리뉴얼 — 3층 구조(중립 코어 CORE-01~13+manifest/Claude 어댑터/Codex 전담 보조)·훅 관측성(systemMessage+guard-blocks.log)·ADR 세분화(1결정=1파일)·conformance 게이트 기계화·H3 안건 흡수. 6 Phase(HR1-DONE, 게이트 7종 green·reviewer CRITICAL 0). PR = 영호 게이트 대기. |
| 16 | — (신설) | `16_BL1-backlog-closeout` | 2026-07-13 | ✅ done | HR1 이후 잔여 백로그 청소 — 훅 견고성·CORE-03 Read deny(유지보수 창)·복원 페이지 데드락·LR4 꼬리(유예 타이머·배너 watchdog)·offKeys prune. 7 Phase(BL1-DONE) + 마감일 후속 2건(goal 표시 수명 일원화·시각검증 8컷) + GAP1 기능격차 감사(확정 48건·마일스톤 3축·quick win 5). 게이트 3종 green·영호 육안 8컷 통과. PR = 영호 게이트 대기. |
| 17 | — (신설) | `17_GAP1-core-parity` | 2026-07-13 ~ 07-15 | ✅ done | Claude Code CLI 대비 코어 작업 루프 동등(배포 게이트) — SDK 신호 배선(훅 콕핏·턴 신뢰성·확장 사고·plan 승인)·IDE급 도구 렌더(Read/Grep/Glob·백그라운드 셸 라이브 테일)·턴 회계/고아 pump 봉합·라이브 모드 전환·SubAgent 스플릿 뷰. 16 Phase(P01~P16 · 15-rounds-log 원장 포함 NN-*.md 17파일). 최종 게이트 typecheck 0·Vitest 5174 passed·lint 0. PR #22 머지(696777b). |
| 18 | — (신설) | `18_TG1-thinking-gui` | 2026-07-16 ~ 07-17 | ✅ done | 사고 GUI를 Claude Code Desktop 스타일로 재작업 — 턴 블록 통합(한 턴=한 블록=아바타 1개)·한 줄 상태 라인(✻ 심볼·동사 순환·경과 초·실시간 토큰)·공식 Claude Spark 아바타를 단일챗·멀티패널·서브에이전트 표면 3종 전파 + P09 provider 브랜드 로고 SSOT. 9 Phase(P01~P09 · 01-scout-report 포함 NN-*.md 10파일). 최종 게이트 typecheck 0·Vitest 5246 passed·lint 0. PR #23 머지(92eeca1). |
| 19 | — (신설) | `19_LM1-live-model-switch` | 2026-07-17 ~ | ⏳ pending | REPL 지속세션 라이브 모델 전환 — GAP1 P13 setPermissionMode의 7단 체인을 SDK `Query.setModel`로 미러(Track2 확장). 재사용 경로 안전망(change-guard 전제)·역통지 이벤트 미신설(낙관 반영)·picker id 원문 전달. 5 Phase({P01,P02}∥ → {P03,P04}∥ → P05). |

**상태 각주**
- ¹ BF1: interrupt 트랙 `_interrupt-track-DONE.md` 완료. loop-decision 트랙(04·05) phase frontmatter는 `pending`으로 남았으나 산출물(ADR-024 재고 초안)은 LR2가 승계 — 실질 종결.
- ² 라이브 e2e/사람 육안 게이트가 phase 단위로 일부 미실행(frontmatter `in-review`/`pending` 잔존)이나 마일스톤 DONE 또는 최종 phase DONE 존재 → 실질 완료.
- ³ RMW1-single-writer 자체는 DONE. RMW lost-update 후속은 별건 백로그(pin "잔여 별건")로 분리 추적.

---

## 리네임 실행 메모

- **실행 완료**: 폴더 `NN_` 접두 리네임은 LR4 P03 커밋(`07b3dcc`) 직후 `git mv`로 15종 전부 실행 완료(2026-07-11, 이력 보존). FB1 untracked ScreenShot도 새 경로 `10_FB1-ui-feedback/ScreenShot/`에 보존.
- **소급 미수정**: 과거 문서(`-DONE.md`·ADR·CHANGELOG·pin 이력) 안의 옛 폴더 경로 표기는 **소급 수정하지 않는다**(git 이력 추적성 보존, M5 배포 전 일괄 정리 권고).
- **정렬 근거**: 동일 날짜 폴더는 최초 커밋 타임스탬프(시각)로 tie-break — 07-03(BF3→RMW1→UC1→FB1), 07-04(FB2→CP1) 순.

---

## 최상위 폴더 개명 항법 (2026-07-25, HR2 P08 — ADR-028 개정 1)

**최상위 5개 폴더의 구분자를 `.` → `_`로 바꿨다.** 이 커밋(HR2 P08) 이전의 로그·문서·스크린샷 경로는 **전부 옛 이름**이므로, 과거를 조회할 때는 아래 표로 옮겨 읽는다.

| 옛 이름 (이 커밋 이전) | 현재 이름 |
|---|---|
| `00.Documents/` | `00_Documents/` |
| `01.Phases/` | `01_Phases/` |
| `02.Source/` | `02_Source/` |
| `98.Management/` | `98_Management/` |
| `99.Others/` | `99_Others/` |

**왜 항법 노트가 필요한가** — `git mv`의 이력 보존은 **파일 단위 `--follow` 한정**이다. 디렉토리 단위 로그·blame은 개명 지점에서 끊긴다(실측: 개명 후 `git log 02_Source`는 1커밋만 보인다). 그래서:

- 파일 하나의 이력: `git log --follow 02_Source/main/index.ts` — **개명을 넘어 추적된다**
- 디렉토리 이력: `git log --follow`가 안 통하므로 **옛 경로로 따로 조회**한다 — `git log -- '02.Source/**'`
- blame이 개명 커밋에서 멈추면: `git blame <개명커밋>^ -- 02.Source/<경로>`

**개명 근거**(ADR-028 개정 1): 취향 통일이 표면 이유지만 실질은 **판정 정규식 단순화**다 — `.`은 정규식 메타문자라 훅이 `00\.documents`로 이스케이프해야 했고, 이스케이프를 빠뜨리면 매칭 실패 = `'unrelated'` = **봉인 해제**로 조용히 기운다. ⚠️ 단 생태계 마찰(`src/` 관례 이탈)은 **해소되지 않았다** — 비표준 A에서 비표준 B로 간 것이지 표준 복귀가 아니다.

**옛 경로 표기는 소급 수정하지 않는다** — 위 2026-07-11 원칙과 같다. 다만 이번에는 원칙을 **둘로 나눴다**: *산문*(`-DONE.md`·CHANGELOG·ADR 서술)은 미수정, ***코드·설정·훅·경로 리터럴은 예외 없이 전수 수정***. 2026-07-11에 뭉뚱그렸다가 e2e 4곳에 유령 경로가 남았고, `mkdirSync(recursive)` 때문에 **에러 없이 없는 폴더에 스크린샷을 쌓고 있었다**(실측 2026-07-25).
