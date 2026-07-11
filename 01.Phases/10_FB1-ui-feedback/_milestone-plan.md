# FB1-ui-feedback — 영호 실사용 피드백 스윕 (2026-07-03 스크린샷 6건)

> 근거: `01.Phases/UC1-ultracode-redesign/Screenshot/` 6장 (영호 실측). UC1 라이브 검증 중 발견된 UX 문제 일괄 처리.
> ①커서 밀림·③오버플로는 UC1 워킹 트리에서 스팟 픽스로 선처리(본 마일스톤 범위 밖) — 본 마일스톤 = ②④⑤.

| Phase | 제목 | 도메인 | 등급 | 깃발 | 이슈 |
|---|---|---|---|---|---|
| 01 | 스트리밍/완료 렌더 정합 | renderer | 보통 | ui-visual(경미) | ② 출력 도중·완료 후 폰트/비율 변화 |
| 02 | 전역 줌 IPC 계약 | shared-ipc | 보통 | shared-contract | ④ VSCode식 UI 크기조절 |
| 03 | 전역 줌 main 적용·영속 | main-process | 보통 | trust-boundary | ④ |
| 04 | 줌 변화 영속+표시 | renderer | 보통 | — | ④ |
| 05 | SubAgent 내부 메타 정규화 | agent-backend | 보통 | backend-contract | ⑤ 하네스 내부 텍스트 노출 |
| 06 | SubAgent 상세 채팅화 | renderer | 복잡 | ui-visual | ⑤ 정보 난잡 → 채팅형 |

의존성: 02→03→04 순차(계약→적용→배선). 01·05는 독립. 06은 05 뒤(정규화된 데이터 전제).
실행 순서 권장: 01 → 05 → 06 → 02 → 03 → 04.

## plan-auditor 봉합 (2026-07-03)
- **줌 baseline 스파이크 선행(🔴)**: 커스텀 메뉴 미설정(`main/index.ts` — `Menu.setApplicationMenu` 호출 0)이라 **Electron 기본 View 메뉴의 zoomIn/zoomOut/resetZoom role이 Ctrl+=/−/0에 이미 바인딩돼 있을 가능성 높음**(autoHideMenuBar는 바만 숨김). P02 착수 전 실증 → "기본 role 제거+커스텀 단일화" vs "기본 role 유지+영속만 추가" 결정. 후자면 P04 대부분 불요(right-sizing). (→ 2026-07-04 중간안 결정으로 초과 — 신규 채널 0, "스파이크 결과·설계 결정" 섹션 참조)
- **Track-2 waiver**: 전역 줌은 원본 미존재(원본은 per-region 줌만) = Track-2 UX 선반영. **영호 요청(2026-07-03 스크린샷)이 consent** — ADR-030/032 선례의 명문화 waiver. 신규 ADR 불요(의존성 0·additive IPC).
- **영속 경로 정정**: `05_settings` 아님 → **`main/prefs.ts`(ui-prefs.json) + `00_ipc/handlers/personalization.ts`** — `shared/ipc/personalization.ts`의 `UI_PREFS_SET`은 이미 `zoomFactor`를 예시 키로 명문. 지속 저장 = `ui.setPref('zoomFactor')` 재사용, 신규 채널은 apply 트리거에만. (→ 2026-07-04 중간안 결정으로 초과 — 신규 채널 0, "스파이크 결과·설계 결정" 섹션 참조)
- **per-region 줌 공존**: `renderer/lib/zoom.tsx`(채팅·뷰어 Ctrl+휠 CSS zoom + localStorage + ZoomBadge)와 전역 page zoom의 이중 배율·배지 2종·저장소 2곳 공존을 P02/P04에서 정의(혼동 방지).
- **브랜치 전략**: FB1은 **UC1 P06 마감(라이브 사인오프) 후 별도 브랜치** 권장 — UC1 사인오프 표면 오염 방지. 스팟 픽스 2건(커서·오버레이)만 UC1 브랜치에 선반영.

## 스파이크 결과·설계 결정 (2026-07-04)
> 실증: `99.Others/tests/e2e/zoom-baseline.spike.e2e.ts` (프로덕션 빌드 실측).

- ① Electron 기본 메뉴 생존 — View에 zoom role 3종(zoomin=`CommandOrControl+Plus` / zoomout=`CommandOrControl+-` / resetzoom=`CommandOrControl+0`) 존재·enabled.
- ② role 발화 시 zoomFactor 1→1.095→1.2 실측(동작 확정).
- ③ 프로덕션은 Chromium HostZoomMap이 per-host 줌을 **우발 영속**(재시작 후 factor 1.44 유지 실측). 단 dev(`localhost:PORT`)는 포트 변경 시 host 키가 달라져 영속 불안정(추정·미검증).
- **영호 결정(중간안)**: 기본 role 유지(제거·재구현 안 함) + zoomFactor 조회/영속만 앱 소유로 추가.
- **P02~04 right-sizing**: P02=read-only 조회 계약만(apply/set 채널 없음) / P03=부팅 시 ui-prefs zoomFactor 복원(set 핸들러 없음) / P04=줌 변화 감지→`ui.setPref` 저장+표시(단축키 신규 등록 없음). estimated 축소(P02 0.5h·P03 0.5h·P04 1h).
