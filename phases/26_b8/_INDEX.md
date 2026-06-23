# Phase 26 — B8: 사용량 분석 (OAuth 레이트리밋 게이지)

> 사용자 결정 ⓐ(원본 1:1 복제). 원본의 "사용량 분석"=**레이트리밋 게이지 2종(5시간·주간)**을 ContextStrip에 추가.
> 원본: `C:/Dev/AgentCodeGUI/src/main/index.ts`(getUsage L471~505·IPC L571) + `Chat.tsx`(resetText L907·ContextStrip L922) + `App.tsx`(usage state L125·fetch L188/233).

## 범위 (원본이 가진 만큼)
- **main `getUsage()`**: `~/.claude/.credentials.json` → `claudeAiOauth.accessToken`(파일/토큰 없으면 empty `{fiveHour:null,weekly:null}`). `fetch('https://api.anthropic.com/api/oauth/usage', {Authorization:'Bearer '+token, 'anthropic-beta':'oauth-2025-04-20'}, 5s AbortController)`. 응답 `{five_hour, seven_day}` 각 `{utilization, resets_at}` → `win(o)={pct:clamp(0,100,round(parseFloat(utilization))), resetsAt:toTs(resets_at)}` (`toTs`=Date.parse/1000). `{fiveHour:win(five_hour), weekly:win(seven_day)}`. **TTL 5분 인메모리 캐시**. 모든 에러 → empty(graceful).
- **shared**: `UsageWindow {pct:number, resetsAt:number|null}` · `UsageInfo {fiveHour:UsageWindow|null, weekly:UsageWindow|null}` · IPC `USAGE_GET='usage.get'`(인자 없음).
- **preload**: `getUsage(): Promise<UsageInfo>` 노출.
- **renderer**: App/Shell 레벨 `usage` 상태(mount + run done/error 시 `getUsage()` fetch). `ContextStrip`을 **3칩**으로 확장: 현재 컨텍스트(보유) + 5시간 한도(usage.fiveHour) + 주간 한도(usage.weekly). `resetText(resetsAt, useDays)` 포맷(5h=시간/분, 주간=일/시간). 칩 구조 cc-ring(--p)/cc-label/cc-pct/cc-detail 원본 미러. CSS 토큰만.

## 비범위
- **비용(costUsd)/턴/duration UI** — 원본이 result에 저장만 하고 표시 UI 없음 → 1:1 복제 대상 아님(스킵). (필요 시 후속.)
- 다운로드형/외부 의존성 0. 신규 패키지 0(fetch=Node 내장).
- 멀티 패널 usage는 원본도 동일 usage prop 공유 → 단일 fetch 재사용(MultiWorkspace usage prop은 후속/선택).

## 신뢰경계 (CRITICAL)
- **자격증명·토큰은 main 단독**: getUsage가 fs로 credentials 읽고 network fetch(둘 다 main). **renderer엔 파생값(`UsageInfo` pct/resetsAt)만 전달 — accessToken 절대 미노출**. 토큰을 로그/DB/렌더러에 평문 0. (ADR-008 준수.)
- IPC 계약 src/shared 단일정의. preload 화이트리스트 getUsage만. renderer 신규 window.api=getUsage(읽기 전용).

## 서브웨이브
- **26a 계약(shared-ipc)**: UsageInfo/UsageWindow + USAGE_GET + preload getUsage. (타입/채널)
- **26b main(main-process)**: getUsage() 구현(credential read·fetch·parse·TTL 캐시) + IPC 핸들러. TDD(mock fs/fetch: 토큰 없음→empty, 정상 응답 파싱, 에러→empty, 캐시 TTL). **토큰 누수 0 검증**.
- **26c renderer(renderer)**: usage 상태+fetch 시점 + ContextStrip 3칩 + resetText. TDD(resetText 포맷·3칩 렌더·fetch 시점).

## 완료조건
- [ ] `npm run typecheck`·`npm run test` green. reviewer 신뢰경계(토큰 미노출·main 단독) 🔴 0.
- [ ] 라이브: `getUsage()` 실 호출 스모크(자격증명 있으면 실 레이트리밋%, 없으면 empty graceful) — 토큰 미노출 확인.
- [ ] FEATURE_MAP B8 분석 ✅ · _LOOP_PROGRESS/REPLICA_GAP 갱신.
