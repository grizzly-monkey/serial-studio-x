export type Protocol = 'tcp' | 'rtu' | 'ascii'
export type DisplayBase = 'hex' | 'dec' | 'inherit'
export type DataType = 'uint16' | 'int16' | 'float32' | 'uint32' | 'int32' | 'binary' | 'hex' | 'ascii'
export type WidgetType = 'table' | 'sparkline' | 'gauge'
export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'disconnecting' | 'error'
export type AlertState = 'ok' | 'low' | 'high'
export type ReadFC = 1 | 2 | 3 | 4 | 23

export interface AlertConfig {
  enabled: boolean
  lowLimit: number | null
  highLimit: number | null
  notifyOS: boolean
}

export interface RegisterConfig {
  address: number
  label: string
  dataType: DataType
  scale: number
  offset: number
  unit: string
  displayBase: DisplayBase
  widgetType: WidgetType
  gaugeMin: number
  gaugeMax: number
  sparklineWindowSecs: number
  alert: AlertConfig
}

export interface RegisterGroup {
  id: string
  label: string
  functionCode: ReadFC
  startAddress: number
  count: number
  registers: RegisterConfig[]
}

export interface ConnectionConfig {
  id: string
  name: string
  protocol: Protocol
  host?: string
  port?: number
  unitId?: number
  serialPort?: string
  baudRate?: number
  dataBits?: 5 | 6 | 7 | 8
  stopBits?: 1 | 2
  parity?: 'none' | 'even' | 'odd' | 'mark' | 'space'
  flowControl?: 'none' | 'rts-cts' | 'xon-xoff'
  slaveId?: number
  pollIntervalMs: number
  panelLayout?: object
  registerGroups: RegisterGroup[]
}

export interface WorkspaceSettings {
  preferredBase: 'hex' | 'dec'
  theme: 'light' | 'dark'
  logDrawerOpen: boolean
}

export interface Workspace {
  schemaVersion: number
  name: string
  settings: WorkspaceSettings
  connections: ConnectionConfig[]
}

export interface RegisterValue {
  raw: number
  decoded: number | string
  timestamp: number
  alertState: AlertState
}

export interface SparklinePoint {
  timestamp: number
  value: number
}

export interface RawFrame {
  direction: 'tx' | 'rx'
  timestamp: number
  bytes: number[]
  connectionId: string
}

export interface LogEntry {
  id: string
  timestamp: number
  connectionId: string
  connectionName: string
  direction: 'tx' | 'rx'
  fc: number
  address: number
  rawHex: string
  rawDec: string
  decodedValue: string
  unit: string
  status: 'ok' | 'error' | 'alert'
  message?: string
}

export interface WorkerPollResult {
  connectionId: string
  groupId: string
  startAddress: number
  values: number[]
  timestamp: number
  rxHex: string
  rawFrame?: RawFrame
}

export interface WorkerStatus {
  connectionId: string
  status: ConnectionStatus
  error?: string
}
