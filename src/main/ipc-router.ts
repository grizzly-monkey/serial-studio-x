import { ipcMain, BrowserWindow, shell, dialog } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { IPC } from '../shared/ipc-channels'
import { spawnWorker, killWorker, sendWrite, sendRawFrame, killAll, pausePolling, resumePolling } from './worker-registry'
import { startScan, stopScan } from './scan-registry'
import {
  listWorkspaces, loadWorkspace, saveWorkspace,
  exportWorkspace, importWorkspace, startLogging, stopLogging
} from './file-io'
import { openTerminal, closeTerminal, writeTerminal, closeAllTerminals } from './serial-terminal-manager'
import type { ConnectionConfig, Workspace } from '../shared/types'

export function registerIpcHandlers(win: BrowserWindow): void {
  ipcMain.handle(IPC.CONNECTION_CONNECT, async (_evt, config: ConnectionConfig) => {
    if (config.protocol === 'serial-terminal') {
      await openTerminal(config)
    } else {
      console.log(`[ipc] CONNECTION_CONNECT: "${config.name}" protocol=${config.protocol} groups=${config.registerGroups.length}`)
      await spawnWorker(config)
    }
  })

  ipcMain.handle(IPC.CONNECTION_DISCONNECT, (_evt, connectionId: string) => {
    killWorker(connectionId)
    closeTerminal(connectionId)
  })

  ipcMain.handle(IPC.REGISTER_WRITE, (_evt, { connectionId, fc, address, value }) => {
    sendWrite(connectionId, fc, address, value)
  })

  ipcMain.handle(IPC.WORKSPACE_LIST, () => listWorkspaces())

  ipcMain.handle(IPC.WORKSPACE_LOAD, (_evt, name: string) => loadWorkspace(name))

  ipcMain.handle(IPC.WORKSPACE_SAVE, (_evt, { name, workspace }: { name: string; workspace: Workspace }) => {
    saveWorkspace(name, workspace)
  })

  ipcMain.handle(IPC.WORKSPACE_EXPORT, (_evt, workspace: Workspace) => exportWorkspace(workspace))

  ipcMain.handle(IPC.WORKSPACE_IMPORT, () => importWorkspace())

  ipcMain.handle(IPC.LOG_START, (_evt, { connectionId, connectionName }) =>
    startLogging(connectionId, connectionName))

  ipcMain.handle(IPC.LOG_STOP, (_evt, connectionId: string) => stopLogging(connectionId))

  ipcMain.handle(IPC.RAW_FRAME_SEND, (_evt, { connectionId, bytes }: { connectionId: string; bytes: number[] }) => {
    sendRawFrame(connectionId, bytes)
  })

  ipcMain.handle(IPC.LOG_EXPORT, async () => {
    const { filePath } = await dialog.showSaveDialog({
      defaultPath: `modbus-log-${new Date().toISOString().split('T')[0]}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    })
    if (filePath) win.webContents.send('log:export-request', filePath)
  })

  ipcMain.handle(IPC.DIAGNOSTICS_RUN, () => {
    return { ok: true, message: 'Diagnostics: see connection status indicators in sidebar.' }
  })

  ipcMain.handle(IPC.POLLING_PAUSE, (_evt, connectionId: string) => {
    pausePolling(connectionId)
  })

  ipcMain.handle(IPC.POLLING_RESUME, (_evt, connectionId: string) => {
    resumePolling(connectionId)
  })

  ipcMain.handle(IPC.SCAN_START, async (_evt, { config, timeoutMs }: { config: ConnectionConfig; timeoutMs: number }) => {
    await startScan(config, timeoutMs, win)
  })

  ipcMain.handle(IPC.SCAN_STOP, async () => {
    await stopScan()
  })

  ipcMain.handle(IPC.TERMINAL_OPEN, async (_evt, config: ConnectionConfig) => {
    await openTerminal(config)
  })

  ipcMain.handle(IPC.TERMINAL_CLOSE, async (_evt, connectionId: string) => {
    await closeTerminal(connectionId)
  })

  ipcMain.handle(IPC.TERMINAL_WRITE, (_evt, { connectionId, bytes }: { connectionId: string; bytes: number[] }) => {
    writeTerminal(connectionId, bytes)
  })

  ipcMain.handle(IPC.SERIAL_PORTS_LIST, async () => {
    try {
      const { SerialPort } = await import('serialport')
      const ports = await SerialPort.list() as Array<{ path: string; friendlyName?: string; manufacturer?: string }>
      ports.sort((a, b) => {
        const ma = a.path.match(/COM(\d+)/i)
        const mb = b.path.match(/COM(\d+)/i)
        if (ma && mb) return parseInt(ma[1]) - parseInt(mb[1])
        return a.path.localeCompare(b.path)
      })
      return ports.map(p => {
        const extra = p.friendlyName ?? p.manufacturer ?? ''
        const label = extra && !extra.includes(p.path) ? `${p.path} — ${extra}` : p.path
        return { path: p.path, label }
      })
    } catch { return [] }
  })

  // Pop a connection panel into its own Electron window (for multi-monitor)
  ipcMain.handle(IPC.WINDOW_POP, (_evt, connectionId: string) => {
    // Notify all existing windows to hide this panel before the popup opens
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send(IPC.WINDOW_POP_OUT, connectionId)
    }

    const popup = new BrowserWindow({
      width: 900,
      height: 700,
      minWidth: 400,
      minHeight: 300,
      show: false,
      autoHideMenuBar: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        nodeIntegration: false,
        contextIsolation: true,
      },
    })

    popup.on('closed', () => {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send(IPC.WINDOW_POP_IN, connectionId)
      }
    })

    popup.once('ready-to-show', () => popup.show())
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      popup.loadURL(`${process.env['ELECTRON_RENDERER_URL']}?panel=${connectionId}`)
    } else {
      popup.loadFile(join(__dirname, '../renderer/index.html'), { query: { panel: connectionId } })
    }
  })
}

export async function cleanupIpc(): Promise<void> {
  await stopScan()
  killAll()
  await closeAllTerminals()
  ipcMain.removeAllListeners()
}
