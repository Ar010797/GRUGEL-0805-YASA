import React from 'react';

interface HouseLogoProps {
  className?: string;
  size?: number;
  variant?: 'green' | 'white' | 'gold';
}

export const HouseLogo: React.FC<HouseLogoProps> = ({
  className = '',
  size = 64,
  variant = 'green',
}) => {
  const roofColor = variant === 'white' ? '#FFFFFF' : '#0B5D3F';
  const accentColor = variant === 'white' ? '#E8F5EE' : '#34D399';
  const windowColor = variant === 'white' ? '#FFFFFF' : '#F59E0B';
  const leafColor = variant === 'white' ? '#A7F3D0' : '#10B981';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Outer Roof Arc / Swoop */}
      <path
        d="M60 12 L10 50 C24 45 42 42 60 42 C78 42 96 45 110 50 Z"
        fill={roofColor}
      />
      {/* Upper Main Roof Gable */}
      <path
        d="M60 20 L24 48 C36 45 48 43 60 43 C72 43 84 45 96 48 Z"
        fill={accentColor}
      />
      
      {/* House Body / Base */}
      <path
        d="M32 50 L32 78 L88 78 L88 50 Z"
        fill={roofColor}
      />
      
      {/* Chimney / Ventilation */}
      <rect x="76" y="28" width="8" height="14" rx="2" fill={roofColor} />

      {/* Two Glowing Window Panes */}
      <rect x="42" y="56" width="14" height="14" rx="3" fill={windowColor} />
      <rect x="64" y="56" width="14" height="14" rx="3" fill={windowColor} />

      {/* Decorative Leaf Curves at the bottom */}
      <path
        d="M15 78 C25 68 50 68 60 76 C50 82 25 84 15 78 Z"
        fill={leafColor}
        opacity="0.9"
      />
      <path
        d="M105 78 C95 68 70 68 60 76 C70 82 95 84 105 78 Z"
        fill={leafColor}
        opacity="0.9"
      />
      
      {/* Bottom organic swoosh ground line */}
      <path
        d="M10 88 C38 80 82 80 110 88 C82 84 38 84 10 88 Z"
        fill={roofColor}
      />
    </svg>
  );
};

export const LeafIcon: React.FC<{ size?: number; className?: string }> = ({
  size = 20,
  className = '',
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
  >
    <path d="M17 8C8 10 5.9 16.17 3.82 21.34l1.89.66l.95-2.3c.48.17.98.3 1.34.3C19 20 22 3 22 3c-1 2-8 2.25-13 3.25S2 11.5 2 13.5s1.75 3.75 1.75 3.75C7 8 17 8 17 8z" />
  </svg>
);
