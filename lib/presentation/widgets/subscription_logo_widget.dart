/// Shared subscription service logo widget used across home and subscription screens.
library;

import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:qor_ai/data/models/other_models.dart';

// ─── Known service domains ────────────────────────────────────────────────────

const knownServiceDomains = <String, String>{
  'netflix': 'netflix.com',
  'spotify': 'spotify.com',
  'apple music': 'music.apple.com',
  'apple tv+': 'tv.apple.com',
  'apple tv': 'tv.apple.com',
  'disney+': 'disneyplus.com',
  'disney plus': 'disneyplus.com',
  'youtube': 'youtube.com',
  'youtube music': 'youtube.com',
  'youtube premium': 'youtube.com',
  'amazon prime video': 'primevideo.com',
  'amazon prime': 'amazon.com',
  'amazon music': 'amazon.com',
  'hbo max': 'max.com',
  'max (hbo)': 'max.com',
  'max': 'max.com',
  'hulu': 'hulu.com',
  'crunchyroll': 'crunchyroll.com',
  'discovery+': 'discoveryplus.com',
  'paramount+': 'paramountplus.com',
  'peacock': 'peacocktv.com',
  'google one': 'one.google.com',
  'google drive': 'drive.google.com',
  'icloud+': 'apple.com',
  'icloud': 'apple.com',
  'dropbox': 'dropbox.com',
  'adobe creative cloud': 'adobe.com',
  'adobe': 'adobe.com',
  'microsoft 365': 'microsoft.com',
  'microsoft': 'microsoft.com',
  'onedrive': 'onedrive.live.com',
  'xbox game pass': 'xbox.com',
  'xbox': 'xbox.com',
  'playstation plus': 'playstation.com',
  'playstation': 'playstation.com',
  'nintendo switch online': 'nintendo.com',
  'ea play': 'ea.com',
  'nvidia geforce now': 'nvidia.com',
  'geforce now': 'nvidia.com',
  'tidal': 'tidal.com',
  'deezer': 'deezer.com',
  'audible': 'audible.com',
  'kindle unlimited': 'amazon.com',
  'notion': 'notion.so',
  'canva': 'canva.com',
  'figma': 'figma.com',
  'slack': 'slack.com',
  'zoom': 'zoom.us',
  'nordvpn': 'nordvpn.com',
  'expressvpn': 'expressvpn.com',
  'surfshark': 'surfshark.com',
  'cyberghost': 'cyberghostvpn.com',
  'duolingo': 'duolingo.com',
  'chatgpt': 'openai.com',
  'chatgpt plus': 'openai.com',
  'openai': 'openai.com',
  'github copilot': 'github.com',
  'midjourney': 'midjourney.com',
  'strava': 'strava.com',
  'calm': 'calm.com',
  'headspace': 'headspace.com',
  'discord nitro': 'discord.com',
  'discord': 'discord.com',
  'twitch': 'twitch.tv',
  'linkedin premium': 'linkedin.com',
  'grammarly': 'grammarly.com',
  '1password': '1password.com',
  'lastpass': 'lastpass.com',
  'norton': 'norton.com',
  'bitdefender': 'bitdefender.com',
  'kaspersky': 'kaspersky.com',
  'avast': 'avast.com',
  'skillshare': 'skillshare.com',
  'masterclass': 'masterclass.com',
  'coursera': 'coursera.org',
  'udemy': 'udemy.com',
  'todoist': 'todoist.com',
  'trello': 'trello.com',
  'asana': 'asana.com',
  'monday.com': 'monday.com',
  'monday': 'monday.com',
  'airtable': 'airtable.com',
  'loom': 'loom.com',
  'miro': 'miro.com',
  'framer': 'framer.com',
  'webflow': 'webflow.com',
  'squarespace': 'squarespace.com',
  'wix': 'wix.com',
  'shopify': 'shopify.com',
  'cloudflare': 'cloudflare.com',
  'sentry': 'sentry.io',
  'datadog': 'datadoghq.com',
  // Turkish services
  'blutv': 'blutv.com',
  'blu tv': 'blutv.com',
  'exxen': 'exxen.com',
  'gain': 'gain.tv',
  'mubi': 'mubi.com',
  'tabii': 'tabii.com',
  'puhutv': 'puhutv.com',
  'puhu tv': 'puhutv.com',
  'tivibu': 'tivibu.com.tr',
  'turkcell tv+': 'turkcell.com.tr',
  'turkcell': 'turkcell.com.tr',
  'digiturk': 'digiturk.com.tr',
  'bein sports': 'beinsports.com',
  'beinsports': 'beinsports.com',
  'tod': 'tod.tv',
  // AI services
  'adobe firefly': 'firefly.adobe.com',
  'adobe acrobat': 'adobe.com',
  'adobe premiere': 'adobe.com',
  'adobe photoshop': 'adobe.com',
  'google gemini': 'gemini.google.com',
  'gemini': 'gemini.google.com',
  'google bard': 'bard.google.com',
  'claude': 'anthropic.com',
  'anthropic': 'anthropic.com',
  'copilot': 'copilot.microsoft.com',
  'microsoft copilot': 'copilot.microsoft.com',
  'perplexity': 'perplexity.ai',
  'jasper': 'jasper.ai',
  'writesonic': 'writesonic.com',
  'copy.ai': 'copy.ai',
  'elevenlabs': 'elevenlabs.io',
  'runway': 'runwayml.com',
  'stable diffusion': 'stability.ai',
  'stability ai': 'stability.ai',
  // Gaming
  'amazon luna': 'luna.amazon.com',
  'luna': 'luna.amazon.com',
  'stadia': 'stadia.google.com',
  'shadow': 'shadow.tech',
  'boosteroid': 'boosteroid.com',
  'antstream': 'antstream.com',
  'ps now': 'playstation.com',
  'ps plus': 'playstation.com',
  'ubisoft+': 'ubisoft.com',
  'ubisoft': 'ubisoft.com',
  // Music/Audio
  'amazon music unlimited': 'music.amazon.com',
  'qobuz': 'qobuz.com',
  'soundcloud': 'soundcloud.com',
  'pandora': 'pandora.com',
  'napster': 'napster.com',
  // Productivity/Cloud
  'zoho': 'zoho.com',
  'evernote': 'evernote.com',
  'bear': 'bear.app',
  'obsidian': 'obsidian.md',
  'coda': 'coda.io',
  'craft': 'craft.do',
  'linear': 'linear.app',
  'github': 'github.com',
  'jira': 'atlassian.com',
  'confluence': 'atlassian.com',
  'hubspot': 'hubspot.com',
  'salesforce': 'salesforce.com',
  'zendesk': 'zendesk.com',
  // Security
  'dashlane': 'dashlane.com',
  'keeper': 'keepersecurity.com',
  'malwarebytes': 'malwarebytes.com',
  'mcafee': 'mcafee.com',
  'avg': 'avg.com',
  'eset': 'eset.com',
  'protonvpn': 'protonvpn.com',
  'proton vpn': 'protonvpn.com',
  'proton mail': 'proton.me',
  'mullvad': 'mullvad.net',
  'ipvanish': 'ipvanish.com',
  // Fitness
  'fitbit premium': 'fitbit.com',
  'fitbit': 'fitbit.com',
  'peloton': 'peloton.com',
  'myfitnesspal': 'myfitnesspal.com',
  'noom': 'noom.com',
  'whoop': 'whoop.com',
  // Email/Communication
  'gmail': 'gmail.com',
  'outlook': 'outlook.com',
  'hey': 'hey.com',
  'fastmail': 'fastmail.com',
  'protonmail': 'proton.me',
};

String domainOf(String website) {
  try {
    final uri = Uri.parse(website.startsWith('http') ? website : 'https://$website');
    final host = uri.host.replaceFirst('www.', '');
    return host.isNotEmpty ? host : website;
  } catch (_) {
    return website;
  }
}

// ─── Public Logo Widget ───────────────────────────────────────────────────────

class SubscriptionLogoWidget extends StatefulWidget {
  final SubscriptionServiceModel service;
  final double size;
  final double borderRadius;
  const SubscriptionLogoWidget({
    required this.service,
    this.size = 42,
    this.borderRadius = 12,
    super.key,
  });
  @override
  State<SubscriptionLogoWidget> createState() => _SubscriptionLogoWidgetState();
}

class _SubscriptionLogoWidgetState extends State<SubscriptionLogoWidget> {
  late List<String> _urls;
  int _idx = 0;
  bool _isSvgLogo = false;

  @override
  void initState() {
    super.initState();
    _build();
  }

  @override
  void didUpdateWidget(SubscriptionLogoWidget old) {
    super.didUpdateWidget(old);
    if (old.service.id != widget.service.id) {
      _idx = 0;
      _build();
    }
  }

  void _build() {
    final nameLower = widget.service.name.toLowerCase().trim();
    final knownDomain = knownServiceDomains[nameLower];

    final websiteDomain = widget.service.website.isNotEmpty
        ? domainOf(widget.service.website)
        : '';
    final domain = knownDomain ?? (websiteDomain.isNotEmpty ? websiteDomain : null);

    final nameSlug = nameLower.replaceAll(RegExp(r'[^a-z0-9]'), '');
    final guessedDomain = nameSlug.isNotEmpty ? '$nameSlug.com' : null;

    final logoUrl = widget.service.logo;
    final isLegacyStorageLogo = logoUrl.isNotEmpty &&
        (logoUrl.contains('storage.googleapis.com') ||
            logoUrl.contains('firebasestorage.googleapis.com'));
    _isSvgLogo = logoUrl.toLowerCase().endsWith('.svg');
    final isHttpLogo = logoUrl.startsWith('http') && !_isSvgLogo;

    _urls = <String>[
      if (isHttpLogo && !isLegacyStorageLogo) logoUrl,
      if (domain != null) ...[
        'https://logo.clearbit.com/$domain',
        'https://icons.duckduckgo.com/ip3/$domain.ico',
      ],
      if (domain == null && guessedDomain != null) ...[
        'https://logo.clearbit.com/$guessedDomain',
        'https://icons.duckduckgo.com/ip3/$guessedDomain.ico',
      ],
      if (_isSvgLogo) logoUrl,
    ].toSet().toList();
  }

  void _advance(String failedUrl) {
    CachedNetworkImageProvider(failedUrl).evict();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && _idx < _urls.length - 1) setState(() => _idx++);
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_urls.isEmpty || _idx >= _urls.length) return _fallback();
    final url = _urls[_idx];
    final isSvgUrl = url.toLowerCase().endsWith('.svg');

    return Container(
      width: widget.size,
      height: widget.size,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(widget.borderRadius),
      ),
      padding: const EdgeInsets.all(4),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(widget.borderRadius - 2),
        child: isSvgUrl
            ? SvgPicture.network(
                url,
                key: ValueKey('${widget.service.id}_svg_$_idx'),
                width: widget.size - 8,
                height: widget.size - 8,
                fit: BoxFit.contain,
                placeholderBuilder: (_) => _fallback(),
              )
            : CachedNetworkImage(
                key: ValueKey('${widget.service.id}_$_idx'),
                imageUrl: url,
                width: widget.size - 8,
                height: widget.size - 8,
                fit: BoxFit.contain,
                placeholder: (_, __) => _fallback(),
                errorWidget: (_, __, ___) {
                  _advance(url);
                  return _fallback();
                },
              ),
      ),
    );
  }

  Widget _fallback() {
    final name = widget.service.name;
    final accent = widget.service.brandColor();
    return Container(
      width: widget.size,
      height: widget.size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(widget.borderRadius),
        gradient: LinearGradient(
          colors: [accent, accent.withValues(alpha: 0.6)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      child: Text(
        name.isNotEmpty ? name[0].toUpperCase() : '?',
        style: TextStyle(
          fontSize: widget.size * 0.4,
          fontWeight: FontWeight.w800,
          color: Colors.white,
        ),
      ),
    );
  }
}
