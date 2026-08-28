// Quiz prompt PARITESI — app ile web ayni kurallari kullanmali.
//
// BUG (kullanici): uygulamada quiz her soruda urun adini tekrarliyordu
// ("Yogun bir gununuzde OnePlus 15'inizi..."). Sebep: app prompt'unda
// `Reference the product name/type in at least 3 questions` yaziyordu, web'de
// ise tam TERSI kural vardi. Iki taraf ayri yazildigi icin birbirinden kopmustu.
//
// Bu test iki dosyayi OKUR ve kritik kurallarin ikisinde de ayni yonde
// oldugunu dogrular. Web prompt'u degisirse ve app guncellenmezse KIRILIR.
//
// 2026-08-28 — TESTIN KENDISI OLMUSTU. Quiz prompt'lari
// `web/src/lib/linkAnalysis.js`ten `admin/js/qor_ai_prompts.js`e TASINDI
// (site ve admin ayni motoru kossun diye); test eski yolu okumaya devam etti,
// aradigi metni bulamadi ve iki iddiada birden kirmizi kaldi. Kirmizi kalan
// bir parite testi, kopmayi yakalamayan bir parite testidir: olculdu, uc
// gercek kaynakta da kural YERINDEYDI, yani test aylardir bos yere
// bagirıyordu. Yol duzeltildi; dosya adi bir daha degisirse `_read` acikca
// patlar (sessizce gecmez).
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';

String _read(String path) {
  final f = File(path);
  if (!f.existsSync()) throw StateError('$path bulunamadi');
  return f.readAsStringSync();
}

void main() {
  late final String web;
  late final String gemini;
  late final String deepseek;
  setUpAll(() {
    // Quiz prompt'larinin TEK KAYNAGI. Site bunu derlemede ice aktariyor
    // (web/src/lib/aiPrompts.js), admin ayni dosyayi <script> ile kosuyor.
    web = _read('admin/js/qor_ai_prompts.js');
    gemini = _read('lib/services/gemini_service.dart');
    deepseek = _read('lib/services/deepseek_service.dart');
  });

  test('urun adini tekrarlama kurali app ve webde AYNI', () {
    const rule = 'mention the product name at most once in the whole quiz';
    expect(web.contains(rule), isTrue, reason: 'web kurali degismis');
    expect(gemini.toLowerCase().contains(rule.toLowerCase()), isTrue,
        reason: 'Gemini quiz prompt web ile ayni degil');
    expect(deepseek.toLowerCase().contains('at most once in the whole quiz'), isTrue,
        reason: 'DeepSeek quiz prompt web ile ayni degil');
  });

  test('eski TERS kural geri gelmemis', () {
    // Yorum satirlarinda gecebilir; prompt METNINDE olmamali.
    final geminiPrompt = gemini.replaceAll(RegExp(r'^\s*///.*$', multiLine: true), '');
    expect(
      geminiPrompt.contains('Reference the product name/type in at least'),
      isFalse,
      reason: 'urun adini zorunlu kilan eski kural geri gelmis',
    );
  });

  test('kategori korlugu kalkani iki tarafta da var', () {
    const guard = 'NEVER assume it is a phone';
    expect(web.contains(guard), isTrue);
    expect(gemini.contains(guard), isTrue, reason: 'Gemini kategori kalkani yok');
    expect(deepseek.contains(guard), isTrue, reason: 'DeepSeek kategori kalkani yok');
  });
}
