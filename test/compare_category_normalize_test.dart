import 'package:flutter_test/flutter_test.dart';
import 'package:qor_ai/core/category_key_specs.dart' as key_specs;

/// `CompareAnalysisNotifier.normalizeCompareCategory` ile AYNI mantık.
/// (Notifier providers.dart part'ı olduğu için burada birebir kopyası test edilir.)
String normalizeCompareCategory(String? category) {
  final raw = category?.trim() ?? '';
  if (raw.isEmpty) return '';
  final canonical = key_specs.resolveCategory(raw);
  if (canonical.isNotEmpty) return canonical;
  var n = raw
      .toLowerCase()
      .replaceAll(RegExp(r'[^a-z0-9çğıöşü ]'), ' ')
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim();
  n = n
      .split(' ')
      .map((w) => (w.length > 3 && w.endsWith('s')) ? w.substring(0, w.length - 1) : w)
      .join(' ');
  return n;
}

void main() {
  group('normalizeCompareCategory — AI serbest-metin kategorilerini birleştirir', () {
    test('KULLANICI BUG\'I: Gaming Laptop == Gaming Laptops', () {
      final a = normalizeCompareCategory('Gaming Laptop');
      final b = normalizeCompareCategory('Gaming Laptops');
      expect(a, b, reason: 'tekil/çoğul farkı aynı kategoriyi ayırmamalı');
      expect(a, 'laptops');
    });

    test('dil/ifade farkları da aynı kategoriye düşer', () {
      expect(normalizeCompareCategory('Laptop'), 'laptops');
      expect(normalizeCompareCategory('Dizüstü Bilgisayar'), 'laptops');
      expect(normalizeCompareCategory('Notebook'), 'laptops');
    });

    test('gerçekten FARKLI kategoriler ayrı kalır (fazla birleştirme yok)', () {
      final laptop = normalizeCompareCategory('Gaming Laptop');
      expect(laptop, isNot(normalizeCompareCategory('Smartphone')));
      expect(laptop, isNot(normalizeCompareCategory('Tablet')));
      expect(laptop, isNot(normalizeCompareCategory('Gaming Console')));
      expect(laptop, isNot(normalizeCompareCategory('Monitor')));
    });

    test('diğer kategorilerde de tekil/çoğul birleşir', () {
      expect(normalizeCompareCategory('Smartphone'), normalizeCompareCategory('Smartphones'));
      expect(normalizeCompareCategory('Tablet'), normalizeCompareCategory('Tablets'));
    });

    test('taksonomi dışı kategori: tekil/çoğul yine birleşir', () {
      expect(
        normalizeCompareCategory('Zibidi Gadget'),
        normalizeCompareCategory('Zibidi Gadgets'),
      );
    });

    test('boş/null güvenli', () {
      expect(normalizeCompareCategory(null), '');
      expect(normalizeCompareCategory('   '), '');
    });
  });
}
