// Pengestrøm mark: a flowing current (the "strøm") carrying a coin (the
// "penge") — a self-contained badge (own gradient background) so it reads
// cleanly on any surface, dark sidebar or light auth card alike.
export function Logo({ size = 40, rounded = true, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" {...props}>
      <defs>
        <linearGradient id="pengestrom-bg" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#0a0e17" />
          <stop offset="1" stopColor="#3d63e0" />
        </linearGradient>
        <linearGradient id="pengestrom-wave" x1="10" y1="72" x2="86" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#4f7df9" />
          <stop offset="1" stopColor="#f5f7fa" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx={rounded ? 22 : 0} fill="url(#pengestrom-bg)" />
      <path
        d="M13,64 C27,42 37,80 51,56 C63,36 71,60 85,34"
        fill="none"
        stroke="url(#pengestrom-wave)"
        strokeWidth="9"
        strokeLinecap="round"
      />
      <circle cx="82" cy="28" r="14" fill="#22c55e" />
      <circle cx="82" cy="28" r="14" fill="none" stroke="#0a0e17" strokeWidth="2" opacity="0.2" />
      <circle cx="82" cy="28" r="8.5" fill="none" stroke="#0a0e17" strokeWidth="1.6" opacity="0.55" />
    </svg>
  )
}

// Icon + wordmark, for the sidebar header and other wide brand placements.
export function LogoWithWordmark({ size = 32, textColor = 'var(--text)' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <Logo size={size} />
      <span style={{ fontWeight: 800, fontSize: size * 0.5, color: textColor, letterSpacing: '-0.01em' }}>
        Pengestrøm
      </span>
    </div>
  )
}

export default Logo
