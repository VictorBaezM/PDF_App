import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { AppProvider, useApp } from '../core/AppContext';
import { annotationStore } from '../core/shared-annotation-store';
import { AnnotationExporter } from '../core/annotation-exporter';
import { FabricLayer } from '../core/fabric-layer';
import { CoordinateTranslator } from '../core/coordinate-translator';
import { PDFDocument } from 'pdf-lib';

describe('User Prompt Verification Suite', () => {
  let basePdfBytes;
  let mockCanvasElement;
  let coordTranslator;

  beforeEach(async () => {
    annotationStore.clear();

    // Create a standard base PDF (600x800)
    const pdfDoc = await PDFDocument.create();
    pdfDoc.addPage([600, 800]);
    basePdfBytes = await pdfDoc.save();

    // Setup canvas element for FabricLayer
    mockCanvasElement = document.createElement('canvas');
    mockCanvasElement.width = 600;
    mockCanvasElement.height = 800;
    document.body.appendChild(mockCanvasElement);

    coordTranslator = new CoordinateTranslator(600, 800, 1.0);
  });

  it('Requirement 1: Drawing an underline and clicking Undo removes the underline from both canvas and state', async () => {
    const fabricLayer = new FabricLayer(mockCanvasElement, 0, coordTranslator, annotationStore);

    // 1. Draw/add an underline annotation to store
    let underlineAnnot;
    act(() => {
      underlineAnnot = annotationStore.add({
        type: 'underline',
        pageIndex: 0,
        rect: [100, 500, 300, 520],
        color: '#000000',
        quadPoints: [100, 520, 300, 520, 100, 500, 300, 500],
      });
    });

    // Verify item added to store and rendered on fabric canvas
    expect(annotationStore.getByPage(0).length).toBe(1);
    expect(fabricLayer.fabricCanvas.getObjects().length).toBe(1);
    const fabricObj = fabricLayer.fabricCanvas.getObjects()[0];
    expect(fabricObj.annotationId).toBe(underlineAnnot.id);

    // 2. Click Undo
    act(() => {
      annotationStore.undo();
    });

    // 3. Verify underline is completely removed from BOTH state (annotationStore) AND canvas
    expect(annotationStore.getByPage(0).length).toBe(0);
    expect(fabricLayer.fabricCanvas.getObjects().length).toBe(0);

    fabricLayer.destroy();
  });

  it('Requirement 2: Uploading PDF, drawing square, underline, stamp, exporting and re-uploading allows selecting, moving, and deleting all imported elements without static duplicates', async () => {
    const fabricLayer1 = new FabricLayer(mockCanvasElement, 0, coordTranslator, annotationStore);

    // 1. Draw a square, underline, stamp, and strikethrough
    let squareObj, stampObj;
    act(() => {
      squareObj = fabricLayer1.addShape('rectangle', 100, 100, 150, 100, { inkColor: '#3b82f6', inkThickness: 2 });
      stampObj = fabricLayer1.addStamp(300, 100, { text: 'APPROVED', color: '#10b981' });

      annotationStore.add({
        type: 'underline',
        pageIndex: 0,
        rect: [100, 300, 300, 320],
        color: '#000000',
        quadPoints: [100, 320, 300, 320, 100, 300, 300, 300],
      });

      annotationStore.add({
        type: 'strikeout',
        pageIndex: 0,
        rect: [100, 400, 300, 420],
        color: '#ef4444',
        quadPoints: [100, 420, 300, 420, 100, 400, 300, 400],
      });
    });

    expect(annotationStore.getByPage(0).length).toBe(4);
    expect(fabricLayer1.fabricCanvas.getObjects().length).toBe(4);

    // 2. Export PDF with annotations
    const exportedBytes = await AnnotationExporter.exportPDFWithAnnotations(basePdfBytes, annotationStore.getAll());
    expect(exportedBytes.length).toBeGreaterThan(0);

    // Clear initial layer and store
    fabricLayer1.destroy();
    annotationStore.clear();
    expect(annotationStore.getByPage(0).length).toBe(0);

    // 3. Re-upload exported PDF using App context
    const exportedFile = new File([exportedBytes], 'exported.pdf', { type: 'application/pdf' });
    exportedFile.exportedBytes = exportedBytes;

    const wrapper = ({ children }) => <AppProvider>{children}</AppProvider>;
    const { result } = renderHook(() => useApp(), { wrapper });

    await act(async () => {
      await result.current.loadPdfFile(exportedFile, 'exported.pdf');
    });

    // 4. Verify all 4 imported annotations exist in store
    const importedAnnots = annotationStore.getByPage(0);
    expect(importedAnnots.length).toBe(4);
    const importedTypes = importedAnnots.map((a) => a.type);
    expect(importedTypes).toContain('square');
    expect(importedTypes).toContain('stamp');
    expect(importedTypes).toContain('underline');
    expect(importedTypes).toContain('strikeout');

    // 5. Attach new FabricLayer to simulate re-opened document canvas
    const fabricLayer2 = new FabricLayer(mockCanvasElement, 0, coordTranslator, annotationStore);
    const canvasObjects = fabricLayer2.fabricCanvas.getObjects();
    expect(canvasObjects.length).toBe(4);

    // Verify all imported canvas objects are selectable, moveable, and evented
    canvasObjects.forEach((obj) => {
      expect(obj.selectable).toBe(true);
      expect(obj.evented).toBe(true);
      expect(obj.annotationId).toBeDefined();
    });

    // 6. Delete each imported element one by one and check canvas cleanliness
    const objectsToDelete = [...canvasObjects];
    for (let i = 0; i < objectsToDelete.length; i++) {
      const obj = objectsToDelete[i];
      const initialCount = fabricLayer2.fabricCanvas.getObjects().length;

      act(() => {
        fabricLayer2.fabricCanvas.setActiveObject(obj);
        fabricLayer2.deleteActiveObject();
      });

      const remainingCanvasObjects = fabricLayer2.fabricCanvas.getObjects();
      expect(remainingCanvasObjects.length).toBe(initialCount - 1);
      expect(remainingCanvasObjects.find((o) => o.annotationId === obj.annotationId)).toBeUndefined();
    }

    // 7. Verify canvas is completely clean (0 objects, no residual duplicate static vector shapes)
    expect(fabricLayer2.fabricCanvas.getObjects().length).toBe(0);
    expect(annotationStore.getByPage(0).length).toBe(0);

    fabricLayer2.destroy();
  });
});
