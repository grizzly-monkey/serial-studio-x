import React from 'react'

interface State { error: Error | null }

export default class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] caught render error:', error)
    console.error('[ErrorBoundary] component stack:', info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9000,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{
            background: '#1e293b', border: '1px solid #f87171', borderRadius: 10,
            padding: 24, maxWidth: 520, width: '90%', color: '#f1f5f9'
          }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#f87171', marginBottom: 10 }}>
              Render error (check DevTools console for full stack)
            </div>
            <pre style={{ fontSize: 11, color: '#fbbf24', whiteSpace: 'pre-wrap', margin: 0 }}>
              {this.state.error.message}
            </pre>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
