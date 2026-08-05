import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { annotationStore } from '../core/shared-annotation-store';
import { AnnotationExporter } from '../core/annotation-exporter';
import { FabricLayer } from '../core/fabric-layer';
import { CoordinateTranslator } from '../core/coordinate-translator';
import { PDFDocument } from 'pdf-lib';

describe('User Verification Requirements 1 & 2', () => {
  let basePdfBytes;
  let mockCanvasElement;
  let coordTranslator;

  beforeEach(async () => {
    annotationStore.clear();

    // Create a 600x800 base PDF
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

  it('Requirement 1: When a PDF with annotations (square box) is loaded and deleted, IT DISAPPEARS IMMEDIATELY FROM PREVIEW CANVAS', async () => {
    // 1. Add a square box annotation to store (simulating an uploaded PDF with a square box)
    const squareAnnot = annotationStore.add({
      type: 'square',
      pageIndex: 0,
      rect: [100, 200, 300, 400],
      color: '#3b82f6',
      borderWidth: 2,
    });

    // 2. Attach FabricLayer to preview canvas
    const fabricLayer = new FabricLayer(mockCanvasElement, 0, coordTranslator, annotationStore);

    // Verify square box is present on preview canvas
    expect(fabricLayer.fabricCanvas.getObjects().length).toBe(1);
    const canvasObj = fabricLayer.fabricCanvas.getObjects()[0];
    expect(canvasObj.annotationId).toBe(squareAnnot.id);

    // 3. Select and delete the square box annotation
    fabricLayer.fabricCanvas.setActiveObject(canvasObj);
    const deleted = fabricLayer.deleteActiveObject();

    // Verify deletion succeeded
    expect(deleted).toBe(true);

    // 4. Assert: IT DISAPPEARS IMMEDIATELY FROM PREVIEW CANVAS (0 objects in canvas, 0 in store)
    expect(fabricLayer.fabricCanvas.getObjects().length).toBe(0);
    expect(annotationStore.getByPage(0).length).toBe(0);

    fabricLayer.destroy();
  });

  it('Requirement 2: Selecting the PASSED stamp, placing it on document, and exporting renders green box with PASSED word on exported PDF', async () => {
    const fabricLayer = new FabricLayer(mockCanvasElement, 0, coordTranslator, annotationStore);

    // 1. Select the PASSED stamp and place it on document
    const stampObj = fabricLayer.addStamp(150, 250, {
      text: 'PASSED',
      color: '#10b981',
    });

    // Verify stamp object added to canvas and annotation store
    expect(stampObj).toBeDefined();
    expect(fabricLayer.fabricCanvas.getObjects().length).toBe(1);
    
    const storeAnnots = annotationStore.getByPage(0);
    expect(storeAnnots.length).toBe(1);
    expect(storeAnnots[0].type).toBe('stamp');
    expect(storeAnnots[0].stampText).toBe('PASSED');
    expect(storeAnnots[0].color).toBe('#10b981');

    // 2. Export document
    const exportedBytes = await AnnotationExporter.exportPDFWithAnnotations(basePdfBytes, annotationStore.getAll());
    expect(exportedBytes).toBeDefined();
    expect(exportedBytes.length).toBeGreaterThan(0);

    // 3. Verify PDF structure of exported PDF
    const exportedPdfDoc = await PDFDocument.load(exportedBytes);
    expect(exportedPdfDoc.getPageCount()).toBe(1);

    // 4. Inspect binary content to confirm PASSED stamp text, green color RGB, and Stamp annotation subtype are cleanly present
    const pdfText = new TextDecoder('latin1').decode(exportedBytes);
    expect(pdfText).toContain('/Stamp');
    expect(pdfText).toContain('PASSED');
    // Green color #10b981 normalizes to [0.0627, 0.7255, 0.5059] -> RGBA / RGB operator in PDF stream
    expect(pdfText).toContain('0.0627');

    fabricLayer.destroy();
  });
});
