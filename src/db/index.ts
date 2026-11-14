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

function getConnectionString(): string {
  return String(
    process.env.DATABASE_URL ||
      process.env.POSTGRES_URL ||
      process.env.POSTGRES_PRISMA_URL ||
      process.env.NEON_DATABASE_URL ||
      process.env.CLOUD_SQL_URL ||
      ''
  ).trim();
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

  const hasSqlParams = Boolean(
    process.env.SQL_HOST && process.env.SQL_USER && process.env.SQL_DB_NAME
  );
  if (hasSqlParams) {
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
      'Database PostgreSQL belum dikonfigurasi di server ini (variabel environment DATABASE_URL / POSTGRES_URL atau SQL_HOST belum diisi). Jika Anda menggunakan Vercel, hubungkan database PostgreSQL (Neon/Supabase/Vercel Postgres) di Settings > Environment Variables lalu redeploy.',
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
      connectionTimeoutMillis: 15000,
      idleTimeoutMillis: isServerless ? 10000 : 30000,
    };
  }

  if (process.env.SQL_HOST) {
    const port = process.env.SQL_PORT ? Number(process.env.SQL_PORT) : undefined;
    return {
      host: process.env.SQL_HOST,
      port: Number.isFinite(port) ? port : undefined,
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      database: process.env.SQL_DB_NAME,
      ssl: process.env.SQL_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
      max: isServerless ? 3 : 10,
      connectionTimeoutMillis: 15000,
    };
  }

  // Fallback placeholder pool config; actual queries check getDatabaseConfigStatus() first
  return {
    host: '127.0.0.1',
    port: 5432,
    max: 1,
    connectionTimeoutMillis: 3000,
  };
}

export const createPool = () => {
  if (!global._postgresPool) {
    global._postgresPool = new Pool(buildPoolConfig());

    global._postgresPool.on('error', (err) => {
      console.error('Unexpected error on idle SQL pool client:', err);
    });
  }
  return global._postgresPool;
};

const pool = createPool();

export const db = drizzle(pool, { schema });
export { pool };
