import React, { useState, useRef } from 'react';
import { Upload, ShieldCheck, FileUp, Lock, Sparkles } from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { pdfjsLib } from '../../core/pdf-config';
import { PageView } from './PageView';

export function DocumentViewer() {
  const { state, loadPdfFile } = useApp();
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  const containerRef = useRef(null);
  const isPanDragging = useRef(false);
  const panStart = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type === 'application/pdf') {
      try {
        await loadPdfFile(file);
      } catch (err) {
        console.error('Failed to load PDF file:', err);
      }
    }
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        await loadPdfFile(file);
      } catch (err) {
        console.error('Failed to load PDF file:', err);
      }
    }
  };

  const handleMouseDown = (e) => {
    if (state.activeTool === 'hand' && containerRef.current) {
      isPanDragging.current = true;
      panStart.current = {
        x: e.clientX,
        y: e.clientY,
        scrollLeft: containerRef.current.scrollLeft,
        scrollTop: containerRef.current.scrollTop,
      };
    }
  };

  const handleMouseMove = (e) => {
    if (isPanDragging.current && containerRef.current) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      containerRef.current.scrollLeft = panStart.current.scrollLeft - dx;
      containerRef.current.scrollTop = panStart.current.scrollTop - dy;
    }
  };

  const handleMouseUp = () => {
    isPanDragging.current = false;
  };

  return (
    <main 
      ref={containerRef}
      className="document-viewer-area"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{
        gridArea: 'viewer',
        backgroundColor: 'var(--bg-canvas)',
        backgroundImage: 'radial-gradient(circle at 50% 30%, rgba(168, 85, 247, 0.12), transparent 70%)',
        position: 'relative',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: (state.pdfDocument || state.pdfBytes) ? 'flex-start' : 'center',
        padding: '40px 20px',
        width: '100%',
        height: '100%',
        cursor: state.activeTool === 'hand' ? 'grab' : 'default',
      }}
    >
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileSelect} 
        accept="application/pdf" 
        style={{ display: 'none' }} 
      />

      {(!state.pdfDocument && !state.pdfBytes) ? (
        <div 
          className="glass-panel animate-fade-in"
          onClick={() => fileInputRef.current?.click()}
          style={{
            maxWidth: '560px',
            width: '100%',
            padding: '52px 36px',
            borderRadius: 'var(--radius-lg)',
            textAlign: 'center',
            cursor: 'pointer',
            border: isDragging ? '2px dashed var(--neon-cyan)' : '1px dashed var(--border-neon)',
            background: isDragging ? 'rgba(6, 182, 212, 0.15)' : 'var(--bg-glass-heavy)',
            boxShadow: isDragging ? 'var(--shadow-neon-cyan)' : 'var(--shadow-card), var(--shadow-neon-violet)',
            transition: 'all 0.3s var(--ease-spring)',
          }}
        >
          <div style={{
            width: '80px',
            height: '80px',
            borderRadius: '28px',
            background: 'var(--gradient-brand)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 28px auto',
            boxShadow: 'var(--shadow-neon-violet)',
          }}>
            <FileUp size={40} color="#ffffff" />
          </div>

          <h2 style={{ 
            fontFamily: 'var(--font-heading)', 
            fontSize: '1.9rem', 
            fontWeight: 800, 
            marginBottom: '14px',
            background: 'var(--gradient-brand)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            letterSpacing: '-0.02em',
          }}>
            Drop your PDF here to edit
          </h2>

          <p style={{ color: 'var(--text-muted)', fontSize: '0.975rem', marginBottom: '28px', lineHeight: '1.6' }}>
            Open documents safely in your browser. Experience zero-server delay, high-precision layout preservation, and Don Norman HCI transparency.
          </p>

          <button className="glass-btn glass-btn-primary" style={{ padding: '14px 32px', fontSize: '1.05rem', borderRadius: 'var(--radius-full)' }}>
            <Upload size={20} />
            <span>Select PDF File</span>
          </button>

          {/* Security & Conceptual Model Indicator */}
          <div style={{ 
            marginTop: '36px', 
            paddingTop: '24px', 
            borderTop: '1px solid var(--border-glass)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '20px',
            fontSize: '0.825rem',
            color: 'var(--text-dim)'
          }}>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#6ee7b7', fontWeight: 600 }}>
              <Lock size={15} />
              <span>100% Client-Side Sandbox</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#6ee7b7', fontWeight: 600 }}>
              <ShieldCheck size={15} />
              <span>No Cloud Transmission</span>
            </div>
          </div>
        </div>
      ) : (
        /* Render Multi-Page PDF Pages with Ambient Halo Glow */
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
          {Array.from({ length: state.totalPages || state.numPages || 0 }, (_, i) => i + 1).map((pageNum) => (
            <PageView key={pageNum} pageNumber={pageNum} />
          ))}
        </div>
      )}
    </main>
  );
}
