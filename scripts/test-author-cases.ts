import fs from 'fs';
import path from 'path';

async function testCases() {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const files = [
    'C:\\Users\\NABTAKIR\\Downloads\\BOOKS\\ابن النضر\\1001605.pdf',
    'C:\\Users\\NABTAKIR\\Downloads\\BOOKS\\ابن بور في الذاكرة العمانية\\1001662.pdf',
    'C:\\Users\\NABTAKIR\\Downloads\\BOOKS\\إباضية جزيرة جربة خلال العصر الحديث\\1001425.pdf',
    'C:\\Users\\NABTAKIR\\Downloads\\BOOKS\\أثر ارتكاب الجنايات بالسحر في الفقه الإسلامي\\1002266.pdf',
  ];

  for (const f of files) {
    if (!fs.existsSync(f)) continue;
    console.log('\n=== FILE:', path.basename(path.dirname(f)), '===');
    const buffer = fs.readFileSync(f);
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
    for (let p = 1; p <= 5; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const text = content.items.map((i: any) => i.str || '').filter(Boolean).join(' ');
      console.log(`[P${p}]`, text.substring(0, 250));
    }
  }
}
testCases().catch(console.error);
