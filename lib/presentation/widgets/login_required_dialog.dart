/// Compair — Login Required Dialog
/// Shows when a guest user tries to use AI features.
library;

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:compair/core/theme.dart';
import 'package:compair/core/pb_client.dart' as pb_client;
import 'package:compair/routing/router.dart';

/// Returns `true` if user is logged in, `false` otherwise.
/// When not logged in, shows a dialog prompting sign-in.
bool requireAuth(BuildContext context) {
  if (pb_client.pb.authStore.isValid) return true;
  showLoginRequiredDialog(context);
  return false;
}

void showLoginRequiredDialog(BuildContext context) {
  final isTr = Localizations.localeOf(context).languageCode == 'tr';
  showDialog(
    context: context,
    builder: (ctx) => AlertDialog(
      backgroundColor: ctx.surfaceColor,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      icon: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [AppTheme.accentTeal, Color(0xFF14B8A6)],
          ),
          borderRadius: BorderRadius.circular(16),
        ),
        child: const Icon(Icons.lock_outline_rounded, color: Colors.white, size: 28),
      ),
      title: Text(
        isTr ? 'Giriş Gerekli' : 'Sign In Required',
        style: TextStyle(
          color: ctx.textPrimary,
          fontWeight: FontWeight.bold,
        ),
      ),
      content: Text(
        isTr
            ? 'AI özelliklerini kullanmak için lütfen giriş yapın.'
            : 'Please sign in to use AI features.',
        style: TextStyle(color: ctx.textSecondary),
        textAlign: TextAlign.center,
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(ctx).pop(),
          child: Text(
            isTr ? 'İptal' : 'Cancel',
            style: TextStyle(color: ctx.textTertiaryColor),
          ),
        ),
        FilledButton(
          onPressed: () {
            Navigator.of(ctx).pop();
            context.go(AppRoutes.login);
          },
          style: FilledButton.styleFrom(
            backgroundColor: AppTheme.accentTeal,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
          child: Text(
            isTr ? 'Giriş Yap' : 'Sign In',
            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
          ),
        ),
      ],
    ),
  );
}
