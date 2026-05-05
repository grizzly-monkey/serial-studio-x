import React, { useState } from 'react'
import { useWorkspaceStore } from '../store/workspace'

export default function TopBar(): React.JSX.Element {
  const { workspace, activeProfile, profileNames, setSettings, setWorkspace, setProfileNames, setActiveProfile } = useWorkspaceStore()
  const [saveName, setSaveName] = useState('')
  const [showSaveAs, setShowSaveAs] = useState(false)

  async function loadProfileList() {
    const names = await window.api.listWorkspaces()
    setProfileNames(names)
  }

  async function handleLoad(name: string) {
    const ws = await window.api.loadWorkspace(name)
    if (ws) { setWorkspace(ws); setActiveProfile(name) }
  }

  async function handleSave() {
    await window.api.saveWorkspace(activeProfile, workspace)
  }

  async function handleSaveAs() {
    const name = saveName.trim() || activeProfile
    await window.api.saveWorkspace(name, { ...workspace, name })
    setActiveProfile(name)
    setShowSaveAs(false)
    setSaveName('')
  }

  async function handleExport() {
    await window.api.exportWorkspace(workspace)
  }

  async function handleImport() {
    const ws = await window.api.importWorkspace()
    if (ws) { setWorkspace(ws); setActiveProfile(ws.name) }
  }

  const isDark = workspace.settings.theme === 'dark'

  return (
    <header style={{
      height: 48, background: 'var(--surface)', borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', padding: '0 16px', gap: 10,
      boxShadow: 'var(--shadow)', zIndex: 100, position: 'relative', flexShrink: 0
    }}>
      <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--primary)', letterSpacing: -0.3 }}>
        ⚡ Serial Studio X
      </span>

      <div style={{ width: 1, height: 24, background: 'var(--border)' }} />

      <select
        value={activeProfile}
        onChange={(e) => handleLoad(e.target.value)}
        onFocus={loadProfileList}
        style={selectStyle}
      >
        <option value={activeProfile}>{activeProfile}</option>
        {profileNames.filter(n => n !== activeProfile).map(n => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>

      <button onClick={handleSave} style={btnStyle}>Save</button>
      <button onClick={() => setShowSaveAs(true)} style={btnStyle}>Save As…</button>
      <button onClick={handleExport} style={btnStyle}>Export</button>
      <button onClick={handleImport} style={btnStyle}>Import</button>

      {showSaveAs && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            autoFocus
            value={saveName}
            onChange={e => setSaveName(e.target.value)}
            placeholder="Profile name"
            onKeyDown={e => { if (e.key === 'Enter') handleSaveAs(); if (e.key === 'Escape') setShowSaveAs(false) }}
            style={{ ...selectStyle, width: 120 }}
          />
          <button onClick={handleSaveAs} style={{ ...btnStyle, background: 'var(--primary)', color: '#fff', border: 'none' }}>OK</button>
          <button onClick={() => setShowSaveAs(false)} style={btnStyle}>✕</button>
        </div>
      )}

      <div style={{ flex: 1 }} />

      <button
        onClick={() => setSettings({ theme: isDark ? 'light' : 'dark' })}
        style={{ ...btnStyle, fontSize: 16, padding: '2px 8px' }}
        title="Toggle theme"
      >
        {isDark ? '☀️' : '🌙'}
      </button>
    </header>
  )
}

const btnStyle: React.CSSProperties = {
  background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 4,
  padding: '4px 10px', cursor: 'pointer', fontSize: 12, color: 'var(--text)', whiteSpace: 'nowrap'
}

const selectStyle: React.CSSProperties = {
  background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 4,
  padding: '4px 8px', color: 'var(--text)', fontSize: 12
}
