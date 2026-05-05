import React, { useEffect, useState } from 'react'
import { useWorkspaceStore, GROWLOC_CONNECTIONS } from '../store/workspace'
import CalibrationWizard from './CalibrationWizard'

interface Props { onClose: () => void }

type View = 'menu' | 'calibration'

export default function GrowlocMenu({ onClose }: Props): React.JSX.Element {
  const [view, setView] = useState<View>('menu')
  const [loadMsg, setLoadMsg] = useState<string | null>(null)
  const { workspace, addConnection } = useWorkspaceStore()

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  function handleLoadConfig() {
    const existingIds = new Set(workspace.connections.map(c => c.id))
    let added = 0
    for (const conn of GROWLOC_CONNECTIONS) {
      if (!existingIds.has(conn.id)) {
        addConnection(conn)
        added++
      }
    }
    setLoadMsg(
      added > 0
        ? `Added ${added} sensor connection${added > 1 ? 's' : ''} to your workspace.`
        : 'Sensor connections are already in your workspace.'
    )
  }

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 10000,
    background: 'rgba(0,0,0,0.72)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    backdropFilter: 'blur(4px)',
  }

  const panel: React.CSSProperties = {
    width: view === 'calibration' ? 700 : 560,
    maxHeight: '90vh',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  }

  if (view === 'calibration') {
    return (
      <div style={overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
        <div style={panel}>
          <CalibrationWizard onBack={() => setView('menu')} onClose={onClose} />
        </div>
      </div>
    )
  }

  return (
    <div style={overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={panel}>
        {/* Header */}
        <div style={{
          padding: '28px 32px 20px',
          background: 'linear-gradient(135deg, var(--primary-light) 0%, var(--surface) 100%)',
          borderBottom: '1px solid var(--border)',
          position: 'relative',
        }}>
          <button onClick={onClose} style={{
            position: 'absolute', top: 16, right: 16,
            background: 'none', border: 'none', color: 'var(--text-muted)',
            cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 4,
          }}>✕</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 12,
              background: 'var(--primary)', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 22,
            }}>
              🌱
            </div>
            <div>
              <div style={{
                fontWeight: 900, fontSize: 22, color: 'var(--primary)',
                letterSpacing: 3, fontFamily: 'var(--font-mono, monospace)',
              }}>
                GROWLOC
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                Sensor Configuration Suite · PHG-206A &amp; DDM-206A
              </div>
            </div>
          </div>
        </div>

        {/* Action cards */}
        <div style={{ padding: '24px 32px', display: 'flex', gap: 16 }}>
          {/* Load Config */}
          <div style={{
            flex: 1, border: '1px solid var(--border)', borderRadius: 10,
            padding: 20, cursor: 'pointer', transition: 'border-color 0.15s',
            display: 'flex', flexDirection: 'column', gap: 10,
          }}
            onClick={handleLoadConfig}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--primary)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            <div style={{ fontSize: 28 }}>📡</div>
            <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--text)' }}>Load Sensor Config</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Add PHG-206A pH and DDM-206A EC sensor connections to your workspace with default register groups pre-configured.
            </div>
            {loadMsg && (
              <div style={{
                fontSize: 11, marginTop: 4, padding: '6px 10px', borderRadius: 6,
                background: loadMsg.startsWith('Added') ? '#16a34a22' : 'var(--surface-2)',
                color: loadMsg.startsWith('Added') ? '#16a34a' : 'var(--text-muted)',
                border: `1px solid ${loadMsg.startsWith('Added') ? '#16a34a44' : 'var(--border)'}`,
              }}>
                {loadMsg}
              </div>
            )}
          </div>

          {/* Calibration */}
          <div style={{
            flex: 1, border: '1px solid var(--border)', borderRadius: 10,
            padding: 20, cursor: 'pointer', transition: 'border-color 0.15s',
            display: 'flex', flexDirection: 'column', gap: 10,
          }}
            onClick={() => setView('calibration')}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--primary)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            <div style={{ fontSize: 28 }}>🔬</div>
            <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--text)' }}>Calibration Wizard</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Step-by-step guided calibration for pH (zero + 2-point slope) and EC (zero + slope) sensors per datasheet procedures.
            </div>
            <div style={{
              fontSize: 11, marginTop: 4, padding: '6px 10px', borderRadius: 6,
              background: 'var(--primary-light)',
              color: 'var(--primary)',
              border: '1px solid var(--primary)44',
            }}>
              Sensor must be connected and polling before calibrating
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 32px 20px',
          borderTop: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono, monospace)' }}>
            press G×4 to open · ESC or click outside to close
          </span>
          <button onClick={onClose} style={{
            background: 'var(--surface-2)', color: 'var(--text)', fontWeight: 600,
            border: '1px solid var(--border)', borderRadius: 6, padding: '6px 18px',
            cursor: 'pointer', fontSize: 12,
          }}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
