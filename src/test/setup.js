import '@testing-library/jest-dom';
import { vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';

// Polyfill Promise.withResolvers for Node.js / Vitest environments if missing
if (typeof Promise.withResolvers !== 'function') {
  Promise.withResolvers = function () {
    let resolve, reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

// Mock URL.createObjectURL / revokeObjectURL for canvas and blob testing in jsdom
if (typeof window !== 'undefined') {
  window.URL.createObjectURL = window.URL.createObjectURL || vi.fn(() => 'blob:mock-url');
  window.URL.revokeObjectURL = window.URL.revokeObjectURL || vi.fn();
}

// Mock HTMLElement scrollIntoView in jsdom
if (typeof Element !== 'undefined') {
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || vi.fn();
}

// Mock HTMLCanvasElement getContext for 2D testing in jsdom
HTMLCanvasElement.prototype.getContext = HTMLCanvasElement.prototype.getContext || vi.fn(() => ({
  fillRect: vi.fn(),
  clearRect: vi.fn(),
  getImageData: vi.fn(() => ({ data: new Uint8Array(4) })),
  putImageData: vi.fn(),
  createImageData: vi.fn(),
  setTransform: vi.fn(),
  drawImage: vi.fn(),
  save: vi.fn(),
  fillText: vi.fn(),
  restore: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  closePath: vi.fn(),
  stroke: vi.fn(),
  translate: vi.fn(),
  scale: vi.fn(),
  rotate: vi.fn(),
  arc: vi.fn(),
  fill: vi.fn(),
  measureText: vi.fn(() => ({ width: 10 })),
  transform: vi.fn(),
  rect: vi.fn(),
  clip: vi.fn(),
}));

vi.mock('pdfjs-dist', async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    GlobalWorkerOptions: { workerSrc: '' },
    getDocument: (params) => {
      const data = params && (params.data || params.url);
      const loadingPromise = (async () => {
        let numPages = 1;
        let pageViews = [];
        try {
          if (data) {
            const cleanBytes = data instanceof Uint8Array ? data : new Uint8Array(data);
            const pdfDoc = await PDFDocument.load(cleanBytes, { ignoreEncryption: true });
            numPages = pdfDoc.getPageCount();
            pageViews = pdfDoc.getPages().map((p) => {
              const { width, height } = p.getSize();
              return { width: width || 600, height: height || 800 };
            });
          }
        } catch (e) {
          numPages = 1;
        }

        return {
          numPages,
          getPage: async (pageNumber) => {
            const dimensions = pageViews[pageNumber - 1] || { width: 600, height: 800 };
            return {
              pageNumber,
              getViewport: ({ scale = 1.0, rotation = 0 }) => ({
                width: dimensions.width * scale,
                height: dimensions.height * scale,
                scale,
                rotation,
                rawDims: {
                  pageWidth: dimensions.width,
                  pageHeight: dimensions.height,
                  pageX: 0,
                  pageY: 0,
                },
              }),
              render: ({ canvasContext }) => {
                if (canvasContext && typeof canvasContext.fillRect === 'function') {
                  canvasContext.fillRect(0, 0, dimensions.width, dimensions.height);
                }
                return {
                  promise: Promise.resolve(),
                  cancel: () => {},
                };
              },
              getTextContent: async () => ({
                items: [
                  {
                    str: 'Sample PDF Text Content',
                    transform: [1, 0, 0, 1, 0, 0],
                    width: 100,
                    height: 20,
                    dir: 'ltr',
                    vertical: false,
                    fontName: 'g_d0_f1',
                    hasEOL: false,
                  },
                ],
                styles: {
                  g_d0_f1: {
                    fontFamily: 'sans-serif',
                    ascent: 0.8,
                    descent: -0.2,
                    vertical: false,
                  },
                },
              }),
            };
          },
          destroy: async () => {},
        };
      })();

      return {
        promise: loadingPromise,
        destroy: () => {},
      };
    },
  };
});
