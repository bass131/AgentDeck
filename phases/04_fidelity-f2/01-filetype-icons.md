# Phase 01: filetype-icons

## 목표
확장자/파일명 → 컬러 배지(monogram label + 색) 매핑 시스템 + 벡터 아이콘 세트가 생기고, 탐색기/탭이 파일타입을 시각적으로 구분한다.

## 담당 도메인 / 에이전트
renderer (src/renderer). 등급: 보통.

## 의존 Phase
F1-b(완료).

## 위험 깃발
없음 (순수 매핑 + 프리젠테이션. IPC/신뢰경계 무관).

## 변경 대상 (이 경계 밖 금지)
- `src/renderer/src/lib/fileType.ts` (신규) — `fileTypeFor(path) → { label, color }`(시각 배지 전용). 확장자 EXT 맵 + 특수파일 NAMED 맵 + 미지(해시 hue) 폴백. label='' = 제네릭. **`lang`(확장자→언어)은 신설 금지 — 기존 `lib/viewer.ts`의 매핑 재사용/참조**(단일 진실원, ARCHITECTURE). fileType은 *색/라벨만* 책임.
- `src/renderer/src/components/icons.tsx` (신규) — 공용 Icon 베이스(viewBox 24, stroke currentColor) + IconChevRight/Folder/FolderOpen/Plus/Search/X/GitBranch 등.
- `src/renderer/src/components/FileBadge.tsx` (신규) + CSS — label 있으면 monogram 칩(`--ft` 색), 없으면 IconFile. 다크 보정(`--ftb` 밝은 변형).

## 작업 단계
1. fileType.ts: 대표 확장자 매핑(.ts/.tsx/.js/.jsx/.json/.css/.scss/.html/.py/.md/.svg/이미지/.sh/.yml 등) + label(1~4자) + 색(oklch 고정). NAMED(dockerfile/makefile/.gitignore/license 등). 미지=첫 4자 대문자 + 해시 hue. 디렉토리는 호출측에서 IconFolder 사용.
2. icons.tsx: IconProps(size·stroke) + Icon 베이스 + 탐색기/사이드바에 필요한 벡터 아이콘. 이모지 금지(UI_GUIDE).
3. FileBadge: props=path. 크기 prop. label 길이별 폰트 스케일.
4. 인라인 색상 0(배지 색은 CSS 변수 `--ft`로 주입 — 동적 값이라 style 변수 허용; 하드코딩 hex 금지, oklch 토큰/계산).

## 완료조건 (AC — 측정 가능)
- [ ] `npm run typecheck` green.
- [ ] `fileType.test.ts`: 대표 확장자/NAMED/미지 폴백/제네릭(확장자 없음) 매핑 검증. PASS.
- [ ] FileBadge 컴포넌트 테스트: label 있는 파일=monogram, 없는 파일=IconFile 렌더. PASS.
- [ ] 이모지 0 · 하드코딩 hex 0(grep — oklch/토큰만).

## 참조
docs/UI_FIDELITY.md §3(fileType/icons) · docs/UI_GUIDE.md(벡터아이콘·안티슬롭) · 레퍼런스 fileType.tsx/icons.tsx(매핑 *방식* 대조).
