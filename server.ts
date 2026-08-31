import { startServer } from './server/index';

startServer().catch((err) => {
  console.error('Fatal Server Initialization Error:', err);
  process.exit(1);
});
