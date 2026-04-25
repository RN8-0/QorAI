/// Qor AI — Email Verify Screen
/// Deep link'ten token alıp e-posta doğrulaması yapan ekran.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:pocketbase/pocketbase.dart';
import 'package:qor_ai/core/pb_client.dart';
import 'package:qor_ai/core/theme.dart';
import 'package:qor_ai/routing/router.dart';

class EmailVerifyScreen extends ConsumerStatefulWidget {
  final String token;
  const EmailVerifyScreen({super.key, required this.token});

  @override
  ConsumerState<EmailVerifyScreen> createState() => _EmailVerifyScreenState();
}

class _EmailVerifyScreenState extends ConsumerState<EmailVerifyScreen> {
  _VerifyState _state = _VerifyState.loading;
  String _errorMessage = '';

  @override
  void initState() {
    super.initState();
    _verify();
  }

  Future<void> _verify() async {
    if (widget.token.isEmpty) {
      setState(() {
        _state = _VerifyState.error;
        _errorMessage = '';
      });
      return;
    }
    try {
      await pb.collection('users').confirmVerification(widget.token);
      if (!mounted) return;
      setState(() => _state = _VerifyState.success);
      await Future.delayed(const Duration(seconds: 2));
      if (!mounted) return;
      context.go(AppRoutes.home);
    } on ClientException catch (e) {
      if (!mounted) return;
      setState(() {
        _state = _VerifyState.error;
        _errorMessage = e.response['message']?.toString() ?? '';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _state = _VerifyState.error;
        _errorMessage = e.toString();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Scaffold(
      backgroundColor: context.backgroundColor,
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (_state == _VerifyState.loading) ...[
                const SizedBox(
                  width: 56,
                  height: 56,
                  child: CircularProgressIndicator(
                    strokeWidth: 3,
                    color: AppTheme.neonCyan,
                  ),
                ),
                const SizedBox(height: 24),
                Text(
                  l?.verifyingEmail ?? 'Verifying email...',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    color: context.textPrimary,
                  ),
                ),
              ] else if (_state == _VerifyState.success) ...[
                Container(
                  width: 80,
                  height: 80,
                  decoration: BoxDecoration(
                    color: AppTheme.success.withValues(alpha: 0.15),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(
                    Icons.check_circle_rounded,
                    color: AppTheme.success,
                    size: 44,
                  ),
                ),
                const SizedBox(height: 24),
                Text(
                  l?.emailVerifiedTitle ?? 'Email Verified!',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 22,
                    fontWeight: FontWeight.w800,
                    color: context.textPrimary,
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  l?.emailVerifiedSubtitle ??
                      'Your email has been successfully verified. Redirecting to home...',
                  textAlign: TextAlign.center,
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 15,
                    color: context.textSecondary,
                  ),
                ),
              ] else ...[
                Container(
                  width: 80,
                  height: 80,
                  decoration: BoxDecoration(
                    color: AppTheme.error.withValues(alpha: 0.15),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(
                    Icons.error_outline_rounded,
                    color: AppTheme.error,
                    size: 44,
                  ),
                ),
                const SizedBox(height: 24),
                Text(
                  l?.verificationFailedTitle ?? 'Verification Failed',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 22,
                    fontWeight: FontWeight.w800,
                    color: context.textPrimary,
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  _errorMessage.isNotEmpty
                      ? _errorMessage
                      : (widget.token.isEmpty
                          ? (l?.invalidVerificationLink ?? 'Invalid verification link.')
                          : (l?.verificationExpired ??
                              'Verification failed. The link may have expired.')),
                  textAlign: TextAlign.center,
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 15,
                    color: context.textSecondary,
                  ),
                ),
                const SizedBox(height: 28),
                FilledButton(
                  onPressed: () => context.go(AppRoutes.login),
                  style: FilledButton.styleFrom(
                    backgroundColor: AppTheme.neonCyan,
                    foregroundColor: Colors.black,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 32,
                      vertical: 14,
                    ),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                  child: Text(
                    l?.signIn ?? 'Sign In',
                    style: GoogleFonts.plusJakartaSans(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

enum _VerifyState { loading, success, error }
