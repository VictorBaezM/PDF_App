import { pdfjsLib } from './pdf-config';

export class PDFRenderer {
  constructor() {
    this.pdfDocument = null;
    this.pageCache = new Map();
    this.activeRenderTasks = new Map(); // pageNumber -> RenderTask
  }

  setDocument(pdfDocument) {
    if (this.pdfDocument !== pdfDocument) {
      this.destroy();
      this.pdfDocument = pdfDocument;
    }
  }

  async loadDocument(data) {
    this.destroy();
    try {
      const dataCopy = data instanceof Uint8Array ? data.slice() : data;
      const loadingTask = pdfjsLib.getDocument({ data: dataCopy });
      this.pdfDocument = await loadingTask.promise;
    } catch (e) {
      console.warn('PDFRenderer loadDocument warning:', e);
      this.pdfDocument = null;
    }
    return {
      numPages: this.pdfDocument ? this.pdfDocument.numPages : 1,
      pdfDocument: this.pdfDocument,
    };
  }

  async getPage(pageNumber) {
    if (!this.pdfDocument) {
      throw new Error('No PDF document loaded in PDFRenderer');
    }
    if (!this.pageCache.has(pageNumber)) {
      const page = await this.pdfDocument.getPage(pageNumber);
      this.pageCache.set(pageNumber, page);
    }
    return this.pageCache.get(pageNumber);
  }

  async getPageViewport(pageNumber, scale = 1.0, rotation = 0) {
    const page = await this.getPage(pageNumber);
    return page.getViewport({ scale, rotation });
  }

  async renderPage(pageNumber, canvasElement, scale = 1.0, rotation = 0) {
    if (!canvasElement || !this.pdfDocument) return null;

    // Cancel any ongoing render task for this specific page number
    if (this.activeRenderTasks.has(pageNumber)) {
      try {
        const previousTask = this.activeRenderTasks.get(pageNumber);
        previousTask.cancel();
      } catch (e) {
        // Ignored
      }
      this.activeRenderTasks.delete(pageNumber);
    }

    const page = await this.getPage(pageNumber);
    const viewport = page.getViewport({ scale, rotation });

    const ctx = canvasElement.getContext('2d');

    // Set display and internal canvas dimensions to match viewport pixels exactly
    canvasElement.width = Math.floor(viewport.width);
    canvasElement.height = Math.floor(viewport.height);
    canvasElement.style.width = `${Math.floor(viewport.width)}px`;
    canvasElement.style.height = `${Math.floor(viewport.height)}px`;

    const renderContext = {
      canvasContext: ctx,
      viewport: viewport,
    };

    const renderTask = page.render(renderContext);
    this.activeRenderTasks.set(pageNumber, renderTask);

    try {
      await renderTask.promise;
    } catch (err) {
      if (err.name !== 'RenderingCancelledException') {
        console.warn(`Render page ${pageNumber} error:`, err);
      }
    } finally {
      this.activeRenderTasks.delete(pageNumber);
    }

    return viewport;
  }

  async renderTextLayer(pageNumber, textLayerContainer, viewport) {
    if (!textLayerContainer || !this.pdfDocument) return;

    textLayerContainer.innerHTML = '';
    textLayerContainer.style.setProperty('--scale-factor', viewport.scale || 1.0);

    const page = await this.getPage(pageNumber);
    const textContent = await page.getTextContent();

    // Check if TextLayer constructor is available in PDF.js v4
    if (typeof pdfjsLib.TextLayer === 'function') {
      try {
        const textLayer = new pdfjsLib.TextLayer({
          textContentSource: textContent,
          container: textLayerContainer,
          viewport: viewport,
        });
        await textLayer.render();
        return textContent;
      } catch (e) {
        console.warn('TextLayer render fallback:', e);
      }
    }

    // High-precision fallback for rendering text items as selectable DOM spans aligned with PDF canvas
    if (textContent && Array.isArray(textContent.items)) {
      const fragment = document.createDocumentFragment();
      for (const item of textContent.items) {
        if (!item.str || item.str.trim() === '') continue;
        const span = document.createElement('span');
        span.textContent = item.str;
        span.className = 'pdf-text-item';
        
        if (item.transform && Array.isArray(item.transform)) {
          const [a, b, c, d, tx, ty] = item.transform;
          const fontHeight = Math.sqrt(a * a + b * b);
          const scale = viewport.scale || 1.0;

          let vx, vy;
          if (typeof viewport.convertToViewportPoint === 'function') {
            const pt = viewport.convertToViewportPoint(tx, ty);
            vx = pt[0];
            vy = pt[1];
          } else {
            vx = tx * scale;
            vy = (viewport.height || 800) - (ty * scale);
          }

          span.style.fontSize = `${fontHeight * scale}px`;
          span.style.left = `${vx}px`;
          span.style.top = `${vy - (fontHeight * scale * 0.85)}px`;
        }
        fragment.appendChild(span);
      }
      textLayerContainer.appendChild(fragment);
    }

    if (textLayerContainer.childElementCount === 0) {
      console.warn(`[AuraPDF] Text layer for page ${pageNumber} is empty — text selection & markup tools will not work on this page.`);
    }

    return textContent;
  }

  async searchDocumentText(query) {
    if (!this.pdfDocument || !query || query.trim() === '') return [];
    const results = [];
    const normalizedQuery = query.toLowerCase().trim();

    for (let pageNum = 1; pageNum <= this.pdfDocument.numPages; pageNum++) {
      const page = await this.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item) => item.str).join(' ');
      
      let matchIndex = pageText.toLowerCase().indexOf(normalizedQuery);
      while (matchIndex !== -1) {
        results.push({
          pageNumber: pageNum,
          matchIndex,
          snippet: pageText.substring(Math.max(0, matchIndex - 20), Math.min(pageText.length, matchIndex + normalizedQuery.length + 20)),
        });
        matchIndex = pageText.toLowerCase().indexOf(normalizedQuery, matchIndex + 1);
      }
    }

    return results;
  }

  destroy() {
    for (const task of this.activeRenderTasks.values()) {
      try {
        task.cancel();
      } catch (e) {}
    }
    this.activeRenderTasks.clear();

    if (this.pdfDocument && typeof this.pdfDocument.destroy === 'function') {
      try {
        this.pdfDocument.destroy();
      } catch (e) {
        console.warn('PDFRenderer destroy warning:', e);
      }
    }
    this.pdfDocument = null;
    this.pageCache.clear();
  }
}
