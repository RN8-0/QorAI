import 'dart:ui';

import 'package:qor_ai/l10n/app_localizations.dart';

const Set<String> _supportedQorLanguageCodes = {
  'ar',
  'de',
  'en',
  'es',
  'fr',
  'it',
  'ja',
  'nl',
  'pl',
  'pt',
  'sv',
  'tr',
};

const Map<String, String> _dailyQResetMessages = {
  'ar': 'سيتم تحديث رصيد Q المجاني غدًا.',
  'de': 'Dein kostenloses Q-Guthaben wird morgen erneuert.',
  'en': 'Your free Q balance will refresh tomorrow.',
  'es': 'Tu saldo gratuito de Q se renovará mañana.',
  'fr': 'Votre solde gratuit de Q sera réinitialisé demain.',
  'it': 'Il tuo saldo Q gratuito si rinnoverà domani.',
  'ja': '無料のQ残高は明日リフレッシュされます。',
  'nl': 'Je gratis Q-saldo wordt morgen vernieuwd.',
  'pl': 'Twoje darmowe saldo Q odnowi się jutro.',
  'pt': 'Seu saldo gratuito de Q será renovado amanhã.',
  'sv': 'Din kostnadsfria Q-saldo fylls på i morgon.',
  'tr': 'Ücretsiz Q bakiyeniz yarın yenilenecektir.',
};

String normalizeQorLanguageCode(String? languageCode) {
  final normalized = (languageCode ?? 'en').toLowerCase().split(RegExp(r'[-_]')).first;
  return _supportedQorLanguageCodes.contains(normalized) ? normalized : 'en';
}

AppLocalizations qorLocalizationsForCode(String? languageCode) {
  return lookupAppLocalizations(Locale(normalizeQorLanguageCode(languageCode)));
}

String dailyQLimitTitle(String? languageCode) {
  return qorLocalizationsForCode(languageCode).dailyLimitReached;
}

String buildDailyQLimitMessage(String? languageCode) {
  return qorLocalizationsForCode(languageCode).dailyLimitMessage;
}

String buildDailyQResetMessage(String? languageCode) {
  final langCode = normalizeQorLanguageCode(languageCode);
  return _dailyQResetMessages[langCode] ?? _dailyQResetMessages['en']!;
}

bool isDailyQLimitMessage(String? message, String? languageCode) {
  if (message == null) return false;
  return message.trim() == buildDailyQLimitMessage(languageCode).trim();
}