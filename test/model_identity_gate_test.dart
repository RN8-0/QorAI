// Model kimlik kapısı — kardeş varyant sızıntısı.
//
// Bu test dosyası, JS eşi (admin/js/qor_ai_prompts.js -> modelIdentityGate)
// ile AYNI vakaları koşar. İki kopya bilerek var: Dart o JS dosyasını
// çalıştıramaz. Ayrışmayı yakalayan şey bu paritedir — bir tarafta kural
// değişip diğerinde değişmezse buradaki vakalardan biri düşer.
//
// Vakaların kaynağı ölçüm: 2026-08-28, canlı grounded araştırma,
// "Samsung Galaxy S26 (512 GB)" raporuna Galaxy S26 Ultra'nın kronik ekran
// lekesi, Ultra'nın fiyatı ve Ultra'ya ÖZEL bir özellik yazılmıştı.

import 'package:flutter_test/flutter_test.dart';
import 'package:qor_ai/services/model_identity_gate.dart';

void main() {
  const s26 = 'Samsung Galaxy S26 (512 GB)';
  const s26Ultra = 'Samsung Galaxy S26 Ultra (12 GB / 512 GB)';

  group('kardeş ad türetimi', () {
    test('taban model → varyantlar ve komşu nesiller kardeştir', () {
      final sibs = ModelIdentityGate.siblingModelNames(s26);
      expect(sibs, contains('Samsung Galaxy S26 Ultra'));
      expect(sibs, contains('Samsung Galaxy S25'));
      expect(sibs, contains('Samsung Galaxy S27'));
    });

    test('varyantlı model → taban model de kardeştir, kendisi değildir', () {
      final sibs = ModelIdentityGate.siblingModelNames(s26Ultra);
      expect(sibs, contains('Samsung Galaxy S26'));
      expect(sibs, isNot(contains('Samsung Galaxy S26 Ultra')));
    });

    test('iPhone 17 Pro → Pro Max ve taban', () {
      final sibs = ModelIdentityGate.siblingModelNames('Apple iPhone 17 Pro (512 GB)');
      expect(sibs, contains('Apple iPhone 17 Pro Max'));
      expect(sibs, contains('Apple iPhone 17'));
      expect(sibs, isNot(contains('Apple iPhone 17 Pro')));
    });
  });

  group('yanlış çapa tuzakları', () {
    test('"5G" nesil sayısı sayılmaz', () {
      final sibs = ModelIdentityGate.siblingModelNames('Samsung Galaxy A17 5G (8 GB / 256 GB)');
      expect(sibs.any((x) => x.contains('4G') || x.contains('6G')), isFalse);
      expect(sibs, contains('Samsung Galaxy A16'));
    });

    test('ekran kartında komşu KADEME, ±1 değil', () {
      final sibs = ModelIdentityGate.siblingModelNames('Asus TUF Gaming GeForce RTX 5090 32GB GDDR7');
      expect(sibs, contains('Asus TUF Gaming GeForce RTX 5080'));
      expect(sibs.any((x) => x.contains('5089')), isFalse);
      expect(sibs.any((x) => x.contains('GDDR')), isFalse);
    });

    test('sayısız ad → kardeş yok, kapı SUSAR', () {
      expect(ModelIdentityGate.siblingModelNames('Honor Robot Phone'), isEmpty);
      expect(ModelIdentityGate.gate(<String>['Netflix']), isEmpty);
      expect(ModelIdentityGate.gate(<String>['Honor Robot Phone']), isEmpty);
    });
  });

  group('araştırma notu temizliği', () {
    String scrub(String t, [List<String>? subj]) =>
        ModelIdentityGate.scrub(t, subj ?? <String>[s26]);

    test('ULTRA kronik sorunu ATILIR', () {
      final out = scrub(
        "Bazı kullanıcılar, Galaxy S26 Ultra'da ekranın ortasında kırmızımsı bir leke bildirmiştir.",
      );
      expect(out, isNot(contains('kırmızımsı')));
    });

    test('ULTRA-özel özellik ATILIR', () {
      expect(scrub('Gizlilik Ekranı özelliği (S26 Ultra\'ya özel).'),
          isNot(contains('Gizlilik')));
    });

    test('KONUYA ait cümle KORUNUR', () {
      expect(scrub("Galaxy S26'nın 4300 mAh bataryası uzun ömürlü."),
          contains('4300 mAh'));
    });

    test('iki adı birden anan karşılaştırma KORUNUR', () {
      expect(scrub('Galaxy S26, Galaxy S26 Ultra\'ya göre daha hafiftir.'),
          contains('Ultra'));
    });

    test('karşılaştırmanın DİĞER konusu silinmez', () {
      final out = scrub("Galaxy S26 Ultra'nın kamerası 200 MP.", <String>[s26, s26Ultra]);
      expect(out, contains('200 MP'));
    });

    test('nesil ekseni: karşılaştırma ipucu KORUR, ipucusuz iddia ATILIR', () {
      expect(scrub("Galaxy S25'e göre daha iyi pil ömrü sunmaktadır."), contains('S25'));
      expect(scrub('Battery life is better than the Galaxy S25.'), contains('S25'));
      expect(scrub('Galaxy S25 kullanıcıları menteşe çatlamasından şikayetçi.'),
          isNot(contains('menteşe')));
    });

    test('varyant ekseni koşulsuz atılır (ipucu kurtarmaz)', () {
      expect(scrub("Galaxy S26 Ultra'ya göre daha küçük ekran sorunu var."),
          isNot(contains('Ultra')));
    });

    test('atılan cümle sayısı bildirilir', () {
      expect(scrub("Galaxy S26 Ultra'da ısınma var. Galaxy S26 Ultra pahalıdır."),
          contains('[Qor AI note] 2 sentence'));
    });
  });

  group('rapor denetimi', () {
    test('kendi bölümlerindeki sızıntı yakalanır, alternatifler taranmaz', () {
      final found = ModelIdentityGate.leaks(<String, dynamic>{
        'product': <String, dynamic>{
          'strengths': <String>["Gizlilik Ekranı özelliği (S26 Ultra'ya özel) çok iyi."],
        },
        'community': <String, dynamic>{
          'chronicIssues': <dynamic>[
            <String, dynamic>{
              'title': 'Ekran lekesi',
              'detail': "Galaxy S26 Ultra'da ekranın ortasında kırmızımsı leke bildirildi.",
            },
          ],
        },
        'alternatives': <dynamic>[
          <String, dynamic>{'name': 'Samsung Galaxy S26 Ultra', 'difference': 'Daha büyük ekran.'},
        ],
      }, <String>[s26]);
      expect(found.length, 2);
      expect(found.any((f) => f.startsWith('product.strengths')), isTrue);
      expect(found.any((f) => f.startsWith('community.chronicIssues')), isTrue);
      expect(found.any((f) => f.startsWith('alternatives')), isFalse);
    });

    test('temiz rapor → bulgu yok', () {
      final found = ModelIdentityGate.leaks(<String, dynamic>{
        'product': <String, dynamic>{
          'strengths': <String>['Galaxy S26 kompakt gövdesiyle rahat kullanılır.'],
        },
        'community': <String, dynamic>{'chronicIssues': <dynamic>[]},
      }, <String>[s26]);
      expect(found, isEmpty);
    });

    test('nesil + ipucu bulgu değildir, varyant bulgudur', () {
      int n(String d) => ModelIdentityGate.leaks(<String, dynamic>{
            'product': <String, dynamic>{'strengths': <String>[d]},
          }, <String>[s26]).length;
      expect(n("Galaxy S25'e göre pil ömrü belirgin şekilde iyi."), 0);
      expect(n("Galaxy S26 Ultra'nın gizlilik ekranı çok iyi."), 1);
    });
  });

  group('kapı metni', () {
    test('konuyu ve kardeşleri adıyla yazar', () {
      final g = ModelIdentityGate.gate(<String>[s26]);
      expect(g, contains('MODEL IDENTITY HARD GATE'));
      expect(g, contains('Samsung Galaxy S26 Ultra'));
      expect(g, contains('BASE model'));
    });

    test('karşılaştırmada her iki konu da kardeş listesinden düşer', () {
      final g = ModelIdentityGate.gate(<String>[s26, s26Ultra]);
      expect(g, contains('"$s26"'));
      expect(g, contains('"$s26Ultra"'));
    });
  });
}
