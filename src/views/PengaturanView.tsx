import React, { useState } from 'react';
import { ArrowLeft, Settings, Save, RotateCcw, Check, Sparkles, Shield } from 'lucide-react';

interface PengaturanViewProps {
  onResetEmpty: () => void;
  onLoadSample: () => void;
  onBack: () => void;
}

export const PengaturanView: React.FC<PengaturanViewProps> = ({
  onResetEmpty,
  onLoadSample,
  onBack,
}) => {
  const [iuranWarga, setIuranWarga] = useState('20000');
  const [iuranKematian, setIuranKematian] = useState('10000');
  const [ketuaRT, setKetuaRT] = useState('Suwardi');
  const [bendahara, setBendahara] = useState('Bambang S.');
  const [sekretaris, setSekretaris] = useState('Ahmad Fauzi');
  const [saved, setSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">Pengaturan Aplikasi</h1>
          <p className="text-xs text-slate-500">Konfigurasi nominal iuran dan data kepengurusan RT 08 RW 05 Desa Kotayasa</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Formulir Pengaturan */}
        <form onSubmit={handleSave} className="rounded-3xl bg-white p-6 shadow-xs border border-slate-200/80 space-y-4">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Settings size={18} className="text-[#0B5D3F]" />
            <span>Tarif Iuran Warga Bulanan</span>
          </h2>

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">
              Nominal Iuran Kas Warga (per KK / bulan)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">Rp</span>
              <input
                type="number"
                value={iuranWarga}
                onChange={(e) => setIuranWarga(e.target.value)}
                className="w-full rounded-xl border border-slate-300 py-2 pl-9 pr-3 text-xs text-slate-800 focus:border-[#0B5D3F] focus:outline-hidden"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">
              Iuran Kas Kematian / Sosial (per KK / bulan)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">Rp</span>
              <input
                type="number"
                value={iuranKematian}
                onChange={(e) => setIuranKematian(e.target.value)}
                className="w-full rounded-xl border border-slate-300 py-2 pl-9 pr-3 text-xs text-slate-800 focus:border-[#0B5D3F] focus:outline-hidden"
              />
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100">
            <h3 className="text-xs font-bold text-slate-800 mb-3">Susunan Pengurus RT 08</h3>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] text-slate-500 block mb-1">Ketua RT 08</label>
                <input
                  type="text"
                  value={ketuaRT}
                  onChange={(e) => setKetuaRT(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 py-1.5 px-3 text-xs text-slate-800 focus:border-[#0B5D3F] focus:outline-hidden"
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-500 block mb-1">Bendahara Kas</label>
                <input
                  type="text"
                  value={bendahara}
                  onChange={(e) => setBendahara(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 py-1.5 px-3 text-xs text-slate-800 focus:border-[#0B5D3F] focus:outline-hidden"
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-500 block mb-1">Sekretaris</label>
                <input
                  type="text"
                  value={sekretaris}
                  onChange={(e) => setSekretaris(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 py-1.5 px-3 text-xs text-slate-800 focus:border-[#0B5D3F] focus:outline-hidden"
                />
              </div>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between">
            {saved ? (
              <span className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                <Check size={14} /> Pengaturan berhasil disimpan
              </span>
            ) : <span />}

            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-xl bg-[#0B5D3F] px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[#084831] transition-all cursor-pointer"
            >
              <Save size={14} />
              <span>Simpan Perubahan</span>
            </button>
          </div>
        </form>

        {/* Manajemen Data Simulasi */}
        <div className="space-y-4">
          <div className="rounded-3xl bg-white p-6 shadow-xs border border-slate-200/80 space-y-4">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Shield size={18} className="text-[#0B5D3F]" />
              <span>Kontrol Status Data Kas</span>
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              Anda dapat mengosongkan semua data kas kembali ke <strong>Rp 0</strong> dan daftar kosong (sesuai instruksi), atau memuat data contoh untuk simulasi presentasi warga.
            </p>

            <div className="space-y-3 pt-2">
              <button
                onClick={onResetEmpty}
                className="w-full flex items-center justify-between rounded-2xl bg-slate-50 p-4 border border-slate-200 hover:bg-slate-100 hover:border-slate-300 transition-all cursor-pointer text-left"
              >
                <div>
                  <h4 className="text-xs font-bold text-slate-800">Kosongkan Data Kas (Default: Rp 0)</h4>
                  <p className="text-[11px] text-slate-500">Kembalikan kas ke kondisi awal kosong tanpa transaksi</p>
                </div>
                <RotateCcw size={18} className="text-slate-400" />
              </button>

              <button
                onClick={onLoadSample}
                className="w-full flex items-center justify-between rounded-2xl bg-[#E8F5EE] p-4 border border-emerald-200 hover:bg-[#d8efe2] transition-all cursor-pointer text-left"
              >
                <div>
                  <h4 className="text-xs font-bold text-[#0B5D3F]">Muat Contoh Data Terisi</h4>
                  <p className="text-[11px] text-emerald-800">Isi data simulasi kas Rp 5.780.000 dan daftar warga</p>
                </div>
                <Sparkles size={18} className="text-[#0B5D3F]" />
              </button>
            </div>
          </div>

          <div className="rounded-3xl bg-gradient-to-r from-[#0B5D3F] to-[#0A5237] p-6 text-white shadow-xs">
            <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-200">
              Desa Kotayasa, RT 08 RW 05
            </h3>
            <p className="text-xs text-emerald-100 mt-2 leading-relaxed">
              Kecamatan Sumbang, Kabupaten Banyumas, Jawa Tengah. Kode Pos: 53183.
            </p>
            <p className="text-[11px] text-emerald-300 mt-2 font-medium">
              Sistem Kas Mandiri Warga • Transparan & Akuntabel
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
