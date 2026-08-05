import { describe, it, expect, beforeEach } from 'vitest';
import { FabricLayer } from '../core/fabric-layer';
import { CoordinateTranslator } from '../core/coordinate-translator';
import { AnnotationStore } from '../core/annotation-store';
import { annotationStore } from '../core/shared-annotation-store';
import { PDFDocument } from 'pdf-lib';
import { AppProvider } from '../core/AppContext';
import { renderHook, act } from '@testing-library/react';
import { useApp } from '../core/AppContext';
import React from 'react';

describe('Strikethrough Positioning & Re-open Verification', () => {
  let store;
  let coordTranslator;
  let mockCanvasElement;

  beforeEach(() => {
    store = new AnnotationStore();
    coordTranslator = new CoordinateTranslator(600, 800, 1.0);
    mockCanvasElement = document.createElement('canvas');
    mockCanvasElement.width = 600;
    mockCanvasElement.height = 800;
    document.body.appendChild(mockCanvasElement);
  });

  it('positions strikethrough lines directly through 50% vertical center (x-height) of selected text rect', () => {
    // PDF rect: [x1=100, y1=200, x2=300, y2=240]
    // Canvas coords (800 height): y=560..600, height=40. Vertical center (50% x-height) = 560 + 20 = 580.
    const textRect = [100, 200, 300, 240];
    const annot = store.add({
      type: 'strikeout',
      pageIndex: 0,
      rect: textRect,
      color: '#ff0000',
      opacity: 1.0,
    });

    const fabricLayer = new FabricLayer(mockCanvasElement, 0, coordTranslator, store);
    const fabricObj = fabricLayer.renderMarkupAnnotation(annot);

    expect(fabricObj).not.toBeNull();
    expect(fabricObj.y1).toBe(580);
    expect(fabricObj.y2).toBe(580);

    fabricLayer.destroy();
  });

  it('positions multi-line strikethrough lines through 50% vertical center of each text line', () => {
    // Line 1 quadPoints (PDF y: 680..700, canvas y: 100..120, height: 20 -> midY = 110)
    // Line 2 quadPoints (PDF y: 610..650, canvas y: 150..190, height: 40 -> midY = 170)
    const quadPoints = [
      50, 700, 250, 700, 50, 680, 250, 680, // Line 1 (Canvas y: 100..120)
      50, 650, 200, 650, 50, 610, 200, 610, // Line 2 (Canvas y: 150..190)
    ];
    const annot = store.add({
      type: 'strikeout',
      pageIndex: 0,
      rect: [50, 610, 250, 700],
      quadPoints: quadPoints,
      color: '#000000',
      opacity: 1.0,
    });

    const fabricLayer = new FabricLayer(mockCanvasElement, 0, coordTranslator, store);
    const fabricObj = fabricLayer.renderMarkupAnnotation(annot);

    expect(fabricObj).not.toBeNull();
    const lines = fabricObj.getObjects ? fabricObj.getObjects() : [fabricObj];
    expect(lines.length).toBe(2);

    // Line 1: canvas top 100, height 20 -> midY = 110
    expect(lines[0].y1).toBe(110);
    expect(lines[0].y2).toBe(110);

    // Line 2: canvas top 150, height 40 -> midY = 170
    expect(lines[1].y1).toBe(170);
    expect(lines[1].y2).toBe(170);

    fabricLayer.destroy();
  });

  it('clears annotationStore and prevents duplicate elements when re-opening a document', async () => {
    // Pre-populate shared annotation store with an annotation
    annotationStore.add({
      type: 'strikeout',
      pageIndex: 0,
      rect: [100, 100, 200, 120],
    });
    expect(annotationStore.getAll().length).toBeGreaterThan(0);

    const wrapper = ({ children }) => <AppProvider>{children}</AppProvider>;
    const { result } = renderHook(() => useApp(), { wrapper });

    const sampleDoc = await PDFDocument.create();
    sampleDoc.addPage([600, 800]);
    const pdfBytes = await sampleDoc.save();
    const file = new File([pdfBytes], 'test-reopen.pdf', { type: 'application/pdf' });

    // Open document 1st time
    await act(async () => {
      await result.current.loadPdfFile(file, 'test-reopen.pdf');
    });

    // annotationStore should be cleared when new document is loaded
    expect(annotationStore.getAll().length).toBe(0);

    // Add new annotation
    annotationStore.add({
      type: 'textbox',
      pageIndex: 0,
      rect: [50, 50, 150, 80],
      contents: 'Test annotation',
    });
    expect(annotationStore.getAll().length).toBe(1);

    // Re-open document 2nd time
    await act(async () => {
      await result.current.loadPdfFile(file, 'test-reopen.pdf');
    });

    // Verify annotationStore is cleared again and no overlay duplicate interactive objects remain
    expect(annotationStore.getAll().length).toBe(0);
  });

  it('detects and parses embedded PDF annotations into interactive, movable, editable objects without flattening or duplicating them when re-opening an exported PDF', async () => {
    const { AnnotationExporter } = await import('../core/annotation-exporter');

    // 1. Create source PDF document and add sample annotations (textbox, square, ink, stamp, highlight)
    const baseDoc = await PDFDocument.create();
    baseDoc.addPage([600, 800]);
    const baseBytes = await baseDoc.save({ useObjectStreams: false });

    const localStore = new AnnotationStore();
    localStore.add({
      type: 'textbox',
      pageIndex: 0,
      rect: [100, 500, 250, 540],
      contents: 'Interactive Editable Note',
      color: '#3b82f6',
      fontSize: 16,
    });
    localStore.add({
      type: 'square',
      pageIndex: 0,
      rect: [50, 300, 200, 420],
      color: '#ef4444',
      borderWidth: 2,
    });
    localStore.add({
      type: 'stamp',
      pageIndex: 0,
      rect: [300, 600, 450, 660],
      stampText: 'VERIFIED',
      color: '#10b981',
    });

    // 2. Export PDF document with embedded PDF annotations
    const exportedBytes = await AnnotationExporter.exportPDFWithAnnotations(baseBytes, localStore.getAll());
    const exportedFile = new File([exportedBytes], 'exported-annotated.pdf', { type: 'application/pdf' });
    exportedFile.exportedBytes = exportedBytes;

    // 3. Load exported PDF in App context (simulating opening in app)
    const wrapper = ({ children }) => <AppProvider>{children}</AppProvider>;
    const { result } = renderHook(() => useApp(), { wrapper });

    await act(async () => {
      await result.current.loadPdfFile(exportedFile, 'exported-annotated.pdf');
    });

    const importedAnnots = annotationStore.getByPage(0);
    expect(importedAnnots.length).toBe(3);

    const types = importedAnnots.map(a => a.type);
    expect(types).toContain('textbox');
    expect(types).toContain('square');
    expect(types).toContain('stamp');

    // 5. Verify FabricLayer converts imported annotations into interactive, movable, editable objects
    const fabricLayer = new FabricLayer(mockCanvasElement, 0, coordTranslator, annotationStore);
    fabricLayer.loadAnnotationsFromStore();

    const canvasObjects = fabricLayer.fabricCanvas.getObjects();
    expect(canvasObjects.length).toBe(3);
    expect(canvasObjects.every(obj => obj.selectable && obj.evented)).toBe(true);

    fabricLayer.destroy();
  });
});
