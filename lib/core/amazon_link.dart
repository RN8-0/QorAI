// Amazon affiliate links for the app — mirrors web/src/lib/format.js so the app
// builds the SAME country-correct, properly-tagged Amazon search link the website
// does (instead of opening whatever raw URL happens to be stored, which often
// pointed at the wrong storefront). OneLink store id qorai-20 earns across
// US/GB/DE/FR/IT/ES/NL/PL/SE/CA; Turkey is a separate program (qorai-21,
// amazon.com.tr) that is NOT OneLink-redirected, so a TR shopper lands on the TR
// store and can actually buy.
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
String amazonUrlForProduct(ProductEntity product, String? country) {
  final query = _amazonQuery(product);
  if (query.isEmpty) return '';
  final market = amazonMarketForCountry(country);
  final host = _amazonDomain[market] ?? _amazonDomain['US']!;
  final tag = _tagByMarket[market] ?? _defaultTag;
  return 'https://$host/s?k=${Uri.encodeQueryComponent(query)}&i=electronics&tag=$tag';
}
