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

  listSerialPorts: (): Promise<string[]> => ipcRenderer.invoke(IPC.SERIAL_PORTS_LIST),

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
