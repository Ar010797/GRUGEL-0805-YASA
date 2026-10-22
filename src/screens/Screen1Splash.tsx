import React from 'react';
import { ArrowRight } from 'lucide-react';
import { HouseLogo } from '../components/HouseLogo';
import { SplashVillageBackground } from '../components/VillageLandscape';

interface Screen1SplashProps {
  onEnter?: () => void;
}

export const Screen1Splash: React.FC<Screen1SplashProps> = ({ onEnter }) => {
  return (
    <div className="relative flex h-full w-full flex-col justify-between overflow-hidden bg-[#0A3E2B] text-white">
      {/* Background Village Landscape Graphic */}
      <SplashVillageBackground className="absolute inset-0 z-0" />

      {/* Top Branding Section */}
      <div className="relative z-10 flex flex-col items-center px-6 pt-10 text-center">
        {/* House Logo with soft drop shadow */}
        <div className="mb-4 flex h-24 w-28 items-center justify-center rounded-2xl bg-white/90 p-2 shadow-lg backdrop-blur-md">
          <HouseLogo size={88} variant="green" />
        </div>

        {/* Big Bold Typography */}
        <h1 className="text-3xl font-extrabold tracking-tight text-[#0B5D3F] drop-shadow-sm">
          RT 08 RW 05
        </h1>
        <h2 className="mt-0.5 text-2xl font-bold tracking-tight text-[#0B5D3F]">
          Desa Kotayasa
        </h2>

        {/* Tagline */}
        <p className="mt-3 max-w-[240px] text-xs font-semibold text-[#0B5D3F]/90 leading-relaxed">
          Bersama Membangun Lingkungan yang Lebih Baik
        </p>
      </div>

      {/* Village Gate & Scenery is visible in mid-to-bottom area */}
      <div className="relative z-10 flex flex-col items-center px-6 pb-6 pt-24">
        {/* Big Green Action Button */}
        <button
          onClick={onEnter}
          className="group relative flex w-full max-w-[280px] items-center justify-center gap-3 rounded-full bg-[#0B5D3F] px-8 py-3.5 text-base font-bold text-white shadow-xl transition-all duration-300 hover:bg-[#084831] hover:shadow-2xl active:scale-95 border border-emerald-400/30 cursor-pointer"
        >
          <span>Masuk</span>
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 transition-transform group-hover:translate-x-1">
            <ArrowRight size={18} className="text-white" strokeWidth={2.5} />
          </div>
        </button>
      </div>
    </div>
  );
};
