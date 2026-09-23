import fs from 'fs';
import path from 'path';

async function inspectSpecific() {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const targetFolders = [
    '10 خطوات للحج المبرور',
    'أبو  اليقظان ودوره في الحركة الإصلاحية في الجزائر',
    'أبو بكر بن دريد الأزدي العماني أعلم العلماء وأشعر الشعراء',
    'أثر ارتكاب الجنايات بالسحر في الفقه الإسلامي',
    'إتحاف الأئمة بفقه الإمامة في الصلاة',
    'ابتهالات الشيخ الهجاري',
    'ابن ماجد والبرتغال',
  ];

  const root = 'C:\\Users\\NABTAKIR\\Downloads\\BOOKS';
  for (const tf of targetFolders) {
    const fullDir = path.join(root, tf);
    if (!fs.existsSync(fullDir)) continue;
    const files = fs.readdirSync(fullDir).filter(f => f.endsWith('.pdf'));
    if (files.length === 0) continue;
    const pdfPath = path.join(fullDir, files[0]);
    const buffer = fs.readFileSync(pdfPath);
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;

    console.log('\n=============================================');
    console.log('BOOK:', tf);
    console.log('Pages:', doc.numPages);
    for (let p = 1; p <= Math.min(8, doc.numPages); p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const rawText = content.items.map((i: any) => i.str || '').filter(Boolean).join(' ');
      if (rawText.trim().length > 0) {
        console.log(`[P${p}]:`, rawText.substring(0, 300));
      }
    }
  }
}
inspectSpecific().catch(console.error);
