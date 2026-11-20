import 'dotenv/config';
import http from 'node:http';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createApiApp } from './src/serverApp.ts';
import { initSocketServer } from './src/realtime/socketServer.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isProd = process.env.NODE_ENV === 'production';
const PORT = isProd ? Number(process.env.PORT) || 3000 : 3000;

async function start() {

  // Create HTTP server early so Socket.IO attaches alongside Express on port 3000
  const rootRouter = express();
  const httpServer = http.createServer(rootRouter);
  const realtime = initSocketServer(httpServer);

  const apiApp = createApiApp({ realtime });
  rootRouter.use(apiApp);

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        watch: process.env.DISABLE_HMR === 'true' ? null : {},
      },
      appType: 'spa',
    });
    rootRouter.use(vite.middlewares);
  } else {
    rootRouter.use(express.static(path.join(__dirname, 'dist')));
    rootRouter.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server Administrasi RW 05 (PostgreSQL + Socket.IO) berjalan aktif di port ${PORT}`);
  });

  const shutdown = () => {
    httpServer.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start().catch((err) => {
  console.error('Fatal error starting server:', err);
});
