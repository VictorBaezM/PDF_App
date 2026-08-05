import { PDFDocument, degrees as pdfDegrees } from 'pdf-lib';

/**
 * Ensures PDF bytes are a clean standalone Uint8Array without offset or shared buffer issues.
 */
export function ensureCleanPdfBytes(input) {
  if (!input) throw new Error('pdfBytes required');
  if (input instanceof Uint8Array) {
    if (input.byteLength === 0 || input.buffer.byteLength === 0) {
      throw new Error('pdfBytes buffer is empty or detached');
    }
    return new Uint8Array(input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength));
  }
  if (input instanceof ArrayBuffer) {
    if (input.byteLength === 0) {
      throw new Error('ArrayBuffer is empty or detached');
    }
    return new Uint8Array(input.slice(0));
  }
  const result = new Uint8Array(input);
  if (result.byteLength === 0) {
    throw new Error('pdfBytes is empty');
  }
  return result;
}

export class PDFModifier {
  /**
   * Rotate a specific page by angle degrees (+90, -90, 180).
   */
  static async rotatePage(pdfBytes, pageIndex, angle = 90) {
    const cleanBytes = ensureCleanPdfBytes(pdfBytes);
    const pdfDoc = await PDFDocument.load(cleanBytes, { ignoreEncryption: true });
    const page = pdfDoc.getPage(pageIndex);
    const currentAngle = page.getRotation().angle || 0;
    const newAngle = (currentAngle + angle) % 360;
    page.setRotation(pdfDegrees(newAngle < 0 ? newAngle + 360 : newAngle));
    const savedBytes = await pdfDoc.save({ useObjectStreams: false });
    return ensureCleanPdfBytes(savedBytes);
  }

  /**
   * Delete a page by index.
   */
  static async deletePage(pdfBytes, pageIndex) {
    const cleanBytes = ensureCleanPdfBytes(pdfBytes);
    const pdfDoc = await PDFDocument.load(cleanBytes, { ignoreEncryption: true });
    if (pdfDoc.getPageCount() <= 1) {
      throw new Error('Cannot delete the only page in document');
    }
    pdfDoc.removePage(pageIndex);
    const savedBytes = await pdfDoc.save({ useObjectStreams: false });
    return ensureCleanPdfBytes(savedBytes);
  }

  /**
   * Reorder pages given an array of page indices in new order (e.g. [2, 0, 1]).
   */
  static async reorderPages(pdfBytes, newOrderIndices) {
    const cleanBytes = ensureCleanPdfBytes(pdfBytes);
    const srcDoc = await PDFDocument.load(cleanBytes, { ignoreEncryption: true });
    const newDoc = await PDFDocument.create();

    const copiedPages = await newDoc.copyPages(srcDoc, newOrderIndices);
    copiedPages.forEach((page) => newDoc.addPage(page));

    const savedBytes = await newDoc.save({ useObjectStreams: false });
    return ensureCleanPdfBytes(savedBytes);
  }

  /**
   * Merge an array of PDF Uint8Arrays into a single document.
   */
  static async mergePDFs(pdfBytesArray) {
    if (!Array.isArray(pdfBytesArray) || pdfBytesArray.length === 0) {
      throw new Error('At least one PDF byte array required for merge');
    }

    const mergedDoc = await PDFDocument.create();

    for (const bytes of pdfBytesArray) {
      const cleanBytes = ensureCleanPdfBytes(bytes);
      const srcDoc = await PDFDocument.load(cleanBytes, { ignoreEncryption: true });
      const pageIndices = srcDoc.getPageIndices();
      const copiedPages = await mergedDoc.copyPages(srcDoc, pageIndices);
      copiedPages.forEach((page) => mergedDoc.addPage(page));
    }

    const savedBytes = await mergedDoc.save({ useObjectStreams: false });
    return ensureCleanPdfBytes(savedBytes);
  }

  /**
   * Extract specified page indices into a new standalone PDF document.
   */
  static async extractPages(pdfBytes, pageIndices) {
    const cleanBytes = ensureCleanPdfBytes(pdfBytes);
    if (!Array.isArray(pageIndices) || pageIndices.length === 0) {
      throw new Error('pageIndices array required for extraction');
    }

    const srcDoc = await PDFDocument.load(cleanBytes, { ignoreEncryption: true });
    const newDoc = await PDFDocument.create();

    const copiedPages = await newDoc.copyPages(srcDoc, pageIndices);
    copiedPages.forEach((page) => newDoc.addPage(page));

    const savedBytes = await newDoc.save({ useObjectStreams: false });
    return ensureCleanPdfBytes(savedBytes);
  }
}
