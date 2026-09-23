import fs from 'fs';

async function testLiveApi() {
  console.log('Testing LIVE HTTP API bulk-scan on http://localhost:3000/api/v1/books/bulk-scan ...');

  // 1. Login as Admin
  const loginRes = await fetch('http://localhost:3000/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      registrationNumber: 'ADM-001',
      password: 'admin123'
    })
  });

  const loginData: any = await loginRes.json();
  if (!loginData.success || !loginData.data?.token) {
    console.error('Login failed:', loginData);
    process.exit(1);
  }

  const token = loginData.data.token;
  console.log('✅ Admin login successful.');

  // 2. Call bulk-scan
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

  console.log(`✅ Bulk scan succeeded! Total discovered: ${scanData.data.totalDiscovered}, Items returned: ${scanData.data.items.length}\n`);

  const summary = scanData.data.items.map((item: any, idx: number) => ({
    num: idx + 1,
    title: item.title,
    author: item.author,
    pages: item.pages,
    detectedFrom: item.authorDetectedFrom,
    category: item.categoryName,
    confidence: item.confidence + '%'
  }));

  console.table(summary);
  fs.writeFileSync('scratch/live_api_scan_results.json', JSON.stringify(summary, null, 2), 'utf-8');
}

testLiveApi().catch(console.error);
