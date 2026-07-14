import 'package:qor_ai/services/gemini_service.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('GeminiService Amazon link helpers', () {
    test('extracts ASIN from Amazon dp URLs', () {
      const url =
          'https://www.amazon.com.tr/dp/B082QPP67G/ref=sspa_mw_detail_1?ie=UTF8&psc=1';

      expect(GeminiService.extractAmazonProductId(url), 'B082QPP67G');
      expect(GeminiService.extractAmazonProductIdType(url), 'asin');
      expect(
        GeminiService.extractProductNameFromUrl(url),
        'Amazon ASIN B082QPP67G',
      );
    });

    test('extracts ISBN-10 type from numeric Amazon product ids', () {
      const url = 'https://www.amazon.com/dp/1402894627';

      expect(GeminiService.extractAmazonProductId(url), '1402894627');
      expect(GeminiService.extractAmazonProductIdType(url), 'isbn10');
      expect(
        GeminiService.extractProductNameFromUrl(url),
        'Amazon ISBN 1402894627',
      );
    });

    test('parses structured web research evidence', () {
      const research = '''
IDENTIFIER_CONFIRMED: yes
MATCHED_URL: https://www.amazon.com.tr/dp/B082QPP67G
PRODUCT_NAME: Amazon Basics 60-Inch Lightweight Tripod with Bag
BRAND: Amazon Basics
CATEGORY: photography
PRICE: TRY 899,00
DESCRIPTION: Lightweight tripod for cameras and phones.
''';

      final evidence = GeminiService.parseLinkResearchEvidence(research);

      expect(evidence.identifierConfirmed, isTrue);
      expect(evidence.matchedUrl, 'https://www.amazon.com.tr/dp/B082QPP67G');
      expect(
        evidence.productName,
        'Amazon Basics 60-Inch Lightweight Tripod with Bag',
      );
      expect(evidence.brand, 'Amazon Basics');
      expect(evidence.category, 'photography');
      expect(evidence.price, 'TRY 899,00');
    });
  });

  group('GeminiService subscription helpers', () {
    test('normalizes known subscription aliases to branded display names', () {
      expect(GeminiService.normalizeSubscriptionDisplayName('hbo max'), 'HBO');
      expect(
        GeminiService.normalizeSubscriptionDisplayName('youtube music'),
        'YouTube Music',
      );
      expect(GeminiService.normalizeSubscriptionDisplayName('exen'), 'Exxen');
      expect(
        GeminiService.normalizeSubscriptionDisplayName('icloud+'),
        'iCloud+',
      );
    });

    test('returns category keys for known subscriptions', () {
      expect(
        GeminiService.subscriptionCategoryKey('Netflix'),
        'video-streaming',
      );
      expect(
        GeminiService.subscriptionCategoryKey('Spotify'),
        'music-streaming',
      );
    });

    test('web hosting / domain services share one category (Hostinger vs '
        'Cloudflare bug)', () {
      // Regression: Hostinger + Cloudflare are both web/hosting services but were
      // categorised differently by AI fallback → "different categories" error.
      const hosts = [
        'Hostinger',
        'Cloudflare',
        'GoDaddy',
        'Namecheap',
        'Bluehost',
        'SiteGround',
        'HostGator',
        'IONOS',
        'DreamHost',
        'Wix',
        'Squarespace',
        'WordPress',
        'Vercel',
        'Netlify',
        'DigitalOcean',
        'Kinsta',
        'Porkbun',
        'WP Engine',
      ];
      for (final h in hosts) {
        expect(
          GeminiService.subscriptionCategoryKey(h),
          'web-hosting',
          reason: '$h should resolve to web-hosting',
        );
      }
      // The exact reported pair must match each other.
      expect(
        GeminiService.subscriptionCategoryKey('Hostinger'),
        GeminiService.subscriptionCategoryKey('Cloudflare'),
      );
      // Spaced/variant spellings resolve too.
      expect(GeminiService.subscriptionCategoryKey('cloud flare'), 'web-hosting');
      expect(GeminiService.subscriptionCategoryKey('go daddy'), 'web-hosting');
      expect(
        GeminiService.normalizeSubscriptionDisplayName('cloudflare'),
        'Cloudflare',
      );
    });
  });
}
