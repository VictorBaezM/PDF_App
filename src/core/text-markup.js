export class TextMarkupUtil {
  /**
   * Convert DOM selection client rects to PDF QuadPoints and overall bounding box
   */
  static extractQuadPointsFromRects(clientRects, containerBounds, coordTranslator) {
    if (!clientRects || clientRects.length === 0 || !containerBounds || !coordTranslator) {
      return null;
    }

    const quadPoints = [];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (let i = 0; i < clientRects.length; i++) {
      const r = clientRects[i];
      if (r.width === 0 || r.height === 0) continue;

      // Convert viewport-relative client rect to page container relative coords
      const relX = r.left - containerBounds.left;
      const relY = r.top - containerBounds.top;
      const relWidth = r.width;
      const relHeight = r.height;

      // Track overall bounding box in canvas coordinates
      minX = Math.min(minX, relX);
      minY = Math.min(minY, relY);
      maxX = Math.max(maxX, relX + relWidth);
      maxY = Math.max(maxY, relY + relHeight);

      // Convert 4 corners of each line rect to PDF coordinate space
      const topLeft = coordTranslator.canvasToPdfPoint(relX, relY);
      const topRight = coordTranslator.canvasToPdfPoint(relX + relWidth, relY);
      const bottomLeft = coordTranslator.canvasToPdfPoint(relX, relY + relHeight);
      const bottomRight = coordTranslator.canvasToPdfPoint(relX + relWidth, relY + relHeight);

      // PDF Spec QuadPoints order: [x1, y1 (top-left), x2, y2 (top-right), x3, y3 (bottom-left), x4, y4 (bottom-right)]
      quadPoints.push(
        topLeft.x, topLeft.y,
        topRight.x, topRight.y,
        bottomLeft.x, bottomLeft.y,
        bottomRight.x, bottomRight.y
      );
    }

    if (quadPoints.length === 0) return null;

    const overallCanvasRect = {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };

    const overallPdfRect = coordTranslator.canvasToPdfRect(overallCanvasRect);

    return {
      quadPoints,
      overallPdfRect,
      overallCanvasRect,
    };
  }
}
