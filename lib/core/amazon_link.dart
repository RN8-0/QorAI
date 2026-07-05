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

const Map<String, String> _tagByMarket = {'TR': 'qorai-21'};
const String _defaultTag = 'qorai-20';

// Where Amazon's Earn-Globally router actually SENDS visitors from countries
// outside its marketplace set (curl-proven): tagged amazon.it stays put for a
// TR IP, so the tag — and the commission — survives there.
const Map<String, String> _egTarget = {'TR': 'IT'};

/// May a link to [market] carry our affiliate tag for a device in
/// [visitorCountry] without Amazon's gg3 geo-router moving the click to
/// another storefront? Unknown geo keeps the tag (IP probe is 7-day cached and
/// rarely missing); unmapped exotic geos drop it so the landing store stays
/// deterministic.
bool amazonTagAllowed(String market, String? visitorCountry) {
  final m = market.trim().toUpperCase();
  final geo = (visitorCountry ?? '').trim().toUpperCase();
  if (geo.isEmpty || m.isEmpty) return true;
  return _countryToMarket[geo] == m || _egTarget[geo] == m;
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
