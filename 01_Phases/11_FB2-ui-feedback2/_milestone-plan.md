# FB2-ui-feedback2 — 영호 실사용 피드백 2차 (2026-07-04 FB1 육안 세션)

> 근거: FB1 육안 세션 중 영호 직접 피드백 + `01.Phases/FB1-ui-feedback/ScreenShot/` 2장(배너 카드·프레임 gloss).
> 영호 결정(2026-07-04): ⑦건 전부 포함 GO / 줌 확대 = 단축키 + 우하단 버튼 / SubAgent 모델 표기 추가(P06 육안 피드백).

| Phase | 제목 | 도메인 | 등급 | 깃발 | 이슈 |
|---|---|---|---|---|---|
| 01 | 인터럽트 미동작 repro·진단 | agent-backend | 보통 | — | ① 중단/인터럽트 버튼이 실제 중단 안 함 |
| 02 | 인터럽트 수정 | agent-backend | 보통 | backend-contract | ① |
| 03 | 줌 클램프 setter 계약 — preload 노출 | shared-ipc | 보통 | shared-contract, trust-boundary | ② |
| 04 | 슬래시 목록 미표시 진단·수정 (기존 인프라 확장) | main-process | 보통 | trust-boundary | ④ |
| 05 | 줌 확대 UI — Ctrl+= + 우하단 ± 버튼 | renderer | 보통 | ui-visual(human-visual) | ② |
| 06 | Composer /xxx 슬래시 토큰 하이라이트 | renderer | 보통 | ui-visual(경미) | ⑤ |
| 07 | SubAgent 모델 표기 | renderer | 보통 | — | ⑥ P06 육안 피드백 |
| 08 | loop/goal 배너 카드 + 프레임 gloss | renderer | 복잡 | ui-visual(human-visual) | ⑦⑧ ScreenShot 2장 |

의존성: 01→02. 03→05. 04·07·08 독립. 06은 독립이나 **08과 Composer 충돌 — 병렬 금지(순차/동일 Worker)**. 병렬 웨이브 권장: (01·03·04) → (02·05) → (06→08 순차·07).

## 설계 노트 (분해 시점 결정)
- **줌 확대 방식**: Electron 기본 zoomIn role 액셀러레이터 = `CommandOrControl+Plus`(=Ctrl+Shift+=) — Ctrl+=(unshifted)는 기본 바인딩 없음(FB1 스파이크 실측 덤프 근거). 수정은 **기본 메뉴를 건드리지 않는다**(FB1 중간안 "기본 role 유지" 정합) — 대신 preload에 **클램프된 setter**를 노출하고 renderer가 Ctrl+= keydown + 우하단 ± 버튼으로 호출. 기존 native role(Ctrl+Shift+=/Ctrl+-/Ctrl+0)은 그대로 공존. FB1 P04의 영속 훅(useGlobalZoom — DPR 변화 감지→저장)이 setter 경유 변화도 자동 저장하므로 영속 배선 추가 불요 (→ 감사 🟡로 정정: 미검증 가정 — P05 라이브 probe로 실증).
- **슬래시 목록 신뢰경계**: `.claude/commands/**`·`.claude/skills/**` fs 스캔은 main 단독(헌법 CRITICAL). renderer는 신규 read-only IPC로 목록 조회만 (→ 감사 🔴로 정정: 신규 IPC 불요 — 기존 command.list/skill.list 재사용, P04 참조).
- **모델 표기 데이터**: SubAgent 이벤트 스트림에 model 정보가 있는지 미확인 — P07에서 조사 먼저, 없으면 어댑터 additive 필드는 **보고 후 중단**(backend-contract 승급).
- **브랜치 전략**: FB1(feature/fb1-ui-feedback)은 P06 커밋으로 완결 — **FB1 PR 선행 권장**(push·PR = 사람 게이트, 영호 GO 필요). FB2는 FB1 머지 후 master에서 새 브랜치 `feature/fb2-ui-feedback2` 권장(FB1 PR이 늦어지면 fb1 브랜치 위에 스택 — 이 경우 PR 순서 주의).

## plan-auditor 감사 (2026-07-04)

- 🔴 **슬래시 기능 기존 존재** — 로컬 커맨드·스킬 조회는 이미 구현(command.list/skill.list 채널·main 스캐너·`useSlashPalette` 팔레트 실측). 신규 채널·신규 스캐너 = IPC 단일 정의 중복 위배 → **P03 축소**(슬래시 채널 제거, 줌 setter 계약만)·**P04 재작성**(신규 스캐너 구축 → 기존 인프라 진단·확장 수정).
- 🔴 **목록 UX 기존 구현** — 팔레트 목록 렌더는 이미 존재 → P06을 **하이라이트만**으로 분리 재작성(기존 06 UX 번들 폐기).
- 🟡 **줌 영속 probe 승격** — FB1 훅이 setter 변화도 저장한다는 것은 미검증 가정(matchMedia DPR change 의존) → P05에서 라이브 probe로 실증, 미발화면 명시 저장 경로 추가.
- 🟡 **step 비대칭 영호 인지** — STEP 0.1(10%) vs native role(level ±0.5 ≈ ×1.095, 약 9.5% — FB1 스파이크 실측) 증분 폭 차이는 영호 인지 완료(P03 계약 주석에 명문).
- 🟡 **P07 escalation 귀결 가능성** — SubAgentInfo에 model 필드 부재 실측(`agent-events.ts:312-332`) → 조사→escalation(shared additive + 어댑터)로 귀결 가능성 높음. **이 Phase 하나로 기능 완성 기대 금지**.
- 🟡 **06·08 Composer 충돌** — 하이라이트(06)와 배너 카드(08)가 같은 Composer 인근 편집 → 병렬 금지(순차/동일 Worker).
