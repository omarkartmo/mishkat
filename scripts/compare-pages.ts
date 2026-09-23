import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';

async function checkPages() {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const base = 'C:\\Users\\NABTAKIR\\Downloads\\BOOKS';

  const jwtSecret = '0f8a713121c4b8f65443bc1d546e2777ece3be3c4163917f58d079a5a41ed569bd3834872203e8eaaccee6cdadd4637a';
  const token = jwt.sign(
    {
      userId: 'admin-001',
      role: 'admin',
      registrationNumber: 'ADM-001',
      tokenVersion: 0
    },
    jwtSecret,
    { expiresIn: '1h' }
  );

  const resp = await fetch('http://localhost:3000/api/v1/books/bulk-scan', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
    body: JSON.stringify({
      folderPath: base,
      limit: 30,
      offset: 0,
      excludeImported: false
    })
  });
  const json = await resp.json();
  const scanned = json.data.results;

  const comparison = [];
  for (const item of scanned) {
    const p = item.stagedFilePath;
    const buf = fs.readFileSync(p);
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
    const realPages = doc.numPages;
    comparison.push({
      title: item.title,
      scannedPages: item.pages,
      realPages: realPages,
      diff: item.pages - realPages,
      match: item.pages === realPages ? 'MATCH' : 'MISMATCH'
    });
  }
  console.table(comparison);
}

checkPages();
