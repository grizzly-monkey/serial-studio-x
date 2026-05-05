import { create } from 'zustand'
import type { Workspace, ConnectionConfig, WorkspaceSettings } from '../../shared/types'

export const DEFAULT_WORKSPACE: Workspace = {
  schemaVersion: 1,
  name: 'Default',
  settings: { preferredBase: 'dec', theme: 'dark', logDrawerOpen: false },
  connections: [],
}

// Growloc sensor connections — loaded on demand via the GROWLOC secret menu (G×4).
// Not included in the default workspace to keep the app clean for general use.
export const GROWLOC_CONNECTIONS: ConnectionConfig[] = [
  {
    id: 'phg206a-default',
    name: 'PHG-206A pH Sensor',
    protocol: 'rtu',
    serialPort: '/dev/cu.usbmodem5ACC0325801',
    baudRate: 9600,
    dataBits: 8,
    stopBits: 1,
    parity: 'none',
    flowControl: 'none',
    slaveId: 2,
    pollIntervalMs: 5000,
    registerGroups: [
      {
        id: 'phg-ph-group',
        label: 'pH',
        functionCode: 3,
        startAddress: 0,
        count: 2,
        registers: [
          {
            address: 0,
            label: 'pH Value',
            dataType: 'uint16',
            scale: 0.01,
            offset: 0,
            unit: 'pH',
            displayBase: 'dec',
            widgetType: 'table',
            gaugeMin: 0,
            gaugeMax: 14,
            sparklineWindowSecs: 60,
            alert: { enabled: false, lowLimit: null, highLimit: null, notifyOS: false }
          }
        ]
      },
      {
        id: 'phg-temp-group',
        label: 'Temperature',
        functionCode: 3,
        startAddress: 2,
        count: 2,
        registers: [
          {
            address: 2,
            label: 'Temperature',
            dataType: 'uint16',
            scale: 0.1,
            offset: 0,
            unit: '°C',
            displayBase: 'dec',
            widgetType: 'table',
            gaugeMin: 0,
            gaugeMax: 50,
            sparklineWindowSecs: 60,
            alert: { enabled: false, lowLimit: null, highLimit: null, notifyOS: false }
          }
        ]
      }
    ],
    writeDefaults: { address: '48195', value: '3' }
  },
  {
    id: 'ddm206a-default',
    name: 'DDM-206A EC Sensor',
    protocol: 'rtu',
    serialPort: '/dev/cu.usbmodem5ACC0325801',
    baudRate: 9600,
    dataBits: 8,
    stopBits: 1,
    parity: 'none',
    flowControl: 'none',
    slaveId: 1,
    pollIntervalMs: 5000,
    registerGroups: [
      {
        id: 'ddm-ec-group',
        label: 'Conductivity',
        functionCode: 3,
        startAddress: 0,
        count: 2,
        registers: [
          {
            address: 0,
            label: 'EC Value',
            dataType: 'uint16',
            scale: 0.1,
            offset: 0,
            unit: 'μS/cm',
            displayBase: 'dec',
            widgetType: 'table',
            gaugeMin: 0,
            gaugeMax: 2000,
            sparklineWindowSecs: 60,
            alert: { enabled: false, lowLimit: null, highLimit: null, notifyOS: false }
          }
        ]
      },
      {
        id: 'ddm-temp-group',
        label: 'Temperature',
        functionCode: 3,
        startAddress: 2,
        count: 2,
        registers: [
          {
            address: 2,
            label: 'Temperature',
            dataType: 'uint16',
            scale: 0.1,
            offset: 0,
            unit: '°C',
            displayBase: 'dec',
            widgetType: 'table',
            gaugeMin: 0,
            gaugeMax: 50,
            sparklineWindowSecs: 60,
            alert: { enabled: false, lowLimit: null, highLimit: null, notifyOS: false }
          }
        ]
      }
    ],
    writeDefaults: { address: '48195', value: '2' }
  }
]

interface WorkspaceStore {
  workspace: Workspace
  profileNames: string[]
  activeProfile: string
  setWorkspace: (ws: Workspace) => void
  setSettings: (s: Partial<WorkspaceSettings>) => void
  addConnection: (c: ConnectionConfig) => void
  updateConnection: (id: string, patch: Partial<ConnectionConfig>) => void
  removeConnection: (id: string) => void
  setProfileNames: (names: string[]) => void
  setActiveProfile: (name: string) => void
}

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  workspace: DEFAULT_WORKSPACE,
  profileNames: [],
  activeProfile: 'Default',

  setWorkspace: (ws) => set({ workspace: ws }),

  setSettings: (s) =>
    set((state) => ({
      workspace: { ...state.workspace, settings: { ...state.workspace.settings, ...s } }
    })),

  addConnection: (c) =>
    set((state) => ({
      workspace: { ...state.workspace, connections: [...state.workspace.connections, c] }
    })),

  updateConnection: (id, patch) =>
    set((state) => ({
      workspace: {
        ...state.workspace,
        connections: state.workspace.connections.map(c => c.id === id ? { ...c, ...patch } : c)
      }
    })),

  removeConnection: (id) =>
    set((state) => ({
      workspace: {
        ...state.workspace,
        connections: state.workspace.connections.filter(c => c.id !== id)
      }
    })),

  setProfileNames: (names) => set({ profileNames: names }),
  setActiveProfile: (name) => set({ activeProfile: name }),
}))
