import fs from 'fs';
import path from 'path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, type PoolConfig } from 'pg';
import * as schema from './schema.ts';

declare global {
  var _postgresPool: Pool | undefined;
}

export interface DatabaseConfigStatus {
  configured: boolean;
  mode: 'connection_string' | 'sql_params' | 'unconfigured';
  engineLabel: string;
  errorMessage?: string;
}

let sqlUnavailableUntilMs = 0;

export function markSqlUnavailable(cooldownMs = 60_000): void {
  sqlUnavailableUntilMs = Math.max(sqlUnavailableUntilMs, Date.now() + cooldownMs);
}

export function isSqlTemporarilyUnavailable(): boolean {
  return Date.now() < sqlUnavailableUntilMs;
}

export function clearSqlUnavailable(): void {
  sqlUnavailableUntilMs = 0;
}

export function isSqlNetworkOrUnavailableError(err: unknown): boolean {
  let curr: any = err;
  for (let depth = 0; depth < 6 && curr; depth++) {
    const code = String(curr?.code || '').toUpperCase();
    const msg = String(curr?.message || '');
    if (
      code === 'ENOTFOUND' ||
      code === 'ECONNREFUSED' ||
      code === 'ETIMEDOUT' ||
      code === 'EAI_AGAIN' ||
      code === 'ENOENT' ||
      code === 'ECONNRESET' ||
      code === 'EPIPE' ||
      code === 'ENETUNREACH' ||
      code === 'EHOSTUNREACH' ||
      code === '08001' ||
      code === '08006' ||
      code === '57P01' ||
      /getaddrinfo\s+ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ECONNRESET|Connection terminated|connection timeout|timeout expired|belum dikonfigurasi|Socket Cloud SQL tidak terpasang/i.test(
        msg
      )
    ) {
      return true;
    }
    curr = curr?.cause;
  }
  return false;
}

function isPostgresConnectionString(val: string): boolean {
  return /^postgres(ql)?:\/\//i.test(val.trim());
}

function getConnectionString(): string {
  const candidates = [
    process.env.DATABASE_URL,
    process.env.POSTGRES_URL,
    process.env.POSTGRES_PRISMA_URL,
    process.env.NEON_DATABASE_URL,
    process.env.CLOUD_SQL_URL,
  ];
  for (const candidate of candidates) {
    const trimmed = String(candidate || '').trim();
    if (trimmed && isPostgresConnectionString(trimmed)) {
      return trimmed;
    }
  }
  return '';
}

function isUnixSocketAvailable(socketPath: string): boolean {
  try {
    if (!fs.existsSync(socketPath)) return false;
    const stat = fs.statSync(socketPath);
    if (stat.isDirectory()) {
      const port = process.env.SQL_PORT ? Number(process.env.SQL_PORT) : 5432;
      const pgSocket = path.join(socketPath, `.s.PGSQL.${Number.isFinite(port) ? port : 5432}`);
      return fs.existsSync(pgSocket);
    }
    return stat.isSocket();
  } catch {
    return false;
  }
}

export function getDatabaseConfigStatus(): DatabaseConfigStatus {
  const connectionString = getConnectionString();
  if (connectionString) {
    const isVercel = Boolean(process.env.VERCEL);
    return {
      configured: true,
      mode: 'connection_string',
      engineLabel: isVercel ? 'PostgreSQL (Serverless)' : 'PostgreSQL',
    };
  }

  const sqlHost = String(process.env.SQL_HOST || '').trim();
  const hasSqlParams = Boolean(sqlHost && process.env.SQL_USER && process.env.SQL_DB_NAME);
  if (hasSqlParams) {
    if (sqlHost.startsWith('/') && !isUnixSocketAvailable(sqlHost)) {
      return {
        configured: false,
        mode: 'unconfigured',
        engineLabel: 'PostgreSQL (Socket Cloud SQL tidak terpasang)',
        errorMessage:
          'Socket PostgreSQL/Cloud SQL tidak terpasang pada runtime ini.',
      };
    }
    return {
      configured: true,
      mode: 'sql_params',
      engineLabel: 'PostgreSQL (Cloud SQL)',
    };
  }

  return {
    configured: false,
    mode: 'unconfigured',
    engineLabel: 'PostgreSQL (Belum Terkonfigurasi)',
    errorMessage:
      'Database PostgreSQL belum dikonfigurasi pada runtime ini.',
  };
}

function buildPoolConfig(): PoolConfig {
  const connectionString = getConnectionString();
  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

  if (connectionString) {
    const isLocalHost =
      connectionString.includes('localhost') ||
      connectionString.includes('127.0.0.1') ||
      connectionString.includes('sslmode=disable');

    return {
      connectionString,
      ssl: isLocalHost ? false : { rejectUnauthorized: false },
      max: isServerless ? 3 : 10,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: isServerless ? 10000 : 30000,
    };
  }

  const sqlHost = String(process.env.SQL_HOST || '').trim();
  if (sqlHost && (!sqlHost.startsWith('/') || isUnixSocketAvailable(sqlHost))) {
    const port = process.env.SQL_PORT ? Number(process.env.SQL_PORT) : undefined;
    return {
      host: sqlHost,
      port: Number.isFinite(port) ? port : undefined,
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      database: process.env.SQL_DB_NAME,
      ssl: process.env.SQL_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
      max: isServerless ? 3 : 10,
      connectionTimeoutMillis: 5000,
    };
  }

  // Fallback placeholder pool config; actual queries check getDatabaseConfigStatus() first
  return {
    host: '127.0.0.1',
    port: 5432,
    max: 1,
    connectionTimeoutMillis: 2000,
  };
}

export const createPool = () => {
  if (!global._postgresPool) {
    global._postgresPool = new Pool(buildPoolConfig());

    global._postgresPool.on('error', (err) => {
      console.info('Idle SQL pool client notice:', err?.message || err);
    });
  }
  return global._postgresPool;
};

const pool = createPool();

export const db = drizzle(pool, { schema });
export { pool };
