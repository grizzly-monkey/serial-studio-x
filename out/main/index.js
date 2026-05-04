"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
const electron = require("electron");
const path = require("path");
const utils = require("@electron-toolkit/utils");
const worker_threads = require("worker_threads");
const fs = require("fs");
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
  CONNECTION_STATUS: "connection:status"
};
const alertStates = /* @__PURE__ */ new Map();
function checkAlert(connectionId, reg, decoded) {
  const key = `${connectionId}:${reg.address}`;
  const prev = alertStates.get(key) ?? "ok";
  const val = typeof decoded === "number" ? decoded : null;
  let next = "ok";
  if (val !== null && reg.alert.enabled) {
    if (reg.alert.lowLimit !== null && val < reg.alert.lowLimit) next = "low";
    else if (reg.alert.highLimit !== null && val > reg.alert.highLimit) next = "high";
  }
  if (next !== prev) {
    alertStates.set(key, next);
    if (reg.alert.notifyOS && electron.Notification.isSupported()) {
      const title = next === "ok" ? `✅ ${reg.label} recovered` : `⚠️ ${reg.label} alert`;
      const body = next === "ok" ? `Value ${val}${reg.unit} is back in range` : `Value ${val}${reg.unit} is ${next === "low" ? "below" : "above"} limit`;
      new electron.Notification({ title, body }).show();
    }
  }
  return next;
}
const SCHEMA_VERSION = 1;
function getWorkspacesDir() {
  return path.join(electron.app.getPath("userData"), "workspaces");
}
function ensureWorkspacesDir() {
  const dir = getWorkspacesDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
function listWorkspaces() {
  ensureWorkspacesDir();
  return fs.readdirSync(getWorkspacesDir()).filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", ""));
}
function loadWorkspace(name) {
  const path$1 = path.join(getWorkspacesDir(), `${name}.json`);
  if (!fs.existsSync(path$1)) return null;
  try {
    return migrate(JSON.parse(fs.readFileSync(path$1, "utf8")));
  } catch {
    return null;
  }
}
function saveWorkspace(name, workspace) {
  ensureWorkspacesDir();
  const path$1 = path.join(getWorkspacesDir(), `${name}.json`);
  fs.writeFileSync(path$1, JSON.stringify({ ...workspace, schemaVersion: SCHEMA_VERSION }, null, 2));
}
async function exportWorkspace(workspace) {
  const { filePath } = await electron.dialog.showSaveDialog({
    defaultPath: `${workspace.name}.json`,
    filters: [{ name: "JSON", extensions: ["json"] }]
  });
  if (filePath) fs.writeFileSync(filePath, JSON.stringify(workspace, null, 2));
}
async function importWorkspace() {
  const { filePaths } = await electron.dialog.showOpenDialog({
    filters: [{ name: "JSON", extensions: ["json"] }],
    properties: ["openFile"]
  });
  if (!filePaths[0]) return null;
  try {
    return migrate(JSON.parse(fs.readFileSync(filePaths[0], "utf8")));
  } catch {
    return null;
  }
}
const logStreams = /* @__PURE__ */ new Map();
async function startLogging(connectionId, connectionName) {
  const { filePath } = await electron.dialog.showSaveDialog({
    defaultPath: `${connectionName}-${(/* @__PURE__ */ new Date()).toISOString().split("T")[0]}.csv`,
    filters: [{ name: "CSV", extensions: ["csv"] }]
  });
  if (!filePath) return;
  fs.writeFileSync(filePath, "timestamp,connection,fc,address,raw_hex,raw_dec,decoded_value,unit,status\n");
  logStreams.set(connectionId, filePath);
}
function stopLogging(connectionId) {
  logStreams.delete(connectionId);
}
function appendLog(connectionId, row) {
  const path2 = logStreams.get(connectionId);
  if (path2) fs.appendFileSync(path2, row + "\n");
}
function isLogging(connectionId) {
  return logStreams.has(connectionId);
}
function migrate(ws) {
  if (!ws.schemaVersion) ws.schemaVersion = 1;
  if (!ws.settings) ws.settings = { preferredBase: "dec", theme: "light", logDrawerOpen: false };
  if (!ws.connections) ws.connections = [];
  return ws;
}
function decodeRegister(rawRegs, regIndex, config) {
  const raw = rawRegs[regIndex] ?? 0;
  switch (config.dataType) {
    case "uint16":
      return raw * config.scale + config.offset;
    case "int16": {
      const signed = raw > 32767 ? raw - 65536 : raw;
      return signed * config.scale + config.offset;
    }
    case "float32": {
      const hi = rawRegs[regIndex] ?? 0;
      const lo = rawRegs[regIndex + 1] ?? 0;
      const buf = Buffer.alloc(4);
      buf.writeUInt16BE(hi, 0);
      buf.writeUInt16BE(lo, 2);
      return buf.readFloatBE(0) * config.scale + config.offset;
    }
    case "uint32": {
      const hi = rawRegs[regIndex] ?? 0;
      const lo = rawRegs[regIndex + 1] ?? 0;
      return (hi << 16 >>> 0 | lo) * config.scale + config.offset;
    }
    case "int32": {
      const hi = rawRegs[regIndex] ?? 0;
      const lo = rawRegs[regIndex + 1] ?? 0;
      const u = (hi << 16 | lo) >>> 0;
      const signed = u > 2147483647 ? u - 4294967296 : u;
      return signed * config.scale + config.offset;
    }
    case "binary":
      return raw.toString(2).padStart(16, "0");
    case "hex":
      return "0x" + raw.toString(16).toUpperCase().padStart(4, "0");
    case "ascii":
      return String.fromCharCode(raw >> 8 & 255, raw & 255);
    default:
      return raw;
  }
}
function transformPollResult(rawValues, registers) {
  return registers.map((reg, i) => {
    const decoded = decodeRegister(rawValues, i, reg);
    return {
      raw: rawValues[i] ?? 0,
      decoded,
      timestamp: Date.now(),
      alertState: "ok"
    };
  });
}
const workers = /* @__PURE__ */ new Map();
let lastPushTime = 0;
const pendingUpdates = {};
function getWorkerPath() {
  if (utils.is.dev) {
    return path.join(__dirname, "../../src/workers/modbus-worker.js");
  }
  return path.join(__dirname, "../workers/modbus-worker.js");
}
function spawnWorker(config, win) {
  if (workers.has(config.id)) killWorker(config.id);
  const worker = new worker_threads.Worker(getWorkerPath(), { workerData: config });
  workers.set(config.id, worker);
  worker.on("message", (msg) => {
    if (msg.type === "poll-result") {
      handlePollResult(msg.payload, config, win);
    }
    if (msg.type === "status") {
      win.webContents.send(IPC.CONNECTION_STATUS, msg.payload);
    }
    if (msg.type === "write-ok" || msg.type === "write-error") {
      win.webContents.send(IPC.REGISTER_WRITE, msg);
    }
  });
  worker.on("error", (err) => {
    win.webContents.send(IPC.CONNECTION_STATUS, {
      connectionId: config.id,
      status: "error",
      error: err.message
    });
  });
  worker.on("exit", (code) => {
    if (code !== 0) {
      win.webContents.send(IPC.CONNECTION_STATUS, {
        connectionId: config.id,
        status: "error",
        error: `Worker exited with code ${code}`
      });
    }
    workers.delete(config.id);
  });
}
function handlePollResult(result, config, win) {
  const group = config.registerGroups.find((g) => g.id === result.groupId);
  if (!group) return;
  const transformed = transformPollResult(result.values, group.registers);
  transformed.forEach((rv, i) => {
    const reg = group.registers[i];
    if (!reg) return;
    rv.alertState = checkAlert(config.id, reg, rv.decoded);
    if (isLogging(config.id)) {
      const row = [
        new Date(rv.timestamp).toISOString(),
        config.name,
        group.functionCode,
        reg.address,
        "0x" + rv.raw.toString(16).toUpperCase().padStart(4, "0"),
        rv.raw,
        rv.decoded,
        reg.unit,
        rv.alertState === "ok" ? "ok" : "alert"
      ].join(",");
      appendLog(config.id, row);
    }
  });
  const now = Date.now();
  Object.assign(pendingUpdates, {
    [`${config.id}:${result.groupId}`]: { ...result, transformed }
  });
  if (now - lastPushTime >= 16) {
    lastPushTime = now;
    if (!win.isDestroyed()) {
      win.webContents.send(IPC.POLL_RESULT, { ...pendingUpdates });
    }
  }
}
function killWorker(connectionId) {
  const w = workers.get(connectionId);
  if (w) {
    w.postMessage({ type: "stop" });
    workers.delete(connectionId);
  }
}
function sendWrite(connectionId, fc, address, value) {
  workers.get(connectionId)?.postMessage({ type: "write", payload: { fc, address, value } });
}
function killAll() {
  for (const id of [...workers.keys()]) killWorker(id);
}
function registerIpcHandlers(win) {
  electron.ipcMain.handle(IPC.CONNECTION_CONNECT, (_evt, config) => {
    spawnWorker(config, win);
  });
  electron.ipcMain.handle(IPC.CONNECTION_DISCONNECT, (_evt, connectionId) => {
    killWorker(connectionId);
  });
  electron.ipcMain.handle(IPC.REGISTER_WRITE, (_evt, { connectionId, fc, address, value }) => {
    sendWrite(connectionId, fc, address, value);
  });
  electron.ipcMain.handle(IPC.WORKSPACE_LIST, () => listWorkspaces());
  electron.ipcMain.handle(IPC.WORKSPACE_LOAD, (_evt, name) => loadWorkspace(name));
  electron.ipcMain.handle(IPC.WORKSPACE_SAVE, (_evt, { name, workspace }) => {
    saveWorkspace(name, workspace);
  });
  electron.ipcMain.handle(IPC.WORKSPACE_EXPORT, (_evt, workspace) => exportWorkspace(workspace));
  electron.ipcMain.handle(IPC.WORKSPACE_IMPORT, () => importWorkspace());
  electron.ipcMain.handle(IPC.LOG_START, (_evt, { connectionId, connectionName }) => startLogging(connectionId, connectionName));
  electron.ipcMain.handle(IPC.LOG_STOP, (_evt, connectionId) => stopLogging(connectionId));
  electron.ipcMain.handle(IPC.SERIAL_PORTS_LIST, async () => {
    try {
      const { SerialPort } = await import("serialport");
      const ports = await SerialPort.list();
      return ports.map((p) => p.path);
    } catch {
      return [];
    }
  });
}
function cleanupIpc() {
  killAll();
  electron.ipcMain.removeAllListeners();
}
let mainWindow = null;
function createWindow() {
  mainWindow = new electron.BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  mainWindow.on("ready-to-show", () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    electron.shell.openExternal(url);
    return { action: "deny" };
  });
  registerIpcHandlers(mainWindow);
  if (utils.is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}
electron.app.whenReady().then(() => {
  createWindow();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
electron.app.on("window-all-closed", () => {
  cleanupIpc();
  if (process.platform !== "darwin") electron.app.quit();
});
