import React, { useEffect } from 'react'
import TopBar from './components/TopBar'
import Sidebar from './components/Sidebar'
import Dashboard from './components/Dashboard'
import LogDrawer from './components/LogDrawer'
import { useWorkspaceStore } from './store/workspace'
import { useConnectionsStore } from './store/connections'

export default function App(): React.JSX.Element {
  const theme = useWorkspaceStore(s => s.workspace.settings.theme)
  const connections = useWorkspaceStore(s => s.workspace.connections)
  const { setStatus, setRegisterValues, appendSparkline, appendLog } = useConnectionsStore()

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    const offStatus = window.api.onConnectionStatus((data: unknown) => {
      const d = data as { connectionId: string; status: string; error?: string }
      setStatus(d.connectionId, d.status as any, d.error)
    })

    const offPoll = window.api.onPollResult((batch: unknown) => {
      const b = batch as Record<string, {
        connectionId: string
        groupId: string
        timestamp: number
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

        // Append log (throttle to avoid flooding: sample every 10th entry per group)
        const shouldLog = Math.random() < 0.1 || item.transformed.some((rv: any) => rv.alertState !== 'ok')
        if (shouldLog) {
          item.transformed.forEach((rv, i) => {
            const reg = group.registers[i]
            if (!reg) return
            appendLog({
              id: `${item.connectionId}-${item.timestamp}-${i}`,
              timestamp: rv.timestamp,
              connectionId: item.connectionId,
              connectionName: conn.name,
              direction: 'rx',
              fc: group.functionCode,
              address: reg.address,
              rawHex: '0x' + rv.raw.toString(16).toUpperCase().padStart(4, '0'),
              rawDec: String(rv.raw),
              decodedValue: String(rv.decoded),
              unit: reg.unit,
              status: rv.alertState !== 'ok' ? 'alert' : 'ok'
            })
          })
        }
      }
    })

    return () => {
      offStatus()
      offPoll()
    }
  }, [connections])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <TopBar />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar />
        <Dashboard />
      </div>
      <LogDrawer />
    </div>
  )
}
