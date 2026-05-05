import { create } from 'zustand'
import type { ConnectionStatus, RegisterValue, SparklinePoint, LogEntry, RawFrame } from '../../shared/types'

interface ConnectionLiveState {
  status: ConnectionStatus
  error?: string
  registerValues: Record<number, RegisterValue>
  sparklineData: Record<number, SparklinePoint[]>
  loggingActive: boolean
  pollingPaused: boolean
}

const defaultConnState = (): ConnectionLiveState => ({
  status: 'idle',
  registerValues: {},
  sparklineData: {},
  loggingActive: false,
  pollingPaused: false,
})

interface ConnectionsStore {
  connections: Record<string, ConnectionLiveState>
  logEntries: LogEntry[]
  rawFrames: Record<string, RawFrame[]>
  poppedOutIds: Set<string>
  setStatus: (id: string, status: ConnectionStatus, error?: string) => void
  setRegisterValues: (id: string, values: RegisterValue[], addresses: number[]) => void
  appendSparkline: (id: string, address: number, point: SparklinePoint, maxPoints: number) => void
  setLogging: (id: string, active: boolean) => void
  setPollPaused: (id: string, paused: boolean) => void
  clearLog: () => void
  clearConnectionLog: (connectionId: string) => void
  appendLog: (entry: LogEntry) => void
  appendFrame: (connectionId: string, frame: RawFrame) => void
  removeConnection: (id: string) => void
  popOut: (id: string) => void
  popIn: (id: string) => void
}

export const useConnectionsStore = create<ConnectionsStore>((set) => ({
  connections: {},
  logEntries: [],
  rawFrames: {},
  poppedOutIds: new Set<string>(),

  setStatus: (id, status, error) =>
    set((state) => ({
      connections: {
        ...state.connections,
        [id]: { ...(state.connections[id] ?? defaultConnState()), status, error }
      }
    })),

  setRegisterValues: (id, values, addresses) =>
    set((state) => {
      const existing = state.connections[id] ?? defaultConnState()
      const next = { ...existing.registerValues }
      addresses.forEach((addr, i) => { if (values[i]) next[addr] = values[i] })
      return { connections: { ...state.connections, [id]: { ...existing, registerValues: next } } }
    }),

  appendSparkline: (id, address, point, maxPoints) =>
    set((state) => {
      const conn = state.connections[id]
      if (!conn) return state
      const existing = conn.sparklineData[address] ?? []
      const next = [...existing, point].slice(-maxPoints)
      return {
        connections: {
          ...state.connections,
          [id]: { ...conn, sparklineData: { ...conn.sparklineData, [address]: next } }
        }
      }
    }),

  setLogging: (id, active) =>
    set((state) => ({
      connections: {
        ...state.connections,
        [id]: { ...(state.connections[id] ?? defaultConnState()), loggingActive: active }
      }
    })),

  setPollPaused: (id, paused) =>
    set((state) => ({
      connections: {
        ...state.connections,
        [id]: { ...(state.connections[id] ?? defaultConnState()), pollingPaused: paused }
      }
    })),

  clearLog: () => set({ logEntries: [] }),

  clearConnectionLog: (connectionId) =>
    set((state) => ({
      logEntries: state.logEntries.filter(e => e.connectionId !== connectionId)
    })),

  appendLog: (entry) =>
    set((state) => ({ logEntries: [...state.logEntries.slice(-50000), entry] })),

  appendFrame: (connectionId, frame) =>
    set((state) => ({
      rawFrames: {
        ...state.rawFrames,
        [connectionId]: [...(state.rawFrames[connectionId] ?? []).slice(-200), frame]
      }
    })),

  removeConnection: (id) =>
    set((state) => {
      const { [id]: _, ...rest } = state.connections
      return { connections: rest }
    }),

  popOut: (id) =>
    set((state) => {
      const next = new Set(state.poppedOutIds)
      next.add(id)
      return { poppedOutIds: next }
    }),

  popIn: (id) =>
    set((state) => {
      const next = new Set(state.poppedOutIds)
      next.delete(id)
      return { poppedOutIds: next }
    }),
}))
