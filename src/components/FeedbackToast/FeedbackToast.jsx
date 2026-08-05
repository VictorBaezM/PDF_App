import React, { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';

let showToastFn = null;

export function triggerFeedback(message, type = 'info') {
  if (showToastFn) {
    showToastFn(message, type);
  }
}

export function FeedbackToast() {
  const [toast, setToast] = useState(null);

  useEffect(() => {
    showToastFn = (message, type) => {
      setToast({ message, type, id: Date.now() });
    };
    return () => {
      showToastFn = null;
    };
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 2500);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  if (!toast) return null;

  return (
    <div
      className="glass-panel animate-fade-in"
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 2000,
        padding: '12px 20px',
        borderRadius: 'var(--radius-full)',
        border: '1px solid var(--border-neon)',
        background: 'var(--bg-glass-heavy)',
        color: 'var(--text-main)',
        fontSize: '0.875rem',
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        boxShadow: 'var(--shadow-card), var(--shadow-neon-violet)',
        pointerEvents: 'none',
      }}
    >
      <Sparkles size={16} color="var(--neon-cyan)" />
      <span>{toast.message}</span>
    </div>
  );
}
