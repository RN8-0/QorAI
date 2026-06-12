import { useEffect, useMemo, useState } from 'react';

// Port of the app's SubscriptionLogoWidget (lib/presentation/widgets/
// subscription_logo_widget.dart): known service -> crisp SVG logo,
// high-res domain logo fallback, short mark last resort.

const KNOWN_DOMAINS = {
  'netflix': 'netflix.com', 'spotify': 'spotify.com', 'apple music': 'music.apple.com',
  'apple tv+': 'tv.apple.com', 'apple tv': 'tv.apple.com', 'disney+': 'disneyplus.com',
  'disney plus': 'disneyplus.com', 'youtube': 'youtube.com', 'youtube music': 'youtube.com',
  'youtube premium': 'youtube.com', 'amazon prime video': 'primevideo.com',
  'amazon prime': 'amazon.com', 'amazon music': 'amazon.com', 'hbo max': 'max.com',
  'max (hbo)': 'max.com', 'max': 'max.com', 'hulu': 'hulu.com', 'crunchyroll': 'crunchyroll.com',
  'discovery+': 'discoveryplus.com', 'paramount+': 'paramountplus.com', 'peacock': 'peacocktv.com',
  'google one': 'one.google.com', 'google drive': 'drive.google.com', 'icloud+': 'apple.com',
  'icloud': 'apple.com', 'dropbox': 'dropbox.com', 'adobe creative cloud': 'adobe.com',
  'adobe': 'adobe.com', 'microsoft 365': 'microsoft.com', 'microsoft': 'microsoft.com',
  'onedrive': 'onedrive.live.com', 'xbox game pass': 'xbox.com', 'xbox': 'xbox.com',
  'playstation plus': 'playstation.com', 'playstation': 'playstation.com',
  'nintendo switch online': 'nintendo.com', 'ea play': 'ea.com',
  'nvidia geforce now': 'nvidia.com', 'geforce now': 'nvidia.com', 'tidal': 'tidal.com',
  'deezer': 'deezer.com', 'audible': 'audible.com', 'kindle unlimited': 'amazon.com',
  'notion': 'notion.so', 'canva': 'canva.com', 'figma': 'figma.com', 'slack': 'slack.com',
  'zoom': 'zoom.us', 'nordvpn': 'nordvpn.com', 'expressvpn': 'expressvpn.com',
  'surfshark': 'surfshark.com', 'cyberghost': 'cyberghostvpn.com', 'duolingo': 'duolingo.com',
  'chatgpt': 'openai.com', 'chatgpt plus': 'openai.com', 'openai': 'openai.com',
  'github copilot': 'github.com', 'midjourney': 'midjourney.com', 'strava': 'strava.com',
  'calm': 'calm.com', 'headspace': 'headspace.com', 'discord nitro': 'discord.com',
  'discord': 'discord.com', 'twitch': 'twitch.tv', 'linkedin premium': 'linkedin.com',
  'grammarly': 'grammarly.com', '1password': '1password.com', 'lastpass': 'lastpass.com',
  'norton': 'norton.com', 'bitdefender': 'bitdefender.com', 'kaspersky': 'kaspersky.com',
  'avast': 'avast.com', 'skillshare': 'skillshare.com', 'masterclass': 'masterclass.com',
  'coursera': 'coursera.org', 'udemy': 'udemy.com', 'todoist': 'todoist.com',
  'trello': 'trello.com', 'asana': 'asana.com', 'monday.com': 'monday.com', 'monday': 'monday.com',
  'airtable': 'airtable.com', 'loom': 'loom.com', 'miro': 'miro.com', 'framer': 'framer.com',
  'webflow': 'webflow.com', 'squarespace': 'squarespace.com', 'wix': 'wix.com',
  'shopify': 'shopify.com', 'cloudflare': 'cloudflare.com', 'hostinger': 'hostinger.com',
  'godaddy': 'godaddy.com', 'namecheap': 'namecheap.com',
  // Turkish services
  'blutv': 'blutv.com', 'blu tv': 'blutv.com', 'exxen': 'exxen.com', 'gain': 'gain.tv',
  'mubi': 'mubi.com', 'tabii': 'tabii.com', 'puhutv': 'puhutv.com', 'puhu tv': 'puhutv.com',
  'tivibu': 'tivibu.com.tr', 'turkcell tv+': 'turkcell.com.tr', 'turkcell': 'turkcell.com.tr',
  'digiturk': 'digiturk.com.tr', 'bein sports': 'beinsports.com', 'beinsports': 'beinsports.com',
  'tod': 'tod.tv',
  // AI services
  'google gemini': 'gemini.google.com', 'gemini': 'gemini.google.com',
  'gemini advanced': 'gemini.google.com', 'claude': 'anthropic.com', 'claude pro': 'anthropic.com',
  'anthropic': 'anthropic.com', 'copilot': 'copilot.microsoft.com',
  'microsoft copilot': 'copilot.microsoft.com', 'perplexity': 'perplexity.ai',
  'jasper': 'jasper.ai', 'elevenlabs': 'elevenlabs.io', 'runway': 'runwayml.com',
  'stable diffusion': 'stability.ai', 'stability ai': 'stability.ai',
  // Gaming / music / productivity extras
  'amazon luna': 'luna.amazon.com', 'luna': 'luna.amazon.com', 'shadow': 'shadow.tech',
  'boosteroid': 'boosteroid.com', 'ubisoft+': 'ubisoft.com', 'ubisoft': 'ubisoft.com',
  'amazon music unlimited': 'music.amazon.com', 'qobuz': 'qobuz.com',
  'soundcloud': 'soundcloud.com', 'pandora': 'pandora.com', 'napster': 'napster.com',
  'evernote': 'evernote.com', 'obsidian': 'obsidian.md', 'linear': 'linear.app',
  'github': 'github.com', 'jira': 'atlassian.com', 'hubspot': 'hubspot.com',
  'salesforce': 'salesforce.com', 'zendesk': 'zendesk.com', 'dashlane': 'dashlane.com',
  'malwarebytes': 'malwarebytes.com', 'mcafee': 'mcafee.com', 'eset': 'eset.com',
  'protonvpn': 'protonvpn.com', 'proton vpn': 'protonvpn.com', 'proton mail': 'proton.me',
  'protonmail': 'proton.me', 'mullvad': 'mullvad.net', 'ipvanish': 'ipvanish.com',
  'fitbit premium': 'fitbit.com', 'fitbit': 'fitbit.com', 'peloton': 'peloton.com',
  'myfitnesspal': 'myfitnesspal.com', 'noom': 'noom.com', 'whoop': 'whoop.com',
};

const AVATAR_COLORS = ['#6c5ce7', '#0984e3', '#00b894', '#e17055', '#d63031', '#e84393', '#fdcb6e', '#00cec9'];

const WORDMARKS = {
  'netflix': { text: 'N', color: '#E50914', bg: '#FFFFFF' },
  'disney+': { text: 'D+', color: '#113CCF', bg: '#F7FAFF' },
  'disney plus': { text: 'D+', color: '#113CCF', bg: '#F7FAFF' },
  'amazon prime': { text: 'PR', color: '#00A8E1', bg: '#F4FBFF' },
  'amazon prime video': { text: 'PR', color: '#00A8E1', bg: '#F4FBFF' },
  'prime video': { text: 'PR', color: '#00A8E1', bg: '#F4FBFF' },
  'apple tv+': { text: 'tv+', color: '#111827', bg: '#FFFFFF' },
  'apple tv': { text: 'tv+', color: '#111827', bg: '#FFFFFF' },
  'hbo max': { text: 'max', color: '#FFFFFF', bg: '#111827' },
  'max': { text: 'max', color: '#FFFFFF', bg: '#111827' },
  'youtube premium': { text: '▶', color: '#FF0033', bg: '#FFFFFF' },
  'youtube': { text: '▶', color: '#FF0033', bg: '#FFFFFF' },
  'blutv': { text: 'BLU', color: '#0B5CFF', bg: '#F4F8FF' },
  'blu tv': { text: 'BLU', color: '#0B5CFF', bg: '#F4F8FF' },
  'exxen': { text: 'EX', color: '#0D0D0D', bg: '#FFD400' },
  'gain': { text: 'G', color: '#111827', bg: '#FFFFFF' },
  'mubi': { text: 'M', color: '#FFFFFF', bg: '#111827' },
  'crunchyroll': { text: 'C', color: '#F47521', bg: '#FFFFFF' },
  'spotify': { text: 'S', color: '#1DB954', bg: '#FFFFFF' },
  'apple music': { text: '♪', color: '#FA243C', bg: '#FFFFFF' },
  'youtube music': { text: 'YT', color: '#FF0033', bg: '#FFFFFF' },
  'tidal': { text: '◆', color: '#FFFFFF', bg: '#111827' },
  'chatgpt': { text: 'AI', color: '#111827', bg: '#FFFFFF' },
  'chatgpt plus': { text: 'AI', color: '#111827', bg: '#FFFFFF' },
  'claude': { text: 'AI', color: '#C15F3C', bg: '#FFF8F3' },
  'claude pro': { text: 'AI', color: '#C15F3C', bg: '#FFF8F3' },
  'gemini': { text: '✦', color: '#4285F4', bg: '#FFFFFF' },
  'gemini advanced': { text: '✦', color: '#4285F4', bg: '#FFFFFF' },
  'perplexity': { text: 'P', color: '#111827', bg: '#FFFFFF' },
  'midjourney': { text: 'MJ', color: '#FFFFFF', bg: '#111827' },
  'xbox game pass': { text: 'X', color: '#107C10', bg: '#FFFFFF' },
  'xbox': { text: 'X', color: '#107C10', bg: '#FFFFFF' },
  'playstation plus': { text: 'PS', color: '#003791', bg: '#FFFFFF' },
  'playstation': { text: 'PS', color: '#003791', bg: '#FFFFFF' },
  'bein sports': { text: 'beIN', color: '#5C2D91', bg: '#FFFFFF' },
  'beinsports': { text: 'beIN', color: '#5C2D91', bg: '#FFFFFF' },
  'tod': { text: 'TOD', color: '#111827', bg: '#FFFFFF' },
  'tabii': { text: 'tabii', color: '#10B981', bg: '#F5FFFB' },
  'microsoft 365': { text: '365', color: '#2563EB', bg: '#F8FBFF' },
  'google one': { text: 'One', color: '#4285F4', bg: '#FFFFFF' },
  'icloud+': { text: 'iC', color: '#111827', bg: '#FFFFFF' },
  'icloud': { text: 'iC', color: '#111827', bg: '#FFFFFF' },
  'adobe creative cloud': { text: 'A', color: '#FA0F00', bg: '#FFFFFF' },
  'notion': { text: 'N', color: '#111827', bg: '#FFFFFF' },
  'canva': { text: 'C', color: '#7D2AE8', bg: '#FFFFFF' },
  'hostinger': { text: 'H', color: '#673DE6', bg: '#FFFFFF' },
};

const SIMPLE_ICON_SLUGS = {
  'netflix': 'netflix',
  'disney+': 'disneyplus',
  'disney plus': 'disneyplus',
  'amazon prime': 'amazonprime',
  'amazon prime video': 'amazonprime',
  'prime video': 'amazonprime',
  'apple tv+': 'appletv',
  'apple tv': 'appletv',
  'hbo max': 'max',
  'max': 'max',
  'youtube': 'youtube',
  'youtube music': 'youtubemusic',
  'youtube premium': 'youtube',
  'blutv': 'blutv',
  'blu tv': 'blutv',
  'exxen': 'exxen',
  'gain': 'gain',
  'crunchyroll': 'crunchyroll',
  'spotify': 'spotify',
  'apple music': 'applemusic',
  'tidal': 'tidal',
  'deezer': 'deezer',
  'soundcloud': 'soundcloud',
  'chatgpt': 'openai',
  'chatgpt plus': 'openai',
  'openai': 'openai',
  'claude': 'anthropic',
  'claude pro': 'anthropic',
  'anthropic': 'anthropic',
  'gemini': 'googlegemini',
  'google gemini': 'googlegemini',
  'gemini advanced': 'googlegemini',
  'perplexity': 'perplexity',
  'microsoft copilot': 'microsoftcopilot',
  'copilot': 'microsoftcopilot',
  'midjourney': 'midjourney',
  'deepseek': 'deepseek',
  'xbox game pass': 'xbox',
  'xbox': 'xbox',
  'playstation plus': 'playstation',
  'playstation': 'playstation',
  'nintendo switch online': 'nintendo',
  'nintendo': 'nintendo',
  'geforce now': 'nvidia',
  'nvidia geforce now': 'nvidia',
  'ea play': 'ea',
  'ubisoft+': 'ubisoft',
  'ubisoft': 'ubisoft',
  'microsoft 365': 'microsoft365',
  'microsoft': 'microsoft',
  'google one': 'googleone',
  'icloud+': 'icloud',
  'icloud': 'icloud',
  'dropbox': 'dropbox',
  'adobe creative cloud': 'adobecreativecloud',
  'adobe': 'adobe',
  'notion': 'notion',
  'canva': 'canva',
  'hostinger': 'hostinger',
  'mubi': 'mubi',
  'beinsports': 'beinsports',
  'bein sports': 'beinsports',
  'tod': 'tod',
  'tabii': 'trt',
};

function simpleIconSlug(name) {
  return SIMPLE_ICON_SLUGS[String(name || '').toLowerCase().trim()] || '';
}

function wordmarkFor(name) {
  return WORDMARKS[String(name || '').toLowerCase().trim()] || null;
}

function domainFor(name, website = '') {
  const lower = String(name || '').toLowerCase().trim();
  if (KNOWN_DOMAINS[lower]) return KNOWN_DOMAINS[lower];
  if (website) {
    try {
      const u = new URL(website.startsWith('http') ? website : `https://${website}`);
      const host = u.host.replace(/^www\./, '');
      if (host) return host;
    } catch { /* fall through */ }
  }
  const slug = lower.replace(/[^a-z0-9]/g, '');
  return slug ? `${slug}.com` : '';
}

export default function SubLogo({ name, website = '', logo = '', size = 40, radius = 10 }) {
  const wordmark = wordmarkFor(name);
  const urls = useMemo(() => {
    const domain = domainFor(name, website);
    const iconSlug = simpleIconSlug(name);
    const list = [];
    const hiRes = Math.max(96, Math.ceil(size * 2.5));
    if (logo && /^https?:/i.test(logo) && !/storage\.googleapis|firebasestorage/.test(logo)) list.push(logo);
    if (iconSlug) list.push(`https://cdn.simpleicons.org/${iconSlug}`);
    if (domain) {
      list.push(`https://logo.clearbit.com/${domain}?size=${hiRes}`);
      list.push(`https://www.google.com/s2/favicons?domain=${domain}&sz=${hiRes}`);
      list.push(`https://icons.duckduckgo.com/ip3/${domain}.ico`);
    }
    return list;
  }, [name, website, logo, size]);
  const [idx, setIdx] = useState(0);
  useEffect(() => { setIdx(0); }, [name, website, logo]);

  const letter = String(name || '?').trim().charAt(0).toUpperCase() || '?';
  const color = AVATAR_COLORS[(letter.charCodeAt(0) || 0) % AVATAR_COLORS.length];

  if (idx >= urls.length && wordmark) {
    const textLen = wordmark.text.length;
    const fontSize = Math.max(9, Math.min(size * 0.42, size / Math.max(1.7, textLen * 0.72)));
    return (
      <span className="sub-logo sub-logo-wordmark" style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: wordmark.bg,
        color: wordmark.color,
        fontSize,
      }}>
        <span>{wordmark.text}</span>
      </span>
    );
  }

  if (idx >= urls.length) {
    return (
      <span className="sub-logo sub-logo-fallback" style={{
        width: size, height: size, borderRadius: radius, fontSize: size * 0.42,
        background: `linear-gradient(135deg, ${color}, ${color}99)`,
      }}>{letter}</span>
    );
  }
  return (
    <span className="sub-logo" style={{ width: size, height: size, borderRadius: radius }}>
      <img src={urls[idx]} alt={name} loading="lazy" width={Math.max(16, size - 8)} height={Math.max(16, size - 8)}
        referrerPolicy="no-referrer"
        style={{ width: Math.max(16, size - 8), height: Math.max(16, size - 8) }}
        onError={() => setIdx((i) => i + 1)} />
    </span>
  );
}
