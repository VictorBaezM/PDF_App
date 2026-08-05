import { PDFDocument, PDFName, PDFString, PDFArray, PDFRef, rgb } from 'pdf-lib';

/**
 * Convert any color format (hex string '#3b82f6', rgb array [0.2, 0.5, 0.9], or color name) to PDF RGB float array [r, g, b] (0.0 to 1.0)
 */
function normalizeColorToPdfRgb(color) {
  if (!color) return [0.0, 0.0, 0.0];
  
  if (Array.isArray(color) && color.length >= 3) {
    // If values are 0-255, convert to 0-1
    const is255 = color.some((v) => v > 1.0);
    return is255 ? color.slice(0, 3).map((v) => v / 255) : color.slice(0, 3);
  }

  if (typeof color === 'string') {
    let hex = color.trim().replace('#', '');
    if (hex.length === 3) {
      hex = hex.split('').map((c) => c + c).join('');
    }
    if (hex.length === 6) {
      const num = parseInt(hex, 16);
      return [
        ((num >> 16) & 255) / 255,
        ((num >> 8) & 255) / 255,
        (num & 255) / 255,
      ];
    }
  }

  return [0.0, 0.0, 0.0]; // Default fallback solid black
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

    if (!Array.isArray(annotations) || annotations.length === 0) {
      return new Uint8Array(cleanPdfBytes);
    }

    const pdfDoc = await PDFDocument.load(cleanPdfBytes, { ignoreEncryption: true });

    for (const annot of annotations) {
      if (annot.pageIndex >= pdfDoc.getPageCount() || annot.pageIndex < 0) continue;
      const page = pdfDoc.getPage(annot.pageIndex);
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

        // Draw visual highlight/underline/strikethrough rectangle or line directly on page stream
        if (annot.type === 'highlight') {
          page.drawRectangle({
            x: Math.min(x1, x2),
            y: Math.min(y1, y2),
            width: Math.max(10, Math.abs(x2 - x1)),
            height: Math.max(10, Math.abs(y2 - y1)),
            color: rgb(pdfColor[0], pdfColor[1], pdfColor[2]),
            opacity: annot.opacity !== undefined ? annot.opacity : 0.30, // 30% default opacity for emphasis
          });
        } else if (annot.type === 'underline') {
          const lineY = Math.min(y1, y2) + 2;
          page.drawLine({
            start: { x: Math.min(x1, x2), y: lineY },
            end: { x: Math.max(x1, x2), y: lineY },
            thickness: 2.5,
            color: rgb(pdfColor[0], pdfColor[1], pdfColor[2]),
            opacity: 1.0, // High opacity solid line
          });
        } else if (annot.type === 'strikeout') {
          // Position strikeout line directly through middle of character height (~55% from bottom)
          const midY = Math.min(y1, y2) + (Math.abs(y2 - y1) * 0.55);
          page.drawLine({
            start: { x: Math.min(x1, x2), y: midY },
            end: { x: Math.max(x1, x2), y: midY },
            thickness: 2.5,
            color: rgb(pdfColor[0], pdfColor[1], pdfColor[2]),
            opacity: 1.0, // High opacity solid line to block legibility
          });
        }

        annotDict = pdfDoc.context.obj({
          Type: 'Annot',
          Subtype: subtypeMap[annot.type] || 'Highlight',
          Rect: safeRect,
          QuadPoints: annot.quadPoints || [
            x1, y2, x2, y2, x1, y1, x2, y1
          ],
          C: pdfColor,
          CA: annot.opacity !== undefined ? annot.opacity : 0.30,
          F: 4, // Print flag
          T: PDFString.of('AuraPDF'),
        });
      } else if (annot.type === 'textbox' || annot.type === 'freetext') {
        const fontSize = annot.fontSize || 16;
        const textContent = annot.contents || 'Text';

        // Draw text directly onto the PDF page stream so it is 100% visible exactly ONCE in all PDF readers
        if (textContent) {
          const lines = textContent.split('\n');
          let currentY = Math.max(y1, y2) - fontSize;
          for (const line of lines) {
            if (line.trim()) {
              page.drawText(line, {
                x: Math.min(x1, x2) + 4,
                y: Math.max(Math.min(y1, y2), currentY),
                size: fontSize,
                color: rgb(pdfColor[0], pdfColor[1], pdfColor[2]),
                opacity: annot.opacity !== undefined ? annot.opacity : 1.0,
              });
            }
            currentY -= (fontSize * 1.25);
          }
        }
      } else if (annot.type === 'text' || annot.type === 'note') {
        if (annot.contents) {
          page.drawText(`[Note: ${annot.contents}]`, {
            x: x1,
            y: y1,
            size: 10,
            color: rgb(0.8, 0.6, 0.1),
          });
        }
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

              // Draw vector lines between points directly on PDF page graphics stream
              if (i > 0) {
                const prevCmd = annot.pathData[i - 1];
                if (Array.isArray(prevCmd) && prevCmd.length >= 3) {
                  const prevX = prevCmd[1];
                  const prevY = prevCmd[2];
                  page.drawLine({
                    start: { x: prevX, y: prevY },
                    end: { x: px, y: py },
                    thickness: annot.borderWidth || 3,
                    color: rgb(pdfColor[0], pdfColor[1], pdfColor[2]),
                  });
                }
              }
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
      } else if (annot.type === 'shape' || annot.type === 'square' || annot.type === 'circle') {
        const isCircle = annot.type === 'circle' || annot.shapeType === 'circle';
        if (isCircle) {
          page.drawEllipse({
            x: (x1 + x2) / 2,
            y: (y1 + y2) / 2,
            xScale: Math.max(5, Math.abs(x2 - x1) / 2),
            yScale: Math.max(5, Math.abs(y2 - y1) / 2),
            borderColor: rgb(pdfColor[0], pdfColor[1], pdfColor[2]),
            borderWidth: annot.borderWidth || 2,
            opacity: annot.opacity !== undefined ? annot.opacity : 1.0,
          });
        } else {
          page.drawRectangle({
            x: Math.min(x1, x2),
            y: Math.min(y1, y2),
            width: Math.max(10, Math.abs(x2 - x1)),
            height: Math.max(10, Math.abs(y2 - y1)),
            borderColor: rgb(pdfColor[0], pdfColor[1], pdfColor[2]),
            borderWidth: annot.borderWidth || 2,
            opacity: annot.opacity !== undefined ? annot.opacity : 1.0,
          });
        }

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
        if (annot.stampType === 'custom_image' && annot.dataUrl) {
          try {
            let embeddedImage;
            if (annot.dataUrl.startsWith('data:image/png')) {
              embeddedImage = await pdfDoc.embedPng(annot.dataUrl);
            } else {
              embeddedImage = await pdfDoc.embedJpg(annot.dataUrl);
            }
            page.drawImage(embeddedImage, {
              x: x1,
              y: y1,
              width: Math.max(10, Math.abs(x2 - x1)) || 100,
              height: Math.max(10, Math.abs(y2 - y1)) || 100,
            });
          } catch (e) {
            console.warn('Custom image stamp embed warning:', e);
          }
        } else {
          const stampText = annot.stampText || 'APPROVED';
          page.drawText(`[${stampText}]`, {
            x: x1,
            y: y1,
            size: 16,
            color: rgb(pdfColor[0], pdfColor[1], pdfColor[2]),
          });
        }

        annotDict = pdfDoc.context.obj({
          Type: 'Annot',
          Subtype: 'Stamp',
          Rect: safeRect,
          Name: PDFName.of(annot.stampText || 'Stamp'),
          C: pdfColor,
          F: 4,
          T: PDFString.of('AuraPDF'),
        });
      }

      if (annotDict) {
        const annotRef = pdfDoc.context.register(annotDict);

        let annotsObj = page.node.get(PDFName.of('Annots'));
        if (annotsObj instanceof PDFRef) {
          annotsObj = pdfDoc.context.lookup(annotsObj);
        }

        if (annotsObj && typeof annotsObj.push === 'function') {
          annotsObj.push(annotRef);
        } else {
          page.node.set(PDFName.of('Annots'), pdfDoc.context.obj([annotRef]));
        }
      }
    }

    return await pdfDoc.save({ useObjectStreams: false });
  }
}
