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
  LOG_EXPORT: "log:export",
  LOG_START: "log:start",
  LOG_STOP: "log:stop",
  SERIAL_PORTS_LIST: "serial:ports-list",
  DIAGNOSTICS_RUN: "diagnostics:run",
  POLL_RESULT: "poll:result",
  CONNECTION_STATUS: "connection:status",
  LOG_ENTRY: "log:entry",
  POLLING_PAUSE: "polling:pause",
  POLLING_RESUME: "polling:resume",
  SCAN_START: "scan:start",
  SCAN_STOP: "scan:stop",
  SCAN_PROGRESS: "scan:progress",
  SCAN_DONE: "scan:done",
  RAW_FRAME_SEND: "raw-frame:send",
  ECHO_RESPONSE: "echo:response",
  TERMINAL_OPEN: "terminal:open",
  TERMINAL_CLOSE: "terminal:close",
  TERMINAL_WRITE: "terminal:write",
  TERMINAL_DATA: "terminal:data",
  TERMINAL_STATUS: "terminal:status",
  WINDOW_POP: "window:pop",
  WINDOW_POP_OUT: "window:pop-out",
  WINDOW_POP_IN: "window:pop-in",
  // Auto-updater
  UPDATE_CHECKING: "update:checking",
  UPDATE_AVAILABLE: "update:available",
  UPDATE_NOT_AVAILABLE: "update:not-available",
  UPDATE_PROGRESS: "update:progress",
  UPDATE_DOWNLOADED: "update:downloaded",
  UPDATE_ERROR: "update:error",
  UPDATE_CHECK: "update:check",
  UPDATE_DOWNLOAD: "update:download",
  UPDATE_INSTALL: "update:install",
  UPDATE_SET_AUTO: "update:set-auto",
  UPDATE_SET_INTERVAL: "update:set-interval"
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
  exportLog: () => electron.ipcRenderer.invoke(IPC.LOG_EXPORT),
  runDiagnostics: () => electron.ipcRenderer.invoke(IPC.DIAGNOSTICS_RUN),
  startLog: (connectionId, connectionName) => electron.ipcRenderer.invoke(IPC.LOG_START, { connectionId, connectionName }),
  stopLog: (connectionId) => electron.ipcRenderer.invoke(IPC.LOG_STOP, connectionId),
  sendRawFrame: (connectionId, bytes) => electron.ipcRenderer.invoke(IPC.RAW_FRAME_SEND, { connectionId, bytes }),
  pausePolling: (connectionId) => electron.ipcRenderer.invoke(IPC.POLLING_PAUSE, connectionId),
  resumePolling: (connectionId) => electron.ipcRenderer.invoke(IPC.POLLING_RESUME, connectionId),
  openTerminal: (config) => electron.ipcRenderer.invoke(IPC.TERMINAL_OPEN, config),
  closeTerminal: (connectionId) => electron.ipcRenderer.invoke(IPC.TERMINAL_CLOSE, connectionId),
  writeTerminal: (connectionId, bytes) => electron.ipcRenderer.invoke(IPC.TERMINAL_WRITE, { connectionId, bytes }),
  onEchoResponse: (cb) => {
    const handler = (_, data) => cb(data);
    electron.ipcRenderer.on(IPC.ECHO_RESPONSE, handler);
    return () => electron.ipcRenderer.removeListener(IPC.ECHO_RESPONSE, handler);
  },
  onTerminalData: (cb) => {
    const handler = (_, data) => cb(data);
    electron.ipcRenderer.on(IPC.TERMINAL_DATA, handler);
    return () => electron.ipcRenderer.removeListener(IPC.TERMINAL_DATA, handler);
  },
  onTerminalStatus: (cb) => {
    const handler = (_, data) => cb(data);
    electron.ipcRenderer.on(IPC.TERMINAL_STATUS, handler);
    return () => electron.ipcRenderer.removeListener(IPC.TERMINAL_STATUS, handler);
  },
  listSerialPorts: () => electron.ipcRenderer.invoke(IPC.SERIAL_PORTS_LIST),
  getPlatform: () => process.platform,
  popOutConnection: (connectionId) => electron.ipcRenderer.invoke(IPC.WINDOW_POP, connectionId),
  onPopOut: (cb) => {
    const handler = (_, id) => cb(id);
    electron.ipcRenderer.on(IPC.WINDOW_POP_OUT, handler);
    return () => electron.ipcRenderer.removeListener(IPC.WINDOW_POP_OUT, handler);
  },
  onPopIn: (cb) => {
    const handler = (_, id) => cb(id);
    electron.ipcRenderer.on(IPC.WINDOW_POP_IN, handler);
    return () => electron.ipcRenderer.removeListener(IPC.WINDOW_POP_IN, handler);
  },
  scanStart: (config, timeoutMs) => electron.ipcRenderer.invoke(IPC.SCAN_START, { config, timeoutMs }),
  scanStop: () => electron.ipcRenderer.invoke(IPC.SCAN_STOP),
  onScanProgress: (cb) => {
    const handler = (_, data) => cb(data);
    electron.ipcRenderer.on(IPC.SCAN_PROGRESS, handler);
    return () => electron.ipcRenderer.removeListener(IPC.SCAN_PROGRESS, handler);
  },
  onScanDone: (cb) => {
    const handler = (_, data) => cb(data);
    electron.ipcRenderer.on(IPC.SCAN_DONE, handler);
    return () => electron.ipcRenderer.removeListener(IPC.SCAN_DONE, handler);
  },
  // Auto-updater
  getAppVersion: () => process.env["npm_package_version"] ?? "?",
  checkForUpdates: () => electron.ipcRenderer.invoke(IPC.UPDATE_CHECK),
  downloadUpdate: () => electron.ipcRenderer.invoke(IPC.UPDATE_DOWNLOAD),
  installUpdate: () => electron.ipcRenderer.invoke(IPC.UPDATE_INSTALL),
  setAutoDownload: (enabled) => electron.ipcRenderer.invoke(IPC.UPDATE_SET_AUTO, enabled),
  setUpdateInterval: (hours) => electron.ipcRenderer.invoke(IPC.UPDATE_SET_INTERVAL, hours),
  onUpdateChecking: (cb) => {
    const handler = () => cb();
    electron.ipcRenderer.on(IPC.UPDATE_CHECKING, handler);
    return () => electron.ipcRenderer.removeListener(IPC.UPDATE_CHECKING, handler);
  },
  onUpdateAvailable: (cb) => {
    const handler = (_, info) => cb(info);
    electron.ipcRenderer.on(IPC.UPDATE_AVAILABLE, handler);
    return () => electron.ipcRenderer.removeListener(IPC.UPDATE_AVAILABLE, handler);
  },
  onUpdateNotAvailable: (cb) => {
    const handler = () => cb();
    electron.ipcRenderer.on(IPC.UPDATE_NOT_AVAILABLE, handler);
    return () => electron.ipcRenderer.removeListener(IPC.UPDATE_NOT_AVAILABLE, handler);
  },
  onUpdateProgress: (cb) => {
    const handler = (_, p) => cb(p);
    electron.ipcRenderer.on(IPC.UPDATE_PROGRESS, handler);
    return () => electron.ipcRenderer.removeListener(IPC.UPDATE_PROGRESS, handler);
  },
  onUpdateDownloaded: (cb) => {
    const handler = (_, info) => cb(info);
    electron.ipcRenderer.on(IPC.UPDATE_DOWNLOADED, handler);
    return () => electron.ipcRenderer.removeListener(IPC.UPDATE_DOWNLOADED, handler);
  },
  onUpdateError: (cb) => {
    const handler = (_, msg) => cb(msg);
    electron.ipcRenderer.on(IPC.UPDATE_ERROR, handler);
    return () => electron.ipcRenderer.removeListener(IPC.UPDATE_ERROR, handler);
  },
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
