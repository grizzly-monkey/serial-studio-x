import { app, dialog } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, readdirSync } from 'fs'
import type { Workspace } from '../shared/types'

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

const logStreams = new Map<string, string>()

export async function startLogging(connectionId: string, connectionName: string): Promise<void> {
  const { filePath } = await dialog.showSaveDialog({
    defaultPath: `${connectionName}-${new Date().toISOString().split('T')[0]}.csv`,
    filters: [{ name: 'CSV', extensions: ['csv'] }]
  })
  if (!filePath) return
  writeFileSync(filePath, 'timestamp,connection,fc,address,raw_hex,raw_dec,decoded_value,unit,status\n')
  logStreams.set(connectionId, filePath)
}

export function stopLogging(connectionId: string): void {
  logStreams.delete(connectionId)
}

export function appendLog(connectionId: string, row: string): void {
  const path = logStreams.get(connectionId)
  if (path) appendFileSync(path, row + '\n')
}

export function isLogging(connectionId: string): boolean {
  return logStreams.has(connectionId)
}

function migrate(ws: Workspace): Workspace {
  if (!ws.schemaVersion) ws.schemaVersion = 1
  if (!ws.settings) ws.settings = { preferredBase: 'dec', theme: 'light', logDrawerOpen: false }
  if (!ws.connections) ws.connections = []
  return ws
}
