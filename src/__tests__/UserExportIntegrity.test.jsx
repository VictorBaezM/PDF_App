import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { PDFModifier } from '../core/pdf-modifier';
import { AnnotationExporter } from '../core/annotation-exporter';
import { AnnotationStore } from '../core/annotation-store';

describe('Real User Workflow: Document Editing, Page Manipulation & Export Integrity', () => {
  it('executes real user editing workflow: delete page, merge document, add annotations, and verify export PDF bytes', async () => {
    // 1. Create a 3-page source PDF document
    const srcDoc = await PDFDocument.create();
    srcDoc.addPage([600, 400]);
    srcDoc.addPage([600, 400]);
    srcDoc.addPage([600, 400]);
    let currentBytes = await srcDoc.save({ useObjectStreams: false });

    // Verify initial page count is 3
    let doc = await PDFDocument.load(currentBytes);
    expect(doc.getPageCount()).toBe(3);

    // 2. User deletes Page 2 (index 1)
    currentBytes = await PDFModifier.deletePage(currentBytes, 1);
    doc = await PDFDocument.load(currentBytes);
    expect(doc.getPageCount()).toBe(2);

    // 3. User merges an extra 2-page PDF document
    const extraDoc = await PDFDocument.create();
    extraDoc.addPage([600, 400]);
    extraDoc.addPage([600, 400]);
    const extraBytes = await extraDoc.save({ useObjectStreams: false });

    currentBytes = await PDFModifier.mergePDFs([currentBytes, extraBytes]);
    doc = await PDFDocument.load(currentBytes);
    expect(doc.getPageCount()).toBe(4);

    // 4. User extracts Page 1 & 2
    const extractedBytes = await PDFModifier.extractPages(currentBytes, [0, 1]);
    const extractedDoc = await PDFDocument.load(extractedBytes);
    expect(extractedDoc.getPageCount()).toBe(2);

    // 5. User adds annotations (Highlight, Strikeout, Textbox, Ink, Shape, Stamp) to AnnotationStore
    const store = new AnnotationStore();

    store.add({
      type: 'highlight',
      pageIndex: 0,
      rect: [100, 200, 300, 220],
      color: '#fde047',
      opacity: 0.3,
    });

    store.add({
      type: 'strikeout',
      pageIndex: 0,
      rect: [100, 150, 250, 165],
      color: '#000000',
      opacity: 1.0,
    });

    store.add({
      type: 'textbox',
      pageIndex: 0,
      rect: [150, 300, 350, 340],
      contents: 'CONFIDENTIAL REVIEW',
      color: '#ef4444',
      fontSize: 20,
    });

    store.add({
      type: 'shape',
      shapeType: 'rectangle',
      pageIndex: 0,
      rect: [50, 50, 200, 120],
      color: '#3b82f6',
      borderWidth: 3,
    });

    store.add({
      type: 'ink',
      pageIndex: 0,
      rect: [80, 80, 180, 180],
      color: '#10b981',
      borderWidth: 4,
      pathData: [
        ['M', 80, 80],
        ['L', 120, 140],
        ['L', 180, 180],
      ],
    });

    store.add({
      type: 'stamp',
      stampText: 'APPROVED',
      pageIndex: 0,
      rect: [400, 300, 550, 360],
      color: '#10b981',
    });

    // 6. Export PDF with all annotations baked into PDF streams
    const exportedBytes = await AnnotationExporter.exportPDFWithAnnotations(currentBytes, store.getAll());
    const finalExportedDoc = await PDFDocument.load(exportedBytes);

    // Verify page count of exported document matches post-deletion & merge state (4 pages)
    expect(finalExportedDoc.getPageCount()).toBe(4);

    // Verify PDF binary output string contains baked annotation streams
    const exportedPdfString = new TextDecoder('latin1').decode(exportedBytes);
    expect(exportedPdfString).toContain('/Highlight');
    expect(exportedPdfString).toContain('/StrikeOut');
    expect(exportedPdfString).toContain('/Square');
    expect(exportedPdfString).toContain('/Ink');
    expect(exportedPdfString).toContain('/Stamp');
    expect(exportedPdfString).toContain('/APPROVED');
  });
});
