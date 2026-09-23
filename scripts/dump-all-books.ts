import fs from 'fs';
import path from 'path';

async function dumpAllBookFirstPages() {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const root = 'C:\\Users\\NABTAKIR\\Downloads\\BOOKS';
  const dirs = fs.readdirSync(root);

  let outputLog = '';
  const log = (...args: any[]) => {
    const line = args.join(' ');
    console.log(line);
    outputLog += line + '\n';
  };
  for (let i = 0; i < dirs.length; i++) {
    const d = dirs[i];
    const fullDir = path.join(root, d);
    if (!fs.statSync(fullDir).isDirectory()) continue;
    const files = fs.readdirSync(fullDir).filter((f) => f.endsWith('.pdf'));
    if (files.length === 0) continue;

    log(`\n======================================================================`);
    log(`[BOOK ${i + 1}/${dirs.length}] FOLDER: "${d}" | FILE: "${files[0]}"`);
    log(`======================================================================`);

    const pdfPath = path.join(fullDir, files[0]);
    const buffer = fs.readFileSync(pdfPath);
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
    log(`Total Pages: ${doc.numPages}`);

    try {
      const meta = await doc.getMetadata();
      if (meta?.info) {
        log(`Metadata: Title="${(meta.info as any)?.Title || ''}", Author="${(meta.info as any)?.Author || ''}"`);
      }
    } catch {}

    for (let p = 1; p <= Math.min(6, doc.numPages); p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const items = content.items.map((it: any) => it.str).filter((s: string) => s && s.trim());
      if (items.length > 0) {
        log(`--- Page ${p} (${items.length} items) ---`);
        log(items.join(' | '));
      } else {
        log(`--- Page ${p} (EMPTY / SCANNED IMAGE) ---`);
      }
    }
  }

  if (!fs.existsSync('scratch')) fs.mkdirSync('scratch', { recursive: true });
  fs.writeFileSync('scratch/dump-output-utf8.txt', outputLog, 'utf8');
  console.log('✅ Dumped utf-8 output successfully.');
}

dumpAllBookFirstPages().catch(console.error);
