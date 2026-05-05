import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import PanelWindow from './PanelWindow'
import ErrorBoundary from './components/ErrorBoundary'
import './styles/global.css'
import './styles/theme.css'
import { useConnectionsStore } from './store/connections'

// Capture renderer console output into the APP LOG drawer as SYS entries.
// Re-entrancy guard prevents infinite loops if Zustand/React internally calls console.
const _log = console.log.bind(console)
const _warn = console.warn.bind(console)
const _error = console.error.bind(console)

let _intercepting = false

function safeStr(a: unknown): string {
  if (a === null) return 'null'
  if (a === undefined) return 'undefined'
  if (typeof a !== 'object') return String(a)
  try { return JSON.stringify(a) } catch { return '[object]' }
}

function pushSysLog(level: 'log' | 'warn' | 'error', args: unknown[]) {
  if (_intercepting) return
  _intercepting = true
  try {
    const msg = args.map(safeStr).join(' ')
    useConnectionsStore.getState().appendLog({
      id: `sys-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: Date.now(),
      connectionId: '__system__',
      connectionName: 'System',
      direction: 'tx',
      fc: 0,
      address: 0,
      rawHex: '',
      rawDec: '',
      decodedValue: msg,
      unit: '',
      status: level === 'error' ? 'error' : level === 'warn' ? 'alert' : 'ok'
    })
  } finally {
    _intercepting = false
  }
}

console.log = (...args) => { _log(...args); pushSysLog('log', args) }
console.warn = (...args) => { _warn(...args); pushSysLog('warn', args) }
console.error = (...args) => { _error(...args); pushSysLog('error', args) }

// Catch unhandled promise rejections so they appear in the sys log instead of going silent
window.addEventListener('unhandledrejection', (e) => {
  const msg = e.reason instanceof Error ? e.reason.message : String(e.reason)
  console.error('[unhandled rejection]', msg)
})

window.addEventListener('error', (e) => {
  console.error('[uncaught error]', e.message)
})

const panelId = new URLSearchParams(window.location.search).get('panel')

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      {panelId ? <PanelWindow connectionId={panelId} /> : <App />}
    </ErrorBoundary>
  </React.StrictMode>
)
