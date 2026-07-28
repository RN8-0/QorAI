/// Qor AI — Insufficient Q Balance Dialog
/// Shown when the signed-in user's Q balance cannot cover an AI action.
/// There is NO daily quota in this app: the balance is granted at signup and
/// spent until it runs out, so this dialog only ever talks about the balance.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:qor_ai/core/constants.dart';
import 'package:qor_ai/core/errors.dart';
import 'package:qor_ai/core/qor_limit_messages.dart';
import 'package:qor_ai/core/theme.dart';
import 'package:qor_ai/presentation/providers/providers.dart';
import 'package:qor_ai/presentation/widgets/paywall_sheet.dart';

/// Shows the "not enough Q" centered dialog.
/// [feature] is the credit-cost key (e.g. `detail_ai`) so the exact price of
/// the blocked action can be shown.
void showInsufficientQDialog(
  BuildContext context,
  WidgetRef ref, {
  required String feature,
}) {
  final langCode = normalizeQorLanguageCode(
    Localizations.localeOf(context).languageCode,
  );
  final l10n = qorLocalizationsForCode(langCode);
  final sub = ref.read(subscriptionServiceProvider);
  final cost = AppConstants.creditCostForFeature(feature);
  final balance = sub.qBalance < 0 ? 0.0 : sub.qBalance;

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
                insufficientQTitle(langCode),
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
                buildInsufficientQMessage(
                  langCode,
                  cost: cost,
                  balance: balance,
                ),
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
                          qorCloseLabel(langCode),
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
                            l10n.premium,
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

/// Non-paywall failure (balance could not be read / not signed in). Shows a
/// retry hint instead of pushing Premium — the user is not out of Q, we just
/// could not check.
void showQBalanceUnavailableSnack(BuildContext context, {Object? error}) {
  final langCode = normalizeQorLanguageCode(
    Localizations.localeOf(context).languageCode,
  );
  final text = error is AuthException
      ? buildSignInRequiredMessage(langCode)
      : buildQBalanceUnavailableMessage(langCode);
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(
      content: Text(text),
      behavior: SnackBarBehavior.floating,
      backgroundColor: AppTheme.error,
    ),
  );
}

/// Routes a failed `spendQCoins()` result to the right UI: the paywall dialog
/// for a real "out of Q", a retry snackbar for anything else (offline, auth).
void showQSpendFailure(
  BuildContext context,
  WidgetRef ref, {
  required String feature,
  required Result<void> result,
}) {
  final error = result is Failure<void> ? result.error : null;
  if (error is InsufficientQCoinsException || error == null) {
    showInsufficientQDialog(context, ref, feature: feature);
    return;
  }
  showQBalanceUnavailableSnack(context, error: error);
}
