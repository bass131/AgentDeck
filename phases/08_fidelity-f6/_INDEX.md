# Milestone 08 — 충실도 F6: 라이트/다크 토글 + 폴리시 (Fidelity)

> 충실도 트랙 F6(`docs/UI_FIDELITY.md` §5·격차#7~#10). 테마 토글 UI + 최종 폴리시. renderer-only, 새 IPC 0. F5 완료. **F6 완료 = 충실도 트랙 F1~F6 마무리 → 사용자 보고.**

## 범위
- **테마 토글 UI**: 설정 모달 테마 섹션(F5 placeholder) → 라이트/다크 선택 → `lib/theme.ts setTheme`(data-theme + localStorage 영속). 현재 테마 반영.
- **startup 기본값**: dark 유지(현 사용자 경험·테스트 결정론 보존). 라이트는 토글로 완전 선택 가능. *라이트 강제 기본화는 미강제(UX 판단)* — 원본은 light/system 기본이나 1줄 변경 옵션으로 문서화.
- **폴리시**: 격차 잔여 — #7 텍스트 4단(F1-a 완료)·#8 스크롤바(F5 완료)·#9 모달blur(F5 완료)·#10 LSP(M2-LSP). F6는 테마 토글 + 잔여 시각 마감(전환 부드러움·포커스링 일관).

## Phase 분해 (2개)

| NN | Phase | 도메인 | 깃발 | 의존 |
|---|---|---|---|---|
| 01 | theme-toggle | renderer | 없음 | F5 |
| 02 | f6-visual-final | qa | 없음 | 01 |

## 실행/검증
renderer + TDD + reviewer + 시각검증(토글로 라이트/다크 전환). 자동: `python scripts/execute.py 08_fidelity-f6`.
