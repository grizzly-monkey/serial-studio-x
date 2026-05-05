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
const fs = require("fs");
const electronUpdater = require("electron-updater");
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
async function startLogging(connectionId, connectionName, options) {
  const opts = {
    onChangeOnly: false,
    errorsOnly: false,
    appendMode: false,
    midnightRotate: false,
    trafficLogPath: null,
    ...options
  };
  const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const { filePath } = await electron.dialog.showSaveDialog({
    defaultPath: `${connectionName}-${today}.csv`,
    filters: [{ name: "CSV", extensions: ["csv"] }]
  });
  if (!filePath) return;
  const header = "timestamp,connection,fc,address,raw_hex,raw_dec,decoded_value,unit,status\n";
  if (opts.appendMode && fs.existsSync(filePath)) {
    fs.appendFileSync(filePath, header);
  } else {
    fs.writeFileSync(filePath, header);
  }
  logStreams.set(connectionId, { filePath, options: opts, lastDate: today, prevValues: /* @__PURE__ */ new Map() });
}
function stopLogging(connectionId) {
  logStreams.delete(connectionId);
}
function appendLog(connectionId, row, status, valueKey, decodedStr) {
  const state = logStreams.get(connectionId);
  if (!state) return;
  if (state.options.errorsOnly && status !== "alert" && status !== "error") return;
  if (state.options.onChangeOnly && valueKey !== void 0 && decodedStr !== void 0) {
    const prev = state.prevValues.get(valueKey);
    if (prev === decodedStr) return;
    state.prevValues.set(valueKey, decodedStr);
  }
  if (state.options.midnightRotate) {
    const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    if (today !== state.lastDate) {
      state.lastDate = today;
      const newPath = state.filePath.replace(/(-\d{4}-\d{2}-\d{2})?(\.\w+)$/, `-${today}$2`);
      fs.writeFileSync(newPath, "timestamp,connection,fc,address,raw_hex,raw_dec,decoded_value,unit,status\n");
      state.filePath = newPath;
    }
  }
  fs.appendFileSync(state.filePath, row + "\n");
}
function appendTrafficLog(connectionId, frame) {
  const state = logStreams.get(connectionId);
  if (!state?.options.trafficLogPath) return;
  fs.appendFileSync(state.options.trafficLogPath, frame + "\n");
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
function dataTypeRegCount(dataType) {
  switch (dataType) {
    case "float64":
    case "int64":
    case "uint64":
      return 4;
    case "float32":
    case "uint32":
    case "int32":
      return 2;
    default:
      return 1;
  }
}
function reorder2(hi, lo, order) {
  switch (order) {
    case "ABCD":
      return [hi, lo];
    case "CDAB":
      return [lo, hi];
    case "BADC":
      return [(hi & 255) << 8 | hi >> 8, (lo & 255) << 8 | lo >> 8];
    case "DCBA": {
      const swapHi = (lo & 255) << 8 | lo >> 8;
      const swapLo = (hi & 255) << 8 | hi >> 8;
      return [swapHi, swapLo];
    }
  }
}
function reorder4(r, order) {
  const [a, b, c, d] = [r[0] ?? 0, r[1] ?? 0, r[2] ?? 0, r[3] ?? 0];
  switch (order) {
    case "ABCD":
      return [a, b, c, d];
    case "CDAB":
      return [c, d, a, b];
    case "BADC":
      return [
        (a & 255) << 8 | a >> 8,
        (b & 255) << 8 | b >> 8,
        (c & 255) << 8 | c >> 8,
        (d & 255) << 8 | d >> 8
      ];
    case "DCBA":
      return [
        (d & 255) << 8 | d >> 8,
        (c & 255) << 8 | c >> 8,
        (b & 255) << 8 | b >> 8,
        (a & 255) << 8 | a >> 8
      ];
  }
}
function applyScale(value, mode, scale, offset, x1, y1, x2, y2) {
  if (mode === "twoPoint" && x2 !== x1) {
    return y1 + (value - x1) * (y2 - y1) / (x2 - x1);
  }
  return value * scale + offset;
}
function decodeRegister(rawRegs, regIndex, config) {
  const raw = rawRegs[regIndex] ?? 0;
  const byteOrder = config.byteOrder ?? "ABCD";
  const scalingMode = config.scalingMode ?? "linear";
  const scale = (v) => applyScale(v, scalingMode, config.scale ?? 1, config.offset ?? 0, config.x1 ?? 0, config.y1 ?? 0, config.x2 ?? 1, config.y2 ?? 1);
  switch (config.dataType) {
    case "uint16": {
      const decoded = scale(raw);
      const key = String(Math.round(decoded));
      if (config.valueNameMap?.[key]) return config.valueNameMap[key];
      return decoded;
    }
    case "int16": {
      const signed = raw > 32767 ? raw - 65536 : raw;
      const decoded = scale(signed);
      const key = String(Math.round(decoded));
      if (config.valueNameMap?.[key]) return config.valueNameMap[key];
      return decoded;
    }
    case "float32": {
      const [r0, r1] = reorder2(rawRegs[regIndex] ?? 0, rawRegs[regIndex + 1] ?? 0, byteOrder);
      const buf = Buffer.alloc(4);
      buf.writeUInt16BE(r0, 0);
      buf.writeUInt16BE(r1, 2);
      return scale(buf.readFloatBE(0));
    }
    case "uint32": {
      const [r0, r1] = reorder2(rawRegs[regIndex] ?? 0, rawRegs[regIndex + 1] ?? 0, byteOrder);
      const u = r0 << 16 >>> 0 | r1;
      return scale(u);
    }
    case "int32": {
      const [r0, r1] = reorder2(rawRegs[regIndex] ?? 0, rawRegs[regIndex + 1] ?? 0, byteOrder);
      const u = (r0 << 16 | r1) >>> 0;
      const signed = u > 2147483647 ? u - 4294967296 : u;
      return scale(signed);
    }
    case "float64": {
      const ordered = reorder4([
        rawRegs[regIndex] ?? 0,
        rawRegs[regIndex + 1] ?? 0,
        rawRegs[regIndex + 2] ?? 0,
        rawRegs[regIndex + 3] ?? 0
      ], byteOrder);
      const buf = Buffer.alloc(8);
      for (let i = 0; i < 4; i++) buf.writeUInt16BE(ordered[i], i * 2);
      return scale(buf.readDoubleBE(0));
    }
    case "uint64": {
      const ordered = reorder4([
        rawRegs[regIndex] ?? 0,
        rawRegs[regIndex + 1] ?? 0,
        rawRegs[regIndex + 2] ?? 0,
        rawRegs[regIndex + 3] ?? 0
      ], byteOrder);
      const buf = Buffer.alloc(8);
      for (let i = 0; i < 4; i++) buf.writeUInt16BE(ordered[i], i * 2);
      return Number(buf.readBigUInt64BE(0));
    }
    case "int64": {
      const ordered = reorder4([
        rawRegs[regIndex] ?? 0,
        rawRegs[regIndex + 1] ?? 0,
        rawRegs[regIndex + 2] ?? 0,
        rawRegs[regIndex + 3] ?? 0
      ], byteOrder);
      const buf = Buffer.alloc(8);
      for (let i = 0; i < 4; i++) buf.writeUInt16BE(ordered[i], i * 2);
      return Number(buf.readBigInt64BE(0));
    }
    case "binary": {
      const bits = raw.toString(2).padStart(16, "0");
      if (config.bitNames && config.bitNames.some((n) => n)) {
        return bits.split("").reverse().map((b, idx) => {
          const name = config.bitNames?.[idx];
          return name ? `${name}=${b}` : b;
        }).reverse().join(" ");
      }
      return bits;
    }
    case "hex":
      return "0x" + raw.toString(16).toUpperCase().padStart(4, "0");
    case "ascii":
      return String.fromCharCode(raw >> 8 & 255, raw & 255);
    default:
      return raw;
  }
}
function evalAlertState(decoded, alert) {
  if (!alert.enabled || typeof decoded !== "number") return "ok";
  if (alert.lowLimit !== null && decoded < alert.lowLimit) return "low";
  if (alert.highLimit !== null && decoded > alert.highLimit) return "high";
  return "ok";
}
function transformPollResult(rawValues, registers, timestamp) {
  const results = [];
  let regIdx = 0;
  for (const reg of registers) {
    const decoded = decodeRegister(rawValues, regIdx, reg);
    const alertState = evalAlertState(decoded, reg.alert);
    results.push({ raw: rawValues[regIdx] ?? 0, decoded, timestamp, alertState });
    regIdx += dataTypeRegCount(reg.dataType);
  }
  return results;
}
function broadcast$3(channel, data) {
  for (const w of electron.BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, data);
  }
}
const workers = /* @__PURE__ */ new Map();
let lastPushTime = 0;
const pendingUpdates = {};
function getWorkerPath() {
  return path.join(__dirname, "workers/modbus-worker.js");
}
function waitForExit(child, timeoutMs = 3e3) {
  return new Promise((resolve) => {
    const t = setTimeout(() => {
      try {
        child.kill();
      } catch {
      }
      resolve();
    }, timeoutMs);
    child.once("exit", () => {
      clearTimeout(t);
      resolve();
    });
  });
}
async function spawnWorker(config) {
  if (workers.has(config.id)) {
    console.log(`[registry] waiting for existing worker to exit: ${config.id}`);
    const old = workers.get(config.id);
    workers.delete(config.id);
    old.postMessage({ type: "stop" });
    await waitForExit(old);
  }
  console.log(`[registry] spawning worker for "${config.name}" (${config.id})`);
  console.log(`[registry]   protocol: ${config.protocol}, groups: ${config.registerGroups.length}`);
  config.registerGroups.forEach((g) => {
    console.log(`[registry]   group "${g.label}" FC${g.functionCode} addr=${g.startAddress} count=${g.count}`);
  });
  const child = electron.utilityProcess.fork(getWorkerPath(), [], { stdio: "inherit" });
  workers.set(config.id, child);
  child.postMessage({ type: "init", config });
  child.on("message", (msg) => {
    if (msg.type === "poll-result") {
      try {
        console.log(`[registry] poll-result from ${msg.payload.connectionId} group=${msg.payload.groupId} values=${JSON.stringify(msg.payload.values)}`);
      } catch {
      }
      handlePollResult(msg.payload, config);
    }
    if (msg.type === "tx-log") {
      const p = msg.payload;
      try {
        console.log(`[registry] tx-log: FC${p.fc} addr=${p.startAddress} count=${p.count} err=${p.isError}`);
      } catch {
      }
      appendTrafficLog(config.id, `${new Date(p.timestamp).toISOString()} TX FC${p.fc} ${p.txHex}`);
      const isWrite = [5, 6, 15, 16].includes(p.fc);
      let decodedValue;
      if (p.isError) {
        decodedValue = p.txHex;
      } else if (isWrite) {
        const wv = p.writeValue ?? "";
        if (p.fc === 5) decodedValue = `Write Coil ${p.startAddress} = ${wv === "1" || wv === "true" ? "ON" : "OFF"}`;
        else if (p.fc === 6) decodedValue = `Write Register ${p.startAddress} = ${wv}`;
        else if (p.fc === 15) decodedValue = `Write ${p.count} Coil${p.count !== 1 ? "s" : ""} @ ${p.startAddress} = ${wv}`;
        else decodedValue = `Write ${p.count} Register${p.count !== 1 ? "s" : ""} @ ${p.startAddress} = ${wv}`;
      } else {
        decodedValue = `FC${String(p.fc).padStart(2, "0")} addr ${p.startAddress}–${p.startAddress + p.count - 1} (${p.count} reg${p.count !== 1 ? "s" : ""})`;
      }
      broadcast$3(IPC.LOG_ENTRY, {
        id: `tx-${p.connectionId}-${p.timestamp}-${p.startAddress}`,
        timestamp: p.timestamp,
        connectionId: p.connectionId,
        connectionName: config.name,
        direction: "tx",
        fc: p.fc,
        address: p.startAddress,
        rawHex: p.isError ? "" : p.txHex,
        rawDec: "",
        decodedValue,
        unit: "",
        status: p.isError ? "error" : "ok"
      });
    }
    if (msg.type === "status") {
      try {
        console.log(`[registry] status from ${msg.payload.connectionId}: ${msg.payload.status}${msg.payload.error ? " — " + msg.payload.error : ""}`);
      } catch {
      }
      broadcast$3(IPC.CONNECTION_STATUS, msg.payload);
    }
    if (msg.type === "write-ok" || msg.type === "write-error") {
      broadcast$3(IPC.REGISTER_WRITE, msg);
    }
    if (msg.type === "echo-response") {
      const p = msg.payload;
      broadcast$3(IPC.ECHO_RESPONSE, p);
      const rxHex = p.bytes.map((b) => b.toString(16).toUpperCase().padStart(2, "0")).join(" ");
      broadcast$3(IPC.LOG_ENTRY, {
        id: `echo-rx-${p.connectionId}-${p.timestamp}`,
        timestamp: p.timestamp,
        connectionId: p.connectionId,
        connectionName: config.name,
        direction: "rx",
        fc: p.bytes[1] ?? 8,
        address: 0,
        rawHex: rxHex,
        rawDec: "",
        decodedValue: `FC08 Echo response (${p.bytes.length} bytes)`,
        unit: "",
        status: "ok"
      });
    }
  });
  child.on("exit", (code) => {
    try {
      console.log(`[registry] worker exited for ${config.id} with code ${code}`);
    } catch {
    }
    if (workers.get(config.id) === child) {
      workers.delete(config.id);
    }
    if (code !== 0 && code !== null) {
      broadcast$3(IPC.CONNECTION_STATUS, {
        connectionId: config.id,
        status: "error",
        error: `Worker exited with code ${code}`
      });
    }
  });
}
function handlePollResult(result, config) {
  const group = config.registerGroups.find((g) => g.id === result.groupId);
  if (!group) {
    console.warn(`[registry] WARN: group ${result.groupId} not found in config for ${result.connectionId} (config has ${config.registerGroups.length} groups: ${config.registerGroups.map((g) => g.id).join(", ")})`);
    return;
  }
  const transformed = transformPollResult(result.values, group.registers, result.timestamp);
  console.log(`[registry] transformed ${transformed.length} registers for group "${group.label}"`);
  const decodedSummary = transformed.map((rv, i) => {
    const reg = group.registers[i];
    if (!reg) return null;
    const val = typeof rv.decoded === "number" ? Number.isInteger(rv.decoded) ? String(rv.decoded) : rv.decoded.toFixed(2) : rv.decoded;
    return reg.unit ? `${val} ${reg.unit}` : String(val);
  }).filter(Boolean).join(" | ");
  broadcast$3(IPC.LOG_ENTRY, {
    id: `rx-${result.connectionId}-${result.timestamp}-${result.startAddress}`,
    timestamp: result.timestamp,
    connectionId: result.connectionId,
    connectionName: config.name,
    direction: "rx",
    fc: group.functionCode,
    address: result.startAddress,
    rawHex: result.rxHex,
    rawDec: "",
    decodedValue: decodedSummary,
    unit: "",
    status: transformed.some((rv) => rv.alertState !== "ok") ? "alert" : "ok"
  });
  transformed.forEach((rv, i) => {
    const reg = group.registers[i];
    if (!reg) return;
    rv.alertState = checkAlert(config.id, reg, rv.decoded);
    if (isLogging(config.id)) {
      const status = rv.alertState === "ok" ? "ok" : "alert";
      const decodedStr = String(rv.decoded);
      const row = [
        new Date(rv.timestamp).toISOString(),
        config.name,
        group.functionCode,
        reg.address,
        "0x" + rv.raw.toString(16).toUpperCase().padStart(4, "0"),
        rv.raw,
        decodedStr,
        reg.unit,
        status
      ].join(",");
      appendLog(config.id, row, status, `${config.id}:${reg.address}`, decodedStr);
    }
  });
  const now = Date.now();
  Object.assign(pendingUpdates, {
    [`${config.id}:${result.groupId}`]: { ...result, transformed }
  });
  try {
    console.log(`[registry] pushing to renderer: ${Object.keys(pendingUpdates).length} pending update(s), dt=${now - lastPushTime}ms`);
  } catch {
  }
  if (now - lastPushTime >= 16) {
    lastPushTime = now;
    broadcast$3(IPC.POLL_RESULT, { ...pendingUpdates });
    try {
      console.log(`[registry] IPC POLL_RESULT sent`);
    } catch {
    }
  }
}
function killWorker(connectionId) {
  const child = workers.get(connectionId);
  if (child) {
    console.log(`[registry] killing worker ${connectionId}`);
    workers.delete(connectionId);
    child.postMessage({ type: "stop" });
    setTimeout(() => {
      try {
        child.kill();
      } catch {
      }
    }, 2e3);
  }
}
function pausePolling(connectionId) {
  workers.get(connectionId)?.postMessage({ type: "pause" });
}
function resumePolling(connectionId) {
  workers.get(connectionId)?.postMessage({ type: "resume" });
}
function sendWrite(connectionId, fc, address, value) {
  workers.get(connectionId)?.postMessage({ type: "write", payload: { fc, address, value } });
}
function sendRawFrame(connectionId, bytes) {
  workers.get(connectionId)?.postMessage({ type: "raw-frame", payload: { bytes } });
}
function killAll() {
  for (const id of [...workers.keys()]) killWorker(id);
}
function broadcast$2(channel, data) {
  for (const w of electron.BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, data);
  }
}
let scanProcess = null;
function getScanWorkerPath() {
  return path.join(__dirname, "workers/scan-worker.js");
}
async function startScan(config, timeoutMs, win) {
  await stopScan();
  if (config.id) {
    killWorker(config.id);
    await new Promise((r) => setTimeout(r, 600));
  }
  scanProcess = electron.utilityProcess.fork(getScanWorkerPath(), [], { stdio: "inherit" });
  scanProcess.postMessage({ type: "init", config, timeoutMs });
  scanProcess.on("message", (msg) => {
    if (msg.type === "progress") broadcast$2(IPC.SCAN_PROGRESS, msg.payload);
    if (msg.type === "done") broadcast$2(IPC.SCAN_DONE, msg.payload);
  });
  scanProcess.on("exit", () => {
    scanProcess = null;
  });
}
async function stopScan() {
  if (!scanProcess) return;
  const proc = scanProcess;
  scanProcess = null;
  proc.postMessage({ type: "stop" });
  await new Promise((resolve) => {
    const t = setTimeout(() => {
      try {
        proc.kill();
      } catch {
      }
      resolve();
    }, 2e3);
    proc.once("exit", () => {
      clearTimeout(t);
      resolve();
    });
  });
}
function broadcast$1(channel, data) {
  for (const w of electron.BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, data);
  }
}
async function getSerialPort() {
  const { SerialPort } = await import("serialport");
  return SerialPort;
}
const openPorts = /* @__PURE__ */ new Map();
async function openTerminal(config) {
  await closeTerminal(config.id);
  const SerialPort = await getSerialPort();
  const port = new SerialPort({
    path: config.serialPort,
    baudRate: config.baudRate ?? 9600,
    dataBits: config.dataBits ?? 8,
    stopBits: config.stopBits ?? 1,
    parity: config.parity ?? "none",
    autoOpen: false
  });
  port.on("data", (data) => {
    broadcast$1(IPC.TERMINAL_DATA, { connectionId: config.id, bytes: Array.from(data) });
  });
  port.on("error", (err) => {
    broadcast$1(IPC.TERMINAL_STATUS, { connectionId: config.id, status: "error", error: err.message });
  });
  port.on("close", () => {
    broadcast$1(IPC.TERMINAL_STATUS, { connectionId: config.id, status: "idle" });
    openPorts.delete(config.id);
  });
  await new Promise((resolve, reject) => {
    port.open((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
  openPorts.set(config.id, port);
  broadcast$1(IPC.TERMINAL_STATUS, { connectionId: config.id, status: "connected" });
}
async function closeTerminal(connectionId) {
  const port = openPorts.get(connectionId);
  if (!port) return;
  openPorts.delete(connectionId);
  if (port.isOpen) {
    await new Promise((resolve) => port.close(() => resolve()));
  }
}
function writeTerminal(connectionId, bytes) {
  const port = openPorts.get(connectionId);
  if (port?.isOpen) port.write(Buffer.from(bytes));
}
async function closeAllTerminals() {
  for (const id of [...openPorts.keys()]) {
    await closeTerminal(id);
  }
}
let pollTimer = null;
let listenersRegistered = false;
function broadcast(channel, data) {
  for (const w of electron.BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, data);
  }
}
function setupUpdater(autoDownload) {
  electronUpdater.autoUpdater.autoDownload = autoDownload;
  electronUpdater.autoUpdater.autoInstallOnAppQuit = false;
  electronUpdater.autoUpdater.forceDevUpdateConfig = true;
  if (listenersRegistered) return;
  listenersRegistered = true;
  electronUpdater.autoUpdater.on("checking-for-update", () => {
    broadcast(IPC.UPDATE_CHECKING);
  });
  electronUpdater.autoUpdater.on("update-available", (info) => {
    broadcast(IPC.UPDATE_AVAILABLE, {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: typeof info.releaseNotes === "string" ? info.releaseNotes : Array.isArray(info.releaseNotes) ? info.releaseNotes.map((n) => n.note ?? "").join("\n") : ""
    });
  });
  electronUpdater.autoUpdater.on("update-not-available", () => {
    broadcast(IPC.UPDATE_NOT_AVAILABLE);
  });
  electronUpdater.autoUpdater.on("download-progress", (p) => {
    broadcast(IPC.UPDATE_PROGRESS, {
      percent: p.percent,
      bytesPerSecond: p.bytesPerSecond,
      transferred: p.transferred,
      total: p.total
    });
  });
  electronUpdater.autoUpdater.on("update-downloaded", (info) => {
    broadcast(IPC.UPDATE_DOWNLOADED, { version: info.version });
  });
  electronUpdater.autoUpdater.on("error", (err) => {
    const msg = err?.message ?? String(err);
    broadcast(IPC.UPDATE_ERROR, msg);
    console.error("[updater] error:", msg);
  });
}
async function checkForUpdates() {
  broadcast(IPC.UPDATE_CHECKING);
  try {
    await electronUpdater.autoUpdater.checkForUpdates();
  } catch (err) {
    const msg = err?.message ?? String(err);
    broadcast(IPC.UPDATE_ERROR, msg);
    console.error("[updater] checkForUpdates failed:", msg);
  }
}
async function downloadUpdate() {
  try {
    await electronUpdater.autoUpdater.downloadUpdate();
  } catch (err) {
    console.error("[updater] downloadUpdate failed:", err);
  }
}
function installUpdate() {
  if (utils.is.dev) {
    broadcast(IPC.UPDATE_ERROR, "Install not available in dev mode — use a packaged build to test installation");
    return;
  }
  electronUpdater.autoUpdater.quitAndInstall(false, true);
}
function setAutoDownload(enabled) {
  electronUpdater.autoUpdater.autoDownload = enabled;
}
function startPolling(intervalHours) {
  stopPolling();
  const ms = Math.max(1, intervalHours) * 60 * 60 * 1e3;
  pollTimer = setInterval(() => checkForUpdates(), ms);
}
function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
function registerIpcHandlers(win) {
  electron.ipcMain.handle(IPC.CONNECTION_CONNECT, async (_evt, config) => {
    if (config.protocol === "serial-terminal") {
      await openTerminal(config);
    } else {
      console.log(`[ipc] CONNECTION_CONNECT: "${config.name}" protocol=${config.protocol} groups=${config.registerGroups.length}`);
      await spawnWorker(config);
    }
  });
  electron.ipcMain.handle(IPC.CONNECTION_DISCONNECT, (_evt, connectionId) => {
    killWorker(connectionId);
    closeTerminal(connectionId);
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
  electron.ipcMain.handle(IPC.RAW_FRAME_SEND, (_evt, { connectionId, bytes }) => {
    sendRawFrame(connectionId, bytes);
  });
  electron.ipcMain.handle(IPC.LOG_EXPORT, async () => {
    const { filePath } = await electron.dialog.showSaveDialog({
      defaultPath: `modbus-log-${(/* @__PURE__ */ new Date()).toISOString().split("T")[0]}.csv`,
      filters: [{ name: "CSV", extensions: ["csv"] }]
    });
    if (filePath) win.webContents.send("log:export-request", filePath);
  });
  electron.ipcMain.handle(IPC.DIAGNOSTICS_RUN, () => {
    return { ok: true, message: "Diagnostics: see connection status indicators in sidebar." };
  });
  electron.ipcMain.handle(IPC.POLLING_PAUSE, (_evt, connectionId) => {
    pausePolling(connectionId);
  });
  electron.ipcMain.handle(IPC.POLLING_RESUME, (_evt, connectionId) => {
    resumePolling(connectionId);
  });
  electron.ipcMain.handle(IPC.SCAN_START, async (_evt, { config, timeoutMs }) => {
    await startScan(config, timeoutMs);
  });
  electron.ipcMain.handle(IPC.SCAN_STOP, async () => {
    await stopScan();
  });
  electron.ipcMain.handle(IPC.TERMINAL_OPEN, async (_evt, config) => {
    await openTerminal(config);
  });
  electron.ipcMain.handle(IPC.TERMINAL_CLOSE, async (_evt, connectionId) => {
    await closeTerminal(connectionId);
  });
  electron.ipcMain.handle(IPC.TERMINAL_WRITE, (_evt, { connectionId, bytes }) => {
    writeTerminal(connectionId, bytes);
  });
  electron.ipcMain.handle(IPC.SERIAL_PORTS_LIST, async () => {
    try {
      const { SerialPort } = await import("serialport");
      const ports = await SerialPort.list();
      ports.sort((a, b) => {
        const ma = a.path.match(/COM(\d+)/i);
        const mb = b.path.match(/COM(\d+)/i);
        if (ma && mb) return parseInt(ma[1]) - parseInt(mb[1]);
        return a.path.localeCompare(b.path);
      });
      return ports.map((p) => {
        if (p.friendlyName) return { path: p.path, label: p.friendlyName };
        const extra = p.manufacturer ?? "";
        return { path: p.path, label: extra ? `${p.path} — ${extra}` : p.path };
      });
    } catch {
      return [];
    }
  });
  electron.ipcMain.handle(IPC.WINDOW_POP, (_evt, connectionId) => {
    for (const w of electron.BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send(IPC.WINDOW_POP_OUT, connectionId);
    }
    const popup = new electron.BrowserWindow({
      width: 900,
      height: 700,
      minWidth: 400,
      minHeight: 300,
      show: false,
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, "../preload/index.js"),
        sandbox: false,
        nodeIntegration: false,
        contextIsolation: true
      }
    });
    popup.on("closed", () => {
      for (const w of electron.BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send(IPC.WINDOW_POP_IN, connectionId);
      }
    });
    popup.once("ready-to-show", () => popup.show());
    if (utils.is.dev && process.env["ELECTRON_RENDERER_URL"]) {
      popup.loadURL(`${process.env["ELECTRON_RENDERER_URL"]}?panel=${connectionId}`);
    } else {
      popup.loadFile(path.join(__dirname, "../renderer/index.html"), { query: { panel: connectionId } });
    }
  });
  electron.ipcMain.handle(IPC.UPDATE_CHECK, async () => {
    await checkForUpdates();
  });
  electron.ipcMain.handle(IPC.UPDATE_DOWNLOAD, async () => {
    await downloadUpdate();
  });
  electron.ipcMain.handle(IPC.UPDATE_INSTALL, () => {
    installUpdate();
  });
  electron.ipcMain.handle(IPC.UPDATE_SET_AUTO, (_evt, enabled) => {
    setAutoDownload(enabled);
  });
  electron.ipcMain.handle(IPC.UPDATE_SET_INTERVAL, (_evt, hours) => {
    startPolling(hours);
  });
}
async function cleanupIpc() {
  await stopScan();
  killAll();
  await closeAllTerminals();
  electron.ipcMain.removeAllListeners();
}
process.on("uncaughtException", (err) => {
  if (err.code === "EIO" || err.code === "EPIPE" || err.code === "ERR_STREAM_DESTROYED") return;
  console.error("[main] uncaughtException:", err);
});
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
  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
    if (utils.is.dev) mainWindow.webContents.openDevTools();
  });
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
  setupUpdater(true);
  setTimeout(() => checkForUpdates(), 4e3);
  startPolling(6);
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") electron.app.quit();
});
let _quitting = false;
electron.app.on("before-quit", (event) => {
  if (_quitting) return;
  event.preventDefault();
  _quitting = true;
  killAll();
  setTimeout(() => {
    cleanupIpc();
    electron.app.quit();
  }, 1500);
});
