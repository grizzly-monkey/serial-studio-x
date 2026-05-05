import React, { useState, useRef, useEffect } from 'react'
import { useWorkspaceStore } from '../store/workspace'
import AboutModal from './AboutModal'
import type { ThemeName } from '../../shared/types'

const THEMES: { id: ThemeName; label: string; dot: string }[] = [
  { id: 'light',     label: 'Light',     dot: '#6366f1' },
  { id: 'dark',      label: 'Dark',      dot: '#818cf8' },
  { id: 'hacker',    label: 'Hacker',    dot: '#00ff41' },
  { id: 'warp',      label: 'Warp',      dot: '#a78bfa' },
  { id: 'nord',      label: 'Nord',      dot: '#88c0d0' },
  { id: 'monokai',   label: 'Monokai',   dot: '#a6e22e' },
  { id: 'solarized', label: 'Solarized', dot: '#268bd2' },
  { id: 'cyberpunk', label: 'Cyberpunk', dot: '#ff00aa' },
]

export default function TopBar(): React.JSX.Element {
  const { workspace, activeProfile, setSettings } = useWorkspaceStore()
  const [themeOpen, setThemeOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const themeRef = useRef<HTMLDivElement>(null)
  const currentTheme = workspace.settings.theme

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (themeRef.current && !themeRef.current.contains(e.target as Node)) setThemeOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const dot = THEMES.find(t => t.id === currentTheme)?.dot ?? '#818cf8'

  return (
    <>
    <header style={{
      height: 46, background: 'var(--surface)', borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', padding: '0 16px', gap: 10,
      boxShadow: 'var(--shadow)', zIndex: 100, position: 'relative', flexShrink: 0
    }}>
      {/* Logo */}
      <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--primary)', letterSpacing: -0.3, whiteSpace: 'nowrap' }}>
        ⚡ Serial Studio X
      </span>

      <div style={{ width: 1, height: 20, background: 'var(--border)' }} />

      {/* Active workspace name (read-only badge) */}
      <span style={{
        fontSize: 11, color: 'var(--text-muted)', background: 'var(--surface-2)',
        border: '1px solid var(--border)', borderRadius: 4, padding: '2px 8px',
        fontFamily: 'var(--font-mono, monospace)', maxWidth: 180,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
      }}>
        {activeProfile}
      </span>

      <div style={{ flex: 1 }} />

      {/* Built-by credit */}
      <button
        onClick={() => setAboutOpen(true)}
        title="About Serial Studio X"
        style={{
          display: 'flex', alignItems: 'center', gap: 5, background: 'none',
          border: 'none', cursor: 'pointer', padding: '3px 8px', borderRadius: 5,
          fontSize: 11, color: 'var(--text-muted)',
        }}
      >
        <span style={{ fontSize: 13 }}>⚡</span>
        <span>by <strong style={{ color: 'var(--primary)', fontFamily: 'var(--font-mono, monospace)' }}>@grizzly_monkey</strong></span>
      </button>

      {/* Theme picker */}
      <div ref={themeRef} style={{ position: 'relative' }}>
        <button
          onClick={() => setThemeOpen(v => !v)}
          title="Change theme"
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: themeOpen ? 'var(--primary-light)' : 'var(--surface-2)',
            border: `1px solid ${themeOpen ? 'var(--primary)' : 'var(--border)'}`,
            borderRadius: 5, padding: '4px 10px', cursor: 'pointer',
            fontSize: 12, color: 'var(--text)', whiteSpace: 'nowrap'
          }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot, display: 'inline-block', flexShrink: 0 }} />
          {THEMES.find(t => t.id === currentTheme)?.label ?? currentTheme}
          <span style={{ fontSize: 9, color: 'var(--text-muted)', marginLeft: 2 }}>▼</span>
        </button>

        {themeOpen && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 9999,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '6px', minWidth: 160,
            boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4
          }}>
            {THEMES.map(t => (
              <button
                key={t.id}
                onClick={() => { setSettings({ theme: t.id }); setThemeOpen(false) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '7px 10px', borderRadius: 5, cursor: 'pointer',
                  background: currentTheme === t.id ? 'var(--primary-light)' : 'none',
                  border: `1px solid ${currentTheme === t.id ? 'var(--primary)' : 'transparent'}`,
                  color: currentTheme === t.id ? 'var(--primary)' : 'var(--text)',
                  fontSize: 12, textAlign: 'left', whiteSpace: 'nowrap',
                  fontWeight: currentTheme === t.id ? 700 : 400,
                }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: t.dot, display: 'inline-block', flexShrink: 0, boxShadow: `0 0 4px ${t.dot}88` }} />
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </header>

    {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}
    </>
  )
}
