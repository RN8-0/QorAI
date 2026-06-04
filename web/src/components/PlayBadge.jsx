// Polished Google Play download badge — the official 4-colour triangle on a
// refined dark pill (not a flat black box). Reused in the header, hero, footer.
const PLAY_URL = 'https://play.google.com/store/apps/details?id=com.compair.app';

function PlayGlyph({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M3.6 2.1 13 11.5 3.2 21.3a1.1 1.1 0 0 1-.5-.95V3.05c0-.4.2-.74.5-.95z" fill="#00C8FF" />
      <path d="m13 11.5 3.4-3.4-10-5.74a1.1 1.1 0 0 0-.8-.1L13 11.5z" fill="#00F076" />
      <path d="m13 11.5-7.4 9.74c.26.06.55.02.8-.12l10-5.73-3.4-3.89z" fill="#FF3B3B" />
      <path d="m16.4 8.1-3.4 3.4 3.4 3.89 4.2-2.4a1.1 1.1 0 0 0 0-1.92L16.4 8.1z" fill="#FFCE00" />
    </svg>
  );
}

// variant: 'full' (icon + GET IT ON / Google Play) · 'compact' (icon + text)
export default function PlayBadge({ getItOn = 'GET IT ON', label = 'Google Play', size = 'full', style, className = '' }) {
  return (
    <a className={'play-badge' + (size === 'sm' ? ' play-badge-sm' : '') + (className ? ` ${className}` : '')} href={PLAY_URL} target="_blank" rel="noopener" style={style}>
      <PlayGlyph size={size === 'sm' ? 20 : 24} />
      <span className="play-badge-txt">
        <small>{getItOn}</small>
        <b>{label}</b>
      </span>
    </a>
  );
}

export { PlayGlyph };
