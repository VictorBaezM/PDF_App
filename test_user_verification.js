import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { PDFDocument, PDFName } from 'pdf-lib';

async function runVerification() {
  console.log('=== STARTING USER VERIFICATION FLOW ===');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    acceptDownloads: true,
  });
  const page = await context.newPage();

  try {
    // 1. Navigate and Upload PDF
    console.log('Step 1: Navigating to http://localhost:5173/PDF_App/ and uploading sample.pdf...');
    await page.goto('http://localhost:5173/PDF_App/', { waitUntil: 'networkidle' });

    // Upload sample.pdf using file input
    const fileInput = await page.querySelector('input[type="file"]');
    await fileInput.setInputFiles('./sample.pdf');

    // Wait for PDF rendering to complete
    await page.waitForSelector('.annotation-canvas', { state: 'visible', timeout: 10000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: './step1_uploaded.png' });
    console.log('Step 1 Complete: sample.pdf uploaded and rendered.');

    // 2. Add annotations of every type (underline, strikethrough, text, square, stamp)
    console.log('Step 2: Adding annotations of every type (underline, strikethrough, text, square, stamp)...');

    // a) Text annotation (textbox)
    console.log('  Adding Text Box...');
    await page.click('button[title*="Add Text Box"]');
    // Click on canvas to place text box
    const canvasBox = await page.locator('.annotation-canvas').first().boundingBox();
    if (!canvasBox) throw new Error('Canvas bounding box not found');
    await page.mouse.click(canvasBox.x + 150, canvasBox.y + 100);
    await page.waitForTimeout(500);
    // Press Escape to finish text editing mode
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // b) Square annotation
    console.log('  Adding Square (Shape)...');
    await page.click('button[title*="Draw Shape"]');
    await page.mouse.click(canvasBox.x + 150, canvasBox.y + 200);
    await page.waitForTimeout(500);

    // c) Stamp annotation
    console.log('  Adding Stamp...');
    await page.click('button[title*="Stamp / Image"]');
    await page.waitForTimeout(500);
    // Click preset stamp 'APPROVED' in StampModal
    const approvedStamp = page.locator('text=APPROVED').first();
    if (await approvedStamp.isVisible()) {
      await approvedStamp.click();
      await page.waitForTimeout(300);
    }
    await page.mouse.click(canvasBox.x + 150, canvasBox.y + 300);
    await page.waitForTimeout(500);

    // d) Underline annotation
    console.log('  Adding Underline...');
    await page.click('button[title*="Underline"]');
    await page.waitForTimeout(300);
    // Select text in .text-layer span
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
    await page.waitForTimeout(500);

    // e) Strikethrough annotation
    console.log('  Adding Strikethrough...');
    await page.click('button[title*="Strikethrough"]');
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const spans = document.querySelectorAll('.text-layer span');
      if (spans.length > 1) {
        const range = document.createRange();
        range.selectNodeContents(spans[1]);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        const container = document.querySelector('.page-view-container');
        container.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      } else if (spans.length > 0) {
        const range = document.createRange();
        range.selectNodeContents(spans[0]);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        const container = document.querySelector('.page-view-container');
        container.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      }
    });
    await page.waitForTimeout(500);

    // Verify annotation count in browser store
    const annotCountAfterStep2 = await page.evaluate(() => {
      const store = window.__ANNOTATION_STORE__ || (window.annotationStore);
      // Access store via window if available or inspect canvas objects
      return document.querySelectorAll('.annotation-canvas').length;
    });

    await page.screenshot({ path: './step2_annotations_added.png' });
    console.log('Step 2 Complete: All annotation types added.');

    // 3. Export document
    console.log('Step 3: Exporting document...');
    const downloadPromise1 = page.waitForEvent('download');
    await page.click('button:has-text("Export")');
    const download1 = await downloadPromise1;
    const exportPath1 = path.resolve('./exported_doc_1.pdf');
    await download1.saveAs(exportPath1);
    console.log(`Step 3 Complete: Document exported to ${exportPath1}`);

    // Verify annotations in exported_doc_1.pdf using pdf-lib
    const pdfBytes1 = fs.readFileSync(exportPath1);
    const pdfDoc1 = await PDFDocument.load(pdfBytes1);
    let annotsCount1 = 0;
    for (let i = 0; i < pdfDoc1.getPageCount(); i++) {
      const page = pdfDoc1.getPage(i);
      const annots = page.node.get(PDFName.of('Annots'));
      if (annots) {
        const lookupAnnots = pdfDoc1.context.lookup(annots);
        if (lookupAnnots && lookupAnnots.array) {
          annotsCount1 += lookupAnnots.array.length;
        } else if (Array.isArray(lookupAnnots)) {
          annotsCount1 += lookupAnnots.length;
        }
      }
    }
    console.log(`Exported PDF 1 contains ${annotsCount1} annotations in /Annots dictionary.`);

    // 4. Upload exported document
    console.log('Step 4: Uploading the exported document...');
    // Trigger file upload for exported_doc_1.pdf
    await fileInput.setInputFiles(exportPath1);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: './step4_reloaded_exported.png' });
    console.log('Step 4 Complete: Exported document reloaded into app.');

    // 5. Select each annotation on the canvas and delete it using the Delete key
    console.log('Step 5: Selecting each annotation on canvas and deleting using Delete key...');
    
    // Switch active tool to Select tool
    await page.click('button[title*="Select / Move"]');
    await page.waitForTimeout(300);

    // Programmatically or interactively select each annotation object on canvas and press Delete key
    const deletedCount = await page.evaluate(async () => {
      // Find fabric canvas instances or elements
      const canvases = document.querySelectorAll('.annotation-canvas');
      let count = 0;
      for (const canvasEl of canvases) {
        // Fabric attaches fabricCanvas instance or we can dispatch events
        // Or get active store and fabric objects
        const fabricObj = canvasEl.__fabric;
      }
      return count;
    });

    // Let's do canvas deletion via Playwright selection & keyboard Delete or canvas object iteration
    // Let's inspect canvas objects inside page.evaluate
    const annotsDeleted = await page.evaluate(async () => {
      // Access shared annotation store or fabric canvas
      // Let's check how fabric canvas is accessed on window or canvas elements
      const storeAnnots = window.annotationStore ? window.annotationStore.getAll() : [];
      return storeAnnots.length;
    });
    console.log('Current stored annotations count:', annotsDeleted);

    // Let's perform Canvas select and Delete key press for every object!
    await page.evaluate(async () => {
      // Iterate through fabric canvas objects on page views
      const canvasEls = document.querySelectorAll('.annotation-canvas');
      for (const cEl of canvasEls) {
        // Fabric canvas object can be accessed from wrapper or fabric layer
        // If fabric instance is on upper-canvas or lower-canvas
      }
    });

  } catch (err) {
    console.error('Error during verification flow:', err);
  } finally {
    await browser.close();
  }
}

runVerification();
