import fs from 'fs';
import path from 'path';

async function testPdf(pdfPath: string) {
  console.log('\n=============================================');
  console.log('Testing PDF:', pdfPath);
  try {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const buffer = fs.readFileSync(pdfPath);
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
    console.log('Total pages:', doc.numPages);
    
    // Check PDF metadata
    try {
      const meta = await doc.getMetadata();
      console.log('PDF info metadata:', meta?.info);
    } catch (e: any) {
      console.log('Metadata error:', e.message);
    }

    for (let p = 1; p <= Math.min(5, doc.numPages); p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const items = content.items.map((i: any) => i.str || '').filter((s: string) => s.trim().length > 0);
      console.log(`--- Page ${p} (items: ${items.length}) ---`);
      if (items.length > 0) {
        console.log('Raw joined:', items.join(' ').substring(0, 300));
      } else {
        console.log('[EMPTY PAGE TEXT - Pure Scanned Image]');
      }
    }
  } catch (err: any) {
    console.error('Error reading PDF:', err.message);
  }
}

async function main() {
  const books = [
    'C:\\Users\\NABTAKIR\\Downloads\\BOOKS\\10 خطوات للحج المبرور\\1001837.pdf',
    'C:\\Users\\NABTAKIR\\Downloads\\BOOKS\\آثار الجهاد في سبيل الله\\1002260.pdf',
    'C:\\Users\\NABTAKIR\\Downloads\\BOOKS\\آثار اللعان في الفقه الإسلامي\\1002261.pdf',
    'C:\\Users\\NABTAKIR\\Downloads\\BOOKS\\أبو  اليقظان ودوره في الحركة الإصلاحية في الجزائر\\1002279.pdf',
    'C:\\Users\\NABTAKIR\\Downloads\\BOOKS\\أبو العباس أحمد بن سعيد الشماخي وآراؤه الأصولية\\1001374.pdf',
    'C:\\Users\\NABTAKIR\\Downloads\\BOOKS\\أبو بكر بن دريد الأزدي العماني أعلم العلماء وأشعر الشعراء\\1001844.pdf'
  ];
  for (const b of books) {
    if (fs.existsSync(b)) {
      await testPdf(b);
    } else {
      // Find what file is inside directory
      const dir = path.dirname(b);
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.pdf'));
        if (files[0]) {
          await testPdf(path.join(dir, files[0]));
        }
      }
    }
  }
}
main().catch(console.error);
