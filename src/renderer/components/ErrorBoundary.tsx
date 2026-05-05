import React from 'react'

interface Props {
  children: React.ReactNode
  /** If true, renders an inline panel-sized error card instead of full-screen */
  inline?: boolean
}

interface State { error: Error | null; copied: boolean }

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, copied: false }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error.message)
    console.error('[ErrorBoundary] stack:', info.componentStack)
  }

  private copyError = () => {
    const { error } = this.state
    if (!error) return
    const text = `${error.message}\n\n${error.stack ?? ''}`
    navigator.clipboard.writeText(text).then(() => {
      this.setState({ copied: true })
      setTimeout(() => this.setState({ copied: false }), 2000)
    })
  }

  private reload = () => window.location.reload()

  private reset = () => this.setState({ error: null })

  render() {
    const { error, copied } = this.state
    if (!error) return this.props.children

    if (this.props.inline) {
      return (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', padding: 16, gap: 8, background: 'var(--surface)',
        }}>
          <span style={{ fontSize: 20 }}>⚠</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--danger)' }}>Panel render error</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', maxWidth: 280 }}>
            {error.message}
          </span>
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <button onClick={this.reset} style={smallBtn('var(--primary)')}>Retry</button>
            <button onClick={this.copyError} style={smallBtn('var(--surface-2)', 'var(--text)')}>
              {copied ? 'Copied!' : 'Copy error'}
            </button>
          </div>
        </div>
      )
    }

    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 99999,
        background: 'var(--bg, #0f172a)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}>
        <div style={{
          maxWidth: 560, width: '100%',
          background: 'var(--surface, #1e293b)',
          border: '1px solid var(--danger, #ef4444)',
          borderRadius: 12, overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        }}>
          {/* Header */}
          <div style={{ background: 'rgba(239,68,68,0.12)', padding: '16px 20px', borderBottom: '1px solid rgba(239,68,68,0.3)' }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#f87171' }}>
              Application Error
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted, #94a3b8)', marginTop: 3 }}>
              An unexpected error crashed the renderer. Your workspace is safe.
            </div>
          </div>

          {/* Error message */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border, #334155)' }}>
            <pre style={{
              margin: 0, fontSize: 12, color: '#fbbf24',
              fontFamily: 'var(--font-mono, monospace)',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              maxHeight: 120, overflowY: 'auto',
            }}>
              {error.message}
            </pre>
          </div>

          {/* Stack trace — collapsible */}
          {error.stack && (
            <details style={{ padding: '0 20px' }}>
              <summary style={{
                fontSize: 11, color: 'var(--text-muted, #94a3b8)',
                cursor: 'pointer', padding: '10px 0', userSelect: 'none',
              }}>
                Stack trace
              </summary>
              <pre style={{
                margin: '0 0 12px', fontSize: 10,
                color: 'var(--text-muted, #94a3b8)',
                fontFamily: 'var(--font-mono, monospace)',
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                maxHeight: 180, overflowY: 'auto',
              }}>
                {error.stack}
              </pre>
            </details>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, padding: '14px 20px', borderTop: '1px solid var(--border, #334155)' }}>
            <button onClick={this.reload} style={actionBtn('var(--primary, #6366f1)', '#fff')}>
              Reload App
            </button>
            <button onClick={this.copyError} style={actionBtn('var(--surface-2, #334155)', 'var(--text, #f1f5f9)')}>
              {copied ? '✓ Copied' : 'Copy Error'}
            </button>
          </div>
        </div>
      </div>
    )
  }
}

function actionBtn(bg: string, color: string): React.CSSProperties {
  return {
    background: bg, color, border: 'none', borderRadius: 6,
    padding: '8px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 700,
  }
}

function smallBtn(bg: string, color = '#fff'): React.CSSProperties {
  return {
    background: bg, color, border: '1px solid var(--border)',
    borderRadius: 5, padding: '4px 10px', cursor: 'pointer', fontSize: 11, fontWeight: 600,
  }
}
