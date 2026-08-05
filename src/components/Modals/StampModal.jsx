import React, { useState } from 'react';
import { Stamp, Image as ImageIcon, X, Check } from 'lucide-react';
import { useApp } from '../../core/AppContext';

export function StampModal({ isOpen, onClose, onSelectStamp }) {
  const [activeTab, setActiveTab] = useState('presets');

  if (!isOpen) return null;

  const presetStamps = [
    { label: 'APPROVED', color: '#10b981', border: '#059669' },
    { label: 'PASSED', color: '#10b981', border: '#059669' },
    { label: 'CONFIDENTIAL', color: '#ef4444', border: '#dc2626' },
    { label: 'DRAFT', color: '#f59e0b', border: '#d97706' },
    { label: 'FINAL', color: '#3b82f6', border: '#2563eb' },
    { label: 'EXPIRED', color: '#6b7280', border: '#4b5563' },
  ];

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        onSelectStamp({
          type: 'custom_image',
          dataUrl: event.target.result,
        });
        onClose();
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div className="glass-panel animate-fade-in" style={{
        maxWidth: '440px',
        width: '100%',
        padding: '24px',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-card)',
        border: '1px solid var(--border-glass-bright)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-cyan)', fontWeight: 700, fontSize: '1.2rem' }}>
            <Stamp size={22} />
            <span>Select Rubber Stamp / Image</span>
          </div>
          <button className="glass-btn" onClick={onClose} style={{ padding: '4px 8px' }}>
            <X size={16} />
          </button>
        </div>

        {/* Tab Selection */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '1px solid var(--border-glass)', paddingBottom: '8px' }}>
          <button
            className={`glass-btn ${activeTab === 'presets' ? 'glass-btn-active' : ''}`}
            onClick={() => setActiveTab('presets')}
            style={{ flex: 1, justifyContent: 'center' }}
          >
            <Stamp size={14} />
            <span>Preset Stamps</span>
          </button>
          <button
            className={`glass-btn ${activeTab === 'custom' ? 'glass-btn-active' : ''}`}
            onClick={() => setActiveTab('custom')}
            style={{ flex: 1, justifyContent: 'center' }}
          >
            <ImageIcon size={14} />
            <span>Upload Image</span>
          </button>
        </div>

        {activeTab === 'presets' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '20px' }}>
            {presetStamps.map((stamp) => (
              <div
                key={stamp.label}
                onClick={() => {
                  onSelectStamp({ type: 'preset', text: stamp.label, color: stamp.color });
                  onClose();
                }}
                className="glass-panel"
                style={{
                  padding: '16px',
                  borderRadius: 'var(--radius-md)',
                  textAlign: 'center',
                  cursor: 'pointer',
                  border: `2px dashed ${stamp.color}`,
                  color: stamp.color,
                  fontWeight: 800,
                  letterSpacing: '0.1em',
                  transform: 'rotate(-4deg)',
                  transition: 'all 0.2s ease',
                }}
              >
                {stamp.label}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <label className="glass-btn glass-btn-primary" style={{ padding: '12px 24px', cursor: 'pointer' }}>
              <ImageIcon size={18} />
              <span>Choose Image File (PNG/JPG)</span>
              <input type="file" accept="image/png, image/jpeg" onChange={handleImageUpload} style={{ display: 'none' }} />
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
