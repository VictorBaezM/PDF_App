import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { AppProvider, useApp } from '../core/AppContext';
import { annotationStore } from '../core/shared-annotation-store';
import { AnnotationExporter } from '../core/annotation-exporter';
import { importPdfAnnotationsToStore } from '../core/AppContext';
import { PDFDocument } from 'pdf-lib';

describe('All Preset Stamps and Custom Image Stamp General Verification', () => {
  let basePdfBytes;

  beforeEach(async () => {
    annotationStore.clear();
    const pdfDoc = await PDFDocument.create();
    pdfDoc.addPage([600, 800]);
    basePdfBytes = await pdfDoc.save();
  });

  it('verifies export and re-import for every preset stamp (APPROVED, PASSED, CONFIDENTIAL, DRAFT, FINAL, EXPIRED) without hardcoding', async () => {
    const presetStamps = [
      { text: 'APPROVED', color: '#10b981' },
      { text: 'PASSED', color: '#10b981' },
      { text: 'CONFIDENTIAL', color: '#ef4444' },
      { text: 'DRAFT', color: '#f59e0b' },
      { text: 'FINAL', color: '#3b82f6' },
      { text: 'EXPIRED', color: '#6b7280' },
    ];

    // Add each preset stamp dynamically to annotationStore
    presetStamps.forEach((stamp, idx) => {
      annotationStore.add({
        type: 'stamp',
        stampType: 'preset',
        pageIndex: 0,
        rect: [50 + idx * 80, 500, 120 + idx * 80, 540],
        stampText: stamp.text,
        color: stamp.color,
      });
    });

    expect(annotationStore.getAll().length).toBe(6);

    // Export PDF with all 6 preset stamps
    const exportedBytes = await AnnotationExporter.exportPDFWithAnnotations(basePdfBytes, annotationStore.getAll());
    annotationStore.clear();

    // Re-import exported PDF and verify all 6 stamps are parsed cleanly
    const tempStore = {
      annots: [],
      add(a) { this.annots.push(a); },
      getAll() { return this.annots; },
    };

    await importPdfAnnotationsToStore(exportedBytes, tempStore);
    const imported = tempStore.getAll();
    expect(imported.length).toBe(6);

    const importedTexts = imported.map((a) => a.stampText || a.contents);
    expect(importedTexts).toContain('APPROVED');
    expect(importedTexts).toContain('PASSED');
    expect(importedTexts).toContain('CONFIDENTIAL');
    expect(importedTexts).toContain('DRAFT');
    expect(importedTexts).toContain('FINAL');
    expect(importedTexts).toContain('EXPIRED');
  });

  it('verifies custom image stamp embedding and export workflow', async () => {
    // 1x1 transparent PNG data URL
    const transparentPngDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    annotationStore.add({
      type: 'stamp',
      stampType: 'custom_image',
      dataUrl: transparentPngDataUrl,
      pageIndex: 0,
      rect: [100, 300, 250, 400],
    });

    // Export PDF with custom image stamp
    const exportedBytes = await AnnotationExporter.exportPDFWithAnnotations(basePdfBytes, annotationStore.getAll());
    expect(exportedBytes).toBeDefined();
    expect(exportedBytes.byteLength).toBeGreaterThan(0);

    annotationStore.clear();

    // Re-import exported PDF
    const tempStore = {
      annots: [],
      add(a) { this.annots.push(a); },
      getAll() { return this.annots; },
    };

    await importPdfAnnotationsToStore(exportedBytes, tempStore);
    expect(tempStore.getAll().length).toBe(1);
    expect(tempStore.getAll()[0].type).toBe('stamp');
  });
});
