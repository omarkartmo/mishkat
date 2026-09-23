import fs from 'fs';
import path from 'path';

async function checkMeta() {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const files = [
    'C:\\Users\\NABTAKIR\\Downloads\\BOOKS\\ابن النضر\\1001605.pdf',
    'C:\\Users\\NABTAKIR\\Downloads\\BOOKS\\ابن بور في الذاكرة العمانية\\1001662.pdf',
    'C:\\Users\\NABTAKIR\\Downloads\\BOOKS\\أثر ارتكاب الجنايات بالسحر في الفقه الإسلامي\\1002266.pdf',
  ];
  for (const f of files) {
    const buffer = fs.readFileSync(f);
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
    const meta = await doc.getMetadata();
    console.log('\n---', path.basename(path.dirname(f)), '---');
    console.log('Metadata Info:', meta.info);
    
    // Check if author signature is on last page!
    const lastPage = await doc.getPage(doc.numPages);
    const lastContent = await lastPage.getTextContent();
    console.log('Last Page text:', lastContent.items.map((i: any) => i.str).join(' ').slice(-300));
  }
}
checkMeta().catch(console.error);
