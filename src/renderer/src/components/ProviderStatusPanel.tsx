/**
 * ProviderStatusPanel.tsx — B1 듀얼 프로바이더 상태 패널.
 *
 * 설정 모달 'Claude Code'(version) 탭 안의 "프로바이더" 섹션.
 * store의 selectBackends 구독 + 마운트 시 loadBackends() 호출.
 *
 * 신뢰경계(CRITICAL):
 *   - renderer untrusted — fs/Node 직접 호출 0.
 *   - 표시는 BackendStatus 6필드만(id·name·available·version·latestVersion·authed).
 *   - 토큰·시크릿·자격증명 표시 0.
 *   - 데이터 취득은 store.loadBackends() → window.api.listBackends() 경유만.
 *
 * 스타일:
 *   - tokens.css 클레이 토큰만 — 신규 hex/oklch/rgb 금지.
 *   - ProviderStatusPanel.css 참조.
 *
 * 단방향 데이터 흐름:
 *   마운트 → loadBackends() → window.api.listBackends() → store.backends → 렌더.
 */
import { useEffect, type JSX } from 'react'
import { useAppStore, selectBackends } from '../store/appStore'
import type { BackendStatus } from '../../../shared/ipc-contract'
import './ProviderStatusPanel.css'

// ── 내부 컴포넌트: 단일 백엔드 카드 ─────────────────────────────────────────

interface ProviderCardProps {
  backend: BackendStatus
}

function ProviderCard({ backend }: ProviderCardProps): JSX.Element {
  const { name, available, version, latestVersion, authed } = backend

  // 업데이트 배지 조건: version·latestVersion 모두 존재 + 다를 때
  const hasUpdate =
    latestVersion != null && version != null && latestVersion !== version

  return (
    <div className="prov-card">
      {/* 카드 헤더: 이름 + 연결 상태 pill */}
      <div className="prov-card-header">
        <span className="prov-name">{name}</span>
        <div className="prov-pills">
          {/* 연결 상태 */}
          {available ? (
            <span className="prov-pill ok">사용 가능</span>
          ) : (
            <span className="prov-pill muted">사용 불가</span>
          )}

          {/* 인증 상태 — available일 때만 표시 */}
          {available && (
            authed ? (
              <span className="prov-pill ok">인증됨</span>
            ) : (
              <span className="prov-pill warn">미인증</span>
            )
          )}
        </div>
      </div>

      {/* 버전 행 */}
      <div className="prov-meta-row">
        <span className="prov-version">{version ?? '—'}</span>
        {hasUpdate && (
          <span className="prov-update-badge">업데이트 v{latestVersion}</span>
        )}
      </div>

      {/* available=false: Track 2 안내 */}
      {!available && (
        <div className="prov-track2-note">
          Track 2 — 추후 지원 예정
        </div>
      )}
    </div>
  )
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

/**
 * ProviderStatusPanel — props 없음. store에서 backends 구독.
 *
 * 마운트 시 loadBackends() 한 번 호출 → store 갱신 → 카드 렌더.
 * 실패 시 빈 배열 유지(graceful) — loadBackends 내부에서 catch.
 */
export function ProviderStatusPanel(): JSX.Element {
  const backends = useAppStore(selectBackends)
  const loadBackends = useAppStore((s) => s.loadBackends)

  useEffect(() => {
    void loadBackends()
  }, [loadBackends])

  return (
    <div className="prov-panel">
      {backends.map((b) => (
        <ProviderCard key={b.id} backend={b} />
      ))}
    </div>
  )
}
