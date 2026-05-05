import React, { useEffect, useRef, useState } from 'react'
import TopBar from './components/TopBar'
import MenuBar from './components/MenuBar'
import Sidebar from './components/Sidebar'
import Dashboard from './components/Dashboard'
import LogDrawer from './components/LogDrawer'
import GrowlocMenu from './components/GrowlocMenu'
import { useWorkspaceStore } from './store/workspace'
import { useConnectionsStore } from './store/connections'
import { useUpdaterStore } from './store/updater'
import type { LogEntry } from '../shared/types'

export default function App(): React.JSX.Element {
  const theme = useWorkspaceStore(s => s.workspace.settings.theme)
  const connections = useWorkspaceStore(s => s.workspace.connections)
  const { setStatus, setRegisterValues, appendSparkline, appendLog, popOut, popIn } = useConnectionsStore()

  function sysLog(msg: string, status: 'ok' | 'error' = 'ok') {
    appendLog({
      id: `upd-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      connectionId: '__system__',
      connectionName: 'updater',
      direction: 'rx',
      fc: 0, address: 0, rawHex: '', rawDec: '', unit: '',
      decodedValue: msg,
      status,
    })
  }
  const shownErrors = useRef<Set<string>>(new Set())
  const [errorToast, setErrorToast] = useState<{ connectionName: string; message: string } | null>(null)
  const [showGrowloc, setShowGrowloc] = useState(false)
  const gPressCount = useRef(0)
  const gPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { setStatus: setUpdateStatus, setInfo: setUpdateInfo, setProgress: setUpdateProgress,
          setError: setUpdateError, setLastChecked } = useUpdaterStore()
  const autoUpdate = useWorkspaceStore(s => s.workspace.settings.autoUpdate)
  const updateIntervalHours = useWorkspaceStore(s => s.workspace.settings.updateCheckIntervalHours)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // Sync auto-update settings to main process when they change
  useEffect(() => {
    window.api.setAutoDownload(autoUpdate)
    window.api.setUpdateInterval(updateIntervalHours)
  }, [autoUpdate, updateIntervalHours])

  // Wire up update IPC events
  useEffect(() => {
    const offChecking = window.api.onUpdateChecking(() => {
      setUpdateStatus('checking')
      sysLog('Checking for updates…')
    })
    const offAvailable = window.api.onUpdateAvailable((info) => {
      setUpdateInfo(info)
      setUpdateStatus('available')
      setLastChecked(Date.now())
      sysLog(`Update available: v${info.version}`)
    })
    const offNotAvailable = window.api.onUpdateNotAvailable(() => {
      setUpdateStatus('uptodate')
      setLastChecked(Date.now())
      sysLog('Already up to date')
      // Revert to idle after 5s so button stays quiet
      setTimeout(() => setUpdateStatus('idle'), 5000)
    })
    const offProgress = window.api.onUpdateProgress((p) => {
      setUpdateProgress(p)
      if (Math.round(p.percent) % 25 === 0) {
        sysLog(`Downloading update… ${Math.round(p.percent)}%`)
      }
      setUpdateStatus('downloading')
    })
    const offDownloaded = window.api.onUpdateDownloaded((info) => {
      setUpdateInfo(info)
      setUpdateStatus('downloaded')
      sysLog(`v${info.version} downloaded — restart to install`)
    })
    const offError = window.api.onUpdateError((msg) => {
      setUpdateError(msg)
      setUpdateStatus('error')
      setLastChecked(Date.now())
      sysLog(`Update error: ${msg}`, 'error')
    })
    return () => {
      offChecking(); offAvailable(); offNotAvailable()
      offProgress(); offDownloaded(); offError()
    }
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key !== 'g' && e.key !== 'G') { gPressCount.current = 0; return }
      gPressCount.current++
      if (gPressTimer.current) clearTimeout(gPressTimer.current)
      gPressTimer.current = setTimeout(() => { gPressCount.current = 0 }, 2000)
      if (gPressCount.current >= 4) {
        gPressCount.current = 0
        if (gPressTimer.current) clearTimeout(gPressTimer.current)
        setShowGrowloc(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    console.log('[app] registering IPC listeners, connections:', connections.map(c => c.id))

    const offStatus = window.api.onConnectionStatus((data: unknown) => {
      const d = data as { connectionId: string; status: string; error?: string }
      console.log(`[app] status: ${d.connectionId} → ${d.status}${d.error ? ' err=' + d.error : ''}`)
      setStatus(d.connectionId, d.status as any, d.error)

      if (d.status === 'error' && d.error && !shownErrors.current.has(d.connectionId)) {
        shownErrors.current.add(d.connectionId)
        const conn = connections.find(c => c.id === d.connectionId)
        setErrorToast({ connectionName: conn?.name ?? d.connectionId, message: d.error! })
      }
      if (d.status === 'connecting') {
        shownErrors.current.delete(d.connectionId)
      }
    })

    const offPoll = window.api.onPollResult((batch: unknown) => {
      const b = batch as Record<string, {
        connectionId: string
        groupId: string
        timestamp: number
        transformed: Array<{ raw: number; decoded: number | string; timestamp: number; alertState: string }>
      }>

      console.log('[app] onPollResult fired, keys:', Object.keys(b))

      for (const key of Object.keys(b)) {
        const item = b[key]
        if (!item?.transformed) {
          console.warn('[app] item has no transformed:', key, item)
          continue
        }

        const conn = connections.find(c => c.id === item.connectionId)
        if (!conn) {
          console.warn('[app] connection not found for id:', item.connectionId, 'known:', connections.map(c => c.id))
          continue
        }

        const group = conn.registerGroups.find(g => g.id === item.groupId)
        if (!group) {
          console.warn('[app] group not found:', item.groupId, 'in conn', item.connectionId, 'groups:', conn.registerGroups.map(g => g.id))
          continue
        }

        console.log(`[app] processing ${item.transformed.length} register(s) for "${conn.name}" / "${group.label}"`)

        const addresses = group.registers.map(r => r.address)
        setRegisterValues(item.connectionId, item.transformed as any, addresses)

        item.transformed.forEach((rv, i) => {
          const reg = group.registers[i]
          if (!reg || typeof rv.decoded !== 'number') return
          const maxPts = Math.max(10, Math.ceil(reg.sparklineWindowSecs * 1000 / conn.pollIntervalMs))
          appendSparkline(item.connectionId, reg.address, { timestamp: rv.timestamp, value: rv.decoded }, maxPts)
        })

        // RX log entries (with full raw frame) are emitted by worker-registry → IPC.LOG_ENTRY
      }
    })

    // Receive TX frame log entries pushed from main (worker tx-log messages)
    const offLogEntry = window.api.onLogEntry((entry: unknown) => {
      appendLog(entry as LogEntry)
    })

    const offPopOut = window.api.onPopOut((id) => popOut(id))
    const offPopIn = window.api.onPopIn((id) => popIn(id))

    return () => {
      offStatus()
      offPoll()
      offLogEntry()
      offPopOut()
      offPopIn()
    }
  }, [connections])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <TopBar />
      <MenuBar />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar />
        <Dashboard />
      </div>
      <LogDrawer />

      {showGrowloc && <GrowlocMenu onClose={() => setShowGrowloc(false)} />}

      {errorToast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          background: 'var(--danger)', color: '#fff',
          borderRadius: 8, padding: '14px 18px', maxWidth: 360,
          boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
          display: 'flex', flexDirection: 'column', gap: 6
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <span style={{ fontWeight: 700, fontSize: 13 }}>
              Connection failed — {errorToast.connectionName}
            </span>
            <button
              onClick={() => setErrorToast(null)}
              style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}
            >
              ✕
            </button>
          </div>
          <span style={{ fontSize: 12, opacity: 0.9 }}>{errorToast.message}</span>
        </div>
      )}
    </div>
  )
}
