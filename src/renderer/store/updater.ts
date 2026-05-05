import { create } from 'zustand'

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'uptodate'
  | 'error'

export interface UpdateInfo {
  version: string
  releaseDate?: string
  releaseNotes?: string
}

export interface DownloadProgress {
  percent: number
  bytesPerSecond: number
  transferred: number
  total: number
}

interface UpdaterStore {
  status: UpdateStatus
  info: UpdateInfo | null
  progress: DownloadProgress | null
  error: string | null
  lastChecked: number | null
  setStatus: (s: UpdateStatus) => void
  setInfo: (info: UpdateInfo) => void
  setProgress: (p: DownloadProgress) => void
  setError: (e: string) => void
  setLastChecked: (t: number) => void
}

export const useUpdaterStore = create<UpdaterStore>((set) => ({
  status: 'idle',
  info: null,
  progress: null,
  error: null,
  lastChecked: null,
  setStatus: (status) => set({ status }),
  setInfo: (info) => set({ info }),
  setProgress: (progress) => set({ progress }),
  setError: (error) => set({ error }),
  setLastChecked: (lastChecked) => set({ lastChecked }),
}))
