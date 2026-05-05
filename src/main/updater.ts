import { autoUpdater } from 'electron-updater'
import { BrowserWindow } from 'electron'
import { is } from '@electron-toolkit/utils'
import { IPC } from '../shared/ipc-channels'

let pollTimer: ReturnType<typeof setInterval> | null = null
let listenersRegistered = false

function broadcast(channel: string, data?: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, data)
  }
}

export function setupUpdater(autoDownload: boolean): void {
  if (is.dev) return

  autoUpdater.autoDownload = autoDownload
  autoUpdater.autoInstallOnAppQuit = false

  // Register event listeners once only
  if (listenersRegistered) return
  listenersRegistered = true

  autoUpdater.on('checking-for-update', () => {
    broadcast(IPC.UPDATE_CHECKING)
  })

  autoUpdater.on('update-available', (info) => {
    broadcast(IPC.UPDATE_AVAILABLE, {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: typeof info.releaseNotes === 'string'
        ? info.releaseNotes
        : Array.isArray(info.releaseNotes)
          ? info.releaseNotes.map((n: { note?: string }) => n.note ?? '').join('\n')
          : ''
    })
  })

  autoUpdater.on('update-not-available', () => {
    broadcast(IPC.UPDATE_NOT_AVAILABLE)
  })

  autoUpdater.on('download-progress', (p) => {
    broadcast(IPC.UPDATE_PROGRESS, {
      percent: p.percent,
      bytesPerSecond: p.bytesPerSecond,
      transferred: p.transferred,
      total: p.total,
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    broadcast(IPC.UPDATE_DOWNLOADED, { version: info.version })
  })

  autoUpdater.on('error', (err) => {
    // Filter out non-critical "no update.yml" errors in unexpected environments
    const msg = err?.message ?? String(err)
    broadcast(IPC.UPDATE_ERROR, msg)
    console.error('[updater] error:', msg)
  })
}

export async function checkForUpdates(): Promise<void> {
  if (is.dev) return
  try {
    await autoUpdater.checkForUpdates()
  } catch (err) {
    console.error('[updater] checkForUpdates failed:', err)
  }
}

export async function downloadUpdate(): Promise<void> {
  if (is.dev) return
  try {
    await autoUpdater.downloadUpdate()
  } catch (err) {
    console.error('[updater] downloadUpdate failed:', err)
  }
}

export function installUpdate(): void {
  if (is.dev) return
  autoUpdater.quitAndInstall(false, true)
}

export function setAutoDownload(enabled: boolean): void {
  if (!is.dev) autoUpdater.autoDownload = enabled
}

export function startPolling(intervalHours: number): void {
  if (is.dev) return
  stopPolling()
  const ms = Math.max(1, intervalHours) * 60 * 60 * 1000
  pollTimer = setInterval(() => checkForUpdates(), ms)
}

export function stopPolling(): void {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}
