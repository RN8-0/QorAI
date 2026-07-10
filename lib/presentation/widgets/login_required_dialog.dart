/// Qor AI — Login Required Dialog
/// Shows when a guest user tries to use AI features.
library;

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:qor_ai/core/theme.dart';
import 'package:qor_ai/core/pb_client.dart' as pb_client;
import 'package:qor_ai/routing/router.dart';

/// Returns `true` if user is logged in, `false` otherwise.
/// When not logged in, sends the user straight to the sign-in screen
/// (no intermediate "sign in required" dialog — user request).
bool requireAuth(BuildContext context) {
  if (pb_client.pb.authStore.isValid) return true;
  context.push(AppRoutes.login);
  return false;
}

void showLoginRequiredDialog(BuildContext context) {
  final isTr = Localizations.localeOf(context).languageCode == 'tr';
  showDialog(
    context: context,
    barrierColor: Colors.black.withValues(alpha: 0.62),
    builder: (ctx) => Dialog(
      insetPadding: const EdgeInsets.symmetric(horizontal: 28),
      backgroundColor: Colors.transparent,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 18),
        decoration: BoxDecoration(
          color: ctx.surfaceVariantColor,
          borderRadius: BorderRadius.circular(24),
          border: Border.all(
            color: AppTheme.accentCyan.withValues(alpha: 0.20),
          ),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.35),
              blurRadius: 34,
              offset: const Offset(0, 16),
            ),
            BoxShadow(
              color: AppTheme.accentCyan.withValues(alpha: 0.12),
              blurRadius: 30,
            ),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Align(
              alignment: Alignment.center,
              child: Container(
                width: 64,
                height: 64,
                decoration: BoxDecoration(
                  gradient: AppTheme.primaryGradient,
                  borderRadius: BorderRadius.circular(20),
                  boxShadow: [
                    BoxShadow(
                      color: AppTheme.accentCyan.withValues(alpha: 0.35),
                      blurRadius: 22,
                      offset: const Offset(0, 8),
                    ),
                  ],
                ),
                child: const Icon(
                  Icons.lock_outline_rounded,
                  color: Colors.white,
                  size: 30,
                ),
              ),
            ),
            const SizedBox(height: 18),
            Text(
              isTr ? 'Giriş gerekli' : 'Sign in required',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: ctx.textPrimary,
                fontSize: 19,
                height: 1.15,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              isTr
                  ? 'Qor AI analizleri, sohbet ve kişisel öneriler hesabınıza kaydedilir. Devam etmek için giriş yapın.'
                  : 'Qor AI analyses, chat and personal recommendations are saved to your account. Sign in to continue.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: ctx.textSecondary,
                fontSize: 13.5,
                height: 1.45,
              ),
            ),
            const SizedBox(height: 20),
            Row(
              children: [
                Expanded(
                  child: TextButton(
                    onPressed: () => Navigator.of(ctx).pop(),
                    style: TextButton.styleFrom(
                      foregroundColor: ctx.textTertiaryColor,
                      minimumSize: const Size(0, 48),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16),
                      ),
                    ),
                    child: Text(isTr ? 'Daha sonra' : 'Not now'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: FilledButton(
                    onPressed: () {
                      Navigator.of(ctx).pop();
                      context.go(AppRoutes.login);
                    },
                    style: FilledButton.styleFrom(
                      minimumSize: const Size(0, 48),
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16),
                      ),
                      backgroundColor: AppTheme.accentCyan,
                      textStyle: const TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 16,
                      ),
                    ),
                    child: Text(
                      isTr ? 'Giriş yap' : 'Sign in',
                      style: const TextStyle(color: Colors.white),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    ),
  );
}
