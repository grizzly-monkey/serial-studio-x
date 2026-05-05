# Calibration Wizard — Guided Step-by-Step UI

**Date:** 2026-05-06  
**Status:** Approved  
**Scope:** Rewrite `CalibrationWizard.tsx` to replace the flat `StepCard` list with a sequential, timer-driven guided flow for both pH and EC sensors.

---

## Problem

The current wizard shows all steps at once and lets the user click "Apply" whenever they like. It gives no guidance on timing, provides no feedback on whether the sensor is actually responding, and does nothing to enforce the correct sequence. Users can — and do — skip the stabilisation wait and calibrate with an unstable reading.

---

## Goals

- Guide users through each calibration step one at a time, in sequence.
- Enforce a mandatory stabilisation timer per step; show a live countdown.
- Display live sensor readings throughout the timer so users can see the reading settling.
- Block the "Calibrate" button until the timer expires **and** a valid reading is confirmed.
- If the probe is not responding at timer expiry, show a clear error and allow retry of that step.
- Mark optional steps (Alkali, Temp) so users can skip them.
- Apply the same guided pattern to both pH and EC sensors.

---

## Component Architecture

### New: `GuidedStep`

A self-contained component encapsulating the full per-step lifecycle. It knows nothing about registers or sensors — it fires callbacks.

**Props:**
```ts
interface GuidedStepProps {
  stepNumber: number
  title: string
  instruction: string
  timerSeconds: number
  isOptional?: boolean
  isLocked: boolean        // true = dimmed row, no interaction
  isDone: boolean          // true = collapsed done state
  doneLabel?: string       // e.g. "Calibrated at 6.87 pH"
  isSkipped?: boolean      // true = collapsed skipped state
  liveValue: number | undefined   // from parent reading Zustand store
  liveUnit: string                // e.g. "pH", "μS/cm", "°C"
  tempValue?: number | undefined  // secondary reading for context
  isConnected: boolean
  onCalibrate: (inputValue?: number) => Promise<void>  // performs the register write
  onComplete: (readingValue: number) => void           // called after write succeeds; parent advances currentStep
  onSkip?: () => void
  hasInput?: boolean        // renders input field after timer (Temp + EC Slope)
  inputLabel?: string       // e.g. "Actual temp (°C)", "Standard solution (μS/cm)"
  inputDefault?: number     // pre-fill with liveValue when timer expires
  inputStep?: number        // 0.1 for temp, 1 for EC slope
}
```

**Internal phase state machine:**
```
idle ──(step unlocked)──► counting ──(timer=0, valid reading)──► valid ──(Calibrate clicked)──► done
                                  └──(timer=0, no valid reading)──► invalid ──(Retry clicked)──► counting
```

- `counting`: countdown timer running, live reading displayed, no action buttons.
- `valid`: timer expired, reading confirmed. Shows large current reading. Shows "Calibrate" button (and input field if `hasInput`). Optional steps also show "Skip".
- `invalid`: timer expired, reading missing or sensor disconnected. Shows error box with "↺ Retry This Step" button.
- `done`: write succeeded. Collapses to a single line showing the done label. Parent advances `currentStep`.
- Locked steps render as a dimmed single-line row with a lock icon.
- Skipped steps render as a dimmed single-line row with a dash icon.

The timer starts automatically via a `useEffect` on `isLocked`: when `isLocked` changes to `false` and the internal phase is still `idle`, the phase transitions to `counting` and the countdown begins. No manual "Start" button. Switching tabs (pH ↔ EC) remounts the respective calibration component, resetting all step progress.

### New: `StepperBar`

Horizontal step indicator rendered above the step list.

**Props:**
```ts
interface StepperBarProps {
  steps: Array<{ title: string; optional?: boolean }>
  currentIndex: number
  outcomes: Array<'pending' | 'done' | 'skipped'>
}
```

Renders numbered circles connected by lines. Active step is blue, done steps are green with a checkmark, skipped steps are grey with a dash, locked steps are dimmed outlines. Optional steps show a small amber "optional" badge below their label.

### Modified: `PhCalibration` and `EcCalibration`

Become thin orchestrators. Each holds:
- `currentStep: number` state (0-indexed)
- `outcomes: Array<'pending' | 'done' | 'skipped'>` state
- A static step config array (see below)
- `onComplete(stepIndex, readingValue)` — advances `currentStep`, records `done`
- `onSkip(stepIndex)` — advances `currentStep`, records `skipped`

Live reading values are read from `useConnectionsStore` in the parent and passed down as props so `GuidedStep` stays free of store imports.

---

## Step Sequences

### pH — PHG-206A (`phg206a-default`, slave ID 2, poll 5 s)

| # | Title | Timer | Optional | Register (0-indexed) | Write value |
|---|-------|-------|----------|-----------------------|-------------|
| 1 | Zero Calibration — pH 6.86 | 5 min | no | 4096 (reg 44097) | 0 |
| 2 | Acid Slope — pH 4.00 | 5 min | no | 4098 (reg 44099) | 0 |
| 3 | Alkali Slope — pH 9.18 | 5 min | yes | 4100 (reg 44101) | 0 |
| 4 | Temperature Calibration | 30 s | yes | 4112 (reg 44113) | `round(actualTemp × 10)` |

Live reading register: `addr 0` (pH value), secondary `addr 2` (temp °C).  
Temp step: `hasInput: true`, `inputLabel: "Actual temp (°C)"`, `inputStep: 0.1`.

### EC — DDM-206A (`ddm206a-default`, slave ID 1, poll 5 s)

| # | Title | Timer | Optional | Register (0-indexed) | Write value |
|---|-------|-------|----------|-----------------------|-------------|
| 1 | Zero Calibration — In Air | 3 min | no | 4096 (reg 44097) | 0 |
| 2 | Slope — Standard Solution | 5 min | no | 4100 (reg 44101) | user input (μS/cm integer) |
| 3 | Temperature Calibration | 30 s | yes | 4112 (reg 44113) | `round(actualTemp × 10)` |

Live reading register: `addr 0` (EC μS/cm), secondary `addr 2` (temp °C).  
Slope step: `hasInput: true`, `inputLabel: "Standard solution (μS/cm)"`, `inputStep: 1`.  
Temp step: same as pH temp.

---

## Live Reading Validity

A reading is considered **valid** at timer expiry if both conditions hold:
1. `connections[id]?.status === 'connected'`
2. `connections[id]?.registerValues[addr]?.decoded` is a finite number

If either fails → phase transitions to `invalid`.

The validity check also runs when the user clicks "Calibrate" (guard against disconnect between timer expiry and button click). If the reading becomes invalid at that point, show an inline error without resetting the phase.

---

## Layout (within the existing modal)

```
┌─ Modal ─────────────────────────────────────────────────────┐
│  ← Back   CALIBRATION WIZARD                            ✕   │
│  ──────────────────────────────────────────────────────────  │
│  [pH — PHG-206A]  [EC — DDM-206A]                           │
│  ──────────────────────────────────────────────────────────  │
│  StepperBar: ①──────②──────③(opt)──────④(opt)              │
│  ──────────────────────────────────────────────────────────  │
│  ● Connected  ·  Slave ID 2  ·  polling every 5s            │
│  ──────────────────────────────────────────────────────────  │
│  [GuidedStep 1 — active, expanded]                           │
│  [GuidedStep 2 — locked, dimmed row]                         │
│  [GuidedStep 3 — locked, dimmed row]  optional               │
│  [GuidedStep 4 — locked, dimmed row]  optional               │
└─────────────────────────────────────────────────────────────┘
```

The modal width stays at 700 px. The body scrolls if steps overflow vertically.

---

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| Probe not connected when step starts | Timer still runs. At expiry, `invalid` phase. |
| Probe disconnects mid-countdown | Timer continues. At expiry, validity check fails → `invalid`. |
| Register write fails (network/timeout) | Inline error below "Calibrate" button. Phase stays `valid` so user can retry the write. |
| User clicks Calibrate but reading became invalid | Inline error: "Reading lost — check connection before saving." Phase stays `valid`. |
| Retry clicked on `invalid` step | Resets phase to `counting`, restarts the full timer. |

---

## What Is Not Changing

- The factory reset section (kept as-is, accessible after all steps).
- The `GrowlocMenu` shell and tab navigation.
- The `applyWrite` helper function.
- The `PH_ADDR` / `EC_ADDR` constants.
- The `LiveReading` component (may be reused or inlined into `GuidedStep`).
- The existing Zustand store — no store changes needed.
