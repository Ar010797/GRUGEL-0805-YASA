import type { Request, Response, NextFunction } from 'express';
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
      return res.status(401).json({
        success: false,
        message: 'Sesi login tidak valid atau sudah kedaluwarsa. Silakan login kembali.',
      });
    } catch (err: any) {
      console.error('SQL auth session verification error:', err);
      return res.status(503).json({
        success: false,
        message:
          err?.message ||
          'Gagal memverifikasi sesi ke database server. Periksa koneksi database server.',
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
