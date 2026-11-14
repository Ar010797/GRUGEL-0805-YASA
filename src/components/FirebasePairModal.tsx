import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  X,
  Cloud,
  Smartphone,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  KeyRound,
  Loader2,
} from 'lucide-react';
import type { User as FirebaseUser } from 'firebase/auth';
import {
  obtainGoogleOAuthTokensForPairing,
  signInToFirebaseWithOAuthTokens,
} from '../firebase';

interface FirebasePairModalProps {
  isOpen: boolean;
  initialMode: 'receive' | 'authorize';
  initialCode?: string;
  onClose: () => void;
  onPairedSuccess: (user: FirebaseUser) => void;
}

export const FirebasePairModal: React.FC<FirebasePairModalProps> = ({
  isOpen,
  initialMode,
  initialCode = '',
  onClose,
  onPairedSuccess,
}) => {
  const [mode, setMode] = useState<'receive' | 'authorize'>(initialMode);

  // Mode: receive (inside Median WebView APK)
  const [pairCode, setPairCode] = useState<string>('');
  const [claimSecret, setClaimSecret] = useState<string>('');
  const [expiresAt, setExpiresAt] = useState<number>(0);
  const [secondsLeft, setSecondsLeft] = useState<number>(0);
  const [receiveLoading, setReceiveLoading] = useState<boolean>(false);
  const [receiveStatus, setReceiveStatus] = useState<'idle' | 'waiting' | 'signing_in' | 'expired' | 'error'>('idle');
  const [receiveError, setReceiveError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<'code' | 'link' | null>(null);

  // Mode: authorize (inside Chrome / Desktop browser)
  const [inputCode, setInputCode] = useState<string>(initialCode.replace(/\D/g, '').slice(0, 6));
  const [authBusy, setAuthBusy] = useState<boolean>(false);
  const [authSuccessEmail, setAuthSuccessEmail] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setMode(initialMode);
    if (initialCode) {
      setInputCode(initialCode.replace(/\D/g, '').slice(0, 6));
    }
    setAuthError(null);
    setAuthSuccessEmail(null);
    setReceiveError(null);
  }, [isOpen, initialMode, initialCode]);

  const startNewPairSession = useCallback(async () => {
    setReceiveLoading(true);
    setReceiveError(null);
    setReceiveStatus('idle');
    try {
      const resp = await fetch('/api/firebase-pair/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
      });
      const json = await resp.json();
      if (!resp.ok || !json?.success || !json?.code || !json?.claimSecret) {
        throw new Error(json?.message || 'Gagal membuat kode pairing Firebase.');
      }
      setPairCode(String(json.code));
      setClaimSecret(String(json.claimSecret));
      setExpiresAt(Number(json.expiresAt || Date.now() + 300000));
      setSecondsLeft(Number(json.ttlSeconds || 300));
      setReceiveStatus('waiting');
    } catch (err: unknown) {
      const e = err as { message?: string };
      setReceiveStatus('error');
      setReceiveError(e?.message || 'Tidak dapat menghubungi server untuk membuat kode pairing.');
    } finally {
      setReceiveLoading(false);
    }
  }, []);

  // Automatically create a pairing session when opening in receive mode
  useEffect(() => {
    if (!isOpen || mode !== 'receive') return;
    if (!pairCode || receiveStatus === 'expired' || receiveStatus === 'error') {
      startNewPairSession();
    }
  }, [isOpen, mode, pairCode, receiveStatus, startNewPairSession]);

  // Countdown timer for active pairing session
  useEffect(() => {
    if (!isOpen || mode !== 'receive' || !expiresAt || receiveStatus !== 'waiting') return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) {
        setReceiveStatus('expired');
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [isOpen, mode, expiresAt, receiveStatus]);

  // Poll /api/firebase-pair/poll every 1.5s while waiting
  useEffect(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    if (!isOpen || mode !== 'receive' || receiveStatus !== 'waiting' || !pairCode || !claimSecret) {
      return;
    }

    let cancelled = false;
    const checkPoll = async () => {
      try {
        const res = await fetch(
          `/api/firebase-pair/poll?code=${encodeURIComponent(pairCode)}&secret=${encodeURIComponent(claimSecret)}`,
          { cache: 'no-store' }
        );
        const data = await res.json();
        if (cancelled) return;

        if (!res.ok) {
          if (res.status === 403) {
            setReceiveStatus('error');
            setReceiveError(data?.message || 'Sesi pairing tidak valid.');
          }
          return;
        }

        if (data?.status === 'expired') {
          setReceiveStatus('expired');
          return;
        }

        if (data?.status === 'ready') {
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
          setReceiveStatus('signing_in');
          try {
            const user = await signInToFirebaseWithOAuthTokens(data.idToken, data.accessToken);
            if (!cancelled) {
              setPairCode('');
              setClaimSecret('');
              onPairedSuccess(user);
              onClose();
            }
          } catch (authErr: unknown) {
            const e = authErr as { message?: string };
            if (!cancelled) {
              setReceiveStatus('error');
              setReceiveError(
                e?.message || 'Token diterima, namun gagal masuk ke Firebase Auth. Buat kode baru dan coba lagi.'
              );
            }
          }
        }
      } catch {
        // transient network hiccup; next interval will retry
      }
    };

    checkPoll();
    pollingRef.current = setInterval(checkPoll, 1500);
    return () => {
      cancelled = true;
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [isOpen, mode, receiveStatus, pairCode, claimSecret, onPairedSuccess, onClose]);

  if (!isOpen) return null;

  const pairUrl =
    typeof window !== 'undefined' && pairCode
      ? `${window.location.origin}/?firebase_pair=${pairCode}`
      : '';

  const copyText = async (text: string, which: 'code' | 'link') => {
    if (!text) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        throw new Error('fallback');
      }
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {
        // ignore
      }
    }
    setCopiedKey(which);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const handleOpenExternalChrome = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const win = window as unknown as {
      median?: { openExternal?: (opts: { url: string }) => void };
      gonative?: { openExternal?: (opts: { url: string }) => void };
    };
    if (pairUrl && win.median?.openExternal) {
      e.preventDefault();
      win.median.openExternal({ url: pairUrl });
    } else if (pairUrl && win.gonative?.openExternal) {
      e.preventDefault();
      win.gonative.openExternal({ url: pairUrl });
    }
  };

  const handleAuthorizeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = inputCode.replace(/\D/g, '');
    if (cleaned.length !== 6) {
      setAuthError('Masukkan tepat 6 digit kode pairing yang muncul di aplikasi Median.');
      return;
    }

    setAuthBusy(true);
    setAuthError(null);
    setAuthSuccessEmail(null);
    try {
      const tokens = await obtainGoogleOAuthTokensForPairing();
      const resp = await fetch('/api/firebase-pair/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: cleaned,
          idToken: tokens.idToken,
          accessToken: tokens.accessToken,
          email: tokens.email,
        }),
      });
      const data = await resp.json();
      if (!resp.ok || !data?.success) {
        throw new Error(data?.message || 'Gagal mengirim login Google ke aplikasi Median.');
      }
      setAuthSuccessEmail(tokens.email || 'Akun Google Anda');
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      if (String(e?.code || '').includes('popup-closed-by-user')) {
        setAuthError('Popup login Google ditutup sebelum selesai. Silakan klik tombol sekali lagi.');
      } else {
        setAuthError(e?.message || 'Gagal melakukan login Google lewat Chrome.');
      }
    } finally {
      setAuthBusy(false);
    }
  };

  const formatSeconds = (total: number) => {
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/70 p-3 sm:p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-[#0B5D3F] to-indigo-700 px-5 py-4 text-white">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-xs">
              <Cloud size={20} />
            </div>
            <div>
              <h3 className="text-sm font-extrabold leading-tight">
                Tautkan Cloud Firebase Median APK
              </h3>
              <p className="text-[11px] text-white/80">
                Bypass blokir WebView Google sekali saja via Chrome
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white cursor-pointer"
            aria-label="Tutup modal pairing"
          >
            <X size={18} />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="grid grid-cols-2 gap-1.5 bg-slate-100 p-1.5 border-b border-slate-200">
          <button
            type="button"
            onClick={() => setMode('receive')}
            className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold transition-all cursor-pointer ${
              mode === 'receive'
                ? 'bg-white text-[#0B5D3F] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Smartphone size={14} />
            <span>Terima di Median</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('authorize')}
            className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold transition-all cursor-pointer ${
              mode === 'authorize'
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <KeyRound size={14} />
            <span>Otorisasi via Chrome</span>
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4">
          {mode === 'receive' ? (
            <>
              <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-3.5 text-[11px] text-emerald-950 leading-relaxed space-y-1">
                <p className="font-extrabold flex items-center gap-1.5">
                  <ShieldCheck size={14} className="text-[#0B5D3F] shrink-0" />
                  <span>Kenapa lewat Chrome?</span>
                </p>
                <p>
                  Google memblokir login OAuth langsung di dalam WebView Android (error 403{' '}
                  <code className="font-mono bg-white px-1 rounded">disallowed_useragent</code>). Cukup login sekali lewat Chrome dengan kode ini, sesi Firebase akan tersimpan permanen di aplikasi Median Anda.
                </p>
              </div>

              {receiveError && (
                <div className="rounded-2xl bg-rose-50 border border-rose-200 p-3 text-xs font-semibold text-rose-700 flex items-start gap-2">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span>{receiveError}</span>
                </div>
              )}

              {receiveStatus === 'signing_in' ? (
                <div className="rounded-2xl bg-indigo-50 border border-indigo-200 p-6 text-center space-y-2">
                  <Loader2 size={28} className="mx-auto text-indigo-700 animate-spin" />
                  <p className="text-xs font-extrabold text-indigo-950">
                    Sesi Google diterima! Sedang masuk ke Firebase...
                  </p>
                </div>
              ) : (
                <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 text-center space-y-3">
                  <div className="flex items-center justify-between text-[11px] text-slate-500 font-bold">
                    <span>Kode Pairing 6 Digit</span>
                    {receiveStatus === 'waiting' && (
                      <span className="rounded-full bg-amber-100 text-amber-800 px-2 py-0.5">
                        Berlaku {formatSeconds(secondsLeft)}
                      </span>
                    )}
                    {receiveStatus === 'expired' && (
                      <span className="rounded-full bg-rose-100 text-rose-700 px-2 py-0.5">
                        Kedaluwarsa
                      </span>
                    )}
                  </div>

                  {receiveLoading ? (
                    <div className="py-4 flex items-center justify-center gap-2 text-xs font-bold text-slate-500">
                      <RefreshCw size={16} className="animate-spin" />
                      <span>Membuat kode...</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-2">
                      <span className="font-mono text-3xl font-black tracking-[0.25em] text-[#0B5D3F] bg-white px-4 py-2 rounded-2xl border border-emerald-200 shadow-2xs select-all">
                        {pairCode || '------'}
                      </span>
                      <button
                        type="button"
                        onClick={() => copyText(pairCode, 'code')}
                        disabled={!pairCode}
                        className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 cursor-pointer disabled:opacity-50"
                        title="Salin Kode 6 Digit"
                      >
                        {copiedKey === 'code' ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
                      </button>
                    </div>
                  )}

                  {receiveStatus === 'waiting' && (
                    <p className="text-[11px] font-semibold text-indigo-700 flex items-center justify-center gap-1.5">
                      <Loader2 size={12} className="animate-spin" />
                      <span>Menunggu konfirmasi login Google dari Chrome...</span>
                    </p>
                  )}

                  <div className="pt-1 flex flex-col gap-2">
                    {pairUrl && (
                      <a
                        href={pairUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={handleOpenExternalChrome}
                        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 px-4 py-2.5 text-xs font-bold text-white shadow-xs transition-all"
                      >
                        <ExternalLink size={14} />
                        <span>Buka Link Login di Chrome</span>
                      </a>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => copyText(pairUrl, 'link')}
                        disabled={!pairUrl}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 px-3 py-2 text-[11px] font-bold text-slate-700 cursor-pointer disabled:opacity-50"
                      >
                        {copiedKey === 'link' ? (
                          <>
                            <Check size={13} className="text-emerald-600" />
                            <span>Link Disalin!</span>
                          </>
                        ) : (
                          <>
                            <Copy size={13} />
                            <span>Salin Link Chrome</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={startNewPairSession}
                        disabled={receiveLoading}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 px-3 py-2 text-[11px] font-bold text-[#0B5D3F] cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw size={13} className={receiveLoading ? 'animate-spin' : ''} />
                        <span>Buat Kode Baru</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <ol className="text-[11px] text-slate-600 space-y-1 list-decimal list-inside leading-relaxed">
                <li>
                  Klik <strong>Buka Link Login di Chrome</strong> (atau salin link/kode lalu buka halaman aplikasi ini di Chrome HP/Laptop).
                </li>
                <li>
                  Login dengan akun Google Admin Cloud (<strong className="font-mono">ar01071997@gmail.com</strong>) di Chrome.
                </li>
                <li>
                  Kembali ke aplikasi Median — Cloud Firestore otomatis terhubung dan menyinkronkan seluruh data secara real-time.
                </li>
              </ol>
            </>
          ) : (
            <form onSubmit={handleAuthorizeSubmit} className="space-y-4">
              <div className="rounded-2xl bg-indigo-50 border border-indigo-200 p-3.5 text-[11px] text-indigo-950 leading-relaxed">
                Gunakan halaman ini di <strong>Google Chrome / Browser Desktop</strong> untuk mengirimkan sesi login Google Admin Anda ke Aplikasi Median Android menggunakan kode 6 digit.
              </div>

              {authError && (
                <div className="rounded-2xl bg-rose-50 border border-rose-200 p-3 text-xs font-semibold text-rose-700 flex items-start gap-2">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span>{authError}</span>
                </div>
              )}

              {authSuccessEmail ? (
                <div className="rounded-2xl bg-emerald-50 border border-emerald-300 p-5 text-center space-y-2">
                  <CheckCircle2 size={32} className="mx-auto text-emerald-600" />
                  <h4 className="text-sm font-extrabold text-emerald-950">
                    Berhasil Terhubung!
                  </h4>
                  <p className="text-xs text-emerald-800 leading-relaxed">
                    Login Google (<strong>{authSuccessEmail}</strong>) telah dikirim ke Aplikasi Median Anda. Silakan kembali ke Aplikasi Median sekarang.
                  </p>
                  <button
                    type="button"
                    onClick={onClose}
                    className="mt-2 inline-flex items-center justify-center rounded-xl bg-[#0B5D3F] px-5 py-2 text-xs font-bold text-white cursor-pointer"
                  >
                    Selesai &amp; Tutup
                  </button>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Masukkan Kode Pairing 6 Digit dari Aplikasi Median
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      required
                      value={inputCode}
                      onChange={(e) => setInputCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="Contoh: 482910"
                      className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-center font-mono text-2xl font-black tracking-[0.3em] text-slate-900 focus:border-indigo-600 outline-hidden"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={authBusy || inputCode.replace(/\D/g, '').length !== 6}
                    className="w-full flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 hover:bg-indigo-700 py-3 text-xs font-extrabold text-white shadow-sm transition-all cursor-pointer disabled:opacity-60"
                  >
                    {authBusy ? (
                      <>
                        <Loader2 size={15} className="animate-spin" />
                        <span>Menghubungkan Google...</span>
                      </>
                    ) : (
                      <>
                        <Cloud size={15} />
                        <span>Login Google &amp; Kirim ke Aplikasi Median</span>
                      </>
                    )}
                  </button>
                </>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
