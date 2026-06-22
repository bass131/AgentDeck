# Milestone 07 — 충실도 F5: 뷰어/모달 정합 (Fidelity)

> 충실도 트랙 F5(`docs/UI_FIDELITY.md` §5, 격차 #8 얇은 스크롤바·#9 모달 blur). renderer-only, 새 IPC 0. F4 완료.
>
> 권위 = `docs/UI_FIDELITY.md` + 라이브 `artifacts/acg/04-settings.png`(설정 모달 backdrop+좌nav).

## 범위 (F5 시각 vs 기능 게이트)
- **F5 = 모달 크롬 + 폴리시**: 재사용 Modal(backdrop blur + 카드 + 헤더 + Esc/클릭아웃) · 얇은 커스텀 스크롤바(전역) · 뷰어(코드/마크다운/이미지) 폴리시.
- **기능 게이트(F5 밖)**: Git 모달=M3 · 서브에이전트/질문/권한 모달=M4 · 설정 *콘텐츠*(엔진버전/MCP/Skill)=M5. → F5 설정 모달은 **최소 소비자**(정보 + 테마 자리[F6 토글 연결])로 크롬만 시연.
- **테마 토글 UI** = F6.

## Phase 분해 (2개)

| NN | Phase | 도메인 | 깃발 | 의존 |
|---|---|---|---|---|
| 01 | modal-scrollbar | renderer | 없음 | F4 |
| 02 | f5-visual-regression | qa | 없음 | 01 |

## 실행/검증
renderer + TDD + reviewer(모달=인터랙션) + 시각검증(모달 backdrop·스크롤바). 자동: `python scripts/execute.py 07_fidelity-f5`.
