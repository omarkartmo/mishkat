import fs from 'fs';
import path from 'path';

async function checkHajj() {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const p = 'C:\\Users\\NABTAKIR\\Downloads\\BOOKS\\10 خطوات للحج المبرور\\1001837.pdf';
  const buffer = fs.readFileSync(p);
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  console.log('Pages:', doc.numPages);
  for (let i = 1; i <= Math.min(10, doc.numPages); i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const txt = content.items.map((it: any) => it.str).join(' ');
    if (txt.trim()) console.log(`[P${i}]:`, txt.substring(0, 200));
  }
}
checkHajj().catch(console.error);
