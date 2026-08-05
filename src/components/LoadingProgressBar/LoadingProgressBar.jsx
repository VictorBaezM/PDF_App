import React from 'react';
import { Loader2, CheckCircle2, ShieldCheck } from 'lucide-react';
import { useApp } from '../../core/AppContext';

export function LoadingProgressBar() {
  const { state } = useApp();

  if (state.loadingProgress === null) return null;

  const isComplete = state.loadingProgress >= 100;

  return (
    <div 
      className="glass-panel animate-fade-in"
      style={{
        position: 'fixed',
        top: '72px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1000,
        width: '420px',
        padding: '16px 20px',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-card), 0 0 30px rgba(139, 92, 246, 0.25)',
        border: '1px solid var(--border-glass-bright)',
        background: 'var(--bg-glass-heavy)',
        backdropFilter: 'var(--blur-glass)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.875rem', fontWeight: 600 }}>
          {isComplete ? (
            <CheckCircle2 size={18} color="#10b981" />
          ) : (
            <Loader2 size={18} className="spin-loader" color="var(--accent-cyan)" />
          )}
          <span style={{ color: isComplete ? '#6ee7b7' : 'var(--text-main)' }}>
            {state.loadingStatus || 'Processing document...'}
          </span>
        </div>

        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent-cyan)' }}>
          {state.loadingProgress}%
        </span>
      </div>

      {/* Outer Progress Bar Track */}
      <div 
        style={{
          width: '100%',
          height: '8px',
          borderRadius: 'var(--radius-full)',
          background: 'rgba(255, 255, 255, 0.08)',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Inner Glowing Fill Bar */}
        <div 
          style={{
            height: '100%',
            width: `${state.loadingProgress}%`,
            background: isComplete ? '#10b981' : 'var(--gradient-brand)',
            borderRadius: 'var(--radius-full)',
            boxShadow: isComplete ? '0 0 12px #10b981' : 'var(--shadow-neon-purple)',
            transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        />
      </div>

      {/* Security note */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '10px' }}>
        <ShieldCheck size={13} color="#10b981" />
        <span>Parsing strictly in local browser memory</span>
      </div>
    </div>
  );
}
