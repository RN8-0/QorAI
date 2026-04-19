import 'package:compair/presentation/providers/providers.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('CompareAnalysisNotifier validation messages', () {
    test('builds invalid compare links warning in Turkish', () {
      final message = CompareAnalysisNotifier.buildInvalidCompareLinksMessage(
        'tr',
        invalidCount: 2,
      );

      expect(message, contains('⚠️'));
      expect(message, contains('2 bağlantı geçersiz'));
    });

    test('builds category mismatch warning in Turkish', () {
      final message = CompareAnalysisNotifier.buildCategoryMismatchMessage(
        'tr',
      );

      expect(message, contains('aynı kategoride değil'));
    });

    test('builds duplicate link warning in Turkish', () {
      final message = CompareAnalysisNotifier.buildDuplicateCompareLinksMessage(
        'tr',
      );

      expect(message, contains('Aynı bağlantıyı'));
      expect(message, contains('tekli analiz'));
    });

    test('normalizes category casing and whitespace', () {
      expect(
        CompareAnalysisNotifier.normalizeCompareCategory('  Gaming '),
        'gaming',
      );
      expect(CompareAnalysisNotifier.normalizeCompareCategory(''), isEmpty);
    });
  });
}
