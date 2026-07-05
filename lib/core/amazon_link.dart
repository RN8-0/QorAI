// Amazon affiliate links for the app — mirrors web/src/lib/format.js so the app
// builds the SAME country-correct Amazon search link the website does.
//
// TAG GATING (curl-proven 2026-07-05, see web/src/lib/format.js): Amazon's
// server-side Earn Globally router 302s ANY amazon.* URL carrying our ?tag= to
// the storefront nearest the visitor's IP (TR IP → amazon.it + linkCode=gg3),
// no matter which storefront the link names. Untagged URLs are never touched.
// So the tag is kept only when the device's detected country maps to the very
// storefront being linked (or to Amazon's known redirect target for it);
// otherwise the link goes untagged so the user lands EXACTLY on the store they
// picked. Strict country rule: landing correctness beats commission.
import '../domain/entities/product_entity.dart';

const Map<String, String> _amazonDomain = {
  'US': 'www.amazon.com', 'GB': 'www.amazon.co.uk', 'DE': 'www.amazon.de',
  'FR': 'www.amazon.fr', 'IT': 'www.amazon.it', 'ES': 'www.amazon.es',
  'CA': 'www.amazon.ca', 'TR': 'www.amazon.com.tr',
  'NL': 'www.amazon.nl', 'PL': 'www.amazon.pl', 'SE': 'www.amazon.se',
};

// Visitor country → the storefront we earn on (nearest in-coverage fallback).
const Map<String, String> _countryToMarket = {
  'TR': 'TR', 'US': 'US', 'GB': 'GB', 'DE': 'DE', 'FR': 'FR', 'IT': 'IT',
  'ES': 'ES', 'CA': 'CA', 'NL': 'NL', 'PL': 'PL', 'SE': 'SE',
  'AT': 'DE', 'CH': 'DE', 'BE': 'FR', 'LU': 'FR', 'IE': 'GB', 'PT': 'ES',
  'DK': 'SE', 'NO': 'SE', 'FI': 'SE', 'CZ': 'PL',
  'AU': 'GB', 'NZ': 'GB', 'MX': 'US',
};

// Tag is per-program — Amazon store IDs are NOT shared across marketplaces.
// Four owned Associates accounts (panels checked 2026-07-05): US qorai-20
// (also the OneLink/Earn-Globally id the other storefronts ride on),
// TR qorai-21, DE qorai0d-21, UK qorai0e-21. qorai-20 on .de/.co.uk
// attributed nothing there.
const Map<String, String> _tagByMarket = {
  'TR': 'qorai-21',
  'DE': 'qorai0d-21',
  'GB': 'qorai0e-21',
};
const String _defaultTag = 'qorai-20';

// Where Amazon's Earn-Globally router actually SENDS visitors from countries
// outside its marketplace set (curl-proven): tagged amazon.it stays put for a
// TR IP, so the tag — and the commission — survives there.
const Map<String, String> _egTarget = {'TR': 'IT'};

/// May a link to [market] carry our affiliate tag for a device in
/// [visitorCountry] without Amazon's geo-router moving the click to another
/// storefront? ONLY when the device's own storefront (or Amazon's known
/// redirect target for it) IS the linked one. 2026-07-05/2: the former
/// "local-program markets (TR/DE/GB) are always safe" exception was removed —
/// Amazon's router proved SESSION-dependent (a real browser bounced a tagged
/// amazon.de /dp link to amazon.it while bare curl did not), so every
/// cross-geo click goes untagged; landing correctness is deterministic.
/// Unknown geo keeps the tag (IP probe is 7-day cached and rarely missing).
bool amazonTagAllowed(String market, String? visitorCountry) {
  final m = market.trim().toUpperCase();
  final geo = (visitorCountry ?? '').trim().toUpperCase();
  if (m.isEmpty) return true;
  if (geo.isEmpty) return true;
  return _countryToMarket[geo] == m || _egTarget[geo] == m;
}

// Hostname (minus www.) → market, for re-tagging stored offer URLs in place.
final Map<String, String> _marketByHost = {
  for (final e in _amazonDomain.entries)
    e.value.replaceFirst(RegExp(r'^www\.'), ''): e.key,
};

/// Re-tag an Amazon URL for the storefront it ALREADY points at (domain is
/// never rewritten — a stored offer's storefront IS the country its row was
/// shown under). Sets that market's own program tag when [amazonTagAllowed],
/// strips the tag otherwise so Amazon's server-side gg3 302 can't move the
/// click to another country's store. Non-Amazon URLs pass through untouched.
String amazonTagUrlForVisitor(String url, String? visitorCountry) {
  final uri = Uri.tryParse(url.trim());
  if (uri == null || !(uri.isScheme('https') || uri.isScheme('http'))) {
    return url;
  }
  final host = uri.host.toLowerCase();
  if (!RegExp(r'(^|\.)amazon\.').hasMatch(host)) return url;
  final market = _marketByHost[host.replaceFirst(RegExp(r'^www\.'), '')] ?? '';
  final params = Map<String, String>.from(uri.queryParameters);
  // OneLink redirect leftovers (gg2/gg3) can re-arm Amazon's geo-router even
  // on an untagged URL — always drop them from stored links.
  params.remove('linkCode');
  params.remove('linkId');
  if (market.isNotEmpty && amazonTagAllowed(market, visitorCountry)) {
    params['tag'] = _tagByMarket[market] ?? _defaultTag;
  } else {
    params.remove('tag');
  }
  return uri.replace(queryParameters: params.isEmpty ? null : params).toString();
}

const Map<String, String> amazonMarketFlag = {
  'US': '🇺🇸', 'GB': '🇬🇧', 'DE': '🇩🇪', 'FR': '🇫🇷', 'IT': '🇮🇹', 'ES': '🇪🇸',
  'CA': '🇨🇦', 'TR': '🇹🇷', 'NL': '🇳🇱', 'PL': '🇵🇱', 'SE': '🇸🇪',
};

String amazonMarketForCountry(String? country) {
  final c = (country ?? 'US').trim().toUpperCase();
  return _countryToMarket[c] ?? 'US';
}

// Mirrors amazonQueryForProduct() in web/src/lib/format.js: trim the name at the
// first spec token (storage / size / connectivity), then make sure the brand
// leads so the search is specific.
String _amazonQuery(ProductEntity p) {
  var name = p.name.replaceAll(RegExp(r'\s+'), ' ').trim();
  final cut = name.indexOf(RegExp(
    r'\s(?:\d+(?:[.,]\d+)?\s*(?:cm|mm|inch|gb|tb|ghz|mhz|mah|wh|w)\b|\(\d|dual\s*sim|single\s*sim|android|wi-?fi|bluetooth)',
    caseSensitive: false,
  ));
  if (cut > 10) name = name.substring(0, cut).trim();
  final brand = (p.brand ?? '').trim();
  final brandFirst = brand.isEmpty ? '' : brand.split(RegExp(r'\s+')).first;
  if (brandFirst.isNotEmpty &&
      !name.toLowerCase().startsWith(brandFirst.toLowerCase())) {
    name = '$brand $name'.trim();
  }
  name = name.replaceAll(RegExp(r'\s+'), ' ').trim();
  return name.length > 120 ? name.substring(0, 120).trim() : name;
}

/// Country-correct Amazon search URL for a product (empty if no query).
/// [visitorCountry] is the device's DETECTED (IP) country and gates the tag:
/// a cross-geo selection goes untagged so Amazon can't bounce it elsewhere.
String amazonUrlForProduct(
  ProductEntity product,
  String? country, {
  String? visitorCountry,
}) {
  final query = _amazonQuery(product);
  if (query.isEmpty) return '';
  final market = amazonMarketForCountry(country);
  final host = _amazonDomain[market] ?? _amazonDomain['US']!;
  final base = 'https://$host/s?k=${Uri.encodeQueryComponent(query)}&i=electronics';
  if (!amazonTagAllowed(market, visitorCountry)) return base;
  final tag = _tagByMarket[market] ?? _defaultTag;
  return '$base&tag=$tag';
}
