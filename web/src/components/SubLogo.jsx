import { useEffect, useMemo, useState } from 'react';

// Port of the app's SubscriptionLogoWidget (lib/presentation/widgets/
// subscription_logo_widget.dart): known service → domain → clearbit logo,
// duckduckgo favicon fallback, letter-avatar last resort.

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
  'godaddy': 'godaddy.com', 'namecheap': 'namecheap.com', 'adobe creative cloud': 'adobe.com',
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
  const urls = useMemo(() => {
    const domain = domainFor(name, website);
    const list = [];
    if (logo && /^https?:/i.test(logo) && !/storage\.googleapis|firebasestorage/.test(logo)) list.push(logo);
    if (domain) {
      list.push(`https://logo.clearbit.com/${domain}`);
      list.push(`https://icons.duckduckgo.com/ip3/${domain}.ico`);
    }
    return list;
  }, [name, website, logo]);
  const [idx, setIdx] = useState(0);
  useEffect(() => { setIdx(0); }, [name, website, logo]);

  const letter = String(name || '?').trim().charAt(0).toUpperCase() || '?';
  const color = AVATAR_COLORS[(letter.charCodeAt(0) || 0) % AVATAR_COLORS.length];

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
      <img src={urls[idx]} alt={name} loading="lazy" width={size - 8} height={size - 8}
        onError={() => setIdx((i) => i + 1)} />
    </span>
  );
}
