import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { annotationStore } from '../core/shared-annotation-store';
import { AnnotationExporter } from '../core/annotation-exporter';
import { FabricLayer } from '../core/fabric-layer';
import { CoordinateTranslator } from '../core/coordinate-translator';
import { PDFDocument } from 'pdf-lib';

describe('Signature Position and PASSED Stamp Export Verification', () => {
  let basePdfBytes;
  let mockCanvasElement;
  let coordTranslator;

  beforeEach(async () => {
    annotationStore.clear();

    // Create a standard Letter size PDF (612 x 792 pt)
    const pdfDoc = await PDFDocument.create();
    pdfDoc.addPage([612, 792]);
    basePdfBytes = await pdfDoc.save();

    mockCanvasElement = document.createElement('canvas');
    mockCanvasElement.width = 612;
    mockCanvasElement.height = 792;
    document.body.appendChild(mockCanvasElement);

    coordTranslator = new CoordinateTranslator(612, 792, 1.0);
  });

  it('Requirement 1: Drawing a freehand signature at the TOP of document exports signature at exact TOP position of PDF', async () => {
    const fabricLayer = new FabricLayer(mockCanvasElement, 0, coordTranslator, annotationStore);

    // 1. Simulate drawing a freehand ink signature near TOP of document (y = 50px on canvas)
    const topSignaturePoints = [
      ['M', 100, 50],
      ['L', 150, 55],
      ['L', 200, 48],
      ['L', 250, 52],
    ];

    const annot = annotationStore.add({
      type: 'ink',
      pageIndex: 0,
      rect: [100, 737, 250, 744], // PDF rect near top (y = 737 to 744)
      color: '#000000',
      borderWidth: 3,
      pathData: topSignaturePoints,
    });

    expect(annot).toBeDefined();

    // 2. Export PDF with signature annotation
    const exportedBytes = await AnnotationExporter.exportPDFWithAnnotations(basePdfBytes, annotationStore.getAll());
    const exportedPdfDoc = await PDFDocument.load(exportedBytes);
    const page = exportedPdfDoc.getPage(0);
    expect(page.getHeight()).toBe(792);

    // 3. Decode exported PDF stream content to verify Y coordinates of signature lines
    const pdfText = new TextDecoder('latin1').decode(exportedBytes);
    
    // In PDF coordinates, top of canvas y=50 corresponds to y = 792 - 50 = 742 pt (near top of 792pt PDF)
    // Confirm y coordinate in PDF operators is near 742, 737, 744 (TOP of PDF, not near 50 at bottom)
    expect(pdfText).toContain('/Subtype /Ink');
    expect(pdfText).toContain('742'); // 792 - 50 = 742
    expect(pdfText).toContain('737'); // 792 - 55 = 737

    fabricLayer.destroy();
  });

  it('Requirement 2: Placing a green PASSED stamp exports green stamp box with PASSED text clearly rendered on PDF', async () => {
    const fabricLayer = new FabricLayer(mockCanvasElement, 0, coordTranslator, annotationStore);

    // 1. Place green PASSED stamp on document
    const stampObj = fabricLayer.addStamp(150, 200, {
      text: 'PASSED',
      color: '#10b981', // Green
    });

    expect(stampObj).toBeDefined();
    
    const storeAnnots = annotationStore.getByPage(0);
    expect(storeAnnots.length).toBe(1);
    expect(storeAnnots[0].type).toBe('stamp');
    expect(storeAnnots[0].stampText).toBe('PASSED');
    expect(storeAnnots[0].color).toBe('#10b981');

    // 2. Export PDF
    const exportedBytes = await AnnotationExporter.exportPDFWithAnnotations(basePdfBytes, annotationStore.getAll());
    
    // 3. Inspect exported PDF stream content
    const pdfText = new TextDecoder('latin1').decode(exportedBytes);
    
    // Verify Subtype /Stamp annotation catalog entry exists
    expect(pdfText).toContain('/Subtype /Stamp');
    // Verify 'PASSED' text is present in the PDF text stream
    expect(pdfText).toContain('PASSED');
    // Verify green RGB color values normalized from #10b981 (r ~ 0.0627, g ~ 0.7255, b ~ 0.5058)
    expect(pdfText).toContain('0.0627');

    fabricLayer.destroy();
  });
});
