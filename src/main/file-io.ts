import { app, dialog } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, readdirSync } from 'fs'
import type { Workspace, LoggingOptions } from '../shared/types'

const SCHEMA_VERSION = 1

function getWorkspacesDir(): string {
  return join(app.getPath('userData'), 'workspaces')
}

function ensureWorkspacesDir(): void {
  const dir = getWorkspacesDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

export function listWorkspaces(): string[] {
  ensureWorkspacesDir()
  return readdirSync(getWorkspacesDir())
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''))
}

export function loadWorkspace(name: string): Workspace | null {
  const path = join(getWorkspacesDir(), `${name}.json`)
  if (!existsSync(path)) return null
  try {
    return migrate(JSON.parse(readFileSync(path, 'utf8')) as Workspace)
  } catch { return null }
}

export function saveWorkspace(name: string, workspace: Workspace): void {
  ensureWorkspacesDir()
  const path = join(getWorkspacesDir(), `${name}.json`)
  writeFileSync(path, JSON.stringify({ ...workspace, schemaVersion: SCHEMA_VERSION }, null, 2))
}

export async function exportWorkspace(workspace: Workspace): Promise<void> {
  const { filePath } = await dialog.showSaveDialog({
    defaultPath: `${workspace.name}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  })
  if (filePath) writeFileSync(filePath, JSON.stringify(workspace, null, 2))
}

export async function importWorkspace(): Promise<Workspace | null> {
  const { filePaths } = await dialog.showOpenDialog({
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile']
  })
  if (!filePaths[0]) return null
  try {
    return migrate(JSON.parse(readFileSync(filePaths[0], 'utf8')) as Workspace)
  } catch { return null }
}

interface LogState {
  filePath: string
  options: LoggingOptions
  lastDate: string
  prevValues: Map<string, string>
}

const logStreams = new Map<string, LogState>()

export async function startLogging(connectionId: string, connectionName: string, options?: Partial<LoggingOptions>): Promise<void> {
  const opts: LoggingOptions = {
    onChangeOnly: false, errorsOnly: false, appendMode: false,
    midnightRotate: false, trafficLogPath: null,
    ...options
  }
  const today = new Date().toISOString().split('T')[0]
  const { filePath } = await dialog.showSaveDialog({
    defaultPath: `${connectionName}-${today}.csv`,
    filters: [{ name: 'CSV', extensions: ['csv'] }]
  })
  if (!filePath) return
  const header = 'timestamp,connection,fc,address,raw_hex,raw_dec,decoded_value,unit,status\n'
  if (opts.appendMode && existsSync(filePath)) {
    appendFileSync(filePath, header)
  } else {
    writeFileSync(filePath, header)
  }
  logStreams.set(connectionId, { filePath, options: opts, lastDate: today, prevValues: new Map() })
}

export function stopLogging(connectionId: string): void {
  logStreams.delete(connectionId)
}

export function appendLog(connectionId: string, row: string, status?: string, valueKey?: string, decodedStr?: string): void {
  const state = logStreams.get(connectionId)
  if (!state) return

  if (state.options.errorsOnly && status !== 'alert' && status !== 'error') return

  if (state.options.onChangeOnly && valueKey !== undefined && decodedStr !== undefined) {
    const prev = state.prevValues.get(valueKey)
    if (prev === decodedStr) return
    state.prevValues.set(valueKey, decodedStr)
  }

  if (state.options.midnightRotate) {
    const today = new Date().toISOString().split('T')[0]
    if (today !== state.lastDate) {
      state.lastDate = today
      const newPath = state.filePath.replace(/(-\d{4}-\d{2}-\d{2})?(\.\w+)$/, `-${today}$2`)
      writeFileSync(newPath, 'timestamp,connection,fc,address,raw_hex,raw_dec,decoded_value,unit,status\n')
      state.filePath = newPath
    }
  }

  appendFileSync(state.filePath, row + '\n')
}

export function appendTrafficLog(connectionId: string, frame: string): void {
  const state = logStreams.get(connectionId)
  if (!state?.options.trafficLogPath) return
  appendFileSync(state.options.trafficLogPath, frame + '\n')
}

export function isLogging(connectionId: string): boolean {
  return logStreams.has(connectionId)
}

export function getLoggingOptions(connectionId: string): LoggingOptions | null {
  return logStreams.get(connectionId)?.options ?? null
}

function migrate(ws: Workspace): Workspace {
  if (!ws.schemaVersion) ws.schemaVersion = 1
  if (!ws.settings) ws.settings = { preferredBase: 'dec', theme: 'light', logDrawerOpen: false }
  if (!ws.connections) ws.connections = []
  return ws
}
