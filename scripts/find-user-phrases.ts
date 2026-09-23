import fs from 'fs';
import path from 'path';

async function findPhrases() {
  const root = 'C:\\Users\\NABTAKIR\\Downloads\\BOOKS';
  const dirs = fs.readdirSync(root);
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  
  for (const d of dirs) {
    const fullDir = path.join(root, d);
    if (!fs.statSync(fullDir).isDirectory()) continue;
    const files = fs.readdirSync(fullDir).filter(f => f.endsWith('.pdf'));
    if (files.length === 0) continue;
    const buf = fs.readFileSync(path.join(fullDir, files[0]));
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
    for (let p = 1; p <= Math.min(8, doc.numPages); p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const text = content.items.map((i: any) => i.str || '').join(' ');
      if (
        text.includes('جوز') ||
        text.includes('الناعس') ||
        text.includes('فسل') ||
        text.includes('تيسري') ||
        text.includes('صالح الدين') ||
        text.includes('صلاح الدين') ||
        text.includes('طلب فرج')
      ) {
        console.log(`\n=== Found in [${d}] page ${p} ===`);
        const matches = text.match(/.{0,50}(?:جوز|الناعس|فسل|تيسري|صالح الدين|صلاح الدين|طلب فرج).{0,50}/g);
        console.log(matches);
      }
    }
  }
}

findPhrases().catch(console.error);
