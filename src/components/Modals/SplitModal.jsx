import React, { useState } from 'react';
import { Scissors, X, Download } from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { PDFModifier } from '../../core/pdf-modifier';
import { triggerFeedback } from '../FeedbackToast/FeedbackToast';

export function SplitModal({ isOpen, onClose }) {
  const { state } = useApp();
  const [pageRange, setPageRange] = useState('1');
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen || (!state.pdfDocument && !state.pdfBytes)) return null;

  const handleExtractPages = async () => {
    try {
      setIsProcessing(true);
      // Parse page numbers (e.g. "1, 2, 3" or "1-3")
      const pagesToExtract = new Set();
      const parts = pageRange.split(',');

      const maxPages = state.totalPages || state.numPages || 1;
      for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed.includes('-')) {
          const [start, end] = trimmed.split('-').map((n) => parseInt(n.trim()));
          if (!isNaN(start) && !isNaN(end)) {
            for (let i = start; i <= end; i++) {
              if (i >= 1 && i <= maxPages) pagesToExtract.add(i - 1);
            }
          }
        } else {
          const pageNum = parseInt(trimmed);
          if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= maxPages) {
            pagesToExtract.add(pageNum - 1);
          }
        }
      }

      const indices = Array.from(pagesToExtract);
      if (indices.length === 0) {
        triggerFeedback(`Please enter valid page numbers between 1 and ${maxPages}.`, 'error');
        return;
      }

      const extractedBytes = await PDFModifier.extractPages(state.pdfBytes, indices);
      const blob = new Blob([extractedBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `extracted-pages-${pageRange}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      triggerFeedback(`Extracted pages ${pageRange} successfully!`);
      onClose();
    } catch (err) {
      triggerFeedback(`Extraction failed: ${err.message}`, 'error');
    } finally {
      setIsProcessing(false);
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
            <Scissors size={22} />
            <span>Split / Extract Pages</span>
          </div>
          <button className="glass-btn" onClick={onClose} style={{ padding: '4px 8px' }}>
            <X size={16} />
          </button>
        </div>

        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
          Extract specific pages into a new PDF document. Specify page numbers or ranges (e.g. <code>1, 3, 5-7</code>).
        </p>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ fontSize: '0.8rem', color: 'var(--text-main)', display: 'block', marginBottom: '6px', fontWeight: 600 }}>
            Pages to Extract (1 to {state.totalPages}):
          </label>
          <input
            type="text"
            className="glass-panel"
            value={pageRange}
            onChange={(e) => setPageRange(e.target.value)}
            placeholder="e.g. 1, 3, 5-7"
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid var(--border-glass)',
              color: '#ffffff',
              fontSize: '0.9rem',
              outline: 'none',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button className="glass-btn" onClick={onClose}>Cancel</button>
          <button className="glass-btn glass-btn-primary" onClick={handleExtractPages} disabled={isProcessing}>
            <Download size={16} />
            <span>{isProcessing ? 'Extracting...' : 'Extract & Save'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
