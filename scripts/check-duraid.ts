import fs from 'fs';
import path from 'path';

async function checkDuraidOnly() {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const file = 'C:\\Users\\NABTAKIR\\Downloads\\BOOKS\\أبو بكر بن دريد الأزدي العماني أعلم العلماء وأشعر الشعراء\\1002280.pdf';
  const buf = fs.readFileSync(file);
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
  console.log('Total pages:', doc.numPages);
  const meta = await doc.getMetadata();
  console.log('Meta Info:', meta.info);
  for (let p = 1; p <= Math.min(8, doc.numPages); p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = content.items.map((i: any) => i.str || '').filter((s: string) => s.trim().length > 0);
    console.log(`\n=== Page ${p} ===`);
    console.log(items.join(' | '));
  }
}
checkDuraidOnly().catch(console.error);
