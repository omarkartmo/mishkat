import fs from 'fs';
import path from 'path';

async function checkAllPdfTypes() {
  const root = 'C:\\Users\\NABTAKIR\\Downloads\\BOOKS';
  const dirs = fs.readdirSync(root);
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

  console.log(`Checking text presence across all ${dirs.length} books:\n`);

  for (let idx = 0; idx < dirs.length; idx++) {
    const d = dirs[idx];
    const fullDir = path.join(root, d);
    if (!fs.statSync(fullDir).isDirectory()) continue;
    const files = fs.readdirSync(fullDir).filter(f => f.endsWith('.pdf'));
    if (files.length === 0) continue;

    const pdfPath = path.join(fullDir, files[0]);
    const buf = fs.readFileSync(pdfPath);
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
    
    let totalTextLen = 0;
    let pagesWithText = 0;
    for (let p = 1; p <= Math.min(10, doc.numPages); p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const txt = content.items.map((i: any) => i.str || '').join(' ').trim();
      if (txt.length > 10) {
        pagesWithText++;
        totalTextLen += txt.length;
      }
    }

    const isImageOnly = pagesWithText === 0;
    console.log(`[#${idx + 1}] "${d}"`);
    console.log(`     Pages: ${doc.numPages} | TextPages (1-10): ${pagesWithText} | Type: ${isImageOnly ? '⚠️ SCANNED_IMAGE_ONLY (NO OCR)' : '📄 HAS_TEXT_LAYER'}`);
  }
}

checkAllPdfTypes().catch(console.error);
