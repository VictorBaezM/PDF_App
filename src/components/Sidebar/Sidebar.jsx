import React, { useRef, useEffect, useState } from 'react';
import { 
  Layers, MessageSquare, ShieldCheck, FileText, RotateCw, Trash2, ChevronUp, ChevronDown, Combine, Scissors, MapPin
} from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { PDFRenderer } from '../../core/pdf-renderer';
import { PDFModifier } from '../../core/pdf-modifier';
import { pdfjsLib } from '../../core/pdf-config';
import { annotationStore } from '../../core/shared-annotation-store';
import { triggerFeedback } from '../FeedbackToast/FeedbackToast';

function ThumbnailItem({ pageNum, isActive, onSelect, onRotate, onDelete, onMove }) {
  const { state } = useApp();
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);

  if (!rendererRef.current) {
    rendererRef.current = new PDFRenderer();
  }

  const pageRotation = (state.pageRotations && state.pageRotations[pageNum - 1]) || 0;

  useEffect(() => {
    let isCancelled = false;

    async function renderThumbnail() {
      if ((!state.pdfDocument && !state.pdfBytes) || !canvasRef.current) return;
      try {
        const renderer = rendererRef.current;
        if (state.pdfDocument) {
          renderer.setDocument(state.pdfDocument);
        } else if (state.pdfBytes && !renderer.pdfDocument) {
          try {
            await renderer.loadDocument(state.pdfBytes);
          } catch (e) {
            return;
          }
        }

        if (!isCancelled && canvasRef.current) {
          try {
            await renderer.renderPage(pageNum, canvasRef.current, 0.2, pageRotation);
          } catch (e) {
            // Fallback canvas render
          }
        }
      } catch (err) {
        console.warn(`Thumbnail render warning for page ${pageNum}:`, err);
      }
    }

    renderThumbnail();

    return () => {
      isCancelled = true;
    };
  }, [state.pdfDocument, state.pdfBytes, pageNum, pageRotation]);

  return (
    <div
      className={`glass-panel ${isActive ? 'glass-btn-active' : ''}`}
      style={{
        width: '190px',
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        borderRadius: 'var(--radius-md)',
        cursor: 'pointer',
        position: 'relative',
        transition: 'all 0.25s var(--ease-spring)',
        border: isActive ? '1px solid var(--neon-cyan)' : '1px solid var(--border-glass)',
        boxShadow: isActive ? 'var(--shadow-neon-cyan)' : 'var(--shadow-card)',
      }}
      onClick={onSelect}
    >
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: '6px', boxShadow: 'var(--shadow-card)', marginBottom: '10px' }}>
        <canvas ref={canvasRef} style={{ display: 'block' }} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
        <span style={{ fontWeight: 600 }}>Page {pageNum}</span>
        
        {/* Tactile Action Controls on Thumbnail */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }} onClick={(e) => e.stopPropagation()}>
          <button 
            className="glass-btn" 
            onClick={() => onRotate(pageNum - 1, 90)}
            title="Rotate 90° Clockwise"
            style={{ padding: '3px 5px' }}
          >
            <RotateCw size={12} />
          </button>
          <button 
            className="glass-btn" 
            onClick={() => onMove(pageNum - 1, -1)}
            disabled={pageNum <= 1}
            title="Move Up"
            style={{ padding: '3px 5px' }}
          >
            <ChevronUp size={12} />
          </button>
          <button 
            className="glass-btn" 
            onClick={() => onMove(pageNum - 1, 1)}
            disabled={pageNum >= (state.totalPages || state.numPages)}
            title="Move Down"
            style={{ padding: '3px 5px' }}
          >
            <ChevronDown size={12} />
          </button>
          <button 
            className="glass-btn glass-btn-danger" 
            onClick={() => onDelete(pageNum - 1)}
            disabled={(state.totalPages || state.numPages) <= 1}
            title={(state.totalPages || state.numPages) <= 1 ? "Cannot delete the only page" : "Delete Page"}
            style={{ padding: '3px 5px' }}
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

export function Sidebar({ onOpenMergeModal, onOpenSplitModal }) {
  const { state, dispatch } = useApp();
  const [annotationsList, setAnnotationsList] = useState(annotationStore.getAll());

  useEffect(() => {
    const unsubscribe = annotationStore.subscribe((list) => {
      setAnnotationsList([...list]);
    });
    return () => unsubscribe();
  }, []);

  if (state.isSidebarOpen === false || state.sidebarOpen === false) return null;

  const handleRotatePage = async (pageIndex, angle) => {
    try {
      dispatch({ type: 'ROTATE_PAGE', payload: { pageIndex, angle } });
      triggerFeedback(`↻ Page ${pageIndex + 1} rotated 90°`);

      if (state.pdfBytes) {
        const updatedBytes = await PDFModifier.rotatePage(state.pdfBytes, pageIndex, angle);
        dispatch({ type: 'SET_PDF_BYTES', payload: updatedBytes });
      }
    } catch (err) {
      console.error('Failed to rotate page:', err);
      triggerFeedback(`Rotation failed: ${err.message}`, 'error');
    }
  };

  const handleDeletePage = async (pageIndex) => {
    const total = state.totalPages || state.numPages || 1;
    if (confirm(`Delete page ${pageIndex + 1}? This action will remove the page from the document.`)) {
      try {
        const updatedBytes = await PDFModifier.deletePage(state.pdfBytes, pageIndex);
        const newTotal = total - 1;
        const nextCurrentPage = Math.min(state.currentPage, newTotal);
        dispatch({
          type: 'UPDATE_DOCUMENT_PAGES',
          payload: {
            pdfBytes: updatedBytes,
            numPages: newTotal,
            totalPages: newTotal,
            currentPage: nextCurrentPage,
          },
        });
        triggerFeedback(`🗑️ Page ${pageIndex + 1} deleted`);
      } catch (err) {
        console.error('Failed to delete page:', err);
        triggerFeedback(`Error deleting page: ${err.message}`, 'error');
      }
    }
  };

  const handleMovePage = async (pageIndex, direction) => {
    const total = state.totalPages || state.numPages || 1;
    const targetIndex = pageIndex + direction;
    if (targetIndex < 0 || targetIndex >= total) return;

    try {
      const pageIndices = Array.from({ length: total }, (_, i) => i);
      const temp = pageIndices[pageIndex];
      pageIndices[pageIndex] = pageIndices[targetIndex];
      pageIndices[targetIndex] = temp;

      const updatedBytes = await PDFModifier.reorderPages(state.pdfBytes, pageIndices);

      const newRotations = {};
      pageIndices.forEach((oldIdx, newIdx) => {
        if (state.pageRotations && state.pageRotations[oldIdx] !== undefined) {
          newRotations[newIdx] = state.pageRotations[oldIdx];
        }
      });

      dispatch({
        type: 'UPDATE_DOCUMENT_PAGES',
        payload: {
          pdfBytes: updatedBytes,
          currentPage: targetIndex + 1,
          pageRotations: newRotations,
        },
      });
      triggerFeedback(`↕️ Moved Page ${pageIndex + 1} to position ${targetIndex + 1}`);
    } catch (err) {
      console.error('Failed to reorder page:', err);
      triggerFeedback(`Reorder failed: ${err.message}`, 'error');
    }
  };

  const handleDeleteAnnotation = (id) => {
    annotationStore.remove(id);
    triggerFeedback('Annotation removed');
  };

  return (
    <aside className="glass-panel-heavy animate-fade-in" style={{
      gridArea: 'sidebar',
      display: 'flex',
      flexDirection: 'column',
      borderRight: '1px solid var(--border-glass)',
      overflow: 'hidden',
      zIndex: 90,
    }}>
      {/* Tab Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
        padding: '10px 8px',
        borderBottom: '1px solid var(--border-glass)',
        background: 'rgba(0, 0, 0, 0.3)',
      }}>
        <button
          className={`glass-btn ${state.sidebarTab === 'thumbnails' ? 'glass-btn-active' : ''}`}
          onClick={() => dispatch({ type: 'SET_SIDEBAR_TAB', payload: 'thumbnails' })}
          style={{ flex: 1, justifyContent: 'center', padding: '8px' }}
          title="Page Thumbnails"
        >
          <Layers size={16} />
        </button>
        <button
          className={`glass-btn ${state.sidebarTab === 'annotations' ? 'glass-btn-active' : ''}`}
          onClick={() => dispatch({ type: 'SET_SIDEBAR_TAB', payload: 'annotations' })}
          style={{ flex: 1, justifyContent: 'center', padding: '8px' }}
          title="Annotations List"
        >
          <MessageSquare size={16} />
        </button>
        <button
          className={`glass-btn ${state.sidebarTab === 'security' ? 'glass-btn-active' : ''}`}
          onClick={() => dispatch({ type: 'SET_SIDEBAR_TAB', payload: 'security' })}
          style={{ flex: 1, justifyContent: 'center', padding: '8px' }}
          title="Security & Privacy Center"
        >
          <ShieldCheck size={16} />
        </button>
      </div>

      {/* Page Operations Bar (Merge & Split triggers) */}
      {(state.pdfDocument || state.pdfBytes) && state.sidebarTab === 'thumbnails' && (
        <div style={{
          display: 'flex',
          gap: '8px',
          padding: '10px 14px',
          borderBottom: '1px solid var(--border-glass)',
          background: 'rgba(255, 255, 255, 0.02)',
        }}>
          <button 
            className="glass-btn"
            onClick={onOpenMergeModal}
            style={{ flex: 1, justifyContent: 'center', fontSize: '0.8rem' }}
          >
            <Combine size={14} color="var(--neon-cyan)" />
            <span>Merge</span>
          </button>
          <button 
            className="glass-btn"
            onClick={onOpenSplitModal}
            style={{ flex: 1, justifyContent: 'center', fontSize: '0.8rem' }}
          >
            <Scissors size={14} color="var(--neon-pink)" />
            <span>Split</span>
          </button>
        </div>
      )}

      {/* Tab Content Area */}
      <div style={{ flex: 1, padding: '16px', overflowY: 'auto' }}>
        {state.sidebarTab === 'thumbnails' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' }}>
            {(!state.pdfDocument && !state.pdfBytes) ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', marginTop: '32px' }}>
                <FileText size={36} style={{ marginBottom: '12px', opacity: 0.4 }} />
                <p>No document loaded</p>
              </div>
            ) : (
              Array.from({ length: state.totalPages || state.numPages || 1 }, (_, i) => i + 1).map((pageNum) => (
                <ThumbnailItem
                  key={pageNum}
                  pageNum={pageNum}
                  isActive={state.currentPage === pageNum}
                  onSelect={() => dispatch({ type: 'SET_CURRENT_PAGE', payload: pageNum })}
                  onRotate={handleRotatePage}
                  onDelete={handleDeletePage}
                  onMove={handleMovePage}
                />
              ))
            )}
          </div>
        )}

        {state.sidebarTab === 'annotations' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {annotationsList.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', marginTop: '32px' }}>
                <MessageSquare size={36} style={{ marginBottom: '12px', opacity: 0.4 }} />
                <p>No annotations in document</p>
              </div>
            ) : (
              annotationsList.map((annot) => (
                <div 
                  key={annot.id} 
                  className="glass-panel" 
                  style={{
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.825rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    borderLeft: '3px solid var(--neon-cyan)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 700, textTransform: 'capitalize', color: 'var(--neon-cyan)' }}>
                      {annot.type}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Page {annot.pageIndex + 1}
                    </span>
                  </div>

                  {annot.contents && (
                    <p style={{ margin: 0, color: 'var(--text-main)', fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      "{annot.contents}"
                    </p>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px', marginTop: '4px' }}>
                    <button
                      className="glass-btn"
                      onClick={() => dispatch({ type: 'SET_CURRENT_PAGE', payload: annot.pageIndex + 1 })}
                      style={{ padding: '3px 6px', fontSize: '0.75rem' }}
                      title="Jump to annotation page"
                    >
                      <MapPin size={12} />
                      <span>Jump</span>
                    </button>
                    <button
                      className="glass-btn glass-btn-danger"
                      onClick={() => handleDeleteAnnotation(annot.id)}
                      style={{ padding: '3px 6px', fontSize: '0.75rem' }}
                      title="Delete annotation"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {state.sidebarTab === 'security' && (
          <div className="glass-panel" style={{ padding: '18px', borderRadius: 'var(--radius-md)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981', fontWeight: 700, marginBottom: '14px' }}>
              <ShieldCheck size={22} />
              <span>Local Sandbox Security</span>
            </div>
            <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)', lineHeight: '1.5', marginBottom: '14px' }}>
              Aura PDF operates inside a closed, local browser memory sandbox. Zero server transfers occur.
            </p>
            <div style={{ fontSize: '0.775rem', background: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: 'var(--radius-sm)', color: '#6ee7b7', lineHeight: '1.6' }}>
              ✓ Status: 100% Offline Capable<br/>
              ✓ Zero Cloud Uploads<br/>
              ✓ Don Norman Mental-Model Transparency<br/>
              ✓ Auto RAM Clean On Close
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
