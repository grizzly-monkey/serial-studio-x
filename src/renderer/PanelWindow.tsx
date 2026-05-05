import React, { useEffect } from 'react'
import { useWorkspaceStore } from './store/workspace'
import { useConnectionsStore } from './store/connections'
import ConnectionPanel from './components/ConnectionPanel'
import SerialTerminalPanel from './components/SerialTerminalPanel'
import ErrorBoundary from './components/ErrorBoundary'
import type { LogEntry } from '../shared/types'

interface Props { connectionId: string }

export default function PanelWindow({ connectionId }: Props): React.JSX.Element {
  const connections = useWorkspaceStore(s => s.workspace.connections)
  const theme = useWorkspaceStore(s => s.workspace.settings.theme)
  const { setStatus, setRegisterValues, appendSparkline, appendLog } = useConnectionsStore()

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // Load persisted workspace so this window has connection configs
  useEffect(() => {
    window.api.listWorkspaces().then(names => {
      if (names.length > 0) {
        window.api.loadWorkspace(names[0]).then(ws => {
          if (ws) useWorkspaceStore.getState().setWorkspace(ws)
        })
      }
    })
  }, [])

  // Wire up IPC listeners (same as App.tsx)
  useEffect(() => {
    const offStatus = window.api.onConnectionStatus((data: unknown) => {
      const d = data as { connectionId: string; status: string; error?: string }
      setStatus(d.connectionId, d.status as any, d.error)
    })
    const offPoll = window.api.onPollResult((batch: unknown) => {
      const b = batch as Record<string, {
        connectionId: string; groupId: string; timestamp: number
        transformed: Array<{ raw: number; decoded: number | string; timestamp: number; alertState: string }>
      }>
      for (const key of Object.keys(b)) {
        const item = b[key]
        if (!item?.transformed) continue
        const conn = connections.find(c => c.id === item.connectionId)
        if (!conn) continue
        const group = conn.registerGroups.find(g => g.id === item.groupId)
        if (!group) continue
        const addresses = group.registers.map(r => r.address)
        setRegisterValues(item.connectionId, item.transformed as any, addresses)
        item.transformed.forEach((rv, i) => {
          const reg = group.registers[i]
          if (!reg || typeof rv.decoded !== 'number') return
          const maxPts = Math.max(10, Math.ceil(reg.sparklineWindowSecs * 1000 / conn.pollIntervalMs))
          appendSparkline(item.connectionId, reg.address, { timestamp: rv.timestamp, value: rv.decoded }, maxPts)
        })
      }
    })
    const offLog = window.api.onLogEntry((entry: unknown) => appendLog(entry as LogEntry))
    return () => { offStatus(); offPoll(); offLog() }
  }, [connections])

  const connection = connections.find(c => c.id === connectionId)

  if (!connection) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 10, color: 'var(--text-muted)', background: 'var(--bg)' }}>
        <div style={{ fontSize: 32 }}>⚡</div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Loading connection…</div>
      </div>
    )
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--surface)', overflow: 'hidden' }}>
      <ErrorBoundary inline>
        {connection.protocol === 'serial-terminal'
          ? <SerialTerminalPanel connection={connection} />
          : <ConnectionPanel connection={connection} />
        }
      </ErrorBoundary>
    </div>
  )
}
