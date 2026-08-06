import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { PDFDocument, PDFName } from 'pdf-lib';

async function verifyAllStamps() {
  console.log('===========================================================');
  console.log(' STARTING PRESET STAMPS & CUSTOM IMAGE VERIFICATION ');
  console.log('===========================================================\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  try {
    // -------------------------------------------------------------------
    // STEP 1: Load http://localhost:5173/PDF_App/ and upload sample.pdf
    // -------------------------------------------------------------------
    console.log('[STEP 1] Navigating to http://localhost:5173/PDF_App/...');
    await page.goto('http://localhost:5173/PDF_App/', { waitUntil: 'networkidle' });

    console.log('[STEP 1] Uploading sample.pdf...');
    const fileInput = await page.locator('input[type="file"]').first();
    await fileInput.setInputFiles('./sample.pdf');

    await page.waitForSelector('.annotation-canvas', { state: 'visible', timeout: 10000 });
    await page.waitForTimeout(1000);
    console.log('[STEP 1 SUCCESS] sample.pdf loaded.\n');

    // -------------------------------------------------------------------
    // STEP 2: Verify Every Preset Stamp (APPROVED, PASSED, CONFIDENTIAL, DRAFT, FINAL, EXPIRED)
    // -------------------------------------------------------------------
    const presetLabels = ['APPROVED', 'PASSED', 'CONFIDENTIAL', 'DRAFT', 'FINAL', 'EXPIRED'];
    console.log(`[STEP 2] Adding all ${presetLabels.length} preset stamps to the document canvas...`);

    const canvasBox = await page.locator('.annotation-canvas').first().boundingBox();
    if (!canvasBox) throw new Error('Canvas bounding box not found');

    for (let i = 0; i < presetLabels.length; i++) {
      const label = presetLabels[i];
      console.log(` -> Selecting preset stamp: ${label}`);

      // Click Stamp / Image button
      await page.click('button[title*="Stamp / Image"]');
      await page.waitForTimeout(300);

      // Click stamp in modal
      const stampBtn = page.getByText(label, { exact: true }).first();
      await stampBtn.click();
      await page.waitForTimeout(400);

      // Place on canvas at staggered Y coordinates
      const clickX = canvasBox.x + 100 + (i % 2) * 160;
      const clickY = canvasBox.y + 80 + Math.floor(i / 2) * 90;
      await page.mouse.click(clickX, clickY);
      await page.waitForTimeout(300);
    }

    // Inspect live annotationStore
    const presetAnnots = await page.evaluate(() => {
      return window.annotationStore ? window.annotationStore.getAll() : [];
    });

    console.log(`[STEP 2 SUMMARY] Total annotations in store: ${presetAnnots.length}`);
    const presetTexts = presetAnnots.map(a => a.stampText || a.contents);
    console.log('[STEP 2 SUMMARY] Preset stamp texts:', presetTexts);

    for (const label of presetLabels) {
      if (!presetTexts.includes(label)) {
        throw new Error(`Preset stamp "${label}" was not found in annotationStore!`);
      }
    }
    await page.screenshot({ path: './preset_stamps_placed.png' });
    console.log('[STEP 2 SUCCESS] All preset stamps placed on canvas successfully.\n');

    // -------------------------------------------------------------------
    // STEP 3: Export PDF with all preset stamps and re-upload cleanly
    // -------------------------------------------------------------------
    console.log('[STEP 3] Exporting document containing preset stamps...');
    const downloadPromise1 = page.waitForEvent('download');
    await page.click('button:has-text("Export")');
    const download1 = await downloadPromise1;
    const presetExportPath = path.resolve('./exported_preset_stamps.pdf');
    await download1.saveAs(presetExportPath);
    console.log(`[STEP 3] Exported preset PDF to: ${presetExportPath}`);

    // Re-upload exported preset PDF
    console.log('[STEP 3] Re-uploading exported preset PDF...');
    await fileInput.setInputFiles(presetExportPath);
    await page.waitForTimeout(1500);

    const reimportedPresetAnnots = await page.evaluate(() => {
      return window.annotationStore ? window.annotationStore.getAll() : [];
    });
    console.log(`[STEP 3 SUMMARY] Re-imported annotations count: ${reimportedPresetAnnots.length}`);
    const reimportedTexts = reimportedPresetAnnots.map(a => a.stampText || a.contents);
    console.log('[STEP 3 SUMMARY] Re-imported stamp texts:', reimportedTexts);

    for (const label of presetLabels) {
      if (!reimportedTexts.includes(label)) {
        throw new Error(`Re-imported preset stamp "${label}" missing from document!`);
      }
    }
    await page.screenshot({ path: './preset_stamps_reimported.png' });
    console.log('[STEP 3 SUCCESS] Exported preset PDF re-uploaded & all 6 preset stamps verified.\n');

    // -------------------------------------------------------------------
    // STEP 4: Custom Image Stamp Upload
    // -------------------------------------------------------------------
    console.log('[STEP 4] Testing Custom Image Stamp upload...');

    // Create a temporary PNG image for uploading
    const testImagePath = path.resolve('./temp_custom_stamp.png');
    // 1x1 red PNG pixel
    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    fs.writeFileSync(testImagePath, Buffer.from(pngBase64, 'base64'));

    // Open Stamp Modal
    await page.click('button[title*="Stamp / Image"]');
    await page.waitForTimeout(300);

    // Switch to "Upload Image" tab
    await page.click('button:has-text("Upload Image")');
    await page.waitForTimeout(300);

    // Upload custom image
    const imageInput = page.locator('input[type="file"][accept*="image"]');
    await imageInput.setInputFiles(testImagePath);
    await page.waitForTimeout(300);

    // Click canvas to place image stamp
    await page.mouse.click(canvasBox.x + 200, canvasBox.y + 450);
    await page.waitForTimeout(500);

    const customAnnots = await page.evaluate(() => {
      return window.annotationStore ? window.annotationStore.getAll() : [];
    });
    console.log(`[STEP 4 SUMMARY] Total annotations in store after image upload: ${customAnnots.length}`);
    const imageStamp = customAnnots.find(a => a.stampType === 'custom_image' || (a.type === 'stamp' && a.dataUrl));
    if (!imageStamp) {
      throw new Error('Custom image stamp was not created in annotationStore!');
    }
    console.log('[STEP 4 SUCCESS] Custom image stamp placed on canvas.\n');

    // -------------------------------------------------------------------
    // STEP 5: Export PDF with Custom Image Stamp and re-upload cleanly
    // -------------------------------------------------------------------
    console.log('[STEP 5] Exporting document containing custom image stamp...');
    const downloadPromise2 = page.waitForEvent('download');
    await page.click('button:has-text("Export")');
    const download2 = await downloadPromise2;
    const customExportPath = path.resolve('./exported_custom_image_stamp.pdf');
    await download2.saveAs(customExportPath);
    console.log(`[STEP 5] Exported custom image stamp PDF to: ${customExportPath}`);

    // Re-upload exported custom image PDF
    console.log('[STEP 5] Re-uploading exported PDF with custom image stamp...');
    await fileInput.setInputFiles(customExportPath);
    await page.waitForTimeout(1500);

    const reimportedCustomAnnots = await page.evaluate(() => {
      return window.annotationStore ? window.annotationStore.getAll() : [];
    });
    console.log(`[STEP 5 SUMMARY] Re-imported annotations count: ${reimportedCustomAnnots.length}`);
    await page.screenshot({ path: './custom_image_reimported.png' });

    if (reimportedCustomAnnots.length === 0) {
      throw new Error('Re-imported PDF with custom image stamp returned 0 annotations!');
    }
    console.log('[STEP 5 SUCCESS] Custom image stamp PDF re-uploaded and parsed cleanly.\n');

    // Clean up temporary image
    if (fs.existsSync(testImagePath)) fs.unlinkSync(testImagePath);

    console.log('===========================================================');
    console.log(' 🎉 ALL PRESET STAMPS & CUSTOM IMAGE VERIFICATION PASSED! ');
    console.log('===========================================================');

  } catch (err) {
    console.error('❌ VERIFICATION ERROR:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

verifyAllStamps();
