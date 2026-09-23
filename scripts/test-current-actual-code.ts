import fs from 'fs';
import path from 'path';

// Note: JWT_SECRET provided via environment variable
import { extractDocumentMetadata } from '../server/utils/authorExtractor';
import { classifyBook } from '../server/routes/books.routes';

async function testAll() {
  const root = 'C:\\Users\\NABTAKIR\\Downloads\\BOOKS';
  const dirs = fs.readdirSync(root);
  const categories = [
    { id: 'cat-islamic', name: 'العلوم الشرعية والفكر الإسلامي' },
    { id: 'cat-arabic', name: 'اللغة العربية وآدابها' },
    { id: 'cat-history', name: 'التاريخ والحضارة والآثار' },
    { id: 'cat-science', name: 'العلوم الطبيعية والتكنولوجيا' },
    { id: 'cat-education', name: 'التربية ومناهج البحث العلمي' },
    { id: 'cat-general', name: 'الثقافة العامة والتطوير الذاتي' }
  ];

  const results: any[] = [];
  let index = 0;

  for (const d of dirs) {
    const fullDir = path.join(root, d);
    if (!fs.statSync(fullDir).isDirectory()) continue;
    const files = fs.readdirSync(fullDir).filter(f => f.endsWith('.pdf'));
    if (files.length === 0) continue;
    index++;

    const filePath = path.join(fullDir, files[0]);
    const title = d;
    const meta = await extractDocumentMetadata(filePath, 'pdf', { folderName: d, title });
    const classification = classifyBook(title, meta.author || '', d, categories, meta.introText);

    results.push({
      num: index,
      folder: d,
      file: files[0],
      author: meta.author,
      method: meta.method,
      page: meta.pageFound,
      category: classification.categoryName,
      catId: classification.categoryId,
      confidence: classification.confidence
    });
  }

  console.log(JSON.stringify(results, null, 2));
  fs.writeFileSync('scratch/actual_results.json', JSON.stringify(results, null, 2));
}

testAll().catch(console.error);
