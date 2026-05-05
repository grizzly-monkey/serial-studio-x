import { Notification } from 'electron'
import {AlertState, RegisterConfig} from "../shared/types";

const alertStates = new Map<string, AlertState>()

export function checkAlert(
  connectionId: string,
  reg: RegisterConfig,
  decoded: number | string
): AlertState {
  const key = `${connectionId}:${reg.address}`
  const prev = alertStates.get(key) ?? 'ok'
  const val = typeof decoded === 'number' ? decoded : null

  let next: AlertState = 'ok'
  if (val !== null && reg.alert.enabled) {
    if (reg.alert.lowLimit !== null && val < reg.alert.lowLimit) next = 'low'
    else if (reg.alert.highLimit !== null && val > reg.alert.highLimit) next = 'high'
  }

  if (next !== prev) {
    alertStates.set(key, next)
    if (reg.alert.notifyOS && Notification.isSupported()) {
      const title = next === 'ok'
        ? `✅ ${reg.label} recovered`
        : `⚠️ ${reg.label} alert`
      const body = next === 'ok'
        ? `Value ${val}${reg.unit} is back in range`
        : `Value ${val}${reg.unit} is ${next === 'low' ? 'below' : 'above'} limit`
      new Notification({ title, body }).show()
    }
  }

  return next
}

export function clearAlertState(connectionId: string): void {
  for (const key of alertStates.keys()) {
    if (key.startsWith(`${connectionId}:`)) alertStates.delete(key)
  }
}
