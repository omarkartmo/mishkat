import net from 'net';
import { logger } from '../utils/logger';

const BLOCK_HTML = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8">
  <title>تم حظر هذا الموقع - مشكاة</title>
  <style>
    body {
      font-family: system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: #0f172a;
      color: #f8fafc;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 1rem;
    }
    .card {
      background-color: #1e293b;
      border: 1px solid #334155;
      border-radius: 1.5rem;
      padding: 2.5rem 2rem;
      max-width: 460px;
      width: 100%;
      text-align: center;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    }
    .icon {
      font-size: 3.5rem;
      margin-bottom: 1.25rem;
    }
    h1 {
      color: #fb7185;
      font-size: 1.4rem;
      font-weight: 800;
      margin: 0 0 0.75rem 0;
    }
    p {
      color: #94a3b8;
      font-size: 0.9rem;
      line-height: 1.6;
      margin: 0 0 1.5rem 0;
    }
    .badge {
      display: inline-block;
      background: rgba(244, 63, 94, 0.12);
      border: 1px solid rgba(244, 63, 94, 0.35);
      color: #fda4af;
      padding: 0.35rem 1rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.025em;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">🛡️</div>
    <h1>تم حظر الوصول إلى هذا الموقع</h1>
    <p>تم تقييد الوصول إلى هذا المحتوى وفقاً لسياسة استخدام الإنترنت المعتمدة في مكتبة مشكاة للتركيز على التحصيل العلمي والبحثي.</p>
    <div class="badge">نظام حماية مشكاة المركزي</div>
  </div>
</body>
</html>`;

const HTTP_403_RESPONSE = Buffer.from(
  'HTTP/1.1 403 Forbidden\r\n' +
  'Content-Type: text/html; charset=utf-8\r\n' +
  'Connection: close\r\n' +
  'Cache-Control: no-cache, no-store, must-revalidate, max-age=0\r\n' +
  'Pragma: no-cache\r\n' +
  `Content-Length: ${Buffer.byteLength(BLOCK_HTML)}\r\n\r\n` +
  BLOCK_HTML
);

let blackholeServer: net.Server | null = null;

/**
 * Starts an ultra-lightweight Blackhole Proxy Server on 127.0.0.1:9999
 * Responds with HTTP 403 Forbidden to both HTTP and HTTPS CONNECT requests.
 * This guarantees Chromium / Edge never flags 127.0.0.1:9999 as a dead proxy (Bad Proxy Retry List),
 * preventing fail-open bypasses on subsequent requests.
 */
export function startBlackholeProxy(port: number = 9999): net.Server {
  if (blackholeServer) {
    return blackholeServer;
  }

  const server = net.createServer((socket) => {
    socket.once('data', () => {
      try {
        socket.write(HTTP_403_RESPONSE);
      } catch {}
      try {
        socket.end();
      } catch {}
    });

    socket.on('error', () => {
      // Ignore client socket errors (browser abruptly closing)
    });
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      logger.info(`[InternetPolicy] Blackhole proxy port ${port} already active.`);
    } else {
      logger.warn(`[InternetPolicy] Blackhole proxy listener warning: ${err.message}`);
    }
  });

  server.listen(port, '127.0.0.1', () => {
    logger.info(`[InternetPolicy] 🛡️ Blackhole proxy shield listening on 127.0.0.1:${port}`);
  });

  blackholeServer = server;
  return server;
}

export function stopBlackholeProxy(): Promise<void> {
  return new Promise((resolve) => {
    if (blackholeServer) {
      blackholeServer.close(() => {
        blackholeServer = null;
        resolve();
      });
    } else {
      resolve();
    }
  });
}
