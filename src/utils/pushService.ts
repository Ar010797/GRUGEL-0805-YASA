import { generateVAPIDKeys, sendNotification, setVapidDetails } from 'web-push';
import { eq } from 'drizzle-orm';
import { pool } from '../db/index.ts';
import { appSettings } from '../db/schema.ts';

interface StoredVapidKeys {
  publicKey: string;
  privateKey: string;
  subject: string;
}

let cachedVapidKeys: StoredVapidKeys | null = null;
let vapidInitPromise: Promise<StoredVapidKeys> | null = null;

export function scrubPiiFromNotificationText(input: string): string {
  if (!input) return '';
  // Mask 16-digit Indonesian NIK / No KK numbers so sensitive PII never enters push payloads or notification bodies
  return input
    .replace(/\b\d{16}\b/g, '[Nomor Terlindungi]')
    .replace(/(?:NIK|No\.?\s*KK|Nomor\s*KK)\s*[:=]?\s*\d[\d\s-]{6,}/gi, 'Identitas Terlindungi')
    .trim();
}

export async function ensureVapidKeys(): Promise<StoredVapidKeys> {
  if (cachedVapidKeys) return cachedVapidKeys;
  if (vapidInitPromise) return vapidInitPromise;

  vapidInitPromise = (async () => {
    const envPub = process.env.VAPID_PUBLIC_KEY?.trim();
    const envPriv = process.env.VAPID_PRIVATE_KEY?.trim();
    const subject = process.env.VAPID_SUBJECT?.trim() || 'mailto:admin.rw05@kotayasa.desa.id';

    if (envPub && envPriv) {
      setVapidDetails(subject, envPub, envPriv);
      cachedVapidKeys = { publicKey: envPub, privateKey: envPriv, subject };
      return cachedVapidKeys;
    }

    try {
      const existing = await pool.query(
        `SELECT keterangan_saldo_awal, kontak_ketua_rt FROM app_settings WHERE id = 'vapid_keys' LIMIT 1`
      );
      if (existing.rows.length > 0 && existing.rows[0]?.kontak_ketua_rt) {
        const stored = existing.rows[0].kontak_ketua_rt as { nama?: string; telp?: string };
        if (stored.nama && stored.telp) {
          setVapidDetails(subject, stored.nama, stored.telp);
          cachedVapidKeys = { publicKey: stored.nama, privateKey: stored.telp, subject };
          return cachedVapidKeys;
        }
      }
    } catch {
      // Table might not exist yet before schema check; continue to generate
    }

    const generated = generateVAPIDKeys();
    const now = new Date().toISOString();
    try {
      await pool.query(
        `INSERT INTO app_settings (
          id, tahun_aktif, nominal_jimpitan_tahunan, nominal_jimpitan_bulanan,
          nominal_kematian_tahunan, nominal_kematian_bulanan,
          saldo_awal_kas_umum, saldo_awal_kas_kematian,
          keterangan_saldo_awal, tanggal_saldo_awal,
          kontak_ketua_rt, kontak_bendahara, updated_at, version
        ) VALUES (
          'vapid_keys', 2026, 0, 0, 0, 0, 0, 0,
          'VAPID Web Push Keys', $1,
          $2::jsonb, $3::jsonb, $1, 1
        ) ON CONFLICT (id) DO NOTHING`,
        [
          now,
          JSON.stringify({ nama: generated.publicKey, telp: generated.privateKey }),
          JSON.stringify({ nama: subject, telp: '' }),
        ]
      );
    } catch {
      // Non-fatal: still works in memory for current runtime
    }

    setVapidDetails(subject, generated.publicKey, generated.privateKey);
    cachedVapidKeys = {
      publicKey: generated.publicKey,
      privateKey: generated.privateKey,
      subject,
    };
    return cachedVapidKeys;
  })();

  try {
    return await vapidInitPromise;
  } finally {
    vapidInitPromise = null;
  }
}

export async function getVapidPublicKey(): Promise<string> {
  const keys = await ensureVapidKeys();
  return keys.publicKey;
}

export interface PushSubscriptionRecord {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export async function sendPushToSubscriptions(
  subscriptions: PushSubscriptionRecord[],
  payload: {
    title: string;
    body: string;
    category: string;
    url?: string;
    tag?: string;
  },
  onDeleteExpired?: (endpoint: string) => Promise<void>
): Promise<{ sent: number; failed: number }> {
  if (!subscriptions || subscriptions.length === 0) {
    return { sent: 0, failed: 0 };
  }

  await ensureVapidKeys();

  const safePayload = JSON.stringify({
    title: scrubPiiFromNotificationText(payload.title).slice(0, 120),
    body: scrubPiiFromNotificationText(payload.body).slice(0, 240),
    category: payload.category,
    url: payload.url || '/',
    tag: payload.tag || `rw05-${payload.category}-${Date.now()}`,
  });

  let sent = 0;
  let failed = 0;

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          safePayload,
          { TTL: 3600 }
        );
        sent += 1;
      } catch (err: any) {
        failed += 1;
        const statusCode = err?.statusCode;
        if ((statusCode === 404 || statusCode === 410) && onDeleteExpired) {
          await onDeleteExpired(sub.endpoint).catch(() => {});
        }
      }
    })
  );

  return { sent, failed };
}

export const _unusedRef = eq;
export const _unusedAppSettings = appSettings;
