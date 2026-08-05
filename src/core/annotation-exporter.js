import { PDFDocument, PDFName, PDFString, PDFArray, PDFRef, rgb } from 'pdf-lib';

/**
 * Convert any color format (hex string '#3b82f6', rgb array [0.2, 0.5, 0.9], or color name) to PDF RGB float array [r, g, b] (0.0 to 1.0)
 */
function normalizeColorToPdfRgb(color) {
  if (!color) return [0.0, 0.0, 0.0];
  
  if (Array.isArray(color) && color.length >= 3) {
    const is255 = color.some((v) => v > 1.0);
    return is255 ? color.slice(0, 3).map((v) => v / 255) : color.slice(0, 3);
  }

  if (typeof color === 'object') {
    const r = color.r ?? color.R ?? 0;
    const g = color.g ?? color.G ?? 0;
    const b = color.b ?? color.B ?? 0;
    const is255 = r > 1 || g > 1 || b > 1;
    return is255 ? [r / 255, g / 255, b / 255] : [r, g, b];
  }

  if (typeof color === 'string') {
    const str = color.trim().toLowerCase();
    
    // Parse rgb(...) or rgba(...) strings
    const rgbMatch = str.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (rgbMatch) {
      return [
        parseInt(rgbMatch[1], 10) / 255,
        parseInt(rgbMatch[2], 10) / 255,
        parseInt(rgbMatch[3], 10) / 255,
      ];
    }

    // Color name map fallback
    const namedColors = {
      blue: [0.231, 0.51, 0.965],
      red: [0.937, 0.267, 0.267],
      green: [0.29, 0.87, 0.5],
      yellow: [0.99, 0.88, 0.28],
      black: [0.0, 0.0, 0.0],
      white: [1.0, 1.0, 1.0],
      purple: [0.545, 0.36, 0.965],
      pink: [0.957, 0.447, 0.714],
      orange: [0.96, 0.62, 0.07],
      cyan: [0.024, 0.714, 0.831],
    };
    if (namedColors[str]) {
      return namedColors[str];
    }

    let hex = str.replace('#', '');
    if (hex.length === 3) {
      hex = hex.split('').map((c) => c + c).join('');
    }
    if (hex.length === 6) {
      const num = parseInt(hex, 16);
      if (!isNaN(num)) {
        return [
          ((num >> 16) & 255) / 255,
          ((num >> 8) & 255) / 255,
          (num & 255) / 255,
        ];
      }
    }
  }

  return [0.0, 0.0, 0.0];
}

function parseSafeRect(rect) {
  const defaultRect = [100, 100, 250, 150];
  if (!Array.isArray(rect) || rect.length < 4) return defaultRect;
  const x1 = typeof rect[0] === 'number' && !isNaN(rect[0]) ? rect[0] : 100;
  const y1 = typeof rect[1] === 'number' && !isNaN(rect[1]) ? rect[1] : 100;
  const x2 = typeof rect[2] === 'number' && !isNaN(rect[2]) ? rect[2] : 250;
  const y2 = typeof rect[3] === 'number' && !isNaN(rect[3]) ? rect[3] : 150;
  return [x1, y1, x2, y2];
}

export class AnnotationExporter {
  /**
   * Export annotations from AnnotationStore into raw PDF bytes per ISO 32000 spec
   */
  static async exportPDFWithAnnotations(originalPdfBytes, annotations) {
    if (!originalPdfBytes) throw new Error('originalPdfBytes required');

    let cleanPdfBytes;
    if (originalPdfBytes instanceof Uint8Array) {
      cleanPdfBytes = originalPdfBytes.buffer.slice(
        originalPdfBytes.byteOffset,
        originalPdfBytes.byteOffset + originalPdfBytes.byteLength
      );
    } else if (originalPdfBytes instanceof ArrayBuffer) {
      cleanPdfBytes = originalPdfBytes;
    } else {
      cleanPdfBytes = originalPdfBytes;
    }

    const pdfDoc = await PDFDocument.load(cleanPdfBytes, { ignoreEncryption: true });
    const pagesCount = pdfDoc.getPageCount();

    // 1. Clear existing /Annots catalog from all pages in the PDF document
    for (let i = 0; i < pagesCount; i++) {
      const page = pdfDoc.getPage(i);
      page.node.delete(PDFName.of('Annots'));
    }

    if (!Array.isArray(annotations) || annotations.length === 0) {
      return await pdfDoc.save({ useObjectStreams: false });
    }

    // 2. Group active annotations by pageIndex
    const annotsByPage = new Map();
    for (const annot of annotations) {
      if (typeof annot.pageIndex === 'number' && annot.pageIndex >= 0 && annot.pageIndex < pagesCount) {
        if (!annotsByPage.has(annot.pageIndex)) {
          annotsByPage.set(annot.pageIndex, []);
        }
        annotsByPage.get(annot.pageIndex).push(annot);
      }
    }

    // 3. Attach fresh ISO 32000 /Annots catalog to pages that have active annotations
    for (const [pageIdx, pageAnnots] of annotsByPage.entries()) {
      const page = pdfDoc.getPage(pageIdx);
      const annotsArray = pdfDoc.context.obj([]);
      const annotsRef = pdfDoc.context.register(annotsArray);
      page.node.set(PDFName.of('Annots'), annotsRef);

      for (const annot of pageAnnots) {
        const pdfColor = normalizeColorToPdfRgb(annot.color);
        const safeRect = parseSafeRect(annot.rect);
        const [x1, y1, x2, y2] = safeRect;

        let annotDict = null;

        if (['highlight', 'underline', 'strikeout'].includes(annot.type)) {
          const subtypeMap = {
            highlight: 'Highlight',
            underline: 'Underline',
            strikeout: 'StrikeOut',
          };

          annotDict = pdfDoc.context.obj({
            Type: 'Annot',
            Subtype: subtypeMap[annot.type] || 'Highlight',
            Rect: safeRect,
            QuadPoints: annot.quadPoints || [
              x1, y2, x2, y2, x1, y1, x2, y1
            ],
            C: pdfColor,
            CA: annot.opacity !== undefined ? annot.opacity : 0.30,
            F: 4,
            T: PDFString.of('AuraPDF'),
          });
        } else if (annot.type === 'textbox' || annot.type === 'freetext') {
          const fontSize = annot.fontSize || 16;
          const textContent = annot.contents || 'Text';

          annotDict = pdfDoc.context.obj({
            Type: 'Annot',
            Subtype: 'FreeText',
            Rect: safeRect,
            Contents: PDFString.of(textContent),
            DA: PDFString.of(`/Helvetica ${fontSize} Tf ${pdfColor.join(' ')} rg`),
            C: pdfColor,
            F: 4,
            T: PDFString.of('AuraPDF'),
          });
        } else if (annot.type === 'text' || annot.type === 'note') {
          annotDict = pdfDoc.context.obj({
            Type: 'Annot',
            Subtype: 'Text',
            Rect: safeRect,
            Contents: PDFString.of(annot.contents || 'Comment'),
            Name: PDFName.of('Comment'),
            C: [0.99, 0.88, 0.28],
            F: 4,
            T: PDFString.of('AuraPDF'),
          });
        } else if (annot.type === 'ink') {
          const inkList = [];
          if (annot.pathData && Array.isArray(annot.pathData)) {
            const flatPoints = [];
            for (let i = 0; i < annot.pathData.length; i++) {
              const cmd = annot.pathData[i];
              if (Array.isArray(cmd) && cmd.length >= 3) {
                const px = typeof cmd[1] === 'number' && !isNaN(cmd[1]) ? cmd[1] : 100;
                const py = typeof cmd[2] === 'number' && !isNaN(cmd[2]) ? cmd[2] : 100;
                flatPoints.push(px, py);
              }
            }
            if (flatPoints.length >= 4) {
              inkList.push(flatPoints);
            }
          }
          if (inkList.length === 0) {
            inkList.push([x1, y1, x2, y2]);
          }

          annotDict = pdfDoc.context.obj({
            Type: 'Annot',
            Subtype: 'Ink',
            Rect: safeRect,
            InkList: inkList,
            C: pdfColor,
            BS: { W: annot.borderWidth || 3 },
            F: 4,
            T: PDFString.of('AuraPDF'),
          });
        } else if (['shape', 'square', 'rectangle', 'circle', 'ellipse'].includes(annot.type)) {
          const isCircle = annot.type === 'circle' || annot.shapeType === 'circle' || annot.type === 'ellipse';

          annotDict = pdfDoc.context.obj({
            Type: 'Annot',
            Subtype: isCircle ? 'Circle' : 'Square',
            Rect: safeRect,
            C: pdfColor,
            BS: { W: annot.borderWidth || 2 },
            CA: annot.opacity !== undefined ? annot.opacity : 1.0,
            F: 4,
            T: PDFString.of('AuraPDF'),
          });
        } else if (annot.type === 'stamp') {
          annotDict = pdfDoc.context.obj({
            Type: 'Annot',
            Subtype: 'Stamp',
            Rect: safeRect,
            Contents: PDFString.of(annot.stampText || annot.contents || 'APPROVED'),
            Name: PDFName.of(annot.stampText || 'Stamp'),
            C: pdfColor,
            F: 4,
            T: PDFString.of('AuraPDF'),
          });
        }

        if (annotDict) {
          const annotRef = pdfDoc.context.register(annotDict);
          annotsArray.push(annotRef);
        }
      }
    }

    return await pdfDoc.save({ useObjectStreams: false });
  }
}
