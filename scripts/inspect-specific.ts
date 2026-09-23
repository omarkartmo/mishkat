import fs from 'fs';
import path from 'path';

async function checkSpecificBooks() {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const filesToCheck = [
    { title: 'أبو بكر بن دريد الأزدي العماني أعلم العلماء وأشعر الشعراء', file: 'C:\\Users\\NABTAKIR\\Downloads\\BOOKS\\أبو بكر بن دريد الأزدي العماني أعلم العلماء وأشعر الشعراء\\1002280.pdf' },
    { title: 'أثر ارتكاب الجنايات بالسحر في الفقه الإسلامي', file: 'C:\\Users\\NABTAKIR\\Downloads\\BOOKS\\أثر ارتكاب الجنايات بالسحر في الفقه الإسلامي\\1002266.pdf' },
    { title: 'إباضية جزيرة جربة خلال العصر الحديث', file: 'C:\\Users\\NABTAKIR\\Downloads\\BOOKS\\إباضية جزيرة جربة خلال العصر الحديث\\1001425.pdf' },
    { title: 'ابن ماجد والبرتغال', file: 'C:\\Users\\NABTAKIR\\Downloads\\BOOKS\\ابن ماجد والبرتغال\\1002278.pdf' },
    { title: 'ابن النضر', file: 'C:\\Users\\NABTAKIR\\Downloads\\BOOKS\\ابن النضر\\1001605.pdf' },
    { title: 'ابن بور في الذاكرة العمانية', file: 'C:\\Users\\NABTAKIR\\Downloads\\BOOKS\\ابن بور في الذاكرة العمانية\\1001662.pdf' }
  ];

  for (const item of filesToCheck) {
    console.log('\n======================================================');
    console.log('CHECKING:', item.title);
    if (!fs.existsSync(item.file)) {
      console.log('File not found:', item.file);
      continue;
    }
    const buf = fs.readFileSync(item.file);
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
    console.log('Total pages:', doc.numPages);
    const meta = await doc.getMetadata();
    console.log('Metadata Info:', meta.info);
    for (let p = 1; p <= Math.min(5, doc.numPages); p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const items = content.items.map((i: any) => i.str || '').filter((s: string) => s.trim().length > 0);
      if (items.length > 0) {
        console.log(`-- Page ${p} (${items.length} items) --:`, items.slice(0, 30).join(' | '));
      }
    }
  }
}

checkSpecificBooks().catch(console.error);
