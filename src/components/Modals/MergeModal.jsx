import React, { useState } from 'react';
import { Combine, Plus, Trash2, X } from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { PDFModifier } from '../../core/pdf-modifier';
import { pdfjsLib } from '../../core/pdf-config';
import { triggerFeedback } from '../FeedbackToast/FeedbackToast';

export function MergeModal({ isOpen, onClose }) {
  const { state, loadPdfFile } = useApp();
  const [filesToMerge, setFilesToMerge] = useState([]);
  const [isMerging, setIsMerging] = useState(false);

  if (!isOpen) return null;

  const handleAddFiles = (e) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length > 0) {
      setFilesToMerge((prev) => [...prev, ...selectedFiles]);
    }
  };

  const handleRemoveFile = (index) => {
    setFilesToMerge((prev) => prev.filter((_, i) => i !== index));
  };

  const handleMerge = async () => {
    if (filesToMerge.length === 0 && !state.pdfBytes) {
      triggerFeedback('Please add at least one PDF file to merge.', 'error');
      return;
    }

    try {
      setIsMerging(true);
      const pdfBytesList = [];

      // Include current document if available
      if (state.pdfBytes) {
        pdfBytesList.push(state.pdfBytes);
      }

      // Read arrayBuffers for added files
      for (const file of filesToMerge) {
        let buffer;
        if (typeof file.arrayBuffer === 'function') {
          buffer = await file.arrayBuffer();
        } else {
          buffer = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
          });
        }
        pdfBytesList.push(new Uint8Array(buffer));
      }

      const mergedBytes = await PDFModifier.mergePDFs(pdfBytesList);
      await loadPdfFile(mergedBytes, 'merged-document.pdf');
      triggerFeedback(`Merged ${pdfBytesList.length} documents successfully!`);
      onClose();
    } catch (err) {
      console.error('Error merging PDFs:', err);
      triggerFeedback(`Merge failed: ${err.message}`, 'error');
    } finally {
      setIsMerging(false);
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
        maxWidth: '480px',
        width: '100%',
        padding: '24px',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-card)',
        border: '1px solid var(--border-glass-bright)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-cyan)', fontWeight: 700, fontSize: '1.2rem' }}>
            <Combine size={22} />
            <span>Merge PDF Documents</span>
          </div>
          <button className="glass-btn" onClick={onClose} style={{ padding: '4px 8px' }}>
            <X size={16} />
          </button>
        </div>

        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
          Combine multiple PDF files into one single document. Your current open file will be included as the base document.
        </p>

        {/* Current Base File */}
        {state.pdfDocument && (
          <div className="glass-panel" style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', marginBottom: '12px', fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>📄 {state.fileName || 'Current Document'} ({state.totalPages} pages)</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--accent-emerald)', fontWeight: 600 }}>Base File</span>
          </div>
        )}

        {/* Added Files List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px', maxHeight: '180px', overflowY: 'auto' }}>
          {filesToMerge.map((file, idx) => (
            <div key={idx} className="glass-panel" style={{ padding: '8px 12px', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>📄 {file.name}</span>
              <button className="glass-btn glass-btn-danger" onClick={() => handleRemoveFile(idx)} style={{ padding: '2px 6px' }}>
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>

        {/* Add Files Trigger */}
        <label className="glass-btn" style={{ width: '100%', justifyContent: 'center', marginBottom: '20px', cursor: 'pointer' }}>
          <Plus size={16} />
          <span>Add More PDF Files</span>
          <input type="file" accept="application/pdf" multiple onChange={handleAddFiles} style={{ display: 'none' }} />
        </label>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button className="glass-btn" onClick={onClose}>Cancel</button>
          <button className="glass-btn glass-btn-primary" onClick={handleMerge} disabled={isMerging}>
            {isMerging ? 'Merging...' : 'Combine & Open'}
          </button>
        </div>
      </div>
    </div>
  );
}
