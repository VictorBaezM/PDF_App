import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { AppProvider, useApp } from '../core/AppContext';
import { annotationStore } from '../core/shared-annotation-store';
import { AnnotationExporter } from '../core/annotation-exporter';
import { importPdfAnnotationsToStore } from '../core/AppContext';
import { PDFDocument } from 'pdf-lib';

describe('Undo & Re-opened Document Editing Workflow', () => {
  let basePdfBytes;

  beforeEach(async () => {
    annotationStore.clear();
    const pdfDoc = await PDFDocument.create();
    pdfDoc.addPage([600, 800]);
    basePdfBytes = await pdfDoc.save();
  });

  it('verifies Undo action removes newly added underline annotation from store and canvas', async () => {
    const wrapper = ({ children }) => <AppProvider>{children}</AppProvider>;
    const { result } = renderHook(() => useApp(), { wrapper });

    await act(async () => {
      await result.current.loadPdfFile(basePdfBytes, 'test.pdf');
    });

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

    expect(annotationStore.getByPage(0).length).toBe(1);

    act(() => {
      annotationStore.undo();
    });

    expect(annotationStore.getByPage(0).length).toBe(0);
  });

  it('verifies user workflow: upload -> annotate (square, stamp, text, underline, strikethrough) -> export -> re-upload -> delete annotations -> re-export -> confirm zero annotations in PDF catalog', async () => {
    // Step 1: Add all types of annotations
    annotationStore.add({
      type: 'square',
      pageIndex: 0,
      rect: [100, 400, 250, 500],
      color: '#3b82f6',
    });
    annotationStore.add({
      type: 'stamp',
      pageIndex: 0,
      rect: [300, 400, 450, 450],
      stampText: 'CONFIDENTIAL',
      color: '#ef4444',
    });
    annotationStore.add({
      type: 'textbox',
      pageIndex: 0,
      rect: [100, 200, 250, 250],
      contents: 'Sample Text',
      color: '#10b981',
    });
    annotationStore.add({
      type: 'underline',
      pageIndex: 0,
      rect: [100, 600, 300, 620],
      color: '#000000',
      quadPoints: [100, 620, 300, 620, 100, 600, 300, 600],
    });
    annotationStore.add({
      type: 'strikeout',
      pageIndex: 0,
      rect: [100, 650, 300, 670],
      color: '#ef4444',
      quadPoints: [100, 670, 300, 670, 100, 650, 300, 650],
    });

    // Step 2: Export annotated PDF
    const firstExportBytes = await AnnotationExporter.exportPDFWithAnnotations(basePdfBytes, annotationStore.getAll());
    annotationStore.clear();

    const exportedFile = new File([firstExportBytes], 'reopened.pdf', { type: 'application/pdf' });
    exportedFile.exportedBytes = firstExportBytes;

    // Step 3: Re-upload the exported PDF into App context
    const wrapper = ({ children }) => <AppProvider>{children}</AppProvider>;
    const { result } = renderHook(() => useApp(), { wrapper });

    await act(async () => {
      await result.current.loadPdfFile(exportedFile, 'reopened.pdf');
    });

    // Verify all 5 annotations were parsed into store
    const imported = annotationStore.getByPage(0);
    expect(imported.length).toBe(5);

    // Step 4: Delete EVERY annotation (simulate user selecting and pressing Delete)
    const allIds = imported.map((a) => a.id);
    act(() => {
      for (const id of allIds) {
        annotationStore.remove(id);
      }
    });

    expect(annotationStore.getAll().length).toBe(0);

    // Step 5: Export the document again after deleting all annotations
    const secondExportBytes = await AnnotationExporter.exportPDFWithAnnotations(firstExportBytes, annotationStore.getAll());

    // Step 6: Verify the second exported PDF has ZERO annotations in its PDF catalog
    const tempStore = {
      annots: [],
      add(a) { this.annots.push(a); },
      getAll() { return this.annots; },
    };

    await importPdfAnnotationsToStore(secondExportBytes, tempStore);
    expect(tempStore.getAll().length).toBe(0);
  });
});
