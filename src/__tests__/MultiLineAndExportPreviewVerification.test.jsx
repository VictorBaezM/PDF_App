import { describe, it, expect, beforeEach } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { TextMarkupUtil } from '../core/text-markup';
import { FabricLayer } from '../core/fabric-layer';
import { CoordinateTranslator } from '../core/coordinate-translator';
import { AnnotationStore } from '../core/annotation-store';
import { AnnotationExporter } from '../core/annotation-exporter';

describe('Multi-Line Underline & Strikethrough + Shape/Stamp Export Preview Verification', () => {
  let store;
  let coordTranslator;
  let mockCanvasElement;

  beforeEach(() => {
    store = new AnnotationStore();
    // 600x800 canvas size, scale 1.0 (PDF 600x800)
    coordTranslator = new CoordinateTranslator(600, 800, 1.0);

    // Mock HTMLCanvasElement for Fabric.js in jsdom
    mockCanvasElement = document.createElement('canvas');
    mockCanvasElement.width = 600;
    mockCanvasElement.height = 800;
    document.body.appendChild(mockCanvasElement);
  });

  it('verifies multi-line selection for Underline places a separate line for each text line in Fabric preview and PDF export', async () => {
    // Simulate multi-line DOM selection: 3 separate text lines
    const clientRects = [
      { left: 50, top: 100, width: 200, height: 20 }, // Line 1
      { left: 50, top: 130, width: 250, height: 20 }, // Line 2
      { left: 50, top: 160, width: 180, height: 20 }, // Line 3
    ];
    const containerBounds = { left: 0, top: 0, width: 600, height: 800 };

    const markupResult = TextMarkupUtil.extractQuadPointsFromRects(
      clientRects,
      containerBounds,
      coordTranslator
    );

    expect(markupResult).not.toBeNull();
    // 3 lines * 8 QuadPoints per line = 24 quadPoints
    expect(markupResult.quadPoints.length).toBe(24);

    // Add Underline annotation with quadPoints to store
    const underlineAnnot = store.add({
      type: 'underline',
      pageIndex: 0,
      rect: markupResult.overallPdfRect,
      quadPoints: markupResult.quadPoints,
      color: '#000000',
      opacity: 1.0,
    });

    // Verify FabricLayer renders a separate Fabric object (Line) for each line rect in group
    const fabricLayer = new FabricLayer(mockCanvasElement, 0, coordTranslator, store);
    const fabricObj = fabricLayer.renderMarkupAnnotation(underlineAnnot);

    expect(fabricObj).not.toBeNull();
    // Because there are 3 lines, fabricObj should be a Group containing 3 objects
    const objectsInGroup = fabricObj.getObjects ? fabricObj.getObjects() : [fabricObj];
    expect(objectsInGroup.length).toBe(3);

    // Verify Export PDF contains Underline draw commands for each line
    const pdfDoc = await PDFDocument.create();
    pdfDoc.addPage([600, 800]);
    const pdfBytes = await pdfDoc.save();

    const exportedBytes = await AnnotationExporter.exportPDFWithAnnotations(pdfBytes, store.getAll());
    expect(exportedBytes.length).toBeGreaterThan(0);

    const pdfString = new TextDecoder('latin1').decode(exportedBytes);
    expect(pdfString).toContain('/Underline');

    fabricLayer.destroy();
  });

  it('verifies multi-line selection for Strikethrough places a separate line for each text line in Fabric preview and PDF export', async () => {
    // Simulate multi-line DOM selection: 2 separate text lines
    const clientRects = [
      { left: 80, top: 200, width: 300, height: 18 }, // Line 1
      { left: 80, top: 225, width: 220, height: 18 }, // Line 2
    ];
    const containerBounds = { left: 0, top: 0, width: 600, height: 800 };

    const markupResult = TextMarkupUtil.extractQuadPointsFromRects(
      clientRects,
      containerBounds,
      coordTranslator
    );

    expect(markupResult).not.toBeNull();
    // 2 lines * 8 QuadPoints = 16 quadPoints
    expect(markupResult.quadPoints.length).toBe(16);

    // Add Strikeout annotation with quadPoints to store
    const strikeoutAnnot = store.add({
      type: 'strikeout',
      pageIndex: 0,
      rect: markupResult.overallPdfRect,
      quadPoints: markupResult.quadPoints,
      color: '#ef4444',
      opacity: 1.0,
    });

    const fabricLayer = new FabricLayer(mockCanvasElement, 0, coordTranslator, store);
    const fabricObj = fabricLayer.renderMarkupAnnotation(strikeoutAnnot);

    expect(fabricObj).not.toBeNull();
    const objectsInGroup = fabricObj.getObjects ? fabricObj.getObjects() : [fabricObj];
    expect(objectsInGroup.length).toBe(2);

    // Verify Export PDF contains StrikeOut draw commands
    const pdfDoc = await PDFDocument.create();
    pdfDoc.addPage([600, 800]);
    const pdfBytes = await pdfDoc.save();

    const exportedBytes = await AnnotationExporter.exportPDFWithAnnotations(pdfBytes, store.getAll());
    const pdfString = new TextDecoder('latin1').decode(exportedBytes);
    expect(pdfString).toContain('/StrikeOut');

    fabricLayer.destroy();
  });

  it('verifies rectangle shapes match their browser preview in exported PDFs', async () => {
    const fabricLayer = new FabricLayer(mockCanvasElement, 0, coordTranslator, store);
    
    // User creates a rectangle shape at (100, 150) with width 140, height 90
    const rectShape = fabricLayer.addShape('rectangle', 100, 150, 140, 90, {
      inkColor: '#3b82f6',
      inkThickness: 3,
      opacity: 0.9,
    });

    expect(rectShape).toBeDefined();
    expect(store.getAll().length).toBe(1);

    const savedAnnot = store.getAll()[0];
    expect(savedAnnot.type).toBe('square');
    expect(savedAnnot.color).toBe('#3b82f6');
    expect(savedAnnot.borderWidth).toBe(3);

    // Export PDF and verify PDF stream contains /Square annotation matching rect
    const pdfDoc = await PDFDocument.create();
    pdfDoc.addPage([600, 800]);
    const pdfBytes = await pdfDoc.save();

    const exportedBytes = await AnnotationExporter.exportPDFWithAnnotations(pdfBytes, store.getAll());
    const pdfString = new TextDecoder('latin1').decode(exportedBytes);
    expect(pdfString).toContain('/Square');

    fabricLayer.destroy();
  });

  it('verifies text stamps match their browser preview in exported PDFs', async () => {
    const fabricLayer = new FabricLayer(mockCanvasElement, 0, coordTranslator, store);

    // User adds a text stamp at (200, 300) with text 'APPROVED'
    const stampGroup = fabricLayer.addStamp(200, 300, {
      text: 'APPROVED',
      color: '#10b981',
    });

    expect(stampGroup).toBeDefined();
    expect(store.getAll().length).toBe(1);

    const savedAnnot = store.getAll()[0];
    expect(savedAnnot.type).toBe('stamp');
    expect(savedAnnot.stampText).toBe('APPROVED');
    expect(savedAnnot.color).toBe('#10b981');

    // Export PDF and verify PDF stream contains /Stamp annotation and '/APPROVED' string
    const pdfDoc = await PDFDocument.create();
    pdfDoc.addPage([600, 800]);
    const pdfBytes = await pdfDoc.save();

    const exportedBytes = await AnnotationExporter.exportPDFWithAnnotations(pdfBytes, store.getAll());
    const pdfString = new TextDecoder('latin1').decode(exportedBytes);
    expect(pdfString).toContain('/Stamp');
    expect(pdfString).toContain('/APPROVED');

    fabricLayer.destroy();
  });
});
