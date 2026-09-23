import fs from 'fs';
import path from 'path';

async function checkShammakhi() {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const file = 'C:\\Users\\NABTAKIR\\Downloads\\BOOKS\\أبو العباس أحمد بن سعيد الشماخي وآراؤه الأصولية\\1001374.pdf';
  const buf = fs.readFileSync(file);
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
  console.log('Total pages:', doc.numPages);
  for (let p = 1; p <= Math.min(8, doc.numPages); p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = content.items.map((i: any) => i.str || '').filter((s: string) => s.trim().length > 0);
    console.log(`\n=== Page ${p} (${items.length} items) ===`);
    console.log(items.slice(0, 40).join(' | '));
  }
}
checkShammakhi().catch(console.error);
