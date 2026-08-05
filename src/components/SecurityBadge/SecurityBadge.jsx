import React, { useState } from 'react';
import { ShieldCheck, Lock, Trash2, Info, CheckCircle2 } from 'lucide-react';
import { useApp } from '../../core/AppContext';

export function SecurityBadge() {
  const { state, purgeMemory } = useApp();
  const [showInfoModal, setShowInfoModal] = useState(false);

  return (
    <div className="security-badge-wrapper" style={{ position: 'relative' }}>
      <div 
        className="badge-security" 
        onClick={() => setShowInfoModal(!showInfoModal)}
        style={{ cursor: 'pointer', userSelect: 'none' }}
        title="Click to view Local Privacy Shield details"
      >
        <span className="dot" />
        <ShieldCheck size={14} color="#10b981" />
        <span>100% Local Sandbox</span>
      </div>

      {showInfoModal && (
        <div 
          className="glass-panel animate-fade-in" 
          style={{
            position: 'absolute',
            top: 'calc(100% + 12px)',
            right: 0,
            width: '320px',
            padding: '16px',
            borderRadius: 'var(--radius-md)',
            zIndex: 1000,
            boxShadow: 'var(--shadow-card), 0 0 20px rgba(16, 185, 129, 0.2)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981', fontWeight: 600, fontSize: '0.95rem' }}>
              <Lock size={18} />
              <span>Zero-Server Privacy Guarantee</span>
            </div>
            <button 
              onClick={() => setShowInfoModal(false)}
              className="glass-btn" 
              style={{ padding: '2px 8px', fontSize: '0.75rem' }}
            >
              ✕
            </button>
          </div>

          <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)', lineHeight: '1.4', marginBottom: '12px' }}>
            Your PDF files stay strictly within your browser's local RAM. No document data is ever uploaded or transmitted to any external server.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px', fontSize: '0.8rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#6ee7b7' }}>
              <CheckCircle2 size={14} />
              <span>Client-side WebWorker processing</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#6ee7b7' }}>
              <CheckCircle2 size={14} />
              <span>Session memory auto-purge on close</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#6ee7b7' }}>
              <CheckCircle2 size={14} />
              <span>Offline-capable Progressive Web App</span>
            </div>
          </div>

          {state.pdfDocument && (
            <button 
              onClick={() => {
                purgeMemory();
                setShowInfoModal(false);
              }}
              className="glass-btn glass-btn-danger"
              style={{ width: '100%', justifyContent: 'center' }}
            >
              <Trash2 size={14} />
              <span>Purge Document & Wipe RAM</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
