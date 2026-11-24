import React from 'react';

interface TblLogoProps {
  variant?: 'light' | 'dark';
  size?: 'sm' | 'md' | 'lg';
}

export const TblLogo: React.FC<TblLogoProps> = ({
  variant = 'dark',
  size = 'md',
}) => {
  const dimensions = {
    sm: 'h-8',
    md: 'h-12',
    lg: 'h-20',
  }[size];

  const textColor = variant === 'light' ? '#FFFFFF' : '#0F172A';
  const subColor = variant === 'light' ? '#E0F2FE' : '#1E293B';

  return (
    <div className="inline-flex items-center gap-3 select-none shrink-0">
      <svg
        viewBox="0 0 210 78"
        className={`${dimensions} w-auto`}
        role="img"
        aria-label="TBL Transportes Bertolini Ltda."
      >
        <defs>
          <linearGradient id="tblBlueGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#0284C7" />
            <stop offset="100%" stopColor="#38BDF8" />
          </linearGradient>
          <linearGradient id="tblOvalGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#FEF9C3" />
            <stop offset="100%" stopColor="#FDE047" />
          </linearGradient>
        </defs>
        {/* Stylized bold italic TBL letters matching the Bertolini mark */}
        <g transform="skewX(-14) translate(12, 4)">
          {/* T */}
          <path d="M4 8 H46 L43 18 H29 L21 44 H9 L17 18 H1 Z" fill="url(#tblBlueGrad)" />
          {/* B */}
          <path
            d="M49 8 H79 C88 8 92 13 90 19 C89 23 85 26 80 27 C86 28 89 32 87 37 C85 42 79 44 70 44 H39 Z M59 17 L56 23 H71 C74 23 77 22 77 19.5 C78 17.5 76 17 72 17 Z M54 31 L52 36 H68 C72 36 74 35 75 33 C75.5 31 73 31 69 31 Z"
            fill="url(#tblBlueGrad)"
          />
          {/* L */}
          <path d="M97 8 H110 L102 34 H123 L120 44 H87 Z" fill="url(#tblBlueGrad)" />
        </g>

        {/* Aquatic wave swoosh & oval emblem */}
        <ellipse
          cx="154"
          cy="35"
          rx="32"
          ry="13"
          fill="none"
          stroke="#7DD3FC"
          strokeWidth="2.5"
        />
        <ellipse
          cx="154"
          cy="35"
          rx="23"
          ry="9"
          fill="url(#tblOvalGrad)"
          stroke="#0EA5E9"
          strokeWidth="2"
        />
        <path
          d="M108 42 C132 54, 178 52, 198 37"
          fill="none"
          stroke="#38BDF8"
          strokeWidth="2.5"
          strokeLinecap="round"
        />

        {/* Company name */}
        <text
          x="10"
          y="58"
          fill={subColor}
          fontSize="11.5"
          fontWeight="700"
          fontStyle="italic"
          fontFamily="Plus Jakarta Sans, sans-serif"
          letterSpacing="0.5"
        >
          TRANSPORTES
        </text>
        <text
          x="10"
          y="73"
          fill={textColor}
          fontSize="15"
          fontWeight="800"
          fontStyle="italic"
          fontFamily="Plus Jakarta Sans, sans-serif"
          letterSpacing="0.4"
        >
          BERTOLINI
        </text>
        <text
          x="108"
          y="73"
          fill={subColor}
          fontSize="9.5"
          fontWeight="700"
          fontStyle="italic"
          fontFamily="Plus Jakarta Sans, sans-serif"
        >
          LTDA.
        </text>
      </svg>
    </div>
  );
};
