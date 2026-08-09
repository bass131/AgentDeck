import { useEffect, type JSX } from 'react'
import { useAppStore, selectBackends } from '../../store/appStore'
import type { BackendStatus } from '../../../../shared/ipcContract'
import './ProviderStatusPanel.css'

interface ProviderCardProps {
  backend: BackendStatus
}

function ProviderCard({ backend }: ProviderCardProps): JSX.Element {
  const { name, available, version, latestVersion, authed } = backend

  const hasUpdate =
    latestVersion != null && version != null && latestVersion !== version

  return (
    <div className="prov-card">
      <div className="prov-card-header">
        <span className="prov-name">{name}</span>
        <div className="prov-pills">
          {available ? (
            <span className="prov-pill ok">사용 가능</span>
          ) : (
            <span className="prov-pill muted">사용 불가</span>
          )}

          {available && (
            authed ? (
              <span className="prov-pill ok">인증됨</span>
            ) : (
              <span className="prov-pill warn">미인증</span>
            )
          )}
        </div>
      </div>

      <div className="prov-meta-row">
        <span className="prov-version">{version ?? '—'}</span>
        {hasUpdate && (
          <span className="prov-update-badge">업데이트 v{latestVersion}</span>
        )}
      </div>

      {!available && (
        <div className="prov-track2-note">
          Track 2 — 추후 지원 예정
        </div>
      )}
    </div>
  )
}

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
