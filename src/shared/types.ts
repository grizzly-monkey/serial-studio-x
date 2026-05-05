export type Protocol = 'tcp' | 'rtu' | 'ascii' | 'udp' | 'rtu-tcp' | 'serial-terminal'
export type DisplayBase = 'hex' | 'dec' | 'inherit'
export type DataType = 'uint16' | 'int16' | 'float32' | 'uint32' | 'int32' | 'binary' | 'hex' | 'ascii'
                     | 'float64' | 'int64' | 'uint64'

export function dataTypeRegCount(dataType: DataType): number {
  switch (dataType) {
    case 'float64': case 'int64': case 'uint64': return 4
    case 'float32': case 'uint32': case 'int32': return 2
    default: return 1
  }
}
export type ByteOrder = 'ABCD' | 'CDAB' | 'BADC' | 'DCBA'
export type WidgetType = 'table' | 'sparkline' | 'gauge'
export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'disconnecting' | 'error'
export type AlertState = 'ok' | 'low' | 'high'
export type ReadFC = 1 | 2 | 3 | 4 | 23
export type ScalingMode = 'linear' | 'twoPoint'

export interface AlertConfig {
  enabled: boolean
  lowLimit: number | null
  highLimit: number | null
  notifyOS: boolean
}

export interface ColorRule {
  op: '<' | '<=' | '>' | '>=' | '==' | '!='
  value: number
  fg?: string
  bg?: string
}

export interface RegisterConfig {
  address: number
  label: string
  dataType: DataType
  byteOrder: ByteOrder
  scale: number
  offset: number
  unit: string
  displayBase: DisplayBase
  widgetType: WidgetType
  gaugeMin: number
  gaugeMax: number
  sparklineWindowSecs: number
  alert: AlertConfig
  // Value name mapping: integer value → display label (e.g. {"0":"Stopped","1":"Running"})
  valueNameMap: Record<string, string>
  // Named bits: index = bit position 0–15
  bitNames: string[]
  // Conditional colour rules evaluated in order
  colorRules: ColorRule[]
  // Two-point calibration
  scalingMode: ScalingMode
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface RegisterGroup {
  id: string
  label: string
  functionCode: ReadFC
  startAddress: number
  count: number
  registers: RegisterConfig[]
}

export interface LoggingOptions {
  onChangeOnly: boolean
  errorsOnly: boolean
  appendMode: boolean
  midnightRotate: boolean
  trafficLogPath: string | null
}

export interface ConnectionConfig {
  id: string
  name: string
  protocol: Protocol
  // TCP / UDP
  host?: string
  port?: number
  unitId?: number
  // Serial (RTU / ASCII)
  serialPort?: string
  baudRate?: number
  dataBits?: 5 | 6 | 7 | 8
  stopBits?: 1 | 2
  parity?: 'none' | 'even' | 'odd' | 'mark' | 'space'
  flowControl?: 'none' | 'rts-cts' | 'xon-xoff'
  slaveId?: number
  rs485Mode?: boolean
  echoRemoval?: boolean
  // Timing
  pollIntervalMs: number
  responseTimeoutMs?: number
  interMessageDelayMs?: number
  // Misc
  enronMode?: boolean
  panelLayout?: { x: number; y: number; w: number; h: number }
  loggingOptions?: LoggingOptions
  registerGroups: RegisterGroup[]
  writeDefaults?: { address: string; value: string }
}

export type ThemeName = 'light' | 'dark' | 'hacker' | 'warp' | 'nord' | 'monokai' | 'solarized' | 'cyberpunk'

export interface WorkspaceSettings {
  preferredBase: 'hex' | 'dec'
  theme: ThemeName
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
