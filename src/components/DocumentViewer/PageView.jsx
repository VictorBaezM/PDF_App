import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../../core/AppContext';
import { PDFRenderer } from '../../core/pdf-renderer';
import { FabricLayer } from '../../core/fabric-layer';
import { CoordinateTranslator } from '../../core/coordinate-translator';
import { annotationStore } from '../../core/shared-annotation-store';
import { TextMarkupUtil } from '../../core/text-markup';
import { triggerFeedback } from '../FeedbackToast/FeedbackToast';

export function PageView({ pageNumber }) {
  const { state } = useApp();
  const canvasRef = useRef(null);
  const textLayerRef = useRef(null);
  const annotCanvasRef = useRef(null);
  const containerRef = useRef(null);
  const fabricLayerRef = useRef(null);
  const pdfRendererRef = useRef(null);

  const [viewportSize, setViewportSize] = useState({ width: 600, height: 800 });
  const [isRendering, setIsRendering] = useState(false);

  // Maintain renderer instance per PageView component
  if (!pdfRendererRef.current) {
    pdfRendererRef.current = new PDFRenderer();
  }

  const isCurrentPage = state.currentPage === pageNumber;

  // Auto-scroll current active page into view when selected
  useEffect(() => {
    if (isCurrentPage && containerRef.current && typeof containerRef.current.scrollIntoView === 'function') {
      try {
        containerRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } catch (e) {
        // Ignored in test environment if smooth scroll isn't supported
      }
    }
  }, [isCurrentPage]);

  const pageRotation = (state.pageRotations && state.pageRotations[pageNumber - 1]) || 0;

  useEffect(() => {
    let isCancelled = false;

    async function render() {
      if ((!state.pdfDocument && !state.pdfBytes) || !canvasRef.current) return;

      try {
        setIsRendering(true);
        const renderer = pdfRendererRef.current;

        if (state.pdfDocument) {
          renderer.setDocument(state.pdfDocument);
        } else if (state.pdfBytes && !renderer.pdfDocument) {
          await renderer.loadDocument(state.pdfBytes);
        }

        const viewport = await renderer.renderPage(
          pageNumber,
          canvasRef.current,
          state.zoomLevel,
          pageRotation
        );

        if (!isCancelled && viewport) {
          setViewportSize({ width: viewport.width, height: viewport.height });

          // Render text layer overlay if container exists
          if (textLayerRef.current) {
            await renderer.renderTextLayer(pageNumber, textLayerRef.current, viewport);
          }

          // Initialize Fabric.js annotation layer
          if (annotCanvasRef.current) {
            const coordTranslator = new CoordinateTranslator(
              viewport.width / viewport.scale,
              viewport.height / viewport.scale,
              viewport.scale
            );

            if (!fabricLayerRef.current) {
              fabricLayerRef.current = new FabricLayer(
                annotCanvasRef.current,
                pageNumber - 1,
                coordTranslator,
                annotationStore
              );
            } else if (typeof fabricLayerRef.current.setCoordinateTranslator === 'function') {
              fabricLayerRef.current.setCoordinateTranslator(coordTranslator);
            }

            fabricLayerRef.current.setDimensions(viewport.width, viewport.height);
            fabricLayerRef.current.setTool(state.activeTool, state.toolOptions);
          }
        }
      } catch (err) {
        console.error(`Error rendering page ${pageNumber}:`, err);
      } finally {
        if (!isCancelled) setIsRendering(false);
      }
    }

    render();

    return () => {
      isCancelled = true;
    };
  }, [state.pdfDocument, state.pdfBytes, pageNumber, state.zoomLevel, pageRotation]);

  // Effect B: Lightweight tool & options updates (does NOT destroy FabricLayer)
  useEffect(() => {
    if (fabricLayerRef.current) {
      fabricLayerRef.current.setTool(state.activeTool, state.toolOptions);
    }
  }, [state.activeTool, state.toolOptions]);

  // Effect C: Cleanup FabricLayer on unmount only
  useEffect(() => {
    return () => {
      if (fabricLayerRef.current && typeof fabricLayerRef.current.destroy === 'function') {
        fabricLayerRef.current.destroy();
        fabricLayerRef.current = null;
      }
    };
  }, []);

  // Handle text selection markup (Highlight, Underline, Strikethrough)
  const handleMouseUp = () => {
    if (['highlight', 'underline', 'strikeout'].includes(state.activeTool)) {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) return;

      if (textLayerRef.current && !textLayerRef.current.contains(selection.anchorNode)) {
        return;
      }

      const range = selection.getRangeAt(0);
      const clientRects = Array.from(range.getClientRects());
      const containerBounds = containerRef.current?.getBoundingClientRect();

      if (clientRects.length > 0 && containerBounds) {
        const coordTranslator = new CoordinateTranslator(
          viewportSize.width / state.zoomLevel,
          viewportSize.height / state.zoomLevel,
          state.zoomLevel
        );

        const result = TextMarkupUtil.extractQuadPointsFromRects(
          clientRects,
          containerBounds,
          coordTranslator
        );

        if (result) {
          let markupColor = '#000000';
          let markupOpacity = 1.0;

          const rawColor = state.toolOptions[state.activeTool + 'Color'] || state.toolOptions.inkColor || state.toolOptions.highlightColor || '#000000';
          if (Array.isArray(rawColor)) {
            const r = Math.round((rawColor[0] || 0) * 255);
            const g = Math.round((rawColor[1] || 0) * 255);
            const b = Math.round((rawColor[2] || 0) * 255);
            markupColor = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
          } else if (typeof rawColor === 'string') {
            markupColor = rawColor;
          }

          if (state.activeTool === 'highlight') {
            markupOpacity = state.toolOptions.opacity !== undefined ? state.toolOptions.opacity : 0.30;
          } else {
            markupOpacity = 1.0;
          }

          const addedAnnot = annotationStore.add({
            type: state.activeTool,
            pageIndex: pageNumber - 1,
            rect: result.overallPdfRect,
            quadPoints: result.quadPoints,
            color: markupColor,
            opacity: markupOpacity,
          });

          // Visually render markup on canvas immediately
          if (fabricLayerRef.current) {
            fabricLayerRef.current.renderMarkupAnnotation(addedAnnot);
          }

          triggerFeedback(`Text ${state.activeTool} applied to page ${pageNumber}!`);
          selection.removeAllRanges();
        }
      }
    }
  };

  const isMarkupToolActive = ['highlight', 'underline', 'strikeout'].includes(state.activeTool);

  return (
    <div
      ref={containerRef}
      onMouseUp={handleMouseUp}
      className={`page-view-container glass-panel animate-fade-in ${isCurrentPage ? 'active-page-view' : ''}`}
      data-page-number={pageNumber}
      style={{
        position: 'relative',
        width: `${viewportSize.width}px`,
        height: `${viewportSize.height}px`,
        backgroundColor: '#ffffff',
        boxShadow: isCurrentPage ? 'var(--shadow-neon-cyan), var(--shadow-page)' : 'var(--shadow-page)',
        border: isCurrentPage ? '2px solid var(--neon-cyan)' : '2px solid transparent',
        borderRadius: '6px',
        margin: '0 auto 32px auto',
        overflow: 'hidden',
        transition: 'all 0.25s ease',
      }}
    >
      {/* PDF.js HiDPI Canvas Layer */}
      <canvas
        ref={canvasRef}
        className="pdf-canvas"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          display: 'block',
          zIndex: 1,
        }}
      />

      {/* PDF.js Text Layer Overlay for Selection & Copy */}
      <div
        ref={textLayerRef}
        className="text-layer"
        style={{
          pointerEvents: isMarkupToolActive ? 'auto' : 'none',
          zIndex: isMarkupToolActive ? 10 : 2,
        }}
      />

      {/* Fabric.js Interactive Annotation Canvas Overlay */}
      <canvas
        ref={annotCanvasRef}
        className="annotation-canvas"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          zIndex: isMarkupToolActive ? 1 : 3,
          pointerEvents: isMarkupToolActive ? 'none' : 'auto',
        }}
      />

      {/* Loading overlay indicator during zoom/render */}
      {isRendering && (
        <div
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            padding: '4px 8px',
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(15, 19, 34, 0.85)',
            color: 'var(--neon-cyan)',
            fontSize: '0.75rem',
            pointerEvents: 'none',
            zIndex: 20,
          }}
        >
          Rendering...
        </div>
      )}
    </div>
  );
}
