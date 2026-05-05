import React from 'react'

interface Props { onClose: () => void }

export default function AboutModal({ onClose }: Props): React.JSX.Element {
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        width: 460, background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 14, boxShadow: '0 32px 80px rgba(0,0,0,0.5)',
        overflow: 'hidden', display: 'flex', flexDirection: 'column',
      }}>
        {/* Hero */}
        <div style={{
          padding: '28px 28px 20px', textAlign: 'center',
          background: 'linear-gradient(135deg, var(--primary-light) 0%, var(--surface) 100%)',
          borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ fontSize: 42, marginBottom: 10 }}>⚡</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--primary)', letterSpacing: -0.5 }}>Serial Studio X</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>v0.1.0 · GPL v3 Open Source</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>
            Production-ready cross-platform serial protocol client<br />
            Modbus TCP/IP · RTU · ASCII · UDP · Serial Terminal
          </div>
        </div>

        {/* Author */}
        <div style={{ padding: '20px 28px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
            Built by
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%',
              background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, fontWeight: 800, color: '#fff', flexShrink: 0,
            }}>
              J
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>Jeet Parmar</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, fontFamily: 'var(--font-mono, monospace)' }}>@grizzly_monkey</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <a
                  href="https://github.com/grizzly-monkey"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => { e.preventDefault(); window.open('https://github.com/grizzly-monkey') }}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    fontSize: 11, color: 'var(--primary)', textDecoration: 'none', fontWeight: 600,
                    background: 'var(--primary-light)', border: '1px solid var(--primary)',
                    borderRadius: 5, padding: '4px 10px',
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
                  </svg>
                  github.com/grizzly-monkey
                </a>
                <a
                  href="https://github.com/grizzly-monkey/serial-studio-x"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => { e.preventDefault(); window.open('https://github.com/grizzly-monkey/serial-studio-x') }}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    fontSize: 11, color: 'var(--text-muted)', textDecoration: 'none', fontWeight: 600,
                    background: 'var(--surface-2)', border: '1px solid var(--border)',
                    borderRadius: 5, padding: '4px 10px',
                  }}
                >
                  Repo ↗
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Tech stack */}
        <div style={{ padding: '14px 28px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
            Built with
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {['Electron', 'React 18', 'TypeScript', 'Vite', 'Zustand', 'modbus-serial', 'recharts'].map(t => (
              <span key={t} style={{ fontSize: 11, color: 'var(--primary)', background: 'var(--primary-light)', border: '1px solid var(--primary)44', borderRadius: 4, padding: '2px 8px', fontFamily: 'var(--font-mono, monospace)' }}>
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Serial Studio X · © 2024 Jeet Parmar · GPL v3</span>
          <button
            onClick={onClose}
            style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 20px', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
