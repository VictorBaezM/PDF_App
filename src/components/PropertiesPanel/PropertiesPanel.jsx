import React from 'react';
import { Sliders, Palette, Type, PenTool, Square, Eye, Trash2 } from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { annotationStore } from '../../core/shared-annotation-store';
import { triggerFeedback } from '../FeedbackToast/FeedbackToast';

export function PropertiesPanel() {
  const { state, dispatch } = useApp();

  if (!state.propertiesPanelOpen) return null;

  const handleOptionChange = (key, value) => {
    dispatch({
      type: 'UPDATE_TOOL_OPTIONS',
      payload: { [key]: value },
    });
  };

  const handleDeleteSelected = () => {
    // Attempt to delete active object from current active canvas or store
    const allAnnots = annotationStore.getAll();
    if (allAnnots.length > 0) {
      const lastAnnot = allAnnots[allAnnots.length - 1];
      annotationStore.remove(lastAnnot.id);
      triggerFeedback('Annotation deleted');
    }
  };

  const highlightColors = [
    { label: 'Yellow', rgb: [1, 0.92, 0], hex: '#fde047' },
    { label: 'Green', rgb: [0.29, 0.87, 0.5], hex: '#4ade80' },
    { label: 'Blue', rgb: [0.38, 0.65, 0.98], hex: '#60a5fa' },
    { label: 'Pink', rgb: [0.96, 0.45, 0.71], hex: '#f472b6' },
  ];

  const inkColors = ['#3b82f6', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b', '#ef4444', '#ffffff', '#000000'];

  return (
    <aside className="glass-panel-heavy animate-fade-in" style={{
      gridArea: 'properties',
      display: 'flex',
      flexDirection: 'column',
      borderLeft: '1px solid var(--border-glass)',
      padding: '16px',
      overflowY: 'auto',
      zIndex: 90,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--border-glass)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '0.95rem' }}>
          <Sliders size={18} color="var(--accent-cyan)" />
          <span>Tool Settings</span>
        </div>
        <button 
          className="glass-btn" 
          onClick={() => dispatch({ type: 'TOGGLE_PROPERTIES_PANEL', payload: false })}
          style={{ padding: '2px 8px', fontSize: '0.75rem' }}
        >
          ✕
        </button>
      </div>

      {/* Active Tool Banner */}
      <div className="glass-panel" style={{ padding: '10px 12px', borderRadius: 'var(--radius-md)', marginBottom: '16px', fontSize: '0.85rem', textTransform: 'capitalize', color: 'var(--accent-cyan)', fontWeight: 600 }}>
        Active: {state.activeTool} Tool
      </div>

      {/* Highlight Tool Options */}
      {(state.activeTool === 'highlight' || state.activeTool === 'underline' || state.activeTool === 'strikeout') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Palette size={14} />
            <span>Markup Color</span>
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            {highlightColors.map((c) => {
              const hlColor = state.toolOptions?.highlightColor || [1, 0.92, 0];
              const isActive = Array.isArray(hlColor) && hlColor[0] === c.rgb[0];
              return (
                <button
                  key={c.label}
                  onClick={() => handleOptionChange('highlightColor', c.rgb)}
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    backgroundColor: c.hex,
                    border: isActive ? '2px solid #ffffff' : '1px solid transparent',
                    cursor: 'pointer',
                    boxShadow: isActive ? '0 0 10px ' + c.hex : 'none',
                  }}
                  title={c.label}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Pen / Freehand Drawing Options */}
      {state.activeTool === 'ink' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <Palette size={14} />
              <span>Ink Color</span>
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '8px' }}>
              {inkColors.map((c) => (
                <button
                  key={c}
                  onClick={() => handleOptionChange('inkColor', c)}
                  style={{
                    height: '28px',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: c,
                    border: state.toolOptions.inkColor === c ? '2px solid var(--accent-cyan)' : '1px solid var(--border-glass)',
                    cursor: 'pointer',
                  }}
                />
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Custom Color:</span>
              <input 
                type="color" 
                value={state.toolOptions.inkColor || '#3b82f6'} 
                onChange={(e) => handleOptionChange('inkColor', e.target.value)} 
                style={{ width: '32px', height: '32px', border: 'none', background: 'transparent', cursor: 'pointer' }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <PenTool size={14} />
              <span>Stroke Thickness: {state.toolOptions.inkThickness}px</span>
            </label>
            <input 
              type="range" 
              aria-label="Stroke Thickness"
              min="1" 
              max="20" 
              value={state.toolOptions.inkThickness}
              onChange={(e) => handleOptionChange('inkThickness', parseInt(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--accent-purple)' }}
            />
          </div>
        </div>
      )}

      {/* Text Box Options */}
      {state.activeTool === 'textbox' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <Type size={14} />
              <span>Font Size: {state.toolOptions.fontSize}px</span>
            </label>
            <input 
              type="range" 
              aria-label="Font Size"
              min="10" 
              max="48" 
              value={state.toolOptions.fontSize}
              onChange={(e) => handleOptionChange('fontSize', parseInt(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--accent-cyan)' }}
            />
          </div>
        </div>
      )}

      {/* General Opacity Slider */}
      <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--border-glass)' }}>
        <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
          <Eye size={14} />
          <span>Opacity: {Math.round((state.toolOptions.opacity ?? 0.3) * 100)}%</span>
        </label>
        <input 
          type="range" 
          aria-label="Opacity"
          min="0" 
          max="100" 
          step="5"
          value={Math.round((state.toolOptions.opacity ?? 0.3) * 100)}
          onChange={(e) => handleOptionChange('opacity', parseFloat(e.target.value) / 100)}
          style={{ width: '100%', accentColor: 'var(--accent-purple)' }}
        />
      </div>

      {/* Delete Annotation Action */}
      <div style={{ marginTop: 'auto', paddingTop: '20px' }}>
        <button
          className="glass-btn glass-btn-danger"
          onClick={handleDeleteSelected}
          style={{ width: '100%', justifyContent: 'center', gap: '8px', padding: '10px' }}
        >
          <Trash2 size={16} />
          <span>Delete Annotation</span>
        </button>
      </div>
    </aside>
  );
}
