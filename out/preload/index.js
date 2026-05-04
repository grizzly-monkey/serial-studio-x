"use strict";
const electron = require("electron");
const IPC = {
  CONNECTION_CONNECT: "connection:connect",
  CONNECTION_DISCONNECT: "connection:disconnect",
  REGISTER_WRITE: "register:write",
  WORKSPACE_SAVE: "workspace:save",
  WORKSPACE_LOAD: "workspace:load",
  WORKSPACE_LIST: "workspace:list",
  WORKSPACE_EXPORT: "workspace:export",
  WORKSPACE_IMPORT: "workspace:import",
  LOG_START: "log:start",
  LOG_STOP: "log:stop",
  SERIAL_PORTS_LIST: "serial:ports-list",
  POLL_RESULT: "poll:result",
  CONNECTION_STATUS: "connection:status",
  LOG_ENTRY: "log:entry"
};
const api = {
  connectConnection: (config) => electron.ipcRenderer.invoke(IPC.CONNECTION_CONNECT, config),
  disconnectConnection: (id) => electron.ipcRenderer.invoke(IPC.CONNECTION_DISCONNECT, id),
  writeRegister: (connectionId, fc, address, value) => electron.ipcRenderer.invoke(IPC.REGISTER_WRITE, { connectionId, fc, address, value }),
  listWorkspaces: () => electron.ipcRenderer.invoke(IPC.WORKSPACE_LIST),
  loadWorkspace: (name) => electron.ipcRenderer.invoke(IPC.WORKSPACE_LOAD, name),
  saveWorkspace: (name, workspace) => electron.ipcRenderer.invoke(IPC.WORKSPACE_SAVE, { name, workspace }),
  exportWorkspace: (workspace) => electron.ipcRenderer.invoke(IPC.WORKSPACE_EXPORT, workspace),
  importWorkspace: () => electron.ipcRenderer.invoke(IPC.WORKSPACE_IMPORT),
  startLogging: (connectionId, connectionName) => electron.ipcRenderer.invoke(IPC.LOG_START, { connectionId, connectionName }),
  stopLogging: (connectionId) => electron.ipcRenderer.invoke(IPC.LOG_STOP, connectionId),
  listSerialPorts: () => electron.ipcRenderer.invoke(IPC.SERIAL_PORTS_LIST),
  onPollResult: (cb) => {
    const handler = (_, data) => cb(data);
    electron.ipcRenderer.on(IPC.POLL_RESULT, handler);
    return () => electron.ipcRenderer.removeListener(IPC.POLL_RESULT, handler);
  },
  onConnectionStatus: (cb) => {
    const handler = (_, data) => cb(data);
    electron.ipcRenderer.on(IPC.CONNECTION_STATUS, handler);
    return () => electron.ipcRenderer.removeListener(IPC.CONNECTION_STATUS, handler);
  },
  onLogEntry: (cb) => {
    const handler = (_, entry) => cb(entry);
    electron.ipcRenderer.on(IPC.LOG_ENTRY, handler);
    return () => electron.ipcRenderer.removeListener(IPC.LOG_ENTRY, handler);
  }
};
electron.contextBridge.exposeInMainWorld("api", api);
