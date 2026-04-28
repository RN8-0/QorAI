/// Qor AI — Email Verification Gate
/// AI özelliklerine erişimden önce kullanıcının e-posta doğrulamasını kontrol eder.
library;

import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:qor_ai/core/errors.dart';
import 'package:qor_ai/core/theme.dart';
import 'package:qor_ai/domain/entities/user_entity.dart';
import 'package:qor_ai/l10n/app_localizations.dart';
import 'package:qor_ai/presentation/providers/providers.dart';

/// Mevcut kullanıcı AI özelliklerini kullanmak için gerekli e-posta
/// doğrulamasına sahip mi? Anonim guest hesaplar her zaman geçer.
bool isUserAllowedForAi(UserEntity? user) {
  if (user == null) return false;
  return !user.requiresEmailVerification;
}

/// Bir AI özelliği tetiklemeden önce çağır. Kullanıcı doğrulanmamışsa
/// modal diyalog gösterir ve `false` döner. Doğrulanmışsa `true` döner.
Future<bool> ensureEmailVerified(BuildContext context, WidgetRef ref) async {
  final user = ref.read(userProfileProvider).valueOrNull;
  if (isUserAllowedForAi(user)) return true;
  if (user == null) return false; // No session — caller handles login
  await showDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (_) => _EmailVerificationDialog(email: user.email),
  );
  // Diyalog kapandıktan sonra kullanıcı doğrulamış olabilir → tekrar oku
  final refreshed = ref.read(userProfileProvider).valueOrNull;
  return isUserAllowedForAi(refreshed);
}

class _EmailVerificationDialog extends ConsumerStatefulWidget {
  final String email;
  const _EmailVerificationDialog({required this.email});

  @override
  ConsumerState<_EmailVerificationDialog> createState() =>
      _EmailVerificationDialogState();
}

class _EmailVerificationDialogState
    extends ConsumerState<_EmailVerificationDialog> {
  bool _resending = false;
  bool _checking = false;
  int _resendCooldown = 0;
  Timer? _cooldownTimer;
  String? _statusMessage;
  bool _statusIsError = false;

  @override
  void dispose() {
    _cooldownTimer?.cancel();
    super.dispose();
  }

  void _startCooldown() {
    _resendCooldown = 60;
    _cooldownTimer?.cancel();
    _cooldownTimer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) {
        t.cancel();
        return;
      }
      setState(() {
        _resendCooldown--;
        if (_resendCooldown <= 0) t.cancel();
      });
    });
  }

  Future<void> _resend() async {
    if (_resending || _resendCooldown > 0) return;
    setState(() {
      _resending = true;
      _statusMessage = null;
    });
    HapticFeedback.lightImpact();
    final result = await ref
        .read(authRepositoryProvider)
        .resendVerificationEmail(widget.email);
    if (!mounted) return;
    setState(() {
      _resending = false;
      result.when(
        success: (_) {
          _statusMessage =
              AppLocalizations.of(context)?.verificationEmailSent ??
              'Verification email sent. Check your inbox.';
          _statusIsError = false;
          _startCooldown();
        },
        failure: (e) {
          _statusMessage = e.message;
          _statusIsError = true;
        },
      );
    });
  }

  Future<void> _checkVerified() async {
    if (_checking) return;
    setState(() {
      _checking = true;
      _statusMessage = null;
    });
    HapticFeedback.lightImpact();
    try {
      // PocketBase auth refresh — kullanıcı record'unu yeniden çek
      await ref.read(authRepositoryProvider).refreshSession();
    } catch (_) {}
    if (!mounted) return;
    // userProfileProvider eski değeri cache'liyor olabilir → invalidate edip
    // yeni record'u beklemeden read'lersek `verified=false` görünür ve dialog
    // kapanmaz. Provider'ı invalidate edip future'ını await ediyoruz.
    ref.invalidate(userProfileProvider);
    UserEntity? user;
    try {
      user = await ref.read(userProfileProvider.future);
    } catch (_) {
      user = ref.read(userProfileProvider).valueOrNull;
    }
    if (!mounted) return;
    if (user != null && !user.requiresEmailVerification) {
      Navigator.of(context).pop();
      return;
    }
    setState(() {
      _checking = false;
      _statusMessage =
          AppLocalizations.of(context)?.notVerifiedYet ??
          "Doesn't seem verified yet. Open the mail and click the link.";
      _statusIsError = true;
    });
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final surface = isDark ? const Color(0xFF101820) : Colors.white;
    final textPrimary = isDark ? Colors.white : const Color(0xFF0F1722);
    final textSecondary = isDark
        ? Colors.white.withValues(alpha: 0.72)
        : const Color(0xFF4A5568);

    return Dialog(
      backgroundColor: surface,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      insetPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 24),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 420),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(22, 24, 22, 18),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(
                  width: 64,
                  height: 64,
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [AppTheme.brandBlue, AppTheme.brandCyan],
                    ),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: const Icon(
                    Icons.mark_email_read_rounded,
                    color: Colors.white,
                    size: 32,
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Text(
                l?.emailVerificationRequired ?? 'Email verification required',
                textAlign: TextAlign.center,
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: textPrimary,
                ),
              ),
              const SizedBox(height: 10),
              Text(
                l?.emailVerificationBody ??
                    'Verify your email to use AI features. We sent a verification link to:',
                textAlign: TextAlign.center,
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 13.5,
                  height: 1.45,
                  color: textSecondary,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                l?.emailSpamNote ??
                    "If the mail doesn't arrive within a few minutes, please also check your Spam / Junk folder.",
                textAlign: TextAlign.center,
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 11.5,
                  height: 1.4,
                  fontStyle: FontStyle.italic,
                  color: textSecondary.withValues(alpha: 0.85),
                ),
              ),
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 10,
                ),
                decoration: BoxDecoration(
                  color: AppTheme.brandBlue.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                    color: AppTheme.brandBlue.withValues(alpha: 0.2),
                  ),
                ),
                child: Text(
                  widget.email,
                  textAlign: TextAlign.center,
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.brandBlue,
                  ),
                ),
              ),
              if (_statusMessage != null) ...[
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 10,
                  ),
                  decoration: BoxDecoration(
                    color: (_statusIsError ? Colors.red : Colors.green)
                        .withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Row(
                    children: [
                      Icon(
                        _statusIsError
                            ? Icons.error_outline_rounded
                            : Icons.check_circle_outline_rounded,
                        size: 18,
                        color: _statusIsError ? Colors.red : Colors.green,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          _statusMessage!,
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 12.5,
                            color: textPrimary,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
              const SizedBox(height: 18),
              SizedBox(
                height: 46,
                child: ElevatedButton(
                  onPressed: _checking ? null : _checkVerified,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.brandBlue,
                    foregroundColor: Colors.white,
                    elevation: 0,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  child: _checking
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : Text(
                          l?.checkVerification ?? 'Check verification',
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                ),
              ),
              const SizedBox(height: 8),
              SizedBox(
                height: 42,
                child: TextButton(
                  onPressed: (_resending || _resendCooldown > 0)
                      ? null
                      : _resend,
                  style: TextButton.styleFrom(
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  child: _resending
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : Text(
                          _resendCooldown > 0
                              ? (l?.resendEmailCooldown(_resendCooldown) ??
                                  'Resend (${_resendCooldown}s)')
                              : (l?.resendEmail ?? 'Resend email'),
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 13.5,
                            fontWeight: FontWeight.w600,
                            color: AppTheme.brandBlue,
                          ),
                        ),
                ),
              ),
              const SizedBox(height: 4),
              TextButton(
                onPressed: () => Navigator.of(context).pop(),
                child: Text(
                  l?.cancel ?? 'Cancel',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 13,
                    color: textSecondary,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
