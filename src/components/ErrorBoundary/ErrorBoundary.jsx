import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          height: '100vh',
          width: '100vw',
          backgroundColor: 'var(--bg-void, #04060d)',
          color: '#f8fafc',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          fontFamily: 'sans-serif',
        }}>
          <div className="glass-panel" style={{
            maxWidth: '480px',
            width: '100%',
            padding: '36px',
            borderRadius: '24px',
            textAlign: 'center',
            background: 'rgba(18, 23, 42, 0.9)',
            border: '1px solid rgba(244, 63, 94, 0.4)',
            boxShadow: '0 0 30px rgba(244, 63, 94, 0.2)',
          }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '20px',
              background: 'rgba(244, 63, 94, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px auto',
              color: '#f43f5e',
            }}>
              <AlertTriangle size={36} />
            </div>

            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '12px' }}>
              Something Went Wrong
            </h2>

            <p style={{ fontSize: '0.9rem', color: '#94a3b8', marginBottom: '24px', lineHeight: '1.5' }}>
              An unexpected rendering error occurred. Your document content remains safe in local memory.
            </p>

            <button
              onClick={this.handleReload}
              className="glass-btn glass-btn-primary"
              style={{
                width: '100%',
                padding: '12px',
                justifyContent: 'center',
                gap: '8px',
                borderRadius: '12px',
                fontSize: '0.95rem',
                cursor: 'pointer',
              }}
            >
              <RotateCcw size={18} />
              <span>Reload Workspace</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
