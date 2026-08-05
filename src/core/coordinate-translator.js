export class CoordinateTranslator {
  constructor(pageWidthPoints = 612, pageHeightPoints = 792, scale = 1.0, rotation = 0) {
    this.pageWidthPoints = pageWidthPoints;   // Standard Letter: 612pt (8.5in)
    this.pageHeightPoints = pageHeightPoints; // Standard Letter: 792pt (11in)
    this.scale = scale || 1.0;
    this.rotation = rotation % 360;
  }

  /**
   * Convert canvas pixel coordinate (x, y) to PDF 72 DPI point (x, y)
   */
  canvasToPdfPoint(canvasX, canvasY) {
    const pdfX = (canvasX || 0) / this.scale;
    const pdfY = this.pageHeightPoints - ((canvasY || 0) / this.scale);
    return {
      x: parseFloat(pdfX.toFixed(2)),
      y: parseFloat(pdfY.toFixed(2)),
    };
  }

  /**
   * Convert PDF 72 DPI point (x, y) to canvas pixel coordinate (x, y)
   */
  pdfToCanvasPoint(pdfX, pdfY) {
    const canvasX = (pdfX || 0) * this.scale;
    const canvasY = (this.pageHeightPoints - (pdfY || 0)) * this.scale;
    return {
      x: parseFloat(canvasX.toFixed(2)),
      y: parseFloat(canvasY.toFixed(2)),
    };
  }

  /**
   * Convert canvas bounding box { x/left, y/top, width, height } to PDF Rect [x1, y1, x2, y2]
   * PDF Rect format: [lower-left-x, lower-left-y, upper-right-x, upper-right-y]
   */
  canvasToPdfRect(canvasRect = {}) {
    const x = canvasRect.left !== undefined ? canvasRect.left : (canvasRect.x !== undefined ? canvasRect.x : 0);
    const y = canvasRect.top !== undefined ? canvasRect.top : (canvasRect.y !== undefined ? canvasRect.y : 0);
    const width = canvasRect.width || 0;
    const height = canvasRect.height || 0;

    const x1 = x / this.scale;
    const y1 = this.pageHeightPoints - ((y + height) / this.scale);
    const x2 = (x + width) / this.scale;
    const y2 = this.pageHeightPoints - (y / this.scale);

    return [
      parseFloat((isNaN(x1) ? 100 : x1).toFixed(2)),
      parseFloat((isNaN(y1) ? 100 : y1).toFixed(2)),
      parseFloat((isNaN(x2) ? 200 : x2).toFixed(2)),
      parseFloat((isNaN(y2) ? 150 : y2).toFixed(2)),
    ];
  }

  /**
   * Convert PDF Rect [x1, y1, x2, y2] to canvas bounding box { x, y, width, height }
   */
  pdfToCanvasRect(pdfRect = [100, 100, 200, 150]) {
    const [x1, y1, x2, y2] = pdfRect;
    const x = x1 * this.scale;
    const y = (this.pageHeightPoints - y2) * this.scale;
    const width = (x2 - x1) * this.scale;
    const height = (y2 - y1) * this.scale;

    return {
      x: parseFloat(x.toFixed(2)),
      y: parseFloat(y.toFixed(2)),
      width: parseFloat(width.toFixed(2)),
      height: parseFloat(height.toFixed(2)),
    };
  }
}
