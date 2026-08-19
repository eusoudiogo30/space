export type IconName = 'chevron-left' | 'chevron-right' | 'chevron-down' | 'close' | 'timer' | 'volume' | 'volume-off' | 'flame' | 'cashout' | 'mail' | 'lock' | 'user' | 'phone' | 'home' | 'users' | 'settings' | 'logout' | 'share' | 'copy' | 'wallet' | 'card-id' | 'eye' | 'eye-off' | 'gift' | 'check' | 'rocket'

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

    case 'phone':
      return (
        <svg {...common}>
          <path d="M6.5 3.5h4l1.5 4.5-2.5 1.8a11 11 0 0 0 5.2 5.2l1.8-2.5 4.5 1.5v4a1.5 1.5 0 0 1-1.6 1.5C11.9 19 5 12.1 4.5 4.6A1.5 1.5 0 0 1 6.5 3.5Z" strokeLinejoin="round" />
        </svg>
      )

    case 'chevron-down':
      return <svg {...common}><polyline points="5 9 12 16 19 9" /></svg>

    case 'home':
      return (
        <svg {...common}>
          <path d="M4 11.5 12 4l8 7.5" />
          <path d="M6 10v9.5a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V10" />
          <path d="M10 20.5v-6h4v6" />
        </svg>
      )

    case 'users':
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3.4" />
          <path d="M3 20c.8-3.6 3.1-5.6 6-5.6s5.2 2 6 5.6" />
          <path d="M16 4.3a3.4 3.4 0 0 1 0 6.8" />
          <path d="M18.5 14.6a5.6 5.6 0 0 1 2.5 4.9" />
        </svg>
      )

    case 'settings':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19 14.5a1.7 1.7 0 0 0 .3 1.9l.1.1-2 2-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V20h-2.8v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1-2-2 .1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 5.4 13.5H5.3v-2.8h.1A1.7 1.7 0 0 0 7 9.5a1.7 1.7 0 0 0-.3-1.9l-.1-.1 2-2 .1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 11.6 4.3V4.2h2.8v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1 2 2-.1.1a1.7 1.7 0 0 0-.3 1.9c.25.6.85 1 1.5 1H20v2.8h-.1a1.7 1.7 0 0 0-1.5 1Z" />
        </svg>
      )

    case 'logout':
      return (
        <svg {...common}>
          <path d="M9.5 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.5" />
          <path d="M15.5 16.5 20 12l-4.5-4.5" />
          <path d="M20 12H9.5" />
        </svg>
      )

    case 'share':
      return (
        <svg {...common}>
          <circle cx="18" cy="5.5" r="2.3" />
          <circle cx="6" cy="12" r="2.3" />
          <circle cx="18" cy="18.5" r="2.3" />
          <path d="m8 10.7 8-3.6M8 13.3l8 3.6" />
        </svg>
      )

    case 'copy':
      return (
        <svg {...common}>
          <rect x="8.5" y="8.5" width="12" height="12" rx="2.2" />
          <path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5" />
        </svg>
      )

    case 'wallet':
      return (
        <svg {...common}>
          <rect x="3" y="6" width="18" height="13" rx="2.3" />
          <path d="M3 10h18" />
          <circle cx="16.5" cy="14" r="1" fill="currentColor" stroke="none" />
        </svg>
      )

    case 'card-id':
      return (
        <svg {...common}>
          <rect x="2.5" y="5" width="19" height="14" rx="2.3" />
          <circle cx="8.3" cy="12" r="2.1" />
          <path d="M5 16.3c.5-1.5 1.7-2.3 3.3-2.3s2.8.8 3.3 2.3" />
          <path d="M14.5 10h4M14.5 14h4" />
        </svg>
      )

    case 'eye':
      return (
        <svg {...common}>
          <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )

    case 'eye-off':
      return (
        <svg {...common}>
          <path d="M4 4l16 16" />
          <path d="M10.6 5.6A10.7 10.7 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a15.6 15.6 0 0 1-3.4 4.2M6.8 7.3C4 9 2.5 12 2.5 12S6 18.5 12 18.5a9.7 9.7 0 0 0 3.3-.6" />
          <path d="M9.9 10a3 3 0 0 0 4.1 4.1" />
        </svg>
      )

    case 'check':
      return <svg {...common}><polyline points="4.5 12.5 9.5 17.5 19.5 6.5" /></svg>

    case 'rocket':
      return (
        <svg {...common} strokeLinejoin="round">
          <path d="M9.3 14.5V9c0-3.6 1.6-5.8 2.7-6.5C13.1 3.2 14.7 5.4 14.7 9v5.5Z" />
          <circle cx="12" cy="9" r="1.5" />
          <path d="M9.3 13.2 6.5 16v2.5L9 17.7" />
          <path d="M14.7 13.2 17.5 16v2.5L15 17.7" />
          <path d="M10.5 16.5c0 1.6.6 2.9 1.5 3.8.9-.9 1.5-2.2 1.5-3.8" />
        </svg>
      )

    case 'gift':
      return (
        <svg {...common}>
          <rect x="3" y="8.5" width="18" height="4" rx="1" />
          <path d="M12 8.5V21M4 12.5V19a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19v-6.5" />
          <path d="M12 8.5c-1.5 0-3-1-3.5-2.5C8 4.5 9 3.5 10.2 3.5c1.4 0 1.8 1.4 1.8 2.5v2.5Zm0 0c1.5 0 3-1 3.5-2.5.5-1.5-.5-2.5-1.7-2.5-1.4 0-1.8 1.4-1.8 2.5v2.5Z" />
        </svg>
      )
  }
}
