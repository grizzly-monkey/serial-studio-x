import React from 'react'
import { useUpdaterStore } from '../store/updater'
import { useWorkspaceStore } from '../store/workspace'

const INTERVAL_OPTIONS = [1, 3, 6, 12, 24]

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function fmtTime(ts: number | null): string {
  if (!ts) return 'Never'
  const diff = Date.now() - ts
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return new Date(ts).toLocaleDateString()
}

interface Props { onClose: () => void }

export default function UpdatePanel({ onClose }: Props): React.JSX.Element {
  const { status, info, progress, error, lastChecked } = useUpdaterStore()
  const { workspace, setSettings } = useWorkspaceStore()
  const { autoUpdate, updateCheckIntervalHours } = workspace.settings

  function toggleAutoUpdate(enabled: boolean) {
    setSettings({ autoUpdate: enabled })
    window.api.setAutoDownload(enabled)
    if (enabled) {
      window.api.setUpdateInterval(updateCheckIntervalHours)
    }
  }

  function changeInterval(h: number) {
    setSettings({ updateCheckIntervalHours: h })
    window.api.setUpdateInterval(h)
  }

  const panel: React.CSSProperties = {
    position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 9999,
    width: 320, background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 10, boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  }

  const row: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 16px', borderBottom: '1px solid var(--border)',
    fontSize: 12,
  }

  return (
    <div style={panel}>
      {/* Header */}
      <div style={{ ...row, background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
        <div>
          <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>Updates</span>
          <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono, monospace)' }}>
            current: v{window.api.getAppVersion()}
          </span>
        </div>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: 'var(--text-muted)',
          cursor: 'pointer', fontSize: 16, padding: 0, lineHeight: 1,
        }}>✕</button>
      </div>

      {/* Current status */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
        <StatusBadge status={status} version={info?.version} progress={progress?.percent} />

        {status === 'available' && info && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
              v{info.version} available
            </div>
            {info.releaseNotes && (
              <div style={{
                fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5,
                maxHeight: 80, overflowY: 'auto',
                background: 'var(--surface-2)', borderRadius: 5, padding: '6px 8px',
              }}>
                {info.releaseNotes.replace(/<[^>]+>/g, '').slice(0, 300)}
              </div>
            )}
            {!autoUpdate && (
              <button
                onClick={() => window.api.downloadUpdate()}
                style={{
                  marginTop: 8, width: '100%', background: 'var(--primary)', color: '#fff',
                  border: 'none', borderRadius: 6, padding: '7px 0', cursor: 'pointer',
                  fontWeight: 700, fontSize: 12,
                }}
              >
                Download v{info.version}
              </button>
            )}
          </div>
        )}

        {status === 'downloading' && progress && (
          <div style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 5 }}>
              <span>Downloading v{info?.version}…</span>
              <span>{Math.round(progress.percent)}% · {fmtBytes(progress.bytesPerSecond)}/s</span>
            </div>
            <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${progress.percent}%`,
                background: 'var(--primary)', borderRadius: 3,
                transition: 'width 0.3s ease',
              }} />
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, textAlign: 'right' }}>
              {fmtBytes(progress.transferred)} / {fmtBytes(progress.total)}
            </div>
          </div>
        )}

        {status === 'downloaded' && info && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
              v{info.version} is ready. Restart to apply the update.
            </div>
            <button
              onClick={() => window.api.installUpdate()}
              style={{
                width: '100%', background: '#16a34a', color: '#fff',
                border: 'none', borderRadius: 6, padding: '8px 0', cursor: 'pointer',
                fontWeight: 700, fontSize: 12,
              }}
            >
              Restart &amp; Install v{info.version}
            </button>
          </div>
        )}

        {status === 'error' && error && (
          <div style={{
            marginTop: 8, fontSize: 11, color: 'var(--danger, #ef4444)',
            background: '#ef444411', border: '1px solid #ef444433',
            borderRadius: 5, padding: '6px 8px',
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            Last checked: {fmtTime(lastChecked)}
          </span>
          <button
            onClick={() => window.api.checkForUpdates()}
            disabled={status === 'checking' || status === 'downloading'}
            style={{
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              borderRadius: 5, padding: '4px 10px', cursor: 'pointer',
              fontSize: 11, color: 'var(--text)', fontWeight: 600,
              opacity: status === 'checking' || status === 'downloading' ? 0.5 : 1,
            }}
          >
            {status === 'checking' ? 'Checking…' : 'Check Now'}
          </button>
        </div>
      </div>

      {/* Settings */}
      <div style={{ padding: '10px 16px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
          Settings
        </div>

        {/* Auto-update toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 600 }}>Auto-update</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>Download &amp; install automatically</div>
          </div>
          <Toggle value={autoUpdate} onChange={toggleAutoUpdate} />
        </div>

        {/* Check interval */}
        <div>
          <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 600, marginBottom: 6 }}>Check interval</div>
          <div style={{ display: 'flex', gap: 5 }}>
            {INTERVAL_OPTIONS.map(h => (
              <button
                key={h}
                onClick={() => changeInterval(h)}
                style={{
                  flex: 1, padding: '4px 0', fontSize: 11, fontWeight: 600,
                  border: `1px solid ${updateCheckIntervalHours === h ? 'var(--primary)' : 'var(--border)'}`,
                  background: updateCheckIntervalHours === h ? 'var(--primary-light)' : 'var(--surface-2)',
                  color: updateCheckIntervalHours === h ? 'var(--primary)' : 'var(--text-muted)',
                  borderRadius: 5, cursor: 'pointer',
                }}
              >
                {h}h
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      onClick={() => onChange(!value)}
      style={{
        width: 36, height: 20, borderRadius: 10, cursor: 'pointer',
        background: value ? 'var(--primary)' : 'var(--border)',
        position: 'relative', transition: 'background 0.2s', flexShrink: 0,
      }}
    >
      <div style={{
        position: 'absolute', top: 3, left: value ? 19 : 3,
        width: 14, height: 14, borderRadius: '50%', background: '#fff',
        transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
      }} />
    </div>
  )
}

function StatusBadge({ status, version, progress }: {
  status: string; version?: string; progress?: number
}) {
  const configs: Record<string, { bg: string; color: string; label: string }> = {
    idle:        { bg: 'var(--surface-2)', color: 'var(--text-muted)', label: 'Up to date' },
    checking:    { bg: 'var(--primary-light)', color: 'var(--primary)', label: 'Checking for updates…' },
    available:   { bg: '#fef3c722', color: '#d97706', label: `Update available` },
    downloading: { bg: 'var(--primary-light)', color: 'var(--primary)', label: `Downloading… ${Math.round(progress ?? 0)}%` },
    downloaded:  { bg: '#16a34a22', color: '#16a34a', label: `Ready to install` },
    uptodate:    { bg: '#16a34a22', color: '#16a34a', label: 'You\'re up to date' },
    error:       { bg: '#ef444411', color: '#ef4444', label: 'Update check failed' },
  }
  const c = configs[status] ?? configs.idle
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 10px', borderRadius: 6,
      background: c.bg, color: c.color,
      fontSize: 12, fontWeight: 600,
    }}>
      <StatusDot status={status} />
      {c.label}
      {(status === 'available' || status === 'downloaded') && version && (
        <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11, opacity: 0.85 }}>
          v{version}
        </span>
      )}
    </div>
  )
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === 'downloaded' || status === 'uptodate' ? '#16a34a' :
    status === 'available' ? '#d97706' :
    status === 'error' ? '#ef4444' :
    'var(--primary)'

  const pulse = status === 'downloaded' || status === 'available' || status === 'checking' || status === 'downloading'

  return (
    <span style={{
      width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0,
      boxShadow: pulse ? `0 0 0 2px ${color}44` : 'none',
      animation: pulse ? 'pulse-dot 1.5s ease-in-out infinite' : 'none',
    }} />
  )
}
