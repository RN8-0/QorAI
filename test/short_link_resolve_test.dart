// GÖREV 4 doğrulaması: UYGULAMANIN GERÇEK KODU (MetadataService.resolveShareUrl)
// kısaltılmış bir Amazon linkini ürün adını taşıyan adrese + başlığa çeviriyor mu?
//
// Kök neden Dart çalışma zamanının HTTP davranışı (cihazla birebir aynı).
// Uygulamanın Link Analizi ekranı giriş + Q Coin kapısının arkasında olduğu için
// UI'dan koşturulamıyor; bu test tam olarak o kod yolunu çalıştırır.
// AĞ ERİŞİMİ İSTER — CI'da atlanması gerekirse `-x network` ile dışlanabilir.
@Tags(['network'])
library;

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:qor_ai/services/cache_service.dart';
import 'package:qor_ai/services/metadata_service.dart';

void main() {
  test('kisaltilmis amzn.eu linki urun adli adrese + basliga cozulur', () async {
    const short = 'https://amzn.eu/d/0j9wMEax';
    final svc = MetadataService(dio: Dio(), cacheService: CacheService());

    final sw = Stopwatch()..start();
    final resolved = await svc.resolveShareUrl(short);
    sw.stop();
    final title = svc.serverTitleFor(resolved) ?? '';

    // ignore: avoid_print
    print('girdi  : $short\ncikti  : $resolved (${sw.elapsedMilliseconds} ms)\nbaslik : $title');

    expect(resolved, isNot(short), reason: 'kisa link cozulmedi');
    expect(resolved, contains('/dp/'), reason: 'Amazon urun adresi degil');
    expect(title, isNotEmpty, reason: 'sayfa basligi alinamadi (urun taninamaz)');
  }, timeout: const Timeout(Duration(seconds: 60)));
}
