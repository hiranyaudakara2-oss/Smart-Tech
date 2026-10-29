import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import type { Request, Response } from 'express';
import { handleSmartTechApiRequest } from './src/server/apiCore';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  const app = express();

  // Ensure Google Sign-In popups work across Chrome, Safari, Firefox, and Edge
  app.use((_req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    next();
  });

  // Collect raw Buffer for /api/* so JSON, PDF uploads, and image uploads all work identically to Netlify Functions
  app.use('/api', express.raw({ type: '*/*', limit: '26mb' }), async (req: Request, res: Response) => {
    try {
      const headers: Record<string, string | undefined> = {};
      for (const [k, v] of Object.entries(req.headers)) {
        headers[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : v;
      }

      const query: Record<string, string | undefined> = {};
      for (const [k, v] of Object.entries(req.query)) {
        if (typeof v === 'string') {
          query[k] = v;
        } else if (Array.isArray(v) && typeof v[0] === 'string') {
          query[k] = v[0];
        }
      }

      const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown')
        .split(',')[0]
        .trim();

      const apiResp = await handleSmartTechApiRequest({
        method: req.method,
        pathname: req.originalUrl.split('?')[0] || `/api${req.path}`,
        query,
        headers,
        rawBody,
        ip,
      });

      for (const [headerName, headerVal] of Object.entries(apiResp.headers)) {
        res.setHeader(headerName, headerVal);
      }
      res.status(apiResp.status).send(apiResp.body);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Internal server error.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, allowedHosts: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Smart Tech running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
