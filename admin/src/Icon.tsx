export type IconName =
  | 'dashboard' | 'users' | 'user-plus' | 'deposit' | 'withdrawal' | 'bell' | 'game' | 'sliders'
  | 'settings' | 'gateway' | 'coins' | 'trophy' | 'alert-triangle' | 'list' | 'clock' | 'check-circle'
  | 'percent' | 'close' | 'logout' | 'upload' | 'gift' | 'star' | 'download' | 'affiliate' | 'link' | 'eye' | 'eye-off'

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none' as const,
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }

  switch (name) {
    case 'dashboard':
      return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1.4" /><rect x="14" y="3" width="7" height="7" rx="1.4" /><rect x="3" y="14" width="7" height="7" rx="1.4" /><rect x="14" y="14" width="7" height="7" rx="1.4" /></svg>

    case 'users':
      return <svg {...common}><circle cx="9" cy="7.5" r="3.6" /><path d="M2.5 20.5c.9-4 3.6-6.3 6.5-6.3s5.6 2.3 6.5 6.3" /><path d="M15.8 3.3a3.6 3.6 0 0 1 0 7.2" /><path d="M19 14.6a6.6 6.6 0 0 1 2.5 5.4" /></svg>

    case 'user-plus':
      return <svg {...common}><circle cx="9" cy="8" r="3.6" /><path d="M2.5 20.5c.9-4 3.6-6.3 6.5-6.3s5.6 2.3 6.5 6.3" /><path d="M18 8v6M15 11h6" /></svg>

    case 'deposit':
      return <svg {...common}><path d="M12 3v12" /><path d="m6.5 9.5 5.5 5.5 5.5-5.5" /><path d="M4.5 20.5h15" /></svg>

    case 'withdrawal':
      return <svg {...common}><path d="M12 21V9" /><path d="m6.5 14.5 5.5-5.5 5.5 5.5" /><path d="M4.5 3.5h15" /></svg>

    case 'bell':
      return <svg {...common}><path d="M6 9.5a6 6 0 0 1 12 0c0 4.2 1.3 5.7 2 6.5H4c.7-.8 2-2.3 2-6.5Z" /><path d="M10 19a2.2 2.2 0 0 0 4 0" /></svg>

    case 'game':
      return <svg {...common}><rect x="2.5" y="7.5" width="19" height="10" rx="4.2" /><path d="M7 10.5v4M5 12.5h4" /><circle cx="15.6" cy="11" r="1" fill="currentColor" stroke="none" /><circle cx="18.1" cy="13.5" r="1" fill="currentColor" stroke="none" /></svg>

    case 'sliders':
      return <svg {...common}><line x1="4" y1="6" x2="20" y2="6" /><circle cx="9" cy="6" r="2.1" fill="currentColor" stroke="none" /><line x1="4" y1="12" x2="20" y2="12" /><circle cx="15" cy="12" r="2.1" fill="currentColor" stroke="none" /><line x1="4" y1="18" x2="20" y2="18" /><circle cx="11" cy="18" r="2.1" fill="currentColor" stroke="none" /></svg>

    case 'settings':
      return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08A1.7 1.7 0 0 0 8.94 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15 1.7 1.7 0 0 0 3 14H3v-4h.08A1.7 1.7 0 0 0 4.6 8.94a1.7 1.7 0 0 0-.34-1.88L4.2 7l2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V3h4v.08A1.7 1.7 0 0 0 15.06 4.6a1.7 1.7 0 0 0 1.88-.34L17 4.2 19.83 7l-.06.06A1.7 1.7 0 0 0 19.4 9c.25.62.86 1.02 1.53 1.02H21v4h-.08A1.7 1.7 0 0 0 19.4 15Z" /></svg>

    case 'gateway':
      return <svg {...common}><rect x="2.5" y="5" width="19" height="14" rx="2.2" /><path d="M2.5 10h19M7 15h2M12 15h4" /></svg>

    case 'coins':
      return <svg {...common}><ellipse cx="9" cy="7" rx="6.5" ry="3.2" /><path d="M2.5 7v10c0 1.77 2.9 3.2 6.5 3.2s6.5-1.43 6.5-3.2V7" /><path d="M2.5 12c0 1.77 2.9 3.2 6.5 3.2s6.5-1.43 6.5-3.2" /><path d="M15.5 8.3c2.9.3 5 1.5 5 3s-2.1 2.7-5 3M15.5 14.3c2.9.3 5 1.5 5 3s-2.1 2.7-5 3" /></svg>

    case 'trophy':
      return <svg {...common}><path d="M7 4h10v5.5a5 5 0 0 1-10 0V4Z" /><path d="M7 5.5H4a1 1 0 0 0-1 1v1a3.5 3.5 0 0 0 3.5 3.5M17 5.5h3a1 1 0 0 1 1 1v1a3.5 3.5 0 0 1-3.5 3.5" /><path d="M12 14.5V18M8.5 21h7M9.8 18h4.4l.4 3H9.4Z" /></svg>

    case 'alert-triangle':
      return <svg {...common}><path d="M12 3.5 22 20.5H2Z" /><path d="M12 9.5v5" /><circle cx="12" cy="17.3" r=".2" fill="currentColor" stroke="currentColor" strokeWidth="1.6" /></svg>

    case 'list':
      return <svg {...common}><path d="M8 6h13M8 12h13M8 18h13" /><circle cx="3.5" cy="6" r="1" fill="currentColor" stroke="none" /><circle cx="3.5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="3.5" cy="18" r="1" fill="currentColor" stroke="none" /></svg>

    case 'clock':
      return <svg {...common}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>

    case 'check-circle':
      return <svg {...common}><circle cx="12" cy="12" r="8.5" /><path d="m8 12.3 2.6 2.6L16.3 9" /></svg>

    case 'percent':
      return <svg {...common}><line x1="5" y1="19" x2="19" y2="5" /><circle cx="7" cy="7" r="2.4" /><circle cx="17" cy="17" r="2.4" /></svg>

    case 'close':
      return <svg {...common}><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>

    case 'logout':
      return <svg {...common}><path d="M9 21H5.5A2.5 2.5 0 0 1 3 18.5v-13A2.5 2.5 0 0 1 5.5 3H9" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></svg>

    case 'upload':
      return <svg {...common}><path d="M12 15V4" /><path d="m7.5 8.5 4.5-4.5 4.5 4.5" /><path d="M4.5 15v3.5A2.5 2.5 0 0 0 7 21h10a2.5 2.5 0 0 0 2.5-2.5V15" /></svg>

    case 'gift':
      return <svg {...common}><rect x="3" y="8.5" width="18" height="4" rx="1" /><path d="M12 8.5V21M4 12.5V19a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19v-6.5" /><path d="M12 8.5c-1.5 0-3-1-3.5-2.5C8 4.5 9 3.5 10.2 3.5c1.4 0 1.8 1.4 1.8 2.5v2.5Zm0 0c1.5 0 3-1 3.5-2.5.5-1.5-.5-2.5-1.7-2.5-1.4 0-1.8 1.4-1.8 2.5v2.5Z" /></svg>

    case 'star':
      return <svg {...common} fill="currentColor" stroke="none"><path d="M12 2.8 14.9 9l6.8.7-5.1 4.6 1.5 6.7L12 17.6 6 21l1.5-6.7-5.1-4.6L9.1 9Z" /></svg>

    case 'download':
      return <svg {...common}><path d="M12 3v11.5" /><path d="m7.5 10.5 4.5 4.5 4.5-4.5" /><path d="M4.5 18v1.5A1.5 1.5 0 0 0 6 21h12a1.5 1.5 0 0 0 1.5-1.5V18" /></svg>

    case 'affiliate':
      return <svg {...common}><circle cx="7.5" cy="8" r="3" /><circle cx="16.5" cy="6" r="2.3" /><path d="M2.2 20.2a5.3 5.3 0 0 1 10.6 0" /><path d="M13 13.8a4.3 4.3 0 0 1 7.8 2.6v3.8" /><path d="m10.5 9 3-1" /></svg>

    case 'link':
      return <svg {...common}><path d="M9.5 14.5 14.5 9.5" /><path d="M11 6.5 12.6 5A4 4 0 1 1 18.3 10.7L16.8 12.2" /><path d="M13 17.5 11.4 19A4 4 0 1 1 5.7 13.3L7.2 11.8" /></svg>

    case 'eye':
      return <svg {...common}><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.8" /></svg>

    case 'eye-off':
      return <svg {...common}><path d="m3 3 18 18" /><path d="M10.6 6.1A9.6 9.6 0 0 1 12 6c6 0 9.5 6 9.5 6a16.8 16.8 0 0 1-2.1 2.8M6.1 6.1C3.8 7.7 2.5 12 2.5 12s3.5 6 9.5 6a9.2 9.2 0 0 0 3.1-.5" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>
  }
}
