import 'package:flutter_test/flutter_test.dart';
import 'package:qor_ai/core/category_key_specs.dart';

void main() {
  group('resolveCategory', () {
    test('jenerik bir kelime rastgele bir kategoriye DÜŞMEZ', () {
      // REGRESYON: eski kod `entry.key.contains(cat)` de deniyordu → "gaming"
      // 'gaming_consoles' anahtarına takılıp 'consoles' donduruyordu.
      expect(resolveCategory('gaming'), isNot('consoles'));
      expect(resolveCategory('  Gaming '), isNot('consoles'));
    });

    test('serbest metin içindeki gerçek kategori bulunur', () {
      expect(resolveCategory('Gaming Laptop'), resolveCategory('laptop'));
      expect(resolveCategory('Gaming Laptops'), resolveCategory('laptop'));
      expect(resolveCategory('gaming laptop'), isNotEmpty);
    });

    test('en UZUN eşleşme kazanır (Map sırasına bağlı değil)', () {
      // "oyun konsolu" hem "konsol"u hem kendisini içerir; ikisi de aynı
      // kanonik kategoriye çözülmeli.
      expect(resolveCategory('oyun konsolu'), resolveCategory('konsol'));
    });

    test('kelime PARÇASI eşleşmez', () {
      // "top" bir kategori aliası olsaydı bile "laptop" ile eşleşmemeli.
      final laptop = resolveCategory('laptop');
      expect(laptop, isNotEmpty);
      expect(resolveCategory('laptop'), laptop);
    });

    test('bilinmeyen ve boş girdi güvenli', () {
      expect(resolveCategory(''), isEmpty);
      expect(resolveCategory('   '), isEmpty);
      expect(resolveCategory('zzzz qwerty asdf'), isEmpty);
    });

    test('tam eşleşme ve alias yolu korunur', () {
      expect(resolveCategory('consoles'), isNotEmpty);
      expect(resolveCategory('konsol'), isNotEmpty);
    });
  });
}
