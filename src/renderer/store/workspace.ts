import { create } from 'zustand'
import type { Workspace, ConnectionConfig, WorkspaceSettings } from '../../shared/types'

const DEFAULT_WORKSPACE: Workspace = {
  schemaVersion: 1,
  name: 'Default',
  settings: { preferredBase: 'dec', theme: 'light', logDrawerOpen: false },
  connections: []
}

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
