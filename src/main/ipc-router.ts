import { ipcMain, BrowserWindow } from 'electron'
import { IPC } from '../shared/ipc-channels'
import { spawnWorker, killWorker, sendWrite, killAll, pausePolling, resumePolling } from './worker-registry'
import { startScan, stopScan } from './scan-registry'
import {
  listWorkspaces, loadWorkspace, saveWorkspace,
  exportWorkspace, importWorkspace, startLogging, stopLogging
} from './file-io'
import type { ConnectionConfig, Workspace } from '../shared/types'

export function registerIpcHandlers(win: BrowserWindow): void {
  ipcMain.handle(IPC.CONNECTION_CONNECT, async (_evt, config: ConnectionConfig) => {
    console.log(`[ipc] CONNECTION_CONNECT: "${config.name}" protocol=${config.protocol} groups=${config.registerGroups.length}`)
    await spawnWorker(config, win)
  })

  ipcMain.handle(IPC.CONNECTION_DISCONNECT, (_evt, connectionId: string) => {
    killWorker(connectionId)
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

  ipcMain.handle(IPC.SERIAL_PORTS_LIST, async () => {
    try {
      const { SerialPort } = await import('serialport')
      const ports = await SerialPort.list()
      return ports.map((p: { path: string }) => p.path)
    } catch { return [] }
  })
}

export async function cleanupIpc(): Promise<void> {
  await stopScan()
  killAll()
  ipcMain.removeAllListeners()
}
