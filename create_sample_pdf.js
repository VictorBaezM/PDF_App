import { PDFDocument, rgb } from 'pdf-lib';
import fs from 'fs';

async function main() {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([600, 800]);
  
  page.drawText('Sample Document for User Verification Flow', {
    x: 50,
    y: 750,
    size: 20,
    color: rgb(0.1, 0.1, 0.1),
  });

  page.drawText('This is sample paragraph text inside the PDF file to test text selection and annotations.', {
    x: 50,
    y: 700,
    size: 14,
    color: rgb(0.2, 0.2, 0.2),
  });

  page.drawText('Underline and strikethrough test line of text here.', {
    x: 50,
    y: 650,
    size: 14,
    color: rgb(0.2, 0.2, 0.2),
  });

  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync('./sample.pdf', pdfBytes);
  console.log('sample.pdf created successfully');
}

main().catch(console.error);
