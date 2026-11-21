export function isWebPushSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return (
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

const PUSH_LOCAL_PREF_KEY = 'kaswarga_browser_notif_enabled_v1';

export async function getCurrentPushSubscription(): Promise<{ endpoint: string } | null> {
  if (!isWebPushSupported()) return null;
  try {
    if (Notification.permission !== 'granted') return null;
    const enabled = localStorage.getItem(PUSH_LOCAL_PREF_KEY) !== 'false';
    return enabled ? { endpoint: 'mqtt-browser-notification' } : null;
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
        'Browser ini belum mendukung notifikasi perangkat. Di iPhone/iOS, buka lewat Safari lalu pilih "Tambah ke Layar Utama (Add to Home Screen)".',
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

  try {
    localStorage.setItem(PUSH_LOCAL_PREF_KEY, 'true');
  } catch {
    // ignore storage errors
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
    localStorage.setItem(PUSH_LOCAL_PREF_KEY, 'false');
    return {
      ok: true,
      message: 'Notifikasi perangkat telah dinonaktifkan.',
    };
  } catch (err: any) {
    return {
      ok: false,
      message: err?.message || 'Gagal menonaktifkan notifikasi perangkat.',
    };
  }
}

export function showBrowserLocalNotification(title: string, body: string) {
  if (!isWebPushSupported()) return;
  if (Notification.permission !== 'granted') return;
  try {
    if (localStorage.getItem(PUSH_LOCAL_PREF_KEY) === 'false') return;
    new Notification(title, { body });
  } catch {
    // ignore notification API errors in restricted contexts
  }
}
