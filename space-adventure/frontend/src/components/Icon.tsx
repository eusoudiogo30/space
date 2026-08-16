type IconName = 'chevron-left' | 'chevron-right' | 'close' | 'timer' | 'volume' | 'volume-off' | 'flame' | 'cashout' | 'mail' | 'lock' | 'user'

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }

  switch (name) {
    case 'chevron-left':
      return <svg {...common}><polyline points="15 5 8 12 15 19" /></svg>

    case 'chevron-right':
      return <svg {...common}><polyline points="9 5 16 12 9 19" /></svg>

    case 'close':
      return <svg {...common}><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>

    case 'timer':
      return (
        <svg {...common}>
          <line x1="10" y1="2" x2="14" y2="2" />
          <line x1="12" y1="2" x2="12" y2="5" />
          <circle cx="12" cy="14" r="8" />
          <polyline points="12 10 12 14 15 16" />
        </svg>
      )

    case 'volume':
      return (
        <svg {...common}>
          <path d="M4 10v4h4l5 4V6L8 10H4Z" strokeLinejoin="round" />
          <path d="M17 9a5 5 0 0 1 0 6" />
          <path d="M19.5 6.5a9 9 0 0 1 0 11" />
        </svg>
      )

    case 'volume-off':
      return (
        <svg {...common}>
          <path d="M4 10v4h4l5 4V6L8 10H4Z" strokeLinejoin="round" />
          <line x1="16" y1="9" x2="21" y2="15" />
          <line x1="21" y1="9" x2="16" y2="15" />
        </svg>
      )

    case 'flame':
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <path d="M12 2c1 3-3 4.5-3 8a3 3 0 0 0 6 0c0-1.2-.6-2-1.2-2.8.8.2 3.2 1.6 3.2 5.3a5 5 0 0 1-10 0C7 8 10 6 12 2Z" />
        </svg>
      )

    case 'cashout':
      return (
        <svg {...common}>
          <path d="M12 4v11" />
          <polyline points="8 11 12 15 16 11" />
          <path d="M5 18h14" />
        </svg>
      )

    case 'mail':
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" rx="2.5" />
          <path d="M4 7l8 6 8-6" />
        </svg>
      )

    case 'lock':
      return (
        <svg {...common}>
          <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
          <path d="M7.5 10.5V7.5a4.5 4.5 0 0 1 9 0v3" />
        </svg>
      )

    case 'user':
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3.6" />
          <path d="M4.5 20c1-4 4.2-6.2 7.5-6.2S18.5 16 19.5 20" />
        </svg>
      )
  }
}
