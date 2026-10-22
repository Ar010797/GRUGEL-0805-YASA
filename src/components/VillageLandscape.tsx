import React from 'react';

/**
 * Detailed Indonesian rural village scene for the Splash Screen:
 * Featuring Mount Slamet / mountain backdrop, golden sunrise/twilight,
 * lush palm trees, village gate (Gapura Desa), and verdant green rice fields.
 */
export const SplashVillageBackground: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div className={`relative w-full h-full overflow-hidden ${className}`}>
      {/* Sky Gradient with golden sunset/sunrise glow */}
      <div 
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(180deg, #3B82F6 0%, #60A5FA 18%, #FBBF24 42%, #F97316 65%, #FEF3C7 90%)'
        }}
      />

      {/* Sun glow & rays */}
      <div className="absolute top-[35%] left-1/2 -translate-x-1/2 w-72 h-72 rounded-full bg-amber-200/50 blur-3xl pointer-events-none" />

      {/* SVG Scenery elements */}
      <svg
        className="absolute inset-0 w-full h-full object-cover"
        viewBox="0 0 390 844"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="mountainFar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4338CA" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#1E3A8A" stopOpacity="0.7" />
          </linearGradient>
          <linearGradient id="mountainMid" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1E40AF" stopOpacity="0.65" />
            <stop offset="100%" stopColor="#065F46" stopOpacity="0.85" />
          </linearGradient>
          <linearGradient id="hillsGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#047857" />
            <stop offset="100%" stopColor="#064E3B" />
          </linearGradient>
          <linearGradient id="gateRoofGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#B45309" />
            <stop offset="100%" stopColor="#78350F" />
          </linearGradient>
          <linearGradient id="gatePillarGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#374151" />
            <stop offset="50%" stopColor="#4B5563" />
            <stop offset="100%" stopColor="#1F2937" />
          </linearGradient>
        </defs>

        {/* Distant Mountain Peak (Mount Slamet silhouette) */}
        <path
          d="M30 430 L160 260 L240 310 L310 240 L420 430 Z"
          fill="url(#mountainFar)"
        />
        {/* Mid Mountain Range */}
        <path
          d="-40 450 L90 340 L195 380 L290 310 L410 450 Z"
          fill="url(#mountainMid)"
        />

        {/* Rolling Green Hills & Terraced Sawah */}
        <path
          d="-20 460 Q100 420 220 450 T410 440 L410 600 L-20 600 Z"
          fill="#15803D"
          opacity="0.85"
        />
        <path
          d="-20 490 Q120 460 260 480 T410 470 L410 650 L-20 650 Z"
          fill="#16A34A"
          opacity="0.95"
        />

        {/* Lush Tree Silhouettes on Left & Right */}
        {/* Left trees */}
        <g fill="#14532D">
          <circle cx="20" cy="450" r="45" />
          <circle cx="50" cy="440" r="35" />
          <circle cx="35" cy="420" r="30" />
          <circle cx="10" cy="470" r="40" />
          {/* Tree trunks */}
          <rect x="25" y="470" width="8" height="60" fill="#292524" />
        </g>

        {/* Right trees & coconut palms */}
        <g fill="#14532D">
          <circle cx="370" cy="440" r="45" />
          <circle cx="340" cy="430" r="35" />
          <circle cx="380" cy="410" r="30" />
          <circle cx="360" cy="470" r="40" />
          <rect x="355" y="465" width="8" height="65" fill="#292524" />
        </g>

        {/* GAPURA DESA (Traditional Indonesian Village Gate) */}
        {/* Left Pillar */}
        <rect x="80" y="480" width="28" height="150" rx="3" fill="url(#gatePillarGrad)" />
        <rect x="74" y="475" width="40" height="10" rx="2" fill="#1F2937" />
        <rect x="70" y="620" width="48" height="15" rx="2" fill="#1F2937" />
        {/* Left Pillar stone relief details */}
        <rect x="84" y="500" width="20" height="30" fill="#374151" />
        <rect x="84" y="540" width="20" height="30" fill="#374151" />
        <rect x="84" y="580" width="20" height="30" fill="#374151" />

        {/* Right Pillar */}
        <rect x="282" y="480" width="28" height="150" rx="3" fill="url(#gatePillarGrad)" />
        <rect x="276" y="475" width="40" height="10" rx="2" fill="#1F2937" />
        <rect x="272" y="620" width="48" height="15" rx="2" fill="#1F2937" />
        {/* Right Pillar stone relief details */}
        <rect x="286" y="500" width="20" height="30" fill="#374151" />
        <rect x="286" y="540" width="20" height="30" fill="#374151" />
        <rect x="286" y="580" width="20" height="30" fill="#374151" />

        {/* Gapura Main Arch Roof */}
        <path
          d="M60 480 L195 435 L330 480 L315 492 L195 450 L75 492 Z"
          fill="url(#gateRoofGrad)"
        />
        {/* Upper ornamental crown */}
        <path
          d="M165 435 L195 410 L225 435 Z"
          fill="#D97706"
        />
        {/* Signboard on the gate arch */}
        <rect x="108" y="475" width="174" height="26" rx="4" fill="#0B5D3F" stroke="#FBBF24" strokeWidth="2" />
        <text
          x="195"
          y="492"
          textAnchor="middle"
          fill="#FFFFFF"
          fontSize="11"
          fontWeight="bold"
          letterSpacing="0.05em"
          fontFamily="system-ui"
        >
          DESA KOTAYASA
        </text>

        {/* Rural Village Houses behind the gate */}
        {/* House Left */}
        <polygon points="115,530 150,505 185,530" fill="#B45309" />
        <rect x="120" y="530" width="60" height="40" fill="#FEF3C7" />
        <rect x="142" y="545" width="16" height="25" fill="#78350F" />

        {/* Village Road / Pathway through the gate */}
        <path
          d="M108 630 L80 844 L310 844 L282 630 Z"
          fill="#78716C"
          opacity="0.9"
        />
        {/* Road center dashes */}
        <path
          d="M195 640 L195 844"
          stroke="#E5E7EB"
          strokeWidth="3"
          strokeDasharray="16 14"
          opacity="0.7"
        />

        {/* Green Grass Verges & Tropical Plants */}
        <path
          d="M0 630 L108 630 L80 844 L0 844 Z"
          fill="#15803D"
        />
        <path
          d="M390 630 L282 630 L310 844 L390 844 Z"
          fill="#15803D"
        />

        {/* Bush flower accents */}
        <circle cx="60" cy="670" r="14" fill="#16A34A" />
        <circle cx="45" cy="685" r="12" fill="#22C55E" />
        <circle cx="70" cy="740" r="16" fill="#15803D" />
        <circle cx="330" cy="670" r="14" fill="#16A34A" />
        <circle cx="345" cy="685" r="12" fill="#22C55E" />
        <circle cx="320" cy="740" r="16" fill="#15803D" />

        {/* Birds flying in sunset */}
        <path d="M120 280 Q125 272 130 280 Q135 272 140 280" stroke="#4B5563" strokeWidth="1.5" fill="none" />
        <path d="M145 265 Q149 259 153 265 Q157 259 161 265" stroke="#4B5563" strokeWidth="1.2" fill="none" />
        <path d="M110 300 Q114 295 118 300 Q122 295 126 300" stroke="#4B5563" strokeWidth="1.2" fill="none" />
      </svg>

      {/* Gentle overlay gradient to ensure text readability */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/10 pointer-events-none" />
    </div>
  );
};

/**
 * Village art for Greeting Card in Screen 2
 */
export const GreetingVillageIllustration: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div className={`relative overflow-hidden ${className}`}>
      <svg
        viewBox="0 0 200 90"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full object-cover"
      >
        <defs>
          <linearGradient id="cardSky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#BAE6FD" />
            <stop offset="100%" stopColor="#E0F2FE" />
          </linearGradient>
        </defs>

        {/* Sky */}
        <rect width="200" height="90" fill="url(#cardSky)" />

        {/* Sun */}
        <circle cx="160" cy="24" r="14" fill="#FDE047" opacity="0.8" />

        {/* Distant Hills */}
        <path d="M0 65 Q50 45 100 58 T200 55 L200 90 L0 90 Z" fill="#6EE7B7" opacity="0.6" />
        <path d="M30 68 Q110 50 170 64 T220 60 L220 90 L30 90 Z" fill="#34D399" opacity="0.7" />
        <path d="M-10 74 Q70 60 140 70 T210 68 L210 90 L-10 90 Z" fill="#10B981" />

        {/* Mosque dome silhouette */}
        <path d="M140 68 C140 54 148 46 152 42 C156 46 164 54 164 68 Z" fill="#047857" />
        {/* Crescent on dome */}
        <circle cx="152" cy="38" r="3" fill="#FBBF24" />
        {/* Minaret */}
        <rect x="168" y="44" width="7" height="26" fill="#065F46" />
        <polygon points="166,44 171.5,35 177,44" fill="#047857" />

        {/* Rural traditional house */}
        <polygon points="105,62 122,50 138,62" fill="#B45309" />
        <rect x="110" y="62" width="24" height="16" fill="#FDE68A" />
        <rect x="118" y="68" width="6" height="10" fill="#78350F" />

        {/* Coconut palm trees */}
        <g stroke="#78350F" strokeWidth="2.5" strokeLinecap="round">
          <path d="M92 78 Q88 62 86 48" />
        </g>
        {/* Palm fronds */}
        <g stroke="#059669" strokeWidth="2" strokeLinecap="round">
          <path d="M86 48 Q76 45 70 50" />
          <path d="M86 48 Q84 38 78 34" />
          <path d="M86 48 Q94 38 98 42" />
          <path d="M86 48 Q96 46 102 52" />
        </g>
      </svg>
    </div>
  );
};
