import type { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../lib/firebase-admin.ts';
import { verifySessionTokenSql } from '../db/repository.ts';
import type { AuthUser } from '../types.ts';

export interface AuthRequest extends Request {
  authUser?: AuthUser;
  authToken?: string;
}

export function extractTokenFromRequest(req: Request, allowQueryToken = false): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim();
    if (token) return token;
  }
  if (allowQueryToken && typeof req.query.token === 'string' && req.query.token.trim()) {
    return req.query.token.trim();
  }
  return null;
}

export function createRequireAuth(options?: { allowQueryToken?: boolean }) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const token = extractTokenFromRequest(req, Boolean(options?.allowQueryToken));
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Akses ditolak: Anda belum login atau sesi telah berakhir.',
      });
    }

    try {
      const sqlSession = await verifySessionTokenSql(token);
      if (sqlSession) {
        req.authUser = {
          role: sqlSession.role,
          username: sqlSession.username,
          nama: sqlSession.nama,
          noKK: sqlSession.noKK,
          wargaId: sqlSession.wargaId,
          rtScope: sqlSession.rtScope,
          isPinAuthenticated: sqlSession.isPinAuthenticated,
        };
        req.authToken = token;
        return next();
      }
    } catch (err) {
      console.error('SQL auth session verification error:', err);
    }

    // Optional Firebase Admin token verification fallback
    try {
      const decoded = await adminAuth.verifyIdToken(token);
      req.authUser = {
        role: decoded.email === 'ar01071997@gmail.com' ? 'server' : 'warga',
        username: decoded.email || decoded.uid,
        nama: decoded.name || decoded.email || 'Pengguna',
        isPinAuthenticated: false,
      };
      req.authToken = token;
      return next();
    } catch {
      return res.status(401).json({
        success: false,
        message: 'Sesi login tidak valid atau sudah kedaluwarsa. Silakan login kembali.',
      });
    }
  };
}

export const requireAuth = createRequireAuth();
export const requireStreamAuth = createRequireAuth({ allowQueryToken: true });

export function requireAdminOrServer(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.authUser) {
    return res.status(401).json({
      success: false,
      message: 'Autentikasi diperlukan.',
    });
  }
  if (req.authUser.role !== 'admin' && req.authUser.role !== 'server') {
    return res.status(403).json({
      success: false,
      message: 'Hak akses ditolak: Operasi ini hanya diperbolehkan untuk Admin RT atau Server.',
    });
  }
  return next();
}
