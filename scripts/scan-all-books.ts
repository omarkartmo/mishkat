import fs from 'fs';
import path from 'path';

async function scanAllBooks() {
  const root = 'C:\\Users\\NABTAKIR\\Downloads\\BOOKS';
  if (!fs.existsSync(root)) {
    console.log('Path does not exist:', root);
    return;
  }
  const dirs = fs.readdirSync(root);
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

  console.log('Total book folders in BOOKS:', dirs.length);

  for (const d of dirs.slice(0, 30)) {
    const fullDir = path.join(root, d);
    if (!fs.statSync(fullDir).isDirectory()) continue;
    const files = fs.readdirSync(fullDir).filter(f => f.endsWith('.pdf'));
    if (files.length === 0) continue;
    
    const pdfPath = path.join(fullDir, files[0]);
    try {
      const buffer = fs.readFileSync(pdfPath);
      const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
      
      let foundText = false;
      let sampleText = '';
      let textPages = 0;
      for (let p = 1; p <= Math.min(10, doc.numPages); p++) {
        const page = await doc.getPage(p);
        const content = await page.getTextContent();
        const items = content.items.map((i: any) => i.str || '').filter((s: string) => s.trim().length > 0);
        if (items.length > 5) {
          textPages++;
          if (!sampleText) {
            sampleText = `(P${p}, ${items.length} items): ` + items.join(' ').substring(0, 160);
          }
        }
      }
      console.log(`[Folder: "${d}"] [File: ${files[0]}] [Pages: ${doc.numPages}] [TextPages 1-10: ${textPages}]`);
      if (sampleText) {
        console.log(`   Sample: ${sampleText}`);
      } else {
        console.log(`   Sample: NO TEXT IN PAGES 1-10`);
      }
    } catch (e: any) {
      console.log(`[Folder: "${d}"] -> ERROR: ${e.message}`);
    }
  }
}

scanAllBooks().catch(console.error);
