import 'dart:ui';

import 'package:qor_ai/core/constants.dart';
import 'package:qor_ai/core/errors.dart';
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

// LIFETIME Q BALANCE MODEL — there is no daily quota and no nightly refresh.
// A signed-in user spends the Q coins granted at signup (and any later grant)
// until the balance runs out. Every string below therefore talks about the
// BALANCE, never about a "daily limit" or a "tomorrow reset".
const Map<String, String> _insufficientTitles = {
  'ar': 'رصيد Q غير كافٍ',
  'de': 'Nicht genug Q-Guthaben',
  'en': 'Not enough Q balance',
  'es': 'Saldo Q insuficiente',
  'fr': 'Solde Q insuffisant',
  'it': 'Saldo Q insufficiente',
  'ja': 'Q残高が不足しています',
  'nl': 'Onvoldoende Q-saldo',
  'pl': 'Za malo srodkow Q',
  'pt': 'Saldo Q insuficiente',
  'sv': 'Otillrackligt Q-saldo',
  'tr': 'Yetersiz Q Bakiyesi',
};

// Stable, number-free opening sentence. Used both as the human message prefix
// and as the marker that lets a screen recognise a balance error without
// string-sniffing the whole sentence.
const Map<String, String> _insufficientHeadlines = {
  'ar': 'رصيد Q غير كافٍ.',
  'de': 'Dein Q-Guthaben reicht nicht aus.',
  'en': 'Your Q balance is not enough.',
  'es': 'Tu saldo Q no es suficiente.',
  'fr': 'Votre solde Q est insuffisant.',
  'it': 'Il tuo saldo Q non e sufficiente.',
  'ja': 'Q残高が足りません。',
  'nl': 'Je Q-saldo is niet toereikend.',
  'pl': 'Twoje srodki Q sa niewystarczajace.',
  'pt': 'Seu saldo Q nao e suficiente.',
  'sv': 'Ditt Q-saldo racker inte.',
  'tr': 'Q bakiyeniz yetersiz.',
};

String _detailSentence(String lang, String cost, String balance) {
  return switch (lang) {
    'ar' => 'تكلفة هذه العملية $cost Q ورصيدك $balance Q. للاستخدام غير المحدود انتقل إلى بريميوم.',
    'de' =>
      'Diese Aktion kostet $cost Q, dein Guthaben betragt $balance Q. Fur unbegrenzte AI-Nutzung hol dir Premium.',
    'en' =>
      'This action costs $cost Q and your balance is $balance Q. Go Premium for unlimited AI.',
    'es' =>
      'Esta accion cuesta $cost Q y tu saldo es $balance Q. Hazte Premium para IA ilimitada.',
    'fr' =>
      'Cette action coute $cost Q et votre solde est de $balance Q. Passez a Premium pour une IA illimitee.',
    'it' =>
      'Questa azione costa $cost Q e il tuo saldo e $balance Q. Passa a Premium per AI illimitata.',
    'ja' => 'この操作には $cost Q が必要ですが、残高は $balance Q です。無制限のAIはプレミアムでご利用ください。',
    'nl' =>
      'Deze actie kost $cost Q en je saldo is $balance Q. Ga Premium voor onbeperkte AI.',
    'pl' =>
      'Ta akcja kosztuje $cost Q, a Twoje saldo to $balance Q. Wybierz Premium, aby korzystac z AI bez limitu.',
    'pt' =>
      'Esta acao custa $cost Q e seu saldo e $balance Q. Assine o Premium para IA ilimitada.',
    'sv' =>
      'Den har atgarden kostar $cost Q och ditt saldo ar $balance Q. Skaffa Premium for obegransad AI.',
    'tr' =>
      'Bu işlem $cost Q, bakiyeniz $balance Q. Sınırsız AI için Premium\'a geçebilirsiniz.',
    _ =>
      'This action costs $cost Q and your balance is $balance Q. Go Premium for unlimited AI.',
  };
}

const Map<String, String> _balanceUnavailableMessages = {
  'ar': 'تعذر التحقق من رصيد Q. تحقق من اتصالك وحاول مرة أخرى.',
  'de': 'Q-Guthaben konnte nicht gepruft werden. Prufe deine Verbindung und versuche es erneut.',
  'en': 'Could not verify your Q balance. Check your connection and try again.',
  'es': 'No se pudo verificar tu saldo Q. Revisa tu conexion e intentalo de nuevo.',
  'fr': 'Impossible de verifier votre solde Q. Verifiez votre connexion et reessayez.',
  'it': 'Impossibile verificare il saldo Q. Controlla la connessione e riprova.',
  'ja': 'Q残高を確認できませんでした。接続を確認して再試行してください。',
  'nl': 'Kon je Q-saldo niet controleren. Controleer je verbinding en probeer opnieuw.',
  'pl': 'Nie udalo sie sprawdzic salda Q. Sprawdz polaczenie i sprobuj ponownie.',
  'pt': 'Nao foi possivel verificar seu saldo Q. Verifique sua conexao e tente novamente.',
  'sv': 'Kunde inte kontrollera ditt Q-saldo. Kontrollera anslutningen och forsok igen.',
  'tr': 'Q bakiyeniz doğrulanamadı. Bağlantınızı kontrol edip tekrar deneyin.',
};

const Map<String, String> _signInRequiredMessages = {
  'ar': 'سجّل الدخول لاستخدام ميزات الذكاء الاصطناعي.',
  'de': 'Melde dich an, um AI-Funktionen zu nutzen.',
  'en': 'Sign in to use AI features.',
  'es': 'Inicia sesion para usar las funciones de IA.',
  'fr': 'Connectez-vous pour utiliser les fonctions IA.',
  'it': 'Accedi per usare le funzioni AI.',
  'ja': 'AI機能を使うにはサインインしてください。',
  'nl': 'Log in om AI-functies te gebruiken.',
  'pl': 'Zaloguj sie, aby korzystac z funkcji AI.',
  'pt': 'Entre para usar os recursos de IA.',
  'sv': 'Logga in for att anvanda AI-funktioner.',
  'tr': 'AI özelliklerini kullanmak için giriş yapın.',
};

const Map<String, String> _closeLabels = {
  'ar': 'إغلاق',
  'de': 'Schliessen',
  'en': 'Close',
  'es': 'Cerrar',
  'fr': 'Fermer',
  'it': 'Chiudi',
  'ja': '閉じる',
  'nl': 'Sluiten',
  'pl': 'Zamknij',
  'pt': 'Fechar',
  'sv': 'Stang',
  'tr': 'Kapat',
};

String normalizeQorLanguageCode(String? languageCode) {
  final normalized = (languageCode ?? 'en').toLowerCase().split(RegExp(r'[-_]')).first;
  return _supportedQorLanguageCodes.contains(normalized) ? normalized : 'en';
}

AppLocalizations qorLocalizationsForCode(String? languageCode) {
  return lookupAppLocalizations(Locale(normalizeQorLanguageCode(languageCode)));
}

/// Dialog title for "you ran out of Q".
String insufficientQTitle(String? languageCode) {
  final lang = normalizeQorLanguageCode(languageCode);
  return _insufficientTitles[lang] ?? _insufficientTitles['en']!;
}

/// Number-free opening sentence — also the recognition marker.
String insufficientQHeadline(String? languageCode) {
  final lang = normalizeQorLanguageCode(languageCode);
  return _insufficientHeadlines[lang] ?? _insufficientHeadlines['en']!;
}

/// Full user-facing sentence: what the action costs and what is left.
String buildInsufficientQMessage(
  String? languageCode, {
  required num cost,
  required num balance,
}) {
  final lang = normalizeQorLanguageCode(languageCode);
  final costText = AppConstants.formatQorAmount(cost, languageCode: lang);
  final balanceText = AppConstants.formatQorAmount(balance, languageCode: lang);
  return '${insufficientQHeadline(lang)} ${_detailSentence(lang, costText, balanceText)}';
}

/// Shown when the balance could not be read from the server (offline / blip).
/// This is NOT a paywall — the user is asked to retry, not to upgrade.
String buildQBalanceUnavailableMessage(String? languageCode) {
  final lang = normalizeQorLanguageCode(languageCode);
  return _balanceUnavailableMessages[lang] ?? _balanceUnavailableMessages['en']!;
}

String buildSignInRequiredMessage(String? languageCode) {
  final lang = normalizeQorLanguageCode(languageCode);
  return _signInRequiredMessages[lang] ?? _signInRequiredMessages['en']!;
}

String qorCloseLabel(String? languageCode) {
  final lang = normalizeQorLanguageCode(languageCode);
  return _closeLabels[lang] ?? _closeLabels['en']!;
}

/// True when [message] is one of the balance errors produced above, so a screen
/// can route it to the dialog instead of rendering it as an inline error.
bool isInsufficientQMessage(String? message, String? languageCode) {
  if (message == null) return false;
  return message.trim().startsWith(insufficientQHeadline(languageCode));
}

/// Turns a failed `spendQCoins()` result into the right user-facing sentence:
/// the exact cost/balance when the user really is out of Q, a retry hint when
/// the balance simply could not be read.
String qSpendErrorMessage(Result<void> result, String? languageCode) {
  final error = result is Failure<void> ? result.error : null;
  if (error is InsufficientQCoinsException) {
    return buildInsufficientQMessage(
      languageCode,
      cost: error.cost,
      balance: error.balance,
    );
  }
  if (error is AuthException) return buildSignInRequiredMessage(languageCode);
  return buildQBalanceUnavailableMessage(languageCode);
}
