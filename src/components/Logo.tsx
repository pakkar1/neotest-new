export function NeoTestLogo({
  className = 'h-9 w-9',
  inverted = false,
}: {
  className?: string;
  inverted?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      role="img"
      aria-label="Logo NeoTest"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="neotest-grad" x1="8" y1="4" x2="42" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3b96f6" />
          <stop offset="1" stopColor="#1c61d8" />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="42" height="42" rx="13" fill={inverted ? '#ffffff' : 'url(#neotest-grad)'} />
      <path
        d="M15 32V16l18 16V16"
        stroke={inverted ? '#1c61d8' : '#ffffff'}
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="33" cy="33" r="3.6" fill={inverted ? '#0f2a54' : '#bfe1fe'} />
    </svg>
  );
}

export function NeoTestWordmark({
  subtitle = 'Powered by Pakkar',
  inverted = false,
  compact = false,
}: {
  subtitle?: string;
  inverted?: boolean;
  compact?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <NeoTestLogo className={compact ? 'h-8 w-8' : 'h-9 w-9'} inverted={inverted} />
      <div className="leading-tight">
        <p className={`text-[17px] font-extrabold tracking-tight ${inverted ? 'text-white' : 'text-navy-900'}`}>
          Neo<span className={inverted ? 'text-brand-200' : 'text-brand-700'}>Test</span>
        </p>
        <p className={`text-[10px] font-medium uppercase tracking-[0.14em] ${inverted ? 'text-navy-200' : 'text-slate-500'}`}>
          {subtitle}
        </p>
      </div>
    </div>
  );
}
