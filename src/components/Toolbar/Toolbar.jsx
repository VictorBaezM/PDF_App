import React, { useRef, useState, useEffect } from 'react';
import { 
  FolderOpen, Download, MousePointer, Grab, Highlighter, Underline, Strikethrough, 
  Type, PenTool, Square, Stamp, StickyNote, ZoomIn, ZoomOut, Maximize2, 
  ChevronLeft, ChevronRight, Sidebar as SidebarIcon, Sliders, Search, Sparkles,
  RotateCcw, RotateCw
} from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { pdfjsLib } from '../../core/pdf-config';
import { SecurityBadge } from '../SecurityBadge/SecurityBadge';
import { SearchBar } from '../SearchBar/SearchBar';
import { AnnotationExporter } from '../../core/annotation-exporter';
import { annotationStore } from '../../core/shared-annotation-store';
import { triggerFeedback } from '../FeedbackToast/FeedbackToast';

export function Toolbar({ onOpenStampModal }) {
  const { state, dispatch, loadPdfFile } = useApp();
  const [showSearch, setShowSearch] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [pageInputVal, setPageInputVal] = useState(state.currentPage);
  const fileInputRef = useRef(null);

  const totalPages = state.totalPages || state.numPages || 0;
  const isDocLoaded = Boolean(state.pdfDocument || state.pdfBytes);

  // Synchronize local page input state when global currentPage changes
  useEffect(() => {
    setPageInputVal(state.currentPage);
  }, [state.currentPage]);

  // Global Ctrl+F / Cmd+F keyboard shortcut for search & Undo/Redo shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      const tagName = e.target.tagName ? e.target.tagName.toLowerCase() : '';
      if (tagName === 'input' || tagName === 'textarea' || (e.target && e.target.isContentEditable)) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setShowSearch((prev) => !prev);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (annotationStore.undo()) triggerFeedback('Undo action');
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        if (annotationStore.redo()) triggerFeedback('Redo action');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        await loadPdfFile(file);
      } catch (err) {
        console.error('Failed to load PDF file:', err);
      }
    }
  };

  const handleExportPDF = async () => {
    if (!state.pdfBytes) return;

    try {
      setIsExporting(true);
      const annotations = annotationStore.getAll();
      const cleanPdfBytes = new Uint8Array(state.pdfBytes.buffer.slice(state.pdfBytes.byteOffset, state.pdfBytes.byteOffset + state.pdfBytes.byteLength));
      const exportedBytes = await AnnotationExporter.exportPDFWithAnnotations(cleanPdfBytes, annotations);

      const blob = new Blob([exportedBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = state.fileName ? `edited-${state.fileName}` : 'edited-document.pdf';
      a.click();
      URL.revokeObjectURL(url);
      triggerFeedback('PDF Exported successfully!');
    } catch (err) {
      console.error('Error exporting PDF:', err);
    } finally {
      setIsExporting(false);
    }
  };

  const handlePageInputChange = (e) => {
    setPageInputVal(e.target.value);
  };

  const handlePageInputSubmit = () => {
    const pageNum = parseInt(pageInputVal, 10);
    if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
      dispatch({ type: 'SET_CURRENT_PAGE', payload: pageNum });
    } else {
      setPageInputVal(state.currentPage);
    }
  };

  const handleUndo = () => {
    if (annotationStore.undo()) {
      triggerFeedback('Undo annotation');
    }
  };

  const handleRedo = () => {
    if (annotationStore.redo()) {
      triggerFeedback('Redo annotation');
    }
  };

  const tools = [
    { id: 'select', label: 'Select / Move', icon: MousePointer },
    { id: 'hand', label: 'Hand / Pan Tool', icon: Grab },
    { id: 'highlight', label: 'Highlight Text', icon: Highlighter },
    { id: 'underline', label: 'Underline', icon: Underline },
    { id: 'strikeout', label: 'Strikethrough', icon: Strikethrough },
    { id: 'textbox', label: 'Add Text Box', icon: Type },
    { id: 'ink', label: 'Freehand Draw', icon: PenTool },
    { id: 'shape', label: 'Draw Shape', icon: Square },
    { id: 'stamp', label: 'Stamp / Image', icon: Stamp },
    { id: 'note', label: 'Sticky Note', icon: StickyNote },
  ];

  const handleToolClick = (toolId) => {
    dispatch({ type: 'SET_ACTIVE_TOOL', payload: toolId });
    if (toolId === 'stamp') {
      onOpenStampModal?.();
    }
  };

  return (
    <header className="glass-panel-heavy" style={{
      gridArea: 'toolbar',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 20px',
      height: 'var(--dock-height)',
      borderBottom: '1px solid var(--border-glass)',
      zIndex: 100,
    }}>
      {/* Left Section: Brand & Sidebar Toggle & File Open & Undo/Redo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <button 
          className="glass-btn" 
          onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}
          title="Toggle Floating Control Blade"
          aria-label="Toggle Sidebar"
          style={{ padding: '8px 12px' }}
        >
          <SidebarIcon size={18} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--gradient-brand)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'var(--shadow-neon-violet)',
          }}>
            <Sparkles size={20} color="#fff" />
          </div>
          <h1 style={{ 
            fontFamily: 'var(--font-heading)', 
            fontSize: '1.25rem', 
            fontWeight: 800, 
            letterSpacing: '-0.03em',
            background: 'var(--gradient-brand)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            Aura PDF
          </h1>
        </div>

        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileChange} 
          accept="application/pdf" 
          style={{ display: 'none' }} 
        />

        <button 
          className="glass-btn glass-btn-primary" 
          onClick={() => fileInputRef.current?.click()}
          style={{ marginLeft: '8px', padding: '8px 18px' }}
        >
          <FolderOpen size={18} />
          <span>Open PDF</span>
        </button>

        {isDocLoaded && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '6px' }}>
            <button
              className="glass-btn"
              onClick={handleUndo}
              title="Undo Annotation (Ctrl+Z)"
              style={{ padding: '8px 10px' }}
            >
              <RotateCcw size={16} />
            </button>
            <button
              className="glass-btn"
              onClick={handleRedo}
              title="Redo Annotation (Ctrl+Y)"
              style={{ padding: '8px 10px' }}
            >
              <RotateCw size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Center Section: Active Cyber Tool Dock & Navigation or SearchBar */}
      {isDocLoaded && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {showSearch ? (
            <SearchBar onClose={() => setShowSearch(false)} />
          ) : (
            <>
              {/* Floating Cyber Tool Palette */}
              <div className="cyber-dock" style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}>
                {tools.map((t) => {
                  const Icon = t.icon;
                  const isActive = state.activeTool === t.id;
                  return (
                    <button
                      key={t.id}
                      className={`glass-btn ${isActive ? 'glass-btn-active' : ''}`}
                      onClick={() => handleToolClick(t.id)}
                      title={`${t.label} (Affordance Tool)`}
                      style={{
                        padding: '8px 11px',
                        borderRadius: 'var(--radius-sm)',
                        border: isActive ? '1px solid #ffffff' : 'none',
                      }}
                    >
                      <Icon size={16} color={isActive ? '#ffffff' : 'var(--text-main)'} />
                    </button>
                  );
                })}
              </div>

              {/* Search Toggle Button */}
              <button
                className="glass-btn"
                onClick={() => setShowSearch(true)}
                title="Search Text (Ctrl+F)"
                style={{ padding: '8px 12px' }}
              >
                <Search size={16} />
              </button>

              {/* Interactive Spatial Page Navigation with Numerical Input Jump */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
                <button 
                  className="glass-btn" 
                  onClick={() => dispatch({ type: 'SET_CURRENT_PAGE', payload: state.currentPage - 1 })}
                  disabled={state.currentPage <= 1}
                  style={{ padding: '8px 10px' }}
                  title="Previous Page"
                >
                  <ChevronLeft size={16} />
                </button>

                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <input
                    type="number"
                    min="1"
                    max={totalPages}
                    value={pageInputVal}
                    onChange={handlePageInputChange}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handlePageInputSubmit();
                    }}
                    onBlur={handlePageInputSubmit}
                    title="Type page number and press Enter to jump"
                    style={{
                      width: '42px',
                      padding: '4px 6px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'rgba(0, 0, 0, 0.4)',
                      border: '1px solid var(--border-glass-bright)',
                      color: 'var(--neon-cyan)',
                      fontWeight: 700,
                      textAlign: 'center',
                      fontSize: '0.85rem',
                      outline: 'none',
                    }}
                  />
                  <span style={{ fontWeight: 700, color: 'var(--text-muted)' }}>/ {totalPages}</span>
                </div>

                <button 
                  className="glass-btn" 
                  onClick={() => dispatch({ type: 'SET_CURRENT_PAGE', payload: state.currentPage + 1 })}
                  disabled={state.currentPage >= totalPages}
                  style={{ padding: '8px 10px' }}
                  title="Next Page"
                >
                  <ChevronRight size={16} />
                </button>
              </div>

              {/* Zoom Spatial Controls */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button 
                  className="glass-btn" 
                  onClick={() => dispatch({ type: 'SET_ZOOM', payload: state.zoomLevel - 0.15 })}
                  style={{ padding: '8px 10px' }}
                  title="Zoom Out"
                >
                  <ZoomOut size={16} />
                </button>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, minWidth: '48px', textAlign: 'center' }}>
                  {Math.round(state.zoomLevel * 100)}%
                </span>
                <button 
                  className="glass-btn" 
                  onClick={() => dispatch({ type: 'SET_ZOOM', payload: state.zoomLevel + 0.15 })}
                  style={{ padding: '8px 10px' }}
                  title="Zoom In"
                >
                  <ZoomIn size={16} />
                </button>
                <button 
                  className="glass-btn" 
                  onClick={() => dispatch({ type: 'SET_ZOOM', payload: 1.0 })}
                  style={{ padding: '8px 10px' }}
                  title="Reset Zoom 100%"
                >
                  <Maximize2 size={16} />
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Right Section: Security Badge & Properties Toggle & Save */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <SecurityBadge />

        {isDocLoaded && (
          <>
            <button 
              className={`glass-btn ${(state.propertiesPanelOpen || state.isPropertiesOpen) ? 'glass-btn-active' : ''}`}
              onClick={() => dispatch({ type: 'TOGGLE_PROPERTIES_PANEL' })}
              title="Tool Properties Dock"
              style={{ padding: '8px 12px' }}
            >
              <Sliders size={18} />
            </button>

            <button 
              className="glass-btn glass-btn-primary" 
              onClick={handleExportPDF}
              disabled={isExporting}
              style={{ gap: '8px', padding: '8px 20px' }}
            >
              <Download size={18} />
              <span>{isExporting ? 'Exporting...' : 'Export'}</span>
            </button>
          </>
        )}
      </div>
    </header>
  );
}
