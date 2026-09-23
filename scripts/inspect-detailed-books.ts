import fs from 'fs';
import path from 'path';

async function inspectSampleBooks() {
  const root = 'C:\\Users\\NABTAKIR\\Downloads\\BOOKS';
  const dirs = fs.readdirSync(root).slice(15, 35);
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

  for (const dirName of dirs) {
    const fullDir = path.join(root, dirName);
    if (!fs.statSync(fullDir).isDirectory()) continue;
    const files = fs.readdirSync(fullDir).filter(f => f.endsWith('.pdf'));
    if (files.length === 0) continue;

    console.log('\n======================================================');
    console.log('FOLDER:', dirName);
    const pdfPath = path.join(fullDir, files[0]);
    const buffer = fs.readFileSync(pdfPath);
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;

    for (let p = 1; p <= Math.min(4, doc.numPages); p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const items = content.items.map((i: any) => i.str || '').filter((s: string) => s.trim().length > 0);
      if (items.length > 0) {
        console.log(`[P${p}] (${items.length} items):`, items.join(' | ').substring(0, 300));
      }
    }
  }
}

inspectSampleBooks().catch(console.error);
