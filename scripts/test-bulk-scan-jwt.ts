import jwt from 'jsonwebtoken';
import { serverConfig } from '../server/config';

// Create a valid admin JWT token directly
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

async function testWithToken() {
  console.log('Testing bulk-scan via direct Admin JWT token on http://localhost:3000/api/v1/books/bulk-scan ...');

  const scanRes = await fetch('http://localhost:3000/api/v1/books/bulk-scan', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      folderPath: 'C:\\Users\\NABTAKIR\\Downloads\\BOOKS',
      limit: 30,
      offset: 0,
      excludeImported: false
    })
  });

  const scanData: any = await scanRes.json();
  if (!scanData.success) {
    console.error('Scan API failed:', scanData);
    process.exit(1);
  }

  console.log(`✅ Live API bulk-scan SUCCEEDED! Total discovered: ${scanData.data.totalDiscovered}, Returned items: ${scanData.data.items.length}\n`);

  const results = scanData.data.items.map((item: any, idx: number) => ({
    '#': idx + 1,
    'الكتاب': item.title,
    'المؤلف': item.author,
    'المصدر': item.authorDetectedFrom,
    'التصنيف': item.categoryName,
    'الدقة': item.confidence + '%'
  }));

  console.table(results);
}

testWithToken().catch(console.error);
