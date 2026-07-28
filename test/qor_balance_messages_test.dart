import 'package:flutter_test/flutter_test.dart';
import 'package:qor_ai/core/errors.dart';
import 'package:qor_ai/core/qor_limit_messages.dart';

void main() {
  group('Q balance messages', () {
    const langs = [
      'tr',
      'en',
      'de',
      'es',
      'fr',
      'it',
      'ja',
      'nl',
      'pl',
      'pt',
      'sv',
      'ar',
    ];

    test('never mention a daily quota or a tomorrow reset', () {
      for (final lang in langs) {
        final message = buildInsufficientQMessage(lang, cost: 2, balance: 1);
        final title = insufficientQTitle(lang);
        final lower = '$message $title'.toLowerCase();
        for (final banned in const [
          'günlük',
          'gunluk',
          'daily',
          'yarın',
          'yarin',
          'tomorrow',
          'täglich',
          'taglich',
          'diario',
          'quotidien',
        ]) {
          expect(
            lower.contains(banned),
            isFalse,
            reason: '[$lang] must not talk about a daily limit: $message',
          );
        }
      }
    });

    test('states the exact cost and the exact balance', () {
      final tr = buildInsufficientQMessage('tr', cost: 2, balance: 1.5);
      expect(tr, contains('2 Q'));
      expect(tr, contains('1,5 Q'));
      final en = buildInsufficientQMessage('en', cost: 2, balance: 1.5);
      expect(en, contains('2 Q'));
      expect(en, contains('1.5 Q'));
    });

    test('are recognised by isInsufficientQMessage in every language', () {
      for (final lang in langs) {
        final message = buildInsufficientQMessage(lang, cost: 2, balance: 0);
        expect(isInsufficientQMessage(message, lang), isTrue, reason: lang);
        expect(
          isInsufficientQMessage(buildQBalanceUnavailableMessage(lang), lang),
          isFalse,
          reason: '$lang: a connection error is not an out-of-Q error',
        );
      }
    });

    test('qSpendErrorMessage maps each failure to the right sentence', () {
      const insufficient = Failure<void>(
        InsufficientQCoinsException(
          featureName: 'detail_ai',
          cost: 2,
          balance: 0,
        ),
      );
      expect(isInsufficientQMessage(qSpendErrorMessage(insufficient, 'tr'), 'tr'), isTrue);

      const offline = Failure<void>(
        NetworkException(code: 'QOR_BALANCE_UNAVAILABLE'),
      );
      expect(
        qSpendErrorMessage(offline, 'tr'),
        buildQBalanceUnavailableMessage('tr'),
      );

      const noAuth = Failure<void>(AuthException(message: 'x'));
      expect(
        qSpendErrorMessage(noAuth, 'tr'),
        buildSignInRequiredMessage('tr'),
      );
    });
  });
}
