import React, { useState, useRef, useEffect } from 'react'
import { useWorkspaceStore } from '../store/workspace'
import DiagnosticsModal from './DiagnosticsModal'
import AboutModal from './AboutModal'

// ── Types ─────────────────────────────────────────────────────────────────────
type MenuItemBase = { label: string; shortcut?: string; disabled?: boolean }
type ActionItem  = MenuItemBase & { kind: 'action';  action: () => void }
type InlineItem  = MenuItemBase & { kind: 'inline';  render: (close: () => void) => React.ReactNode }
type DividerItem = { kind: 'divider' }
type MenuItem    = ActionItem | InlineItem | DividerItem

// ── Dropdown ──────────────────────────────────────────────────────────────────
function Dropdown({ items, onClose }: { items: MenuItem[]; onClose: () => void }) {
  const [inlineIdx, setInlineIdx] = useState<number | null>(null)

  return (
    <div style={{
      position: 'absolute', top: '100%', left: 0, zIndex: 9000,
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 6, padding: '4px 0', minWidth: 230,
      boxShadow: '0 8px 24px rgba(0,0,0,0.2)', marginTop: 2,
    }}>
      {items.map((item, i) => {
        if (item.kind === 'divider') {
          return <div key={i} style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
        }

        if (item.kind === 'inline') {
          if (inlineIdx === i) {
            return (
              <div key={i} style={{ padding: '4px 8px' }}>
                {item.render(() => { setInlineIdx(null); onClose() })}
              </div>
            )
          }
          return (
            <button key={i}
              onClick={() => setInlineIdx(i)}
              disabled={item.disabled}
              style={itemStyle(!!item.disabled)}
              onMouseEnter={e => { if (!item.disabled) (e.currentTarget as HTMLElement).style.background = 'var(--primary-light)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}>
              <span>{item.label}</span>
              {item.shortcut && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.shortcut}</span>}
            </button>
          )
        }

        // action
        return (
          <button key={i}
            onClick={() => { item.action(); onClose() }}
            disabled={item.disabled}
            style={itemStyle(!!item.disabled)}
            onMouseEnter={e => { if (!item.disabled) (e.currentTarget as HTMLElement).style.background = 'var(--primary-light)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}>
            <span>{item.label}</span>
            {item.shortcut && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.shortcut}</span>}
          </button>
        )
      })}
    </div>
  )
}

function itemStyle(disabled: boolean): React.CSSProperties {
  return {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    width: '100%', padding: '7px 16px', background: 'none', border: 'none',
    cursor: disabled ? 'default' : 'pointer', textAlign: 'left',
    fontSize: 13, color: disabled ? 'var(--text-muted)' : 'var(--text)', gap: 24,
  }
}

// ── Inline Save-As form ───────────────────────────────────────────────────────
function SaveAsForm({ defaultName, onSave, onCancel }: {
  defaultName: string
  onSave: (name: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(defaultName)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.select() }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '2px 0' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        Workspace name
      </div>
      <input
        ref={ref}
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => {
          e.stopPropagation()
          if (e.key === 'Enter' && name.trim()) onSave(name.trim())
          if (e.key === 'Escape') onCancel()
        }}
        style={{
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          borderRadius: 4, padding: '6px 8px', color: 'var(--text)',
          fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box',
        }}
      />
      <div style={{ display: 'flex', gap: 5 }}>
        <button
          onClick={() => name.trim() && onSave(name.trim())}
          disabled={!name.trim()}
          style={{
            flex: 1, padding: '5px', borderRadius: 4,
            background: name.trim() ? 'var(--primary)' : 'var(--surface-2)',
            border: 'none', color: name.trim() ? '#fff' : 'var(--text-muted)',
            cursor: name.trim() ? 'pointer' : 'default', fontSize: 12, fontWeight: 700,
          }}>
          Save
        </button>
        <button onClick={onCancel}
          style={{ padding: '5px 10px', borderRadius: 4, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12 }}>
          ✕
        </button>
      </div>
    </div>
  )
}

// ── MenuBar ───────────────────────────────────────────────────────────────────
export default function MenuBar(): React.JSX.Element {
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [diagOpen, setDiagOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const barRef = useRef<HTMLDivElement>(null)

  const { workspace, activeProfile, setWorkspace, setActiveProfile, setSettings } = useWorkspaceStore()

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setOpenMenu(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const close = () => setOpenMenu(null)

  const fileMenu: MenuItem[] = [
    {
      kind: 'action', label: 'Save Workspace', shortcut: '⌘S',
      action: () => window.api.saveWorkspace(activeProfile, workspace),
    },
    {
      kind: 'inline', label: 'Save As…',
      render: (done) => (
        <SaveAsForm
          defaultName={activeProfile}
          onSave={async (name) => {
            await window.api.saveWorkspace(name, { ...workspace, name })
            setActiveProfile(name)
            done()
          }}
          onCancel={done}
        />
      ),
    },
    { kind: 'divider' },
    { kind: 'action', label: 'Export Workspace…', action: () => window.api.exportWorkspace(workspace) },
    {
      kind: 'action', label: 'Import Workspace…',
      action: async () => {
        const ws = await window.api.importWorkspace()
        if (ws) { setWorkspace(ws); setActiveProfile(ws.name) }
      },
    },
  ]

  const connectionMenu: MenuItem[] = [
    {
      kind: 'action', label: 'Connect All',
      action: async () => { for (const c of workspace.connections) await window.api.connectConnection(c) },
    },
    {
      kind: 'action', label: 'Disconnect All',
      action: async () => { for (const c of workspace.connections) await window.api.disconnectConnection(c.id) },
    },
  ]

  const loggingMenu: MenuItem[] = [
    {
      kind: 'action', label: 'Start Logging…',
      action: async () => {
        const conn = workspace.connections[0]
        if (conn) await window.api.startLogging(conn.id, conn.name)
      },
    },
    {
      kind: 'action', label: 'Stop All Logging',
      action: () => { for (const c of workspace.connections) window.api.stopLogging(c.id) },
    },
    { kind: 'divider' },
    { kind: 'action', label: 'Export Log…', action: () => window.api.exportLog() },
  ]

  const diagnosticsMenu: MenuItem[] = [
    { kind: 'action', label: 'Open Diagnostics…', action: () => { close(); setDiagOpen(true) } },
    { kind: 'divider' },
    { kind: 'action', label: 'Export Log…', action: () => window.api.exportLog() },
  ]

  const viewMenu: MenuItem[] = [
    {
      kind: 'action', label: 'Toggle Log Drawer', shortcut: '⌘L',
      action: () => setSettings({ logDrawerOpen: !workspace.settings.logDrawerOpen }),
    },
    { kind: 'divider' },
    ...((['light','dark','hacker','warp','nord','monokai','solarized','cyberpunk'] as const).map(t => ({
      kind: 'action' as const,
      label: t.charAt(0).toUpperCase() + t.slice(1) + ' Theme',
      action: () => setSettings({ theme: t }),
      disabled: workspace.settings.theme === t,
    }))),
    { kind: 'divider' },
    { kind: 'action', label: 'About Serial Studio X…', action: () => { close(); setAboutOpen(true) } },
  ]

  const menus: { label: string; items: MenuItem[] }[] = [
    { label: 'File',        items: fileMenu },
    { label: 'Connection',  items: connectionMenu },
    { label: 'Logging',     items: loggingMenu },
    { label: 'Diagnostics', items: diagnosticsMenu },
    { label: 'View',        items: viewMenu },
  ]

  return (
    <>
      <div ref={barRef} style={{
        height: 28, background: 'var(--surface-2)', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'stretch', padding: '0 4px', flexShrink: 0, position: 'relative', zIndex: 150,
      }}>
        {menus.map(menu => (
          <div key={menu.label} style={{ position: 'relative' }}>
            <button
              onClick={() => setOpenMenu(openMenu === menu.label ? null : menu.label)}
              style={{
                background: openMenu === menu.label ? 'var(--primary-light)' : 'none',
                border: 'none', cursor: 'pointer', padding: '0 10px', height: '100%',
                fontSize: 12, color: openMenu === menu.label ? 'var(--primary)' : 'var(--text)',
                fontWeight: openMenu === menu.label ? 600 : 400, borderRadius: 3,
              }}>
              {menu.label}
            </button>
            {openMenu === menu.label && (
              <Dropdown items={menu.items} onClose={close} />
            )}
          </div>
        ))}
      </div>

      {diagOpen && <DiagnosticsModal onClose={() => setDiagOpen(false)} />}
      {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}
    </>
  )
}
