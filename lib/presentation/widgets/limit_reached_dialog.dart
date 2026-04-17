/// Compair — Limit Reached Dialog
/// Shown when a free user exhausts their daily limit for any feature.
/// Offers "Go Premium" and "Continue Free" options, fully localized.
library;

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:compair/core/theme.dart';
import 'package:compair/presentation/widgets/paywall_sheet.dart';

const Map<String, Map<String, String>> _limitDialogTranslations = {
  'dailyLimitReached': {
    'en': 'Daily Limit Reached',
    'tr': 'Gunluk Limit Doldu',
    'de': 'Tageslimit erreicht',
    'es': 'Limite diario alcanzado',
    'fr': 'Limite quotidienne atteinte',
    'it': 'Limite giornaliero raggiunto',
    'ja': '1日の利用上限に達しました',
    'nl': 'Dagelijkse limiet bereikt',
    'pl': 'Osiagnieto dzienny limit',
    'pt': 'Limite diario atingido',
    'sv': 'Daglig grans uppnadd',
    'ar': 'تم الوصول للحد اليومي',
  },
  'limitMessage': {
    'en': 'You have used all your free credits for today. Upgrade to Premium for unlimited access to all AI features.',
    'tr': 'Bugunluk ucretsiz haklarinizi kullandiniz. Tum AI ozelliklerine sinirsiz erisim icin Premium\'a yukselin.',
    'de': 'Sie haben heute alle kostenlosen Credits verbraucht. Upgraden Sie auf Premium fur unbegrenzten Zugang.',
    'es': 'Has agotado tus creditos gratuitos de hoy. Actualiza a Premium para acceso ilimitado.',
    'fr': 'Vous avez utilise tous vos credits gratuits pour aujourd\'hui. Passez a Premium pour un acces illimite.',
    'it': 'Hai esaurito i crediti gratuiti di oggi. Passa a Premium per accesso illimitato.',
    'ja': '本日の無料クレジットを全て使い切りました。プレミアムにアップグレードして無制限アクセスを。',
    'nl': 'Je hebt al je gratis credits voor vandaag gebruikt. Upgrade naar Premium voor onbeperkte toegang.',
    'pl': 'Wykorzystales wszystkie darmowe kredyty na dzisiaj. Przejdz na Premium po nieograniczony dostep.',
    'pt': 'Voce usou todos os seus creditos gratuitos de hoje. Atualize para Premium para acesso ilimitado.',
    'sv': 'Du har anvant alla dina gratis credits for idag. Uppgradera till Premium for obegransad atkomst.',
    'ar': 'لقد استخدمت جميع رصيدك المجاني لليوم. قم بالترقية إلى بريميوم للوصول غير المحدود.',
  },
  'goPremium': {
    'en': 'Go Premium',
    'tr': 'Premium\'a Gec',
    'de': 'Premium holen',
    'es': 'Hacerse Premium',
    'fr': 'Passer Premium',
    'it': 'Passa a Premium',
    'ja': 'プレミアムへ',
    'nl': 'Premium worden',
    'pl': 'Przejdz na Premium',
    'pt': 'Ir para Premium',
    'sv': 'Bli Premium',
    'ar': 'الترقية لبريميوم',
  },
  'continueFree': {
    'en': 'Continue Free',
    'tr': 'Ucretsiz Devam Et',
    'de': 'Kostenlos fortfahren',
    'es': 'Continuar gratis',
    'fr': 'Continuer gratuitement',
    'it': 'Continua gratis',
    'ja': '無料で続ける',
    'nl': 'Gratis doorgaan',
    'pl': 'Kontynuuj za darmo',
    'pt': 'Continuar gratis',
    'sv': 'Fortsatt gratis',
    'ar': 'متابعة مجانية',
  },
};

String _t(String key, String langCode) {
  return _limitDialogTranslations[key]?[langCode] ??
      _limitDialogTranslations[key]?['en'] ??
      key;
}

/// Shows the limit-reached bottom sheet.
/// [featureName] is for analytics/display (optional).
void showLimitReachedDialog(BuildContext context, {String? featureName}) {
  final langCode =
      Localizations.localeOf(context).languageCode.toLowerCase();

  showModalBottomSheet(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    builder: (ctx) => Container(
      padding: EdgeInsets.only(
        left: 24,
        right: 24,
        top: 24,
        bottom: MediaQuery.of(ctx).viewInsets.bottom + 32,
      ),
      decoration: BoxDecoration(
        color: ctx.surfaceElevatedColor,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
        border: Border.all(
          color: AppTheme.premiumBase.withValues(alpha: 0.15),
        ),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Handle bar
          Container(
            width: 40,
            height: 4,
            margin: const EdgeInsets.only(bottom: 20),
            decoration: BoxDecoration(
              color: ctx.dividerColor,
              borderRadius: BorderRadius.circular(2),
            ),
          ),

          // Icon
          Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(
              gradient: AppTheme.premiumGradient,
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(
                  color: AppTheme.premiumBase.withValues(alpha: 0.3),
                  blurRadius: 20,
                  offset: const Offset(0, 8),
                ),
              ],
            ),
            child: const Icon(
              Icons.lock_clock_rounded,
              color: Colors.white,
              size: 28,
            ),
          ),
          const SizedBox(height: 16),

          // Title
          Text(
            _t('dailyLimitReached', langCode),
            style: GoogleFonts.plusJakartaSans(
              fontSize: 22,
              fontWeight: FontWeight.w800,
              color: ctx.textPrimary,
              letterSpacing: -0.3,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 10),

          // Message
          Text(
            _t('limitMessage', langCode),
            style: GoogleFonts.plusJakartaSans(
              fontSize: 14,
              color: ctx.textSecondary,
              height: 1.5,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 24),

          // Go Premium button
          SizedBox(
            width: double.infinity,
            height: 52,
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: AppTheme.premiumGradient,
                borderRadius: BorderRadius.circular(16),
                boxShadow: [
                  BoxShadow(
                    color: AppTheme.premiumBase.withValues(alpha: 0.25),
                    blurRadius: 16,
                    offset: const Offset(0, 6),
                  ),
                ],
              ),
              child: ElevatedButton.icon(
                onPressed: () {
                  Navigator.pop(ctx);
                  showPaywallSheet(context);
                },
                icon: const Icon(
                  Icons.diamond_rounded,
                  color: Colors.white,
                  size: 18,
                ),
                label: Text(
                  _t('goPremium', langCode),
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: Colors.white,
                  ),
                ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.transparent,
                  shadowColor: Colors.transparent,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(height: 10),

          // Continue Free button
          SizedBox(
            width: double.infinity,
            height: 48,
            child: TextButton(
              onPressed: () => Navigator.pop(ctx),
              style: TextButton.styleFrom(
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                  side: BorderSide(color: ctx.dividerColor),
                ),
              ),
              child: Text(
                _t('continueFree', langCode),
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: ctx.textSecondary,
                ),
              ),
            ),
          ),
        ],
      ),
    ),
  );
}
