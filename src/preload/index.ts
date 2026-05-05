import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc-channels'
import type { ConnectionConfig, Workspace } from '../shared/types'

const api = {
  connectConnection: (config: ConnectionConfig) =>
    ipcRenderer.invoke(IPC.CONNECTION_CONNECT, config),
  disconnectConnection: (id: string) =>
    ipcRenderer.invoke(IPC.CONNECTION_DISCONNECT, id),
  writeRegister: (connectionId: string, fc: number, address: number, value: unknown) =>
    ipcRenderer.invoke(IPC.REGISTER_WRITE, { connectionId, fc, address, value }),

  listWorkspaces: (): Promise<string[]> => ipcRenderer.invoke(IPC.WORKSPACE_LIST),
  loadWorkspace: (name: string): Promise<Workspace | null> => ipcRenderer.invoke(IPC.WORKSPACE_LOAD, name),
  saveWorkspace: (name: string, workspace: Workspace): Promise<void> =>
    ipcRenderer.invoke(IPC.WORKSPACE_SAVE, { name, workspace }),
  exportWorkspace: (workspace: Workspace): Promise<void> =>
    ipcRenderer.invoke(IPC.WORKSPACE_EXPORT, workspace),
  importWorkspace: (): Promise<Workspace | null> => ipcRenderer.invoke(IPC.WORKSPACE_IMPORT),

  startLogging: (connectionId: string, connectionName: string): Promise<void> =>
    ipcRenderer.invoke(IPC.LOG_START, { connectionId, connectionName }),
  stopLogging: (connectionId: string): Promise<void> =>
    ipcRenderer.invoke(IPC.LOG_STOP, connectionId),
  exportLog: (): Promise<void> => ipcRenderer.invoke(IPC.LOG_EXPORT),
  runDiagnostics: (): Promise<unknown> => ipcRenderer.invoke(IPC.DIAGNOSTICS_RUN),

  startLog: (connectionId: string, connectionName: string): Promise<void> =>
    ipcRenderer.invoke(IPC.LOG_START, { connectionId, connectionName }),
  stopLog: (connectionId: string): Promise<void> =>
    ipcRenderer.invoke(IPC.LOG_STOP, connectionId),
  sendRawFrame: (connectionId: string, bytes: number[]): Promise<void> =>
    ipcRenderer.invoke(IPC.RAW_FRAME_SEND, { connectionId, bytes }),

  pausePolling: (connectionId: string): Promise<void> =>
    ipcRenderer.invoke(IPC.POLLING_PAUSE, connectionId),
  resumePolling: (connectionId: string): Promise<void> =>
    ipcRenderer.invoke(IPC.POLLING_RESUME, connectionId),

  openTerminal: (config: ConnectionConfig): Promise<void> =>
    ipcRenderer.invoke(IPC.TERMINAL_OPEN, config),
  closeTerminal: (connectionId: string): Promise<void> =>
    ipcRenderer.invoke(IPC.TERMINAL_CLOSE, connectionId),
  writeTerminal: (connectionId: string, bytes: number[]): Promise<void> =>
    ipcRenderer.invoke(IPC.TERMINAL_WRITE, { connectionId, bytes }),
  onEchoResponse: (cb: (data: { connectionId: string; bytes: number[]; timestamp: number }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: unknown) => cb(data as { connectionId: string; bytes: number[]; timestamp: number })
    ipcRenderer.on(IPC.ECHO_RESPONSE, handler)
    return () => ipcRenderer.removeListener(IPC.ECHO_RESPONSE, handler)
  },
  onTerminalData: (cb: (data: { connectionId: string; bytes: number[] }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: unknown) => cb(data as { connectionId: string; bytes: number[] })
    ipcRenderer.on(IPC.TERMINAL_DATA, handler)
    return () => ipcRenderer.removeListener(IPC.TERMINAL_DATA, handler)
  },
  onTerminalStatus: (cb: (data: { connectionId: string; status: string; error?: string }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: unknown) => cb(data as { connectionId: string; status: string; error?: string })
    ipcRenderer.on(IPC.TERMINAL_STATUS, handler)
    return () => ipcRenderer.removeListener(IPC.TERMINAL_STATUS, handler)
  },

  listSerialPorts: (): Promise<Array<{ path: string; label: string }>> => ipcRenderer.invoke(IPC.SERIAL_PORTS_LIST),
  getPlatform: (): string => process.platform,
  popOutConnection: (connectionId: string): Promise<void> => ipcRenderer.invoke(IPC.WINDOW_POP, connectionId),
  onPopOut: (cb: (connectionId: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, id: unknown) => cb(id as string)
    ipcRenderer.on(IPC.WINDOW_POP_OUT, handler)
    return () => ipcRenderer.removeListener(IPC.WINDOW_POP_OUT, handler)
  },
  onPopIn: (cb: (connectionId: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, id: unknown) => cb(id as string)
    ipcRenderer.on(IPC.WINDOW_POP_IN, handler)
    return () => ipcRenderer.removeListener(IPC.WINDOW_POP_IN, handler)
  },

  scanStart: (config: ConnectionConfig, timeoutMs: number): Promise<void> =>
    ipcRenderer.invoke(IPC.SCAN_START, { config, timeoutMs }),
  scanStop: (): Promise<void> => ipcRenderer.invoke(IPC.SCAN_STOP),
  onScanProgress: (cb: (data: unknown) => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: unknown) => cb(data)
    ipcRenderer.on(IPC.SCAN_PROGRESS, handler)
    return () => ipcRenderer.removeListener(IPC.SCAN_PROGRESS, handler)
  },
  onScanDone: (cb: (data: unknown) => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: unknown) => cb(data)
    ipcRenderer.on(IPC.SCAN_DONE, handler)
    return () => ipcRenderer.removeListener(IPC.SCAN_DONE, handler)
  },

  // Auto-updater
  checkForUpdates: (): Promise<void> => ipcRenderer.invoke(IPC.UPDATE_CHECK),
  downloadUpdate: (): Promise<void> => ipcRenderer.invoke(IPC.UPDATE_DOWNLOAD),
  installUpdate: (): Promise<void> => ipcRenderer.invoke(IPC.UPDATE_INSTALL),
  setAutoDownload: (enabled: boolean): Promise<void> => ipcRenderer.invoke(IPC.UPDATE_SET_AUTO, enabled),
  setUpdateInterval: (hours: number): Promise<void> => ipcRenderer.invoke(IPC.UPDATE_SET_INTERVAL, hours),
  onUpdateChecking: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on(IPC.UPDATE_CHECKING, handler)
    return () => ipcRenderer.removeListener(IPC.UPDATE_CHECKING, handler)
  },
  onUpdateAvailable: (cb: (info: { version: string; releaseDate?: string; releaseNotes?: string }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, info: unknown) => cb(info as { version: string; releaseDate?: string; releaseNotes?: string })
    ipcRenderer.on(IPC.UPDATE_AVAILABLE, handler)
    return () => ipcRenderer.removeListener(IPC.UPDATE_AVAILABLE, handler)
  },
  onUpdateNotAvailable: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on(IPC.UPDATE_NOT_AVAILABLE, handler)
    return () => ipcRenderer.removeListener(IPC.UPDATE_NOT_AVAILABLE, handler)
  },
  onUpdateProgress: (cb: (p: { percent: number; bytesPerSecond: number; transferred: number; total: number }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, p: unknown) => cb(p as { percent: number; bytesPerSecond: number; transferred: number; total: number })
    ipcRenderer.on(IPC.UPDATE_PROGRESS, handler)
    return () => ipcRenderer.removeListener(IPC.UPDATE_PROGRESS, handler)
  },
  onUpdateDownloaded: (cb: (info: { version: string }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, info: unknown) => cb(info as { version: string })
    ipcRenderer.on(IPC.UPDATE_DOWNLOADED, handler)
    return () => ipcRenderer.removeListener(IPC.UPDATE_DOWNLOADED, handler)
  },
  onUpdateError: (cb: (msg: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, msg: unknown) => cb(msg as string)
    ipcRenderer.on(IPC.UPDATE_ERROR, handler)
    return () => ipcRenderer.removeListener(IPC.UPDATE_ERROR, handler)
  },

  onPollResult: (cb: (data: unknown) => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: unknown) => cb(data)
    ipcRenderer.on(IPC.POLL_RESULT, handler)
    return () => ipcRenderer.removeListener(IPC.POLL_RESULT, handler)
  },
  onConnectionStatus: (cb: (data: unknown) => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: unknown) => cb(data)
    ipcRenderer.on(IPC.CONNECTION_STATUS, handler)
    return () => ipcRenderer.removeListener(IPC.CONNECTION_STATUS, handler)
  },
  onLogEntry: (cb: (entry: unknown) => void) => {
    const handler = (_: Electron.IpcRendererEvent, entry: unknown) => cb(entry)
    ipcRenderer.on(IPC.LOG_ENTRY, handler)
    return () => ipcRenderer.removeListener(IPC.LOG_ENTRY, handler)
  },
}

contextBridge.exposeInMainWorld('api', api)

export type API = typeof api
