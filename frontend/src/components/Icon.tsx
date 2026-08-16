export type IconName =
  | 'home' | 'trophy' | 'target' | 'wallet' | 'user'
  | 'speaker' | 'speaker-off' | 'fire' | 'chart' | 'gift' | 'gamepad' | 'clock' | 'check'

const shared = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

function paths(name: IconName) {
  switch (name) {
    case 'home':
      return <><path d="M4 11.5 12 4l8 7.5" /><path d="M6 10v9a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1v-9" /></>
    case 'trophy':
      return <>
        <path d="M8 4h8v4a4 4 0 0 1-8 0V4Z" />
        <path d="M8 5H5a2 2 0 0 0 0 4h1.6" />
        <path d="M16 5h3a2 2 0 0 1 0 4h-1.6" />
        <path d="M12 12v3.2" />
        <path d="M9 19h6" />
        <path d="M10 19v-1.8a2 2 0 0 1 4 0V19" />
      </>
    case 'target':
      return <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4.4" /><circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" /></>
    case 'wallet':
      return <><rect x="3" y="6" width="18" height="13" rx="2.5" /><path d="M3 10.2h18" /><circle cx="16.4" cy="14" r="1.2" fill="currentColor" stroke="none" /></>
    case 'user':
      return <><circle cx="12" cy="8" r="3.6" /><path d="M5 20c0-3.6 3.1-6.2 7-6.2s7 2.6 7 6.2" /></>
    case 'speaker':
      return <><path d="M4 9.6v4.8h3.1L12 18V6L7.1 9.6H4Z" /><path d="M16 9.4a4 4 0 0 1 0 5.2" /><path d="M18.4 7.2a7.2 7.2 0 0 1 0 9.6" /></>
    case 'speaker-off':
      return <><path d="M4 9.6v4.8h3.1L12 18V6L7.1 9.6H4Z" /><path d="M16 9.5 20.3 14" /><path d="M20.3 9.5 16 14" /></>
    case 'fire':
      return <path d="M12 3c1 3-2.5 4-2.5 7a2.5 2.5 0 0 0 5 0c0-1-.4-1.7-1-2.3 1.8.5 3 2.3 3 4.6A4.5 4.5 0 0 1 12 21a4.5 4.5 0 0 1-4.5-4.5c0-3.6 2-5 3-6.5.6-.9 1-2 1.5-4.6Z" />
    case 'chart':
      return <><path d="M4 20V10" /><path d="M11 20V4" /><path d="M18 20v-7" /><path d="M3 20.5h18" /></>
    case 'gift':
      return <>
        <rect x="4" y="10" width="16" height="10" rx="1.4" />
        <path d="M4 14h16" />
        <path d="M12 10v10" />
        <path d="M12 10c-1.2-3.4-6-3.6-6-1 0 1.4 1.6 1 6 1Z" />
        <path d="M12 10c1.2-3.4 6-3.6 6-1 0 1.4-1.6 1-6 1Z" />
      </>
    case 'gamepad':
      return <>
        <rect x="2.5" y="8" width="19" height="10" rx="4" />
        <path d="M7 10.4v5.2" />
        <path d="M4.4 13h5.2" />
        <circle cx="16" cy="11.6" r="1" fill="currentColor" stroke="none" />
        <circle cx="18.4" cy="14" r="1" fill="currentColor" stroke="none" />
      </>
    case 'clock':
      return <><circle cx="12" cy="12" r="8.2" /><path d="M12 7.5V12l3.2 1.8" /></>
    case 'check':
      return <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
  }
}

export function Icon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false" {...shared}>
      {paths(name)}
    </svg>
  )
}
