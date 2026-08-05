import { describe, it, expect, beforeEach } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { AnnotationStore } from '../core/annotation-store';
import { AnnotationExporter } from '../core/annotation-exporter';
import { FabricLayer } from '../core/fabric-layer';
import { CoordinateTranslator } from '../core/coordinate-translator';

describe('Rectangle Shape & Strikethrough Color Export and Selection Integrity', () => {
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

  it('retains blue color for rectangle shapes in exported PDFs without turning black when color is hex, rgb string, or array', async () => {
    // 1. Add blue rectangle annotation (#3b82f6)
    store.add({
      type: 'shape',
      shapeType: 'rectangle',
      pageIndex: 0,
      rect: [50, 50, 200, 150],
      color: '#3b82f6',
      borderWidth: 3,
    });

    // 2. Add rectangle with rgb(...) color string (as produced by Fabric canvas)
    store.add({
      type: 'shape',
      shapeType: 'rectangle',
      pageIndex: 0,
      rect: [250, 50, 400, 150],
      color: 'rgb(59, 130, 246)',
      borderWidth: 2,
    });

    // Export PDF
    const pdfDoc = await PDFDocument.create();
    pdfDoc.addPage([600, 800]);
    const pdfBytes = await pdfDoc.save();

    const exportedBytes = await AnnotationExporter.exportPDFWithAnnotations(pdfBytes, store.getAll());
    const exportedDoc = await PDFDocument.load(exportedBytes);
    expect(exportedDoc.getPageCount()).toBe(1);

    const pdfString = new TextDecoder('latin1').decode(exportedBytes);
    
    // Verify PDF stream contains non-zero blue RGB color array values (/C [ 0.231... 0.509... 0.964... ]) and NOT default black [0 0 0]
    expect(pdfString).toContain('/Square');
    expect(pdfString).toContain('0.9647058823529412');
  });

  it('maintains selected color for strikethrough lines without reversing to blue or black when selected', async () => {
    // 1. Create a red strikethrough line (#ef4444)
    const strikethroughAnnot = store.add({
      type: 'strikeout',
      pageIndex: 0,
      rect: [100, 200, 300, 220],
      quadPoints: [100, 220, 300, 220, 100, 200, 300, 200],
      color: '#ef4444',
      opacity: 1.0,
    });

    const fabricLayer = new FabricLayer(mockCanvasElement, 0, coordTranslator, store);
    const fabricObj = fabricLayer.renderMarkupAnnotation(strikethroughAnnot);

    expect(fabricObj).not.toBeNull();

    // 2. Select the strikethrough line in Fabric layer and invoke setTool with default inkColor (#3b82f6)
    fabricLayer.fabricCanvas.setActiveObject(fabricObj);
    fabricLayer.setTool('select', { inkColor: '#3b82f6', strikeoutColor: '#ef4444' });

    // 3. Verify annotation in store STILL retains red color (#ef4444) and did NOT reverse to blue (#3b82f6) or black (#000000)
    const updatedAnnot = store.getAll().find((a) => a.id === strikethroughAnnot.id);
    expect(updatedAnnot.color).toBe('#ef4444');

    // 4. Verify Exported PDF contains red strikeout color
    const pdfDoc = await PDFDocument.create();
    pdfDoc.addPage([600, 800]);
    const pdfBytes = await pdfDoc.save();

    const exportedBytes = await AnnotationExporter.exportPDFWithAnnotations(pdfBytes, store.getAll());
    const pdfString = new TextDecoder('latin1').decode(exportedBytes);
    expect(pdfString).toContain('/StrikeOut');
    expect(pdfString).toContain('0.937');

    fabricLayer.destroy();
  });
});
