# P04 진단 노트 — 복원 페이지 클릭 데드락 (2026-07-13)

> BL1 P04 산출물. 조사 주체 = renderer Worker(계측·반증 실험), 박제 = secretary. 제품 코드 diff 0으로 종료(`git status -- 02.Source/` 클린 확인).

## 결론

**LR4-DONE:78의 "JS 구동 지속 갱신 루프" 가설은 오진.** 렌더러에 상시 구동 루프는 존재하지 않는다(idle 3초 관찰창: rAF 콜백 0회 · longtask 0건 · DOM 변이 0건). 실제 원인:

> 복원(re-launch)된 `BrowserWindow`가 OS 레벨 포커스/가시성을 획득하지 못함 → Chromium이 백그라운드 창에 rAF 전달을 완전 정지 → Playwright 'stable' 액셔너빌리티 판정이 내부적으로 rAF 프레임 샘플링에 의존하므로 **판정이 단 한 번도 수행되지 못한 채** 타임아웃.

stable 실패 유형은 계획서의 ①(박스 실변화)/②(요소 교체)/③(렌더러 과부하) 어느 것도 아닌 **제4유형: 판정 메커니즘 자체 미구동**.

## 반증된 후보들 (기계 증거)

| 후보 | 반증 근거 |
|---|---|
| REPL 활성 인디케이터 (LR4 옛 유력) | 판정 = 타이머 없는 항등 함수(replIndicator.ts:11) · 점등 = `box-shadow`만 애니메이션(Composer.css:927, 레이아웃 불변) — LR4에서 이미 반증 |
| SmoothMarkdown 영구 rAF 루프 (Codex 1순위) | 재현 경로(SC-1/SC-1-B)는 `thread.length===0` → PanelView `hasContent` 분기(:197,:408-414)로 `.ma-p-empty` — SmoothMarkdown 마운트 0(DOM 계측). rAF 스케줄링 무력화 패치 후에도 데드락 100% 동일 재현 — 정식 반증 완료 |

renderer 전역: 자기 재귀 rAF 루프는 SmoothMarkdown 1곳뿐(그 외 rAF 4곳 = 전부 1회성), `setInterval` 0건(grep) — "지속 갱신 루프"는 코드베이스에 없다.

## 실험 로그 요지 (4회 독립 실행, 재현율 100%)

1. **기본 재현** — fresh 페이지 일반 클릭 88ms 성공 / 동일 userDataDir 재기동(복원) 후 동일 클릭 `Timeout 9000ms... visible, enabled and stable`에서 재시도 로그 없이 고정(rAF 폴링 0회의 방증).
2. **포커스/가시성 계측** — fresh: `{isFocused:true, isVisible:true}`, rAF 2초 창 288회 / 복원: `{isFocused:false, isVisible:false}`, rAF **0회**. (`document.hidden`은 false로 오도 — DOM 레벨과 OS 레벨 상태 불일치.)
3. **인과 실험** — 복원 창에 `app.evaluate(({BrowserWindow}) => { win.show(); win.focus() })` → 상태 전환 + rAF 1.5초 창 202회 회복 → **동일 일반 클릭 34ms 성공** (개입→효과 직접 인과).
4. **대안 확인** — Playwright `page.bringToFront()`는 무효(상태 불변) → 수정은 Electron 네이티브 `BrowserWindow` 핸들 경유 필수.

## 정량 (P05 baseline)

- 복원 페이지 idle 3초: rAF 0회 · longtask 0 · 변이 0 → **상시 CPU 소모 없음** (LR4-DONE:78의 성능/배터리 우려는 실측상 근거 없음 — 렌더링이 완전 정지된 반대 상태).
- fresh 페이지 idle 참고치: rAF 2초 창 288회(~144/s).

## P05 수정 방향 (채택 1안 + 기각 3안)

- **채택 — 테스트 하네스 전용 수정 (제품 diff 0)**: 앱 close→relaunch e2e 헬퍼 공통 1곳에 `app.evaluate(({BrowserWindow}) => { const w = BrowserWindow.getAllWindows()[0]; w.show(); w.focus() })` 추가 → force 클릭 우회(m3-multi-restore.e2e.ts:115,226,236 등) 일반 클릭 복원. trade-off: 테스트가 Electron 네이티브 API에 결합되지만 실제 메커니즘을 정확히 겨냥, 제품 리스크 0.
- 기각 1 — main에 강제 포커스 로직: `win.show()`는 이미 정상 호출됨(Windows 전경 잠금이 자동화 프로세스의 포커스 요청을 거부하는 것으로 추정). 실사용 UX에 포커스 스틸링을 넣는 해악 > 테스트 문제 해결 이득.
- 기각 2 — force 클릭 유지: phase 정본이 "force 통과 = 문제 없음 근거 금지" 명시. 진짜 회귀를 가림.
- 기각 3 — 타임아웃 연장: rAF 영구 0이라 대기 무의미(느림이 아니라 정지), CI만 느려짐.

## 파생 기록

- LR4-DONE.md:78 잔여 항목의 성능 우려 문구는 본 진단으로 해소(소급 수정은 하지 않음 — INDEX 원칙, 본 노트가 정본).
- P05는 본 진단에 따라 재정의됨(제품 수정 → 테스트 하네스 수정, 보통·auto-gate·qa) — `05-restore-deadlock-fix.md` 재정의 기록 참조.
