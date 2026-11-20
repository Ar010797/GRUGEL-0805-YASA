import React, { useEffect, useState } from 'react';
import {
  Bell,
  BellOff,
  BellRing,
  Check,
  CheckCheck,
  Megaphone,
  ShieldAlert,
  Smartphone,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import type { AppNotification } from '../types';
import {
  disableWebPushNotifications,
  enableWebPushNotifications,
  getCurrentPushSubscription,
  getNotificationPermissionState,
  isStandalonePwa,
  isWebPushSupported,
} from '../utils/pushClient';

interface NotificationCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: AppNotification[];
  unreadCount: number;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
}

export const NotificationCenterModal: React.FC<NotificationCenterModalProps> = ({
  isOpen,
  onClose,
  notifications,
  unreadCount,
  onMarkRead,
  onMarkAllRead,
}) => {
  const [filterCat, setFilterCat] = useState<'all' | 'pengumuman' | 'kas' | 'warga'>('all');
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMessage, setPushMessage] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    getCurrentPushSubscription().then((sub) => {
      if (active) setPushSubscribed(Boolean(sub));
    });
    return () => {
      active = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const filtered = notifications.filter((n) => {
    if (filterCat === 'all') return true;
    if (filterCat === 'pengumuman') return n.category === 'pengumuman';
    if (filterCat === 'kas') return n.category === 'kas' || n.category === 'iuran' || n.category === 'kematian' || n.category === 'laporan' || n.category === 'pengaturan';
    if (filterCat === 'warga') return n.category === 'warga';
    return true;
  });

  const pushSupported = isWebPushSupported();
  const permState = getNotificationPermissionState();
  const standalone = isStandalonePwa();

  const handleTogglePush = async () => {
    setPushBusy(true);
    setPushMessage(null);
    try {
      if (pushSubscribed) {
        const res = await disableWebPushNotifications();
        if (res.ok) setPushSubscribed(false);
        setPushMessage({ text: res.message, ok: res.ok });
      } else {
        const res = await enableWebPushNotifications();
        if (res.ok) setPushSubscribed(true);
        setPushMessage({ text: res.message, ok: res.ok });
      }
    } finally {
      setPushBusy(false);
    }
  };

  const getCategoryIcon = (cat: AppNotification['category']) => {
    if (cat === 'pengumuman') return <Megaphone size={16} className="text-amber-700" />;
    if (cat === 'kas' || cat === 'laporan') return <Wallet size={16} className="text-[#0B5D3F]" />;
    if (cat === 'warga') return <Users size={16} className="text-blue-700" />;
    return <ShieldAlert size={16} className="text-indigo-700" />;
  };

  const getCategoryBg = (cat: AppNotification['category']) => {
    if (cat === 'pengumuman') return 'bg-amber-100 border-amber-200';
    if (cat === 'kas' || cat === 'laporan') return 'bg-emerald-100 border-emerald-200';
    if (cat === 'warga') return 'bg-blue-100 border-blue-200';
    return 'bg-indigo-100 border-indigo-200';
  };

  const formatRelTime = (iso: string) => {
    try {
      return new Intl.DateTimeFormat('id-ID', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Jakarta',
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-xl rounded-3xl bg-white shadow-2xl border border-emerald-900/10 overflow-hidden max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-[#E8F5EE] px-6 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0B5D3F] text-white">
              <Bell size={19} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold text-[#0B5D3F]">Pusat Notifikasi RW 05</h3>
                {unreadCount > 0 && (
                  <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-black text-white">
                    {unreadCount} Baru
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600">
                Pembaruan real-time pengumuman RT/RW, transaksi kas, dan data keluarga
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white text-slate-500 transition-colors cursor-pointer"
            aria-label="Tutup"
          >
            <X size={18} />
          </button>
        </div>

        {/* Web Push Banner */}
        <div className="px-5 pt-4 pb-2 shrink-0 space-y-2">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-start gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-[#0B5D3F] border border-emerald-200">
                <Smartphone size={16} />
              </div>
              <div className="text-[11px] text-slate-700">
                <p className="font-bold text-slate-900">
                  Notifikasi Perangkat (HP &amp; Laptop)
                </p>
                <p className="text-slate-600 leading-relaxed">
                  {pushSubscribed
                    ? 'Aktif: perangkat menerima notifikasi pengumuman & transaksi RT.'
                    : !pushSupported && !standalone
                    ? 'Di iPhone/iOS, buka lewat Safari lalu pilih "Tambah ke Layar Utama" untuk mengaktifkan notifikasi push.'
                    : 'Aktifkan agar pembaruan penting RT/RW langsung muncul di perangkat.'}
                </p>
              </div>
            </div>

            {pushSupported && (
              <button
                type="button"
                disabled={pushBusy}
                onClick={handleTogglePush}
                className={`shrink-0 inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-bold transition-colors cursor-pointer disabled:opacity-60 ${
                  pushSubscribed
                    ? 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
                    : 'bg-[#0B5D3F] text-white hover:bg-[#084831]'
                }`}
              >
                {pushSubscribed ? <BellOff size={13} /> : <BellRing size={13} />}
                <span>
                  {pushBusy
                    ? 'Memproses...'
                    : pushSubscribed
                    ? 'Nonaktifkan Push'
                    : permState === 'denied'
                    ? 'Izin Diblokir'
                    : 'Aktifkan Notifikasi'}
                </span>
              </button>
            )}
          </div>

          {pushMessage && (
            <div
              className={`rounded-xl px-3 py-2 text-[11px] font-semibold border ${
                pushMessage.ok
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-amber-50 text-amber-900 border-amber-200'
              }`}
            >
              {pushMessage.text}
            </div>
          )}

          {/* Filter & Mark All Read */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {[
                { id: 'all' as const, label: 'Semua' },
                { id: 'pengumuman' as const, label: 'Pengumuman' },
                { id: 'kas' as const, label: 'Kas & Iuran' },
                { id: 'warga' as const, label: 'Data Warga' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterCat(tab.id)}
                  className={`rounded-xl px-3 py-1.5 text-[11px] font-bold transition-colors cursor-pointer ${
                    filterCat === tab.id
                      ? 'bg-[#0B5D3F] text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={onMarkAllRead}
                className="inline-flex items-center gap-1 rounded-xl bg-emerald-50 px-2.5 py-1.5 text-[11px] font-bold text-[#0B5D3F] hover:bg-emerald-100 transition-colors cursor-pointer"
              >
                <CheckCheck size={13} />
                <span>Tandai Semua Dibaca</span>
              </button>
            )}
          </div>
        </div>

        {/* Notifications List */}
        <div className="overflow-y-auto px-5 py-3 space-y-2.5 flex-1">
          {filtered.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                <Bell size={22} />
              </div>
              <p className="text-xs font-bold text-slate-700">Belum ada notifikasi</p>
              <p className="text-[11px] text-slate-400">
                Setiap pengumuman baru, perubahan data warga, dan transaksi kas akan tercatat di sini.
              </p>
            </div>
          ) : (
            filtered.map((n) => (
              <div
                key={n.id}
                onClick={() => {
                  if (!n.isRead) onMarkRead(n.id);
                }}
                className={`rounded-2xl border p-3.5 transition-all cursor-pointer ${
                  n.isRead
                    ? 'bg-white border-slate-200/80 opacity-85 hover:opacity-100'
                    : 'bg-[#F4FAF6] border-emerald-300 shadow-xs'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${getCategoryBg(
                      n.category
                    )}`}
                  >
                    {getCategoryIcon(n.category)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-xs font-extrabold text-slate-900 leading-snug">
                        {n.title}
                      </h4>
                      <span className="text-[10px] text-slate-400 whitespace-nowrap shrink-0">
                        {formatRelTime(n.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-600 leading-relaxed">{n.body}</p>
                    <div className="mt-2 flex items-center justify-between text-[10px]">
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 font-bold text-slate-600">
                        Target:{' '}
                        {n.targetRts.includes('SEMUA')
                          ? 'Semua RT RW 05'
                          : n.targetRts.map((r) => `RT ${r}`).join(', ')}
                      </span>

                      {!n.isRead ? (
                        <span className="inline-flex items-center gap-1 font-bold text-[#0B5D3F]">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#0B5D3F]" />
                          <span>Belum dibaca</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-slate-400">
                          <Check size={11} />
                          <span>Dibaca</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
