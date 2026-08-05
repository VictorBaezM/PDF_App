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

        if (annot.quadPoints && Array.isArray(annot.quadPoints) && annot.quadPoints.length >= 8) {
          for (let i = 0; i < annot.quadPoints.length; i += 8) {
            const qx1 = annot.quadPoints[i];
            const qy1 = annot.quadPoints[i + 1];
            const qx2 = annot.quadPoints[i + 2];
            const qy2 = annot.quadPoints[i + 3];
            const qx3 = annot.quadPoints[i + 4];
            const qy3 = annot.quadPoints[i + 5];
            const qx4 = annot.quadPoints[i + 6];
            const qy4 = annot.quadPoints[i + 7];

            const lineMinX = Math.min(qx1, qx2, qx3, qx4);
            const lineMaxX = Math.max(qx1, qx2, qx3, qx4);
            const lineMinY = Math.min(qy1, qy2, qy3, qy4);
            const lineMaxY = Math.max(qy1, qy2, qy3, qy4);
            const lineH = Math.max(5, Math.abs(lineMaxY - lineMinY));

            if (annot.type === 'highlight') {
              page.drawRectangle({
                x: lineMinX,
                y: lineMinY,
                width: Math.max(5, Math.abs(lineMaxX - lineMinX)),
                height: lineH,
                color: rgb(pdfColor[0], pdfColor[1], pdfColor[2]),
                opacity: annot.opacity !== undefined ? annot.opacity : 0.30,
              });
            } else if (annot.type === 'underline') {
              const lineY = lineMinY + 1;
              page.drawLine({
                start: { x: lineMinX, y: lineY },
                end: { x: lineMaxX, y: lineY },
                thickness: 2.0,
                color: rgb(pdfColor[0], pdfColor[1], pdfColor[2]),
                opacity: 1.0,
              });
            } else if (annot.type === 'strikeout') {
              const midY = lineMinY + (lineH * 0.45);
              page.drawLine({
                start: { x: lineMinX, y: midY },
                end: { x: lineMaxX, y: midY },
                thickness: 2.0,
                color: rgb(pdfColor[0], pdfColor[1], pdfColor[2]),
                opacity: 1.0,
              });
            }
          }
        } else {
          if (annot.type === 'highlight') {
            page.drawRectangle({
              x: Math.min(x1, x2),
              y: Math.min(y1, y2),
              width: Math.max(10, Math.abs(x2 - x1)),
              height: Math.max(10, Math.abs(y2 - y1)),
              color: rgb(pdfColor[0], pdfColor[1], pdfColor[2]),
              opacity: annot.opacity !== undefined ? annot.opacity : 0.30,
            });
          } else if (annot.type === 'underline') {
            const lineY = Math.min(y1, y2) + 2;
            page.drawLine({
              start: { x: Math.min(x1, x2), y: lineY },
              end: { x: Math.max(x1, x2), y: lineY },
              thickness: 2.5,
              color: rgb(pdfColor[0], pdfColor[1], pdfColor[2]),
              opacity: 1.0,
            });
          } else if (annot.type === 'strikeout') {
            const midY = Math.min(y1, y2) + (Math.abs(y2 - y1) * 0.45);
            page.drawLine({
              start: { x: Math.min(x1, x2), y: midY },
              end: { x: Math.max(x1, x2), y: midY },
              thickness: 2.5,
              color: rgb(pdfColor[0], pdfColor[1], pdfColor[2]),
              opacity: 1.0,
            });
          }
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
          F: 4,
          T: PDFString.of('AuraPDF'),
        });
      } else if (annot.type === 'textbox' || annot.type === 'freetext') {
        const fontSize = annot.fontSize || 16;
        const textContent = annot.contents || 'Text';

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
      } else if (['shape', 'square', 'rectangle', 'circle', 'ellipse'].includes(annot.type)) {
        const isCircle = annot.type === 'circle' || annot.shapeType === 'circle' || annot.type === 'ellipse';
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
            const imgW = Math.max(10, Math.abs(x2 - x1)) || 120;
            const imgH = Math.max(10, Math.abs(y2 - y1)) || 80;
            page.drawImage(embeddedImage, {
              x: Math.min(x1, x2),
              y: Math.min(y1, y2),
              width: imgW,
              height: imgH,
            });
          } catch (e) {
            console.warn('Custom image stamp embed warning:', e);
          }
        } else {
          const stampText = (annot.stampText || annot.contents || 'APPROVED').toUpperCase();
          const boxW = Math.max(60, Math.abs(x2 - x1)) || 140;
          const boxH = Math.max(24, Math.abs(y2 - y1)) || 48;
          const boxX = Math.min(x1, x2);
          const boxY = Math.min(y1, y2);

          page.drawRectangle({
            x: boxX,
            y: boxY,
            width: boxW,
            height: boxH,
            borderColor: rgb(pdfColor[0], pdfColor[1], pdfColor[2]),
            borderWidth: 2.5,
            opacity: annot.opacity !== undefined ? annot.opacity : 1.0,
          });

          const fontSize = Math.min(16, boxH * 0.45);
          const textW = stampText.length * (fontSize * 0.55);
          const textX = boxX + Math.max(4, (boxW - textW) / 2);
          const textY = boxY + (boxH / 2) - (fontSize / 3);

          page.drawText(stampText, {
            x: textX,
            y: textY,
            size: fontSize,
            color: rgb(pdfColor[0], pdfColor[1], pdfColor[2]),
            opacity: annot.opacity !== undefined ? annot.opacity : 1.0,
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
