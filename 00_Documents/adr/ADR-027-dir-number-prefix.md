### ADR-027: 디렉토리 번호접두 컨벤션 (`NN_name`) — 큰 분류 시각적 순서화

**결정**: 일부 디렉토리의 *하위 폴더*에 `NN_<name>` 언더바 번호접두를 도입한다 (구분자=`_`, 번호=촘촘 `00,01,02…`, 정렬=**논리/데이터흐름 순**). 적용 범위:

| 범위 | 예시 (논리 순) |
|---|---|
| `src/renderer/src/components/` | `00_shell`·`01_conversation`·`02_file`·`03_viewer`·`04_git`·`05_agent`·`06_feedback` (+ `common` 무번호) |
| `src/main/` 내부 모듈 | `00_ipc`·`01_agents`·`02_fs`·`03_lsp`·`04_persistence`·`05_window` |
| `docs/` | `00_PRD`·`01_ARCHITECTURE`·`02_ADR`·`03_UI`·`04_FEATURE_MAP`·… (읽기 순) |

- **❌ 제외**: 최상위 `src/{main,preload,renderer,shared}` — electron-vite 진입점(`electron.vite.config.ts`)·`@shared`/`@renderer` alias 고정 + 헌법 "최상위 폴더 추가=ADR". 번호접두 대상 아님.
- **구분자 `_` 선택**: 점(`.`)은 일부 도구가 확장자로 오인할 여지, 하이픈(`-`)도 가능하나 언더바가 식별자 친화적 + import 경로 무탈.

**이유**: 파일시스템 알파벳 정렬은 *논리적 순서*(데이터 흐름·중요도)와 어긋남 → 번호접두로 "어디부터 보나"를 파일시스템이 답하게 함(온보딩·탐색 비용↓). 관련 파일을 도메인 카테고리로 묶어 응집도↑. 영호 요청(큰 분류 `00_`·`01_` 순서화).

**트레이드오프 / 불변**:
- (단점) rename 시 import 경로 churn 1회 + 카테고리 *삽입* 시 뒤 번호 재정렬(촘촘 선택의 비용). → `git mv`(히스토리 보존) + 일괄 갱신으로 흡수.
- (불변) agent R/W 글롭 `src/main/**`·`src/renderer/**`는 `/**`라 하위 rename에 **안 깨짐**. electron-vite alias·신뢰 경계(ADR 신뢰경계)·IPC 계약 단일정의 불변.
- (⚠️ 주의 — 글롭 ≠ 리터럴) `scripts/hooks/risk-detector.sh`의 `*src/main/ipc/*` 같은 **리터럴**은 rename 시 깨져 trust-boundary 검출이 침묵 → 해당 Phase(RF1 P07)에서 hook 패턴 동반 갱신(`scripts/hooks/**`=영호 단독 확정). 같은 함정: shared-contract `*src/shared/ipc-contract*`(P09).

**위험도**: [M] — 구조 컨벤션(행동 변경 동반, 기존 결정 불변).

**현황(2026-06-27)**: ✅ **결정 확정(영호 GO)** — 구분자 `_`·촘촘·논리순. 구현은 RF1-cleanup 트랙 B(P05 매핑 → P06 components → P07 src/main → P08 docs). 미구현(컨벤션만 박제).

---

