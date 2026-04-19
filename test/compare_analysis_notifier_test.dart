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

    test('builds category mismatch warning with detected categories', () {
      final message = CompareAnalysisNotifier.buildCategoryMismatchMessage(
        'tr',
        {'gaming', 'jewelry'},
      );

      expect(message, contains('aynı kategoride değil'));
      expect(message, contains('gaming'));
      expect(message, contains('jewelry'));
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
