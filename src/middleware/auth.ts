import type { Request, Response, NextFunction } from 'express';
import { isSqlNetworkOrUnavailableError } from '../db/index.ts';
import { isSqlUnavailable, verifySessionTokenSql } from '../db/repository.ts';
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
        code: 'REAUTH_FIREBASE',
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
        code: 'REAUTH_FIREBASE',
        message:
          'Sesi login lama tidak valid atau telah berakhir. Aplikasi kini menggunakan Firebase Authentication — silakan login ulang.',
      });
    } catch (err: any) {
      if (isSqlUnavailable(err) || isSqlNetworkOrUnavailableError(err)) {
        console.info('Legacy SQL auth session verification skipped (Firebase mode active).');
        return res.status(401).json({
          success: false,
          code: 'REAUTH_FIREBASE',
          message:
            'Sesi lama tidak dapat diverifikasi karena autentikasi telah beralih ke Firebase Authentication. Silakan muat ulang aplikasi.',
        });
      }
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
