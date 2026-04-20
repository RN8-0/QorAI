import 'package:compair/config/filter_config.dart';
import 'package:compair/core/product_filter.dart';
import 'package:compair/domain/entities/product_entity.dart';
import 'package:compair/presentation/models/filter_models.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  ProductEntity buildProduct({
    required String id,
    required String name,
    required String category,
    String brand = 'samsung',
    Map<String, dynamic> specs = const {},
    Map<String, dynamic> specSections = const {},
    Map<String, String> keySpecs = const {},
  }) {
    return ProductEntity(
      id: id,
      name: name,
      brand: brand,
      category: category,
      subcategory: category,
      specs: specs,
      specSections: specSections,
      keySpecs: keySpecs,
      techScore: 80,
      trendScore: 70,
      lastUpdated: DateTime(2026, 1, 1),
      createdAt: DateTime(2026, 1, 1),
    );
  }

  group('category browse regressions', () {
    test('tablet OS filter reads Operating System from keySpecs', () {
      final androidTablet = buildProduct(
        id: 'android-tablet',
        name: 'Galaxy Tab',
        category: 'tablets',
        keySpecs: const {'Operating System': 'Android 15'},
      );
      final ipad = buildProduct(
        id: 'ipad',
        name: 'iPad Pro',
        category: 'tablets',
        brand: 'apple',
        keySpecs: const {'Operating System': 'iPadOS 18'},
      );

      final state = const FilterState(
        multiSelect: {
          'os': {'android'},
        },
      );

      final result = FilterApplier.apply(
        [androidTablet, ipad],
        state,
        FilterConfig.getFilters('tablets'),
      );

      expect(result.map((p) => p.id), ['android-tablet']);
    });

    test('tablet OS filter matches Platform values from spec sections', () {
      final androidTablet = buildProduct(
        id: 'platform-android',
        name: 'Xiaomi Pad',
        category: 'tablets',
        specSections: const {
          'software': {'Platform': 'Android 14, HyperOS'},
        },
      );
      final windowsTablet = buildProduct(
        id: 'windows-tablet',
        name: 'Surface Pro',
        category: 'tablets',
        brand: 'microsoft',
        specSections: const {
          'software': {'Operating System': 'Windows 11'},
        },
      );

      final state = const FilterState(
        multiSelect: {
          'os': {'android'},
        },
      );

      final result = FilterApplier.apply(
        [androidTablet, windowsTablet],
        state,
        FilterConfig.getFilters('tablets'),
      );

      expect(result.map((p) => p.id), ['platform-android']);
    });

    test('active filters exclude products with missing relevant specs', () {
      final androidTablet = buildProduct(
        id: 'android-only',
        name: 'Galaxy Tab',
        category: 'tablets',
        specSections: const {
          'software': {'Operating System': 'Android 15'},
        },
      );
      final unknownTablet = buildProduct(
        id: 'unknown-tablet',
        name: 'Mystery Tab',
        category: 'tablets',
      );

      final state = const FilterState(
        multiSelect: {
          'os': {'android'},
        },
      );

      final result = FilterApplier.apply(
        [androidTablet, unknownTablet],
        state,
        FilterConfig.getFilters('tablets'),
      );

      expect(result.map((p) => p.id), ['android-only']);
    });

    test(
      'release year is extracted from translated key specs and sections',
      () {
        final fromKeySpecs = buildProduct(
          id: 'keyspec-year',
          name: 'Phone A',
          category: 'smartphones',
          keySpecs: const {'Çıkış Yılı': '2025'},
        );
        final fromSection = buildProduct(
          id: 'section-year',
          name: 'Phone B',
          category: 'smartphones',
          specSections: const {
            'general': {'Release Year': '2024'},
          },
        );

        expect(ProductFilter.getExactReleaseYear(fromKeySpecs), 2025);
        expect(ProductFilter.getExactReleaseYear(fromSection), 2024);
      },
    );
  });
}
