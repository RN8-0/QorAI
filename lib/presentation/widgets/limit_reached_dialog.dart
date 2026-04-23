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
    'tr': 'Günlük Limit Doldu',
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
    'en':
        'You have used all your free credits for today. Upgrade to Premium for unlimited access to all AI features.',
    'tr':
        'Bugünlük ücretsiz haklarınızı kullandınız. Tüm AI özelliklerine sınırsız erişim için Premium\'a yükselin.',
    'de':
        'Sie haben heute alle kostenlosen Credits verbraucht. Upgraden Sie auf Premium fur unbegrenzten Zugang.',
    'es':
        'Has agotado tus creditos gratuitos de hoy. Actualiza a Premium para acceso ilimitado.',
    'fr':
        'Vous avez utilise tous vos credits gratuits pour aujourd\'hui. Passez a Premium pour un acces illimite.',
    'it':
        'Hai esaurito i crediti gratuiti di oggi. Passa a Premium per accesso illimitato.',
    'ja': '本日の無料クレジットを全て使い切りました。プレミアムにアップグレードして無制限アクセスを。',
    'nl':
        'Je hebt al je gratis credits voor vandaag gebruikt. Upgrade naar Premium voor onbeperkte toegang.',
    'pl':
        'Wykorzystales wszystkie darmowe kredyty na dzisiaj. Przejdz na Premium po nieograniczony dostep.',
    'pt':
        'Voce usou todos os seus creditos gratuitos de hoje. Atualize para Premium para acesso ilimitado.',
    'sv':
        'Du har anvant alla dina gratis credits for idag. Uppgradera till Premium for obegransad atkomst.',
    'ar':
        'لقد استخدمت جميع رصيدك المجاني لليوم. قم بالترقية إلى بريميوم للوصول غير المحدود.',
  },
  'goPremium': {
    'en': 'Go Premium',
    'tr': 'Premium\'a Geç',
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
    'tr': 'Ücretsiz Devam Et',
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

/// Shows the limit-reached centered dialog.
/// [featureName] is for analytics/display (optional).
void showLimitReachedDialog(BuildContext context, {String? featureName}) {
  final langCode = Localizations.localeOf(context).languageCode.toLowerCase();

  showDialog<void>(
    context: context,
    barrierColor: Colors.black.withValues(alpha: 0.45),
    builder: (ctx) => Container(
      alignment: Alignment.center,
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Dialog(
        insetPadding: EdgeInsets.zero,
        backgroundColor: Colors.transparent,
        child: Container(
          padding: const EdgeInsets.fromLTRB(24, 24, 24, 20),
          decoration: BoxDecoration(
            color: ctx.surfaceElevatedColor,
            borderRadius: BorderRadius.circular(28),
            border: Border.all(
              color: AppTheme.premiumBase.withValues(alpha: 0.18),
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.16),
                blurRadius: 28,
                offset: const Offset(0, 18),
              ),
              BoxShadow(
                color: AppTheme.premiumBase.withValues(alpha: 0.10),
                blurRadius: 20,
                offset: const Offset(0, 8),
              ),
            ],
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 72,
                height: 72,
                decoration: BoxDecoration(
                  gradient: AppTheme.premiumGradient,
                  borderRadius: BorderRadius.circular(24),
                  boxShadow: [
                    BoxShadow(
                      color: AppTheme.premiumBase.withValues(alpha: 0.28),
                      blurRadius: 20,
                      offset: const Offset(0, 10),
                    ),
                  ],
                ),
                child: const Icon(
                  Icons.workspace_premium_rounded,
                  color: Colors.white,
                  size: 34,
                ),
              ),
              const SizedBox(height: 18),
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
              Text(
                _t('limitMessage', langCode),
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 14,
                  color: ctx.textSecondary,
                  height: 1.55,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 22),
              Row(
                children: [
                  Expanded(
                    child: SizedBox(
                      height: 50,
                      child: OutlinedButton(
                        onPressed: () => Navigator.pop(ctx),
                        style: OutlinedButton.styleFrom(
                          side: BorderSide(color: ctx.dividerColor),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(16),
                          ),
                          foregroundColor: ctx.textSecondary,
                        ),
                        child: Text(
                          'Free',
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 15,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: SizedBox(
                      height: 50,
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          gradient: AppTheme.premiumGradient,
                          borderRadius: BorderRadius.circular(16),
                          boxShadow: [
                            BoxShadow(
                              color: AppTheme.premiumBase.withValues(
                                alpha: 0.22,
                              ),
                              blurRadius: 16,
                              offset: const Offset(0, 6),
                            ),
                          ],
                        ),
                        child: ElevatedButton(
                          onPressed: () {
                            Navigator.pop(ctx);
                            showPaywallSheet(context);
                          },
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Colors.transparent,
                            shadowColor: Colors.transparent,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(16),
                            ),
                          ),
                          child: Text(
                            'Premium',
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 15,
                              fontWeight: FontWeight.w800,
                              color: Colors.white,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    ),
  );
}
