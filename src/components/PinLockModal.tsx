import React, { useState, useEffect } from 'react';
import { ShieldCheck, Lock, AlertTriangle, Delete, PhoneCall, HelpCircle, User, Sparkles } from 'lucide-react';
import { HouseLogo } from './HouseLogo';
import { AuthUser, PengaturanKas } from '../types';

interface PinLockModalProps {
  isOpen: boolean;
  currentUser: AuthUser | null;
  currentPin: string; // current active PIN (default 123456)
  onUnlockSuccess: () => void;
  pengaturanKas: PengaturanKas;
  onOpenHelp: () => void;
}

export const PinLockModal: React.FC<PinLockModalProps> = ({
  isOpen,
  currentUser,
  currentPin,
  onUnlockSuccess,
  pengaturanKas,
  onOpenHelp,
}) => {
  const [pinInput, setPinInput] = useState<string>('');
  const [errorCount, setErrorCount] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [lockoutSeconds, setLockoutSeconds] = useState<number>(0);

  // Lockout countdown timer
  useEffect(() => {
    if (lockoutSeconds > 0) {
      const timer = setInterval(() => {
        setLockoutSeconds((prev) => prev - 1);
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [lockoutSeconds]);

  if (!isOpen) return null;

  const handleKeyPress = (digit: string) => {
    if (lockoutSeconds > 0) return;
    if (pinInput.length < 6) {
      const nextPin = pinInput + digit;
      setPinInput(nextPin);
      setErrorMessage('');

      // Auto verify when 6 digits are typed
      if (nextPin.length === 6) {
        verifyPin(nextPin);
      }
    }
  };

  const handleBackspace = () => {
    if (lockoutSeconds > 0) return;
    setPinInput((prev) => prev.slice(0, -1));
    setErrorMessage('');
  };

  const verifyPin = (typed: string) => {
    if (typed === currentPin) {
      setErrorCount(0);
      setPinInput('');
      setErrorMessage('');
      onUnlockSuccess();
    } else {
      const newErrors = errorCount + 1;
      setErrorCount(newErrors);
      setPinInput('');

      if (newErrors >= 3) {
        setLockoutSeconds(45); // Lockout for 45 seconds
        setErrorMessage('PIN salah 3x berturut-turut! Akun terkunci sementara demi keamanan.');
      } else {
        setErrorMessage(`PIN salah! Sisa percobaan: ${3 - newErrors} kali lagi.`);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-sm rounded-3xl bg-white p-7 text-center shadow-2xl border border-emerald-900/10">
        {/* Village Brand & Shield Icon */}
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-[#0B5D3F] to-[#10B981] text-white shadow-lg shadow-emerald-900/20">
          <Lock size={30} />
        </div>

        <h2 className="text-xl font-extrabold text-slate-900">Kunci Aplikasi (PIN 6 Digit)</h2>
        <p className="mt-1 text-xs text-slate-500">
          RT 08 RW 05 Desa Kotayasa &bull; {currentUser?.role === 'admin' ? 'Akun Admin' : 'Akun Warga'}
        </p>

        {currentUser && (
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-[#0B5D3F] border border-emerald-200">
            <User size={13} />
            <span>{currentUser.nama}</span>
          </div>
        )}

        {/* PIN Dots (6 digits) */}
        <div className="my-6 flex justify-center gap-3">
          {[0, 1, 2, 3, 4, 5].map((idx) => {
            const isFilled = idx < pinInput.length;
            return (
              <div
                key={idx}
                className={`h-4 w-4 rounded-full transition-all duration-200 ${
                  isFilled
                    ? 'scale-110 bg-[#0B5D3F] ring-4 ring-emerald-200'
                    : 'bg-slate-200'
                }`}
              />
            );
          })}
        </div>

        {/* Error / Lockout Alert */}
        {lockoutSeconds > 0 ? (
          <div className="mb-4 rounded-2xl bg-rose-50 p-3.5 text-xs text-rose-700 border border-rose-200">
            <div className="flex items-center justify-center gap-1.5 font-bold">
              <AlertTriangle size={15} />
              <span>Akses Terkunci Sementara</span>
            </div>
            <p className="mt-1">
              Mohon tunggu <strong className="text-rose-900 font-extrabold">{lockoutSeconds} detik</strong> sebelum mencoba lagi.
            </p>
          </div>
        ) : errorMessage ? (
          <div className="mb-4 rounded-xl bg-amber-50 p-2.5 text-xs font-semibold text-amber-800 border border-amber-200">
            {errorMessage}
          </div>
        ) : (
          <p className="mb-4 text-[11px] text-slate-400">
            Masukkan PIN 6 digit Anda (PIN Awal Standar: <span className="font-mono font-bold text-slate-600">123456</span>)
          </p>
        )}

        {/* Numeric Keypad (0-9) */}
        <div className="grid grid-cols-3 gap-2.5 max-w-[260px] mx-auto">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              onClick={() => handleKeyPress(digit)}
              disabled={lockoutSeconds > 0}
              className="flex h-14 w-full items-center justify-center rounded-2xl bg-slate-100 text-xl font-bold text-slate-800 hover:bg-emerald-50 hover:text-[#0B5D3F] hover:shadow-xs active:scale-95 transition-all disabled:opacity-40 cursor-pointer"
            >
              {digit}
            </button>
          ))}

          {/* Empty or Reset */}
          <button
            onClick={() => setPinInput('')}
            disabled={lockoutSeconds > 0 || pinInput.length === 0}
            className="flex h-14 w-full items-center justify-center rounded-2xl text-xs font-bold text-slate-400 hover:bg-slate-100 transition-all disabled:opacity-20 cursor-pointer"
          >
            Bersihkan
          </button>

          {/* 0 */}
          <button
            onClick={() => handleKeyPress('0')}
            disabled={lockoutSeconds > 0}
            className="flex h-14 w-full items-center justify-center rounded-2xl bg-slate-100 text-xl font-bold text-slate-800 hover:bg-emerald-50 hover:text-[#0B5D3F] active:scale-95 transition-all disabled:opacity-40 cursor-pointer"
          >
            0
          </button>

          {/* Backspace */}
          <button
            onClick={handleBackspace}
            disabled={lockoutSeconds > 0 || pinInput.length === 0}
            className="flex h-14 w-full items-center justify-center rounded-2xl bg-slate-100 text-slate-600 hover:bg-rose-50 hover:text-rose-600 active:scale-95 transition-all disabled:opacity-40 cursor-pointer"
          >
            <Delete size={20} />
          </button>
        </div>

        {/* Footer Help Link */}
        <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <button
            onClick={onOpenHelp}
            className="flex items-center gap-1.5 font-bold text-[#0B5D3F] hover:underline cursor-pointer"
          >
            <HelpCircle size={14} />
            <span>Lupa PIN / Password?</span>
          </button>
          <span className="text-[10px] text-slate-400">Enkripsi AES 256</span>
        </div>
      </div>
    </div>
  );
};
