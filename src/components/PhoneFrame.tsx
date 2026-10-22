import React from 'react';
import { Wifi } from 'lucide-react';

interface PhoneFrameProps {
  children: React.ReactNode;
  screenNumber?: number;
  screenTitle?: string;
  isDarkStatusBar?: boolean;
  onClick?: () => void;
  className?: string;
  isFocused?: boolean;
  scale?: number;
}

export const PhoneFrame: React.FC<PhoneFrameProps> = ({
  children,
  screenNumber,
  screenTitle,
  isDarkStatusBar = false,
  onClick,
  className = '',
  isFocused = false,
  scale = 1,
}) => {
  return (
    <div className={`flex flex-col items-center ${className}`}>
      {/* Optional Screen label for Presentation */}
      {(screenNumber || screenTitle) && (
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-950/70">
          {screenNumber && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0B5D3F] text-[10px] font-bold text-white shadow-sm">
              {screenNumber}
            </span>
          )}
          <span>{screenTitle}</span>
        </div>
      )}

      {/* Smartphone Chassis */}
      <div
        onClick={onClick}
        style={{
          transform: scale !== 1 ? `scale(${scale})` : undefined,
          transformOrigin: 'top center',
        }}
        className={`group relative h-[780px] w-[360px] cursor-pointer select-none rounded-[44px] bg-[#1a1f1d] p-[10px] shadow-2xl transition-all duration-300 ${
          isFocused
            ? 'ring-4 ring-[#0B5D3F] ring-offset-4 ring-offset-white'
            : 'hover:shadow-[0_30px_70px_-15px_rgba(11,93,63,0.35)]'
        }`}
      >
        {/* Outer Phone Bezel Metal Edge Reflection */}
        <div className="absolute inset-0 rounded-[44px] border-[2px] border-emerald-900/30 pointer-events-none" />

        {/* Volume & Power Button Nubs */}
        <div className="absolute -left-[12px] top-[120px] h-[32px] w-[3px] rounded-l-md bg-stone-600" />
        <div className="absolute -left-[12px] top-[165px] h-[48px] w-[3px] rounded-l-md bg-stone-600" />
        <div className="absolute -left-[12px] top-[225px] h-[48px] w-[3px] rounded-l-md bg-stone-600" />
        <div className="absolute -right-[12px] top-[160px] h-[64px] w-[3px] rounded-r-md bg-stone-600" />

        {/* Phone Screen Display Area */}
        <div className="relative flex h-full w-full flex-col overflow-hidden rounded-[36px] bg-white text-slate-800 shadow-inner">
          
          {/* Status Bar */}
          <div
            className={`relative z-30 flex h-[44px] w-full shrink-0 items-center justify-between px-6 pt-1 text-[13px] font-semibold tracking-tight transition-colors ${
              isDarkStatusBar ? 'text-white' : 'text-slate-900'
            }`}
          >
            {/* Time */}
            <span className="font-semibold text-[13px] tracking-tight">9:41</span>

            {/* Dynamic Island / Camera Notch */}
            <div className="absolute left-1/2 top-2 h-4 w-24 -translate-x-1/2 rounded-full bg-black">
              {/* Camera lens highlight */}
              <div className="absolute right-3 top-1 h-2 w-2 rounded-full bg-slate-900 ring-1 ring-slate-800" />
            </div>

            {/* System Icons: Signal, Wifi, Battery */}
            <div className="flex items-center gap-1.5">
              {/* Cellular Signal Bars */}
              <div className="flex items-end gap-[1.5px] h-3">
                <div className={`w-[2.5px] h-[4px] rounded-xs ${isDarkStatusBar ? 'bg-white' : 'bg-slate-900'}`} />
                <div className={`w-[2.5px] h-[6px] rounded-xs ${isDarkStatusBar ? 'bg-white' : 'bg-slate-900'}`} />
                <div className={`w-[2.5px] h-[8px] rounded-xs ${isDarkStatusBar ? 'bg-white' : 'bg-slate-900'}`} />
                <div className={`w-[2.5px] h-[10px] rounded-xs ${isDarkStatusBar ? 'bg-white' : 'bg-slate-900'}`} />
              </div>

              {/* Wifi */}
              <Wifi size={13} strokeWidth={2.5} />

              {/* Battery Indicator */}
              <div className="flex items-center">
                <div className={`flex h-[11px] w-[20px] items-center rounded-[3px] border p-[1px] ${
                  isDarkStatusBar ? 'border-white' : 'border-slate-800'
                }`}>
                  <div className={`h-full w-full rounded-[1.5px] ${isDarkStatusBar ? 'bg-white' : 'bg-slate-900'}`} />
                </div>
                <div className={`h-[4px] w-[1px] rounded-r-[1px] ${isDarkStatusBar ? 'bg-white' : 'bg-slate-800'}`} />
              </div>
            </div>
          </div>

          {/* Screen Body Content */}
          <div className="relative flex-1 overflow-y-auto overflow-x-hidden no-scrollbar flex flex-col">
            {children}
          </div>

          {/* Home Indicator Bar */}
          <div className="relative z-30 flex h-[20px] w-full shrink-0 items-center justify-center pb-1">
            <div className={`h-[4px] w-32 rounded-full transition-colors ${
              isDarkStatusBar ? 'bg-white/40' : 'bg-black/25'
            }`} />
          </div>
        </div>
      </div>
    </div>
  );
};
