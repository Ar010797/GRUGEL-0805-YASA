import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApiApp } from '../src/serverApp.ts';

const app = createApiApp();

export default function handler(req: IncomingMessage & { body?: any; _body?: boolean }, res: ServerResponse) {
  try {
    const parsedUrl = new URL(req.url || '/', 'http://localhost');
    const routeParam = parsedUrl.searchParams.get('route');

    if (routeParam !== null || parsedUrl.pathname === '/api/index') {
      const cleanRoute = (routeParam || '').replace(/^\/+/, '');
      parsedUrl.searchParams.delete('route');
      const qs = parsedUrl.searchParams.toString();
      req.url = cleanRoute
        ? `/api/${cleanRoute}${qs ? `?${qs}` : ''}`
        : `/api/health${qs ? `?${qs}` : ''}`;
    }

    // Guard against Vercel runtime pre-parsing the JSON body before Express body-parser runs
    if (req.body !== undefined && !req.readable) {
      req._body = true;
    }
  } catch {
    // Keep original req.url on unexpected URL parse edge cases
  }

  return app(req as any, res as any);
}
