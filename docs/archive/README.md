# docs/archive — 완료된 루프 드라이버 (보관)

작업이 끝난 `/loop`·드라이버 추적 문서들. **현재 진행에는 불필요**하지만 개발 히스토리로 보존한다.
(활성 레퍼런스는 `docs/` 루트: PRD·ARCHITECTURE·ADR·UI_GUIDE·UI_FIDELITY·FEATURE_MAP.)

| 문서 | 내용 | 상태 |
|---|---|---|
| `REPLICA_GAP.md` | AgentCodeGUI 1:1 완전복제 갭 추적 + /loop 드라이버 | ✅ F1~F15·시각 audit 완료 (M5 배포만 남음) |
| `WEAKNESS_BOOST.md` | 원본 대비 약점 7개 전면 보강 드라이버 | ✅ 8 마일스톤 전부 완료 |
| `POLISH_GAP.md` | 원본 미세 동작/실배선 디테일 폴리싱 드라이버 | ✅ 완료 |
| `RUNTIME_PARITY.md` | 실 런타임 비교·기능검증 루프 드라이버 | ✅ 완료 |
| `ORCHESTRATION_FIX.md` | SDK Workflow/task_* 런타임 동작 ground truth | ✅ 완료 (결정=ADR-021) |
| `LOOP_SUPPORT.md` | 앱 레벨 `/loop` 직접 반복 구현 드라이버 | ✅ 구현 완료 (`loopCommand.ts`·`LoopIndicator.tsx` 등) |
| `HARNESS_GAP.md` | 하네스 자기진단 갭 (AgentDeck 세션 자기편향) | ⚠️ `docs/HARNESS_PORT_MANIFEST.md`로 supersede (2026-06-26) |

> 잔여 작업은 `docs/FEATURE_MAP.md`(M5 배포)가 추적. 오케스트레이션 SDK 참조는
> `docs/archive/ORCHESTRATION_FIX.md` + ADR-021.
