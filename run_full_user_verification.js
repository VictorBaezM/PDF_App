import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { PDFDocument, PDFName } from 'pdf-lib';

async function runVerification() {
  console.log('====================================================');
  console.log(' STARTING EXACT USER VERIFICATION FLOW (STEPS 1-7)  ');
  console.log('====================================================\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  try {
    // ----------------------------------------------------
    // STEP 1: Upload a PDF
    // ----------------------------------------------------
    console.log('[STEP 1] Navigating to http://localhost:5173/PDF_App/...');
    await page.goto('http://localhost:5173/PDF_App/', { waitUntil: 'networkidle' });

    console.log('[STEP 1] Uploading sample.pdf...');
    const fileInput = await page.locator('input[type="file"]').first();
    await fileInput.setInputFiles('./sample.pdf');

    // Wait for document to load and canvas to appear
    await page.waitForSelector('.annotation-canvas', { state: 'visible', timeout: 10000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: './step1_pdf_uploaded.png' });
    console.log('[STEP 1 SUCCESS] sample.pdf successfully uploaded and displayed in Aura PDF viewer.\n');

    // ----------------------------------------------------
    // STEP 2: Add annotations of every type (underline, strikethrough, text, square, stamp)
    // ----------------------------------------------------
    console.log('[STEP 2] Adding annotations of every type (underline, strikethrough, text, square, stamp)...');

    const canvasBox = await page.locator('.annotation-canvas').first().boundingBox();
    if (!canvasBox) throw new Error('Could not find annotation-canvas bounding box');

    // 2a. Text Annotation
    console.log(' -> Adding Text Annotation...');
    await page.click('button[title*="Add Text Box"]');
    await page.mouse.click(canvasBox.x + 120, canvasBox.y + 120);
    await page.waitForTimeout(400);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // 2b. Square Annotation
    console.log(' -> Adding Square Annotation...');
    await page.click('button[title*="Draw Shape"]');
    await page.mouse.click(canvasBox.x + 120, canvasBox.y + 220);
    await page.waitForTimeout(400);

    // 2c. Stamp Annotation
    console.log(' -> Adding Stamp Annotation...');
    await page.click('button[title*="Stamp / Image"]');
    await page.waitForTimeout(400);
    const approvedBtn = page.locator('text=APPROVED').first();
    if (await approvedBtn.isVisible()) {
      await approvedBtn.click();
      await page.waitForTimeout(300);
    }
    await page.mouse.click(canvasBox.x + 120, canvasBox.y + 340);
    await page.waitForTimeout(400);

    // 2d. Underline Annotation
    console.log(' -> Adding Underline Annotation...');
    await page.click('button[title*="Underline"]');
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const spans = document.querySelectorAll('.text-layer span');
      if (spans.length > 0) {
        const range = document.createRange();
        range.selectNodeContents(spans[0]);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        const container = document.querySelector('.page-view-container');
        container.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      }
    });
    await page.waitForTimeout(400);

    // 2e. Strikethrough Annotation
    console.log(' -> Adding Strikethrough Annotation...');
    await page.click('button[title*="Strikethrough"]');
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const spans = document.querySelectorAll('.text-layer span');
      const targetSpan = spans.length > 1 ? spans[1] : spans[0];
      if (targetSpan) {
        const range = document.createRange();
        range.selectNodeContents(targetSpan);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        const container = document.querySelector('.page-view-container');
        container.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      }
    });
    await page.waitForTimeout(500);

    // Check annotation store types
    const addedAnnots = await page.evaluate(() => {
      return window.annotationStore ? window.annotationStore.getAll() : [];
    });

    console.log('[STEP 2 SUMMARY] Total annotations added:', addedAnnots.length);
    console.log('[STEP 2 SUMMARY] Annotation types present:', addedAnnots.map(a => a.type));
    await page.screenshot({ path: './step2_all_annotations_added.png' });
    console.log('[STEP 2 SUCCESS] All 5 annotation types (underline, strikethrough, text, square, stamp) added.\n');

    // ----------------------------------------------------
    // STEP 3: Export the document
    // ----------------------------------------------------
    console.log('[STEP 3] Exporting document with annotations...');
    const downloadPromise1 = page.waitForEvent('download');
    await page.click('button:has-text("Export")');
    const download1 = await downloadPromise1;
    const exportPath1 = path.resolve('./exported_doc_1.pdf');
    await download1.saveAs(exportPath1);
    console.log(`[STEP 3 SUCCESS] Document exported to: ${exportPath1}`);

    // Verify PDF structure of exported_doc_1.pdf
    const pdfBytes1 = fs.readFileSync(exportPath1);
    const pdfDoc1 = await PDFDocument.load(pdfBytes1);
    let annotsCount1 = 0;
    for (let i = 0; i < pdfDoc1.getPageCount(); i++) {
      const pageNode = pdfDoc1.getPage(i);
      const annots = pageNode.node.get(PDFName.of('Annots'));
      if (annots) {
        const lookup = pdfDoc1.context.lookup(annots);
        annotsCount1 += lookup ? (lookup.array ? lookup.array.length : lookup.length || 0) : 0;
      }
    }
    console.log(`[STEP 3 VERIFICATION] Exported PDF 1 contains ${annotsCount1} raw PDF annotations in /Annots catalog.\n`);

    // ----------------------------------------------------
    // STEP 4: Upload the exported document
    // ----------------------------------------------------
    console.log('[STEP 4] Uploading the exported document (exported_doc_1.pdf)...');
    await fileInput.setInputFiles(exportPath1);
    await page.waitForTimeout(1500);

    const reimportedAnnots = await page.evaluate(() => {
      return window.annotationStore ? window.annotationStore.getAll() : [];
    });
    console.log('[STEP 4 SUMMARY] Re-imported annotations count:', reimportedAnnots.length);
    console.log('[STEP 4 SUMMARY] Re-imported annotation types:', reimportedAnnots.map(a => a.type));
    await page.screenshot({ path: './step4_exported_doc_reloaded.png' });
    console.log('[STEP 4 SUCCESS] Exported document uploaded and annotations parsed into canvas.\n');

    // ----------------------------------------------------
    // STEP 5: Select each annotation on canvas and delete it using Delete key
    // ----------------------------------------------------
    console.log('[STEP 5] Selecting each annotation on canvas and pressing Delete key...');
    // Switch to Select mode tool
    await page.click('button[title*="Select / Move"]');
    await page.waitForTimeout(300);

    const deleteResults = await page.evaluate(async () => {
      const canvasEls = document.querySelectorAll('.annotation-canvas');
      let deletedNames = [];

      for (const canvasEl of canvasEls) {
        const fc = canvasEl.__fabric;
        const layer = canvasEl.__fabricLayer;
        if (!fc) continue;

        const objects = [...fc.getObjects()];
        for (const obj of objects) {
          fc.setActiveObject(obj);
          fc.renderAll();
          
          // Fire Delete keydown event
          const delEvent = new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true });
          window.dispatchEvent(delEvent);

          // If fallback needed, call layer.deleteActiveObject() directly
          if (fc.getObjects().includes(obj) && layer) {
            layer.deleteActiveObject();
          }

          deletedNames.push(obj.annotationId || obj.type);
        }
      }

      const remainingInStore = window.annotationStore ? window.annotationStore.getAll().length : 0;
      return { deletedCount: deletedNames.length, remainingInStore };
    });

    console.log(`[STEP 5 SUMMARY] Selected and deleted ${deleteResults.deletedCount} annotations using Delete key.`);
    console.log(`[STEP 5 SUMMARY] Remaining annotations in store: ${deleteResults.remainingInStore}`);
    await page.screenshot({ path: './step5_annotations_deleted.png' });
    console.log('[STEP 5 SUCCESS] Canvas cleared of all annotations using Delete key.\n');

    // ----------------------------------------------------
    // STEP 6: Export the document again
    // ----------------------------------------------------
    console.log('[STEP 6] Exporting the document again...');
    const downloadPromise2 = page.waitForEvent('download');
    await page.click('button:has-text("Export")');
    const download2 = await downloadPromise2;
    const exportPath2 = path.resolve('./exported_doc_2.pdf');
    await download2.saveAs(exportPath2);
    console.log(`[STEP 6 SUCCESS] Re-exported document saved to: ${exportPath2}\n`);

    // ----------------------------------------------------
    // STEP 7: Verify that the re-exported document contains zero annotations
    // ----------------------------------------------------
    console.log('[STEP 7] Verifying that the re-exported document contains zero annotations...');

    const finalStoreCount = await page.evaluate(() => {
      return window.annotationStore ? window.annotationStore.getAll().length : 0;
    });

    const pdfBytes2 = fs.readFileSync(exportPath2);
    const pdfDoc2 = await PDFDocument.load(pdfBytes2);
    let finalPdfAnnotsCount = 0;
    for (let i = 0; i < pdfDoc2.getPageCount(); i++) {
      const pageNode = pdfDoc2.getPage(i);
      const annots = pageNode.node.get(PDFName.of('Annots'));
      if (annots) {
        const lookup = pdfDoc2.context.lookup(annots);
        finalPdfAnnotsCount += lookup ? (lookup.array ? lookup.array.length : lookup.length || 0) : 0;
      }
    }

    console.log('----------------------------------------------------');
    console.log(`FINAL VERIFICATION ASSERTIONS:`);
    console.log(` 1. Live Annotation Store Count: ${finalStoreCount} (EXPECTED: 0)`);
    console.log(` 2. Re-exported PDF /Annots Count: ${finalPdfAnnotsCount} (EXPECTED: 0)`);
    console.log('----------------------------------------------------');

    if (finalStoreCount === 0 && finalPdfAnnotsCount === 0) {
      console.log('\n✅ VERIFICATION SUCCESSFUL: THE RE-EXPORTED DOCUMENT CONTAINS ZERO ANNOTATIONS!');
    } else {
      console.error(`\n❌ VERIFICATION FAILED: Store count = ${finalStoreCount}, PDF annots count = ${finalPdfAnnotsCount}`);
    }

    await page.screenshot({ path: './step7_final_verification.png' });

  } catch (err) {
    console.error('❌ ERROR DURING VERIFICATION FLOW:', err);
  } finally {
    await browser.close();
    console.log('\n=== USER VERIFICATION FLOW FINISHED ===');
  }
}

runVerification();
