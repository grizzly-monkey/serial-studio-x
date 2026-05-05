import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { registerIpcHandlers, cleanupIpc } from './ipc-router'
import { killAll } from './worker-registry'
import { setupUpdater, checkForUpdates, startPolling } from './updater'

// Suppress broken-pipe / stdio errors that fire when utility-process workers
// exit during app shutdown and the parent tries to write to the dead pipe.
process.on('uncaughtException', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EIO' || err.code === 'EPIPE' || err.code === 'ERR_STREAM_DESTROYED') return
  console.error('[main] uncaughtException:', err)
})

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
    if (is.dev) mainWindow!.webContents.openDevTools()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  registerIpcHandlers(mainWindow)

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  // Auto-updater: set up listeners, check on startup, then poll every 6 hours.
  // Renderer can adjust autoDownload + interval via IPC once loaded.
  setupUpdater(true)
  setTimeout(() => checkForUpdates(), 4000)
  startPolling(6)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

let _quitting = false
app.on('before-quit', (event) => {
  if (_quitting) return
  event.preventDefault()
  _quitting = true
  // Send stop to all workers and give them time to close their connections
  killAll()
  setTimeout(() => {
    cleanupIpc()
    app.quit()
  }, 1500)
})
