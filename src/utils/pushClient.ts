import {
  fetchVapidPublicKeyFromServer,
  subscribePushOnServer,
  unsubscribePushOnServer,
} from './cloudSync';

export function isWebPushSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    (window.isSecureContext ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1')
  );
}

export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    Boolean(nav.standalone) ||
    Boolean(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
  );
}

export function getNotificationPermissionState(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function getSwRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  const existing = await navigator.serviceWorker.getRegistration('/sw.js');
  if (existing) return existing;
  return await navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

export async function getCurrentPushSubscription(): Promise<PushSubscription | null> {
  if (!isWebPushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js');
    if (!reg) return null;
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

export async function enableWebPushNotifications(): Promise<{
  ok: boolean;
  message: string;
}> {
  if (!isWebPushSupported()) {
    return {
      ok: false,
      message:
        'Browser ini belum mendukung Web Push. Di iPhone/iOS, buka lewat Safari lalu pilih "Tambah ke Layar Utama (Add to Home Screen)".',
    };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return {
      ok: false,
      message:
        permission === 'denied'
          ? 'Izin notifikasi ditolak di pengaturan browser. Aktifkan izin notifikasi untuk situs ini.'
          : 'Permintaan izin notifikasi belum disetujui.',
    };
  }

  const publicKey = await fetchVapidPublicKeyFromServer();
  if (!publicKey) {
    return {
      ok: false,
      message: 'Kunci Web Push server belum tersedia. Coba beberapa saat lagi.',
    };
  }

  const reg = await getSwRegistration();
  if (!reg) {
    return { ok: false, message: 'Gagal mendaftarkan Service Worker notifikasi.' };
  }

  await navigator.serviceWorker.ready;
  let subscription = await reg.pushManager.getSubscription();
  if (!subscription) {
    const appServerKey = urlBase64ToUint8Array(publicKey);
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: appServerKey.buffer as ArrayBuffer,
    });
  }

  const jsonSub = subscription.toJSON();
  const saved = await subscribePushOnServer(jsonSub);
  if (!saved.ok) {
    return {
      ok: false,
      message: saved.message || 'Gagal menyimpan langganan notifikasi perangkat di server.',
    };
  }

  return {
    ok: true,
    message: 'Notifikasi perangkat berhasil diaktifkan untuk pengumuman & transaksi RT.',
  };
}

export async function disableWebPushNotifications(): Promise<{
  ok: boolean;
  message: string;
}> {
  try {
    const sub = await getCurrentPushSubscription();
    const endpoint = sub?.endpoint;
    if (sub) {
      await sub.unsubscribe().catch(() => {});
    }
    const res = await unsubscribePushOnServer(endpoint);
    if (!res.ok) {
      return {
        ok: false,
        message: res.message || 'Gagal menonaktifkan notifikasi di server.',
      };
    }
    return {
      ok: true,
      message: 'Notifikasi push perangkat telah dinonaktifkan.',
    };
  } catch (err: any) {
    return {
      ok: false,
      message: err?.message || 'Gagal menonaktifkan notifikasi perangkat.',
    };
  }
}
