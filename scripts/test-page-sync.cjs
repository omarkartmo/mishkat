const http = require('http');

async function request(options, postData) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    req.on('error', reject);
    if (postData) req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    req.end();
  });
}

async function main() {
  console.log('1. Logging in as admin...');
  const loginRes = await request(
    {
      hostname: 'localhost',
      port: 3000,
      path: '/api/v1/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    { registrationNumber: 'ADM-001', password: 'admin123' }
  );

  if (!loginRes.data.success) {
    console.error('Login failed:', loginRes.data);
    return;
  }
  const token = loginRes.data.data.token;
  console.log('Logged in successfully. Token acquired.');

  console.log('2. Calling POST /api/v1/books/sync-page-counts...');
  const syncRes = await request(
    {
      hostname: 'localhost',
      port: 3000,
      path: '/api/v1/books/sync-page-counts',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    },
    {}
  );
  console.log('Sync Response:', syncRes.data);

  console.log('\n3. Inspecting digital books after sync:');
  const booksRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/v1/books?type=digital&limit=100',
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  const books = booksRes.data.data || [];
  console.log(`Found ${books.length} digital books:`);
  for (const b of books) {
    console.log(`- [${b.id}] "${b.title}": pagesCount = ${b.pagesCount || b.pages} (filePath: ${b.filePath || b.fileUrl || 'N/A'})`);
  }
}

main().catch(console.error);
