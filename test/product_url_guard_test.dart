// Urun linki kapisi — app ile web AYNI kurali kullanmali.
//
// BUG (kullanici): uygulamada Link Analizi bir YouTube videosunu URUN sanip
// %72 uyum puani uretti; web'de ayni link reddediliyor.
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:qor_ai/core/product_url_guard.dart';

void main() {
  group('urun OLMAYAN linkler reddedilir', () {
    for (final url in [
      'https://www.youtube.com/watch?v=abc123',
      'https://youtu.be/abc123',
      'https://www.reddit.com/r/turkey/comments/x/baslik/',
      'https://x.com/biri/status/1',
      'https://www.instagram.com/p/Cabc/',
      'https://tr.wikipedia.org/wiki/Telefon',
      'https://www.google.com/search?q=telefon',
      'https://medium.com/@biri/yazi-123',
      'https://www.tiktok.com/@biri/video/1',
      'https://www.hepsiburada.com',        // ciplak ana sayfa
      'https://www.amazon.com.tr/',         // ciplak ana sayfa
      'not-a-url',
      'ftp://example.com/file',
    ]) {
      test(url, () => expect(looksLikeProductUrl(url), isFalse));
    }
  });

  group('gercek urun linkleri gecer', () {
    for (final url in [
      'https://www.amazon.com.tr/Apple-MacBook-Air/dp/B0TEST',
      'https://www.hepsiburada.com/apple-macbook-air-p-HBV123',
      'https://www.trendyol.com/apple/macbook-air-p-123456',
      'https://www.mediamarkt.com.tr/tr/product/_apple-123.html',
      'https://www.sahibinden.com/ilan/vasita-otomobil-123/baslik',
    ]) {
      test(url, () => expect(looksLikeProductUrl(url), isTrue));
    }
  });

  test('host listesi web ile AYNI', () {
    final web = File('web/src/lib/linkAnalysis.js').readAsStringSync();
    final dart = File('lib/core/product_url_guard.dart').readAsStringSync();
    List<String> hosts(String src, String marker) {
      final i = src.indexOf(marker);
      expect(i, greaterThan(-1), reason: '$marker bulunamadi');
      final j = src.indexOf('];', i);
      return RegExp("'([a-z0-9.-]+\.[a-z]{2,})'")
          .allMatches(src.substring(i, j))
          .map((m) => m.group(1)!)
          .toSet()
          .toList()
        ..sort();
    }

    expect(hosts(dart, '_nonProductHosts'), hosts(web, 'NON_PRODUCT_HOSTS'),
        reason: 'app ve web urun-disi host listeleri farkli');
  });
}
