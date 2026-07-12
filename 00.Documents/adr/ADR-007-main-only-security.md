### ADR-007: 보안 — main 단독 권한 + contextIsolation
**결정**: `nodeIntegration:false`, `contextIsolation:true`. fs/proc/db/network은 main만. preload는 화이트리스트 IPC만 노출.
**이유**: renderer는 untrusted(웹 콘텐츠/마크다운 렌더). 하네스 "도구 경계" 기둥의 코드화.
**트레이드오프**: 모든 권한작업이 IPC 왕복 → 코드량 ↑. 보안·하네스 정합이 우선.

