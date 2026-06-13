/**
 * PodiumIllustration — 3-tier podium with a gold star + sparkle arrows.
 *
 * Pure inline SVG, no external assets. Themed to Coastal Sunrise — sky-blue
 * podium tiers, gold star, peach + mint arrow accents that mirror the
 * /queue sidebar palette.
 *
 * Width is fluid; height scales proportionally. Intended size: 180–240px wide.
 */

export interface PodiumIllustrationProps {
  className?: string
}

export function PodiumIllustration({ className }: PodiumIllustrationProps) {
  return (
    <svg
      viewBox="0 0 220 180"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Top-ranked leads"
    >
      <defs>
        <linearGradient id="pod-1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="#A5B4FC" />
          <stop offset="100%" stopColor="#6366F1" />
        </linearGradient>
        <linearGradient id="pod-2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="#7DD3FC" />
          <stop offset="100%" stopColor="#3B82F6" />
        </linearGradient>
        <linearGradient id="pod-3" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="#C4B5FD" />
          <stop offset="100%" stopColor="#7C3AED" />
        </linearGradient>
        <linearGradient id="star-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="#FDE68A" />
          <stop offset="100%" stopColor="#F59E0B" />
        </linearGradient>
        <linearGradient id="arrow-mint" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%"  stopColor="#6EE7B7" />
          <stop offset="100%" stopColor="#10B981" />
        </linearGradient>
        <linearGradient id="arrow-peach" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%"  stopColor="#FDBA74" />
          <stop offset="100%" stopColor="#FB923C" />
        </linearGradient>
        <linearGradient id="arrow-sky" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%"  stopColor="#38BDF8" />
          <stop offset="100%" stopColor="#0EA5E9" />
        </linearGradient>
        <filter id="soft-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Soft radial sheen behind everything */}
      <ellipse cx="110" cy="155" rx="95" ry="14" fill="#E0E7FF" opacity="0.55" />

      {/* 3-tier podium — bottom tier (rank 3, leftmost narrow) */}
      <rect x="20"  y="115" width="50" height="40" rx="6" fill="url(#pod-3)" />
      <rect x="20"  y="115" width="50" height="6"  rx="3" fill="#FFFFFF" opacity="0.32" />

      {/* Middle tier (rank 1, tallest, centred) */}
      <rect x="78"  y="68"  width="60" height="87" rx="7" fill="url(#pod-2)" />
      <rect x="78"  y="68"  width="60" height="7"  rx="3" fill="#FFFFFF" opacity="0.4" />

      {/* Right tier (rank 2) */}
      <rect x="146" y="92"  width="54" height="63" rx="6" fill="url(#pod-1)" />
      <rect x="146" y="92"  width="54" height="6"  rx="3" fill="#FFFFFF" opacity="0.35" />

      {/* Gold star on top of the tallest podium */}
      <g transform="translate(108, 48)" filter="url(#soft-glow)">
        <polygon
          points="0,-18 5.3,-5.6 18,-4.5 8.3,3.7 11.5,16 0,9.5 -11.5,16 -8.3,3.7 -18,-4.5 -5.3,-5.6"
          fill="url(#star-grad)"
          stroke="#F59E0B"
          strokeWidth="0.8"
        />
      </g>

      {/* Sparkle arrows curling up + right (growth motif) */}
      <path
        d="M 160 90 Q 185 60, 200 30"
        stroke="url(#arrow-mint)"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
      <polygon
        points="195,33 205,28 200,40"
        fill="url(#arrow-mint)"
      />
      <path
        d="M 90 70 Q 70 45, 55 22"
        stroke="url(#arrow-peach)"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
      />
      <polygon
        points="50,25 58,18 60,30"
        fill="url(#arrow-peach)"
      />
      <path
        d="M 125 65 Q 135 38, 130 12"
        stroke="url(#arrow-sky)"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
      />
      <polygon
        points="125,15 134,12 132,24"
        fill="url(#arrow-sky)"
      />

      {/* Tiny sparkles */}
      <circle cx="40"  cy="40" r="2"   fill="#FDE68A" />
      <circle cx="185" cy="70" r="1.5" fill="#A7F3D0" />
      <circle cx="70"  cy="95" r="1.5" fill="#C7D2FE" />
      <circle cx="170" cy="55" r="1"   fill="#FECACA" />
    </svg>
  )
}
