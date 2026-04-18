import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:compair/core/theme.dart';
import 'package:compair/core/errors.dart';
import 'package:compair/presentation/providers/providers.dart';
import 'package:compair/presentation/screens/quiz/quiz_screen.dart';
import 'package:compair/routing/router.dart';
import 'package:cached_network_image/cached_network_image.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  bool _isLoading = false;
  final Set<String> _prefetchedQuizCoverUrls = <String>{};

  void _showError(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        behavior: SnackBarBehavior.floating,
        backgroundColor: AppTheme.error,
        margin: const EdgeInsets.all(20),
        duration: const Duration(seconds: 8),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
  }

  Future<void> _navigateAfterLogin(bool quizCompleted) async {
    if (quizCompleted) {
      context.go(AppRoutes.home);
    } else {
      setState(() => _isLoading = true);
      try {
        final covers = await ref.read(quizCategoryVisualsProvider.future);
        await _prefetchQuizCovers(covers.values);
      } finally {
        if (mounted) {
          setState(() => _isLoading = false);
        }
      }
      if (!mounted) return;
      context.go(AppRoutes.quiz);
    }
  }

  Future<void> _prefetchQuizCovers(Iterable<String> urls) async {
    final pending = urls
        .map((url) => url.trim())
        .where((url) => url.isNotEmpty)
        .where(_prefetchedQuizCoverUrls.add)
        .toList(growable: false);
    if (pending.isEmpty) return;

    await Future.wait(
      pending.map(
        (url) => precacheImage(CachedNetworkImageProvider(url), context).catchError((_) {}),
      ),
    );
  }

  Future<void> _signInWithGoogle() async {
    setState(() => _isLoading = true);
    final result = await ref.read(authRepositoryProvider).signInWithGoogle();
    if (!mounted) return;
    setState(() => _isLoading = false);

    switch (result) {
      case Success(data: final user):
        _navigateAfterLogin(user.quizCompleted);
      case Failure(error: final error):
        _showError(error.message);
    }
  }

  Future<void> _signInWithApple() async {
    setState(() => _isLoading = true);
    final result = await ref.read(authRepositoryProvider).signInWithApple();
    if (!mounted) return;
    setState(() => _isLoading = false);

    switch (result) {
      case Success(data: final user):
        _navigateAfterLogin(user.quizCompleted);
      case Failure(error: final error):
        _showError(error.message);
    }
  }

  Future<void> _signInWithFacebook() async {
    setState(() => _isLoading = true);
    final result = await ref.read(authRepositoryProvider).signInWithFacebook();
    if (!mounted) return;
    setState(() => _isLoading = false);

    switch (result) {
      case Success(data: final user):
        _navigateAfterLogin(user.quizCompleted);
      case Failure(error: final error):
        _showError(error.message);
    }
  }

  Future<void> _signInWithX() async {
    setState(() => _isLoading = true);
    final result = await ref.read(authRepositoryProvider).signInWithX();
    if (!mounted) return;
    setState(() => _isLoading = false);

    switch (result) {
      case Success(data: final user):
        _navigateAfterLogin(user.quizCompleted);
      case Failure(error: final error):
        _showError(error.message);
    }
  }

  Future<void> _launchUrl(String url) async {
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  // ─── BUILD ───────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.backgroundColor,
      body: Stack(
        children: [
          SafeArea(
            child: _buildWelcomeScreen(),
          ),
          // Back button overlay
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.only(left: 4, top: 4),
              child: IconButton(
                onPressed: () => context.go(AppRoutes.home),
                icon: const Icon(
                  Icons.arrow_back_rounded,
                  size: 22,
                  color: AppTheme.neonCyan,
                ),
              ),
            ),
          ),
          if (_isLoading)
            Container(
              color: context.backgroundColor.withValues(alpha: 0.7),
              child: const Center(
                child: CircularProgressIndicator(color: AppTheme.neonCyan),
              ),
            ),
        ],
      ),
    );
  }

  // ─── HERO SECTION ───────────────────────────────────────────────────

  Widget _buildHeroSection() {
    final height = MediaQuery.of(context).size.height * 0.32;
    return SizedBox(
      height: height,
      width: double.infinity,
      child: Container(
        color: context.backgroundColor,
        child: Stack(
          alignment: Alignment.center,
          children: [
            Positioned(
              top: height * 0.05,
              child: Container(
                width: height * 0.9,
                height: height * 0.9,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: RadialGradient(
                    colors: [
                      AppTheme.neonCyan.withValues(alpha: 0.12),
                      AppTheme.neonPurple.withValues(alpha: 0.08),
                      Colors.transparent,
                    ],
                    stops: const [0.0, 0.5, 1.0],
                  ),
                ),
              ),
            ),
            Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Image.asset(
                  'assets/logo/compair_logo.png',
                  width: 80,
                  height: 80,
                  filterQuality: FilterQuality.high,
                ),
                const SizedBox(height: 20),
                ShaderMask(
                  blendMode: BlendMode.srcIn,
                  shaderCallback: (bounds) =>
                      const LinearGradient(
                        colors: [
                          AppTheme.neonCyan,
                          AppTheme.neonPurple,
                          AppTheme.neonPink,
                        ],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ).createShader(
                        Rect.fromLTWH(0, 0, bounds.width, bounds.height * 1.2),
                      ),
                  child: Padding(
                    padding: const EdgeInsets.only(bottom: 4),
                    child: Text(
                      context.l10n?.compairTitle ?? 'Compair',
                      style: const TextStyle(
                        fontSize: 34,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -0.8,
                        color: Colors.white,
                        height: 1.2,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  context.l10n?.smarterDecisions ??
                      'Smarter Decisions, Powered by AI',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                    color: context.textTertiaryColor.withValues(alpha: 0.8),
                    letterSpacing: 0.2,
                  ),
                ),
                const SizedBox(height: 4),
              ],
            ),
          ],
        ),
      ),
    );
  }

  // ─── WELCOME SCREEN ──────────────────────────────────────────────────

  Widget _buildWelcomeScreen() {
    return Column(
      children: [
        _buildHeroSection(),
        Expanded(
          child: Container(
            width: double.infinity,
            decoration: BoxDecoration(
              color: context.backgroundColor,
              borderRadius: const BorderRadius.vertical(top: Radius.circular(32)),
            ),
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Column(
                children: [
                  const SizedBox(height: 32),
                  // Google button
                  _buildGoogleButton(),
                  const SizedBox(height: 14),
                  // Apple button
                  _buildAppleButton(),
                  const SizedBox(height: 14),
                  // Facebook button
                  _buildFacebookButton(),
                  const SizedBox(height: 14),
                  // X (Twitter) button
                  _buildXButton(),
                  const SizedBox(height: 24),
                  // Divider with "or"
                  _buildOrDivider(),
                  const SizedBox(height: 16),
                  // Guest
                  GestureDetector(
                    onTap: () => context.go(AppRoutes.home),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        vertical: 12,
                        horizontal: 24,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.06),
                        borderRadius: BorderRadius.circular(30),
                        border: Border.all(color: context.dividerColor),
                      ),
                      child: Text(
                        context.l10n?.continueAsGuest ?? 'Continue as Guest',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: context.textTertiaryColor,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 32),
                  // Terms
                  _buildTermsText(),
                  const SizedBox(height: 24),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildGoogleButton() {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(30),
        border: Border.all(color: context.dividerColor, width: 1.5),
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: _signInWithGoogle,
          borderRadius: BorderRadius.circular(30),
          child: SizedBox(
            height: 56,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                ShaderMask(
                  blendMode: BlendMode.srcIn,
                  shaderCallback: (bounds) => const LinearGradient(
                    colors: [AppTheme.primaryBlue, AppTheme.brandCyan],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ).createShader(bounds),
                  child: const Text(
                    'G',
                    style: TextStyle(fontSize: 24, fontWeight: FontWeight.w900),
                  ),
                ),
                const SizedBox(width: 12),
                Text(
                  context.l10n?.continueWithGoogle ?? 'Continue with Google',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: context.textPrimary,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildAppleButton() {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final backgroundColor = isDark ? Colors.white : const Color(0xFF111111);
    final foregroundColor = isDark ? const Color(0xFF111111) : Colors.white;

    return Container(
      decoration: BoxDecoration(
        color: backgroundColor,
        borderRadius: BorderRadius.circular(30),
        border: Border.all(
          color: isDark
              ? Colors.white.withValues(alpha: 0.18)
              : const Color(0xFF111111),
        ),
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: _signInWithApple,
          borderRadius: BorderRadius.circular(30),
          child: SizedBox(
            height: 56,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.apple, color: foregroundColor, size: 24),
                const SizedBox(width: 12),
                Text(
                  context.l10n?.continueWithApple ?? 'Continue with Apple',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: foregroundColor,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildFacebookButton() {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF1877F2),
        borderRadius: BorderRadius.circular(30),
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: _signInWithFacebook,
          borderRadius: BorderRadius.circular(30),
          child: SizedBox(
            height: 56,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.facebook_rounded, color: Colors.white, size: 24),
                const SizedBox(width: 12),
                Text(
                  context.l10n?.continueWithFacebook ?? 'Continue with Facebook',
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: Colors.white,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildXButton() {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      decoration: BoxDecoration(
        color: isDark ? Colors.white : const Color(0xFF0F1419),
        borderRadius: BorderRadius.circular(30),
        border: Border.all(
          color: isDark
              ? Colors.white.withValues(alpha: 0.18)
              : const Color(0xFF0F1419),
        ),
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: _signInWithX,
          borderRadius: BorderRadius.circular(30),
          child: SizedBox(
            height: 56,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  '𝕏',
                  style: TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w900,
                    color: isDark ? const Color(0xFF0F1419) : Colors.white,
                  ),
                ),
                const SizedBox(width: 12),
                Text(
                  context.l10n?.continueWithX ?? 'Continue with X',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: isDark ? const Color(0xFF0F1419) : Colors.white,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildOrDivider() {
    return Row(
      children: [
        Expanded(child: Container(height: 1, color: context.dividerColor)),
        Container(
          margin: const EdgeInsets.symmetric(horizontal: 16),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.06),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Text(
            context.l10n?.or ?? 'or',
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w500,
              color: context.textSecondary,
            ),
          ),
        ),
        Expanded(child: Container(height: 1, color: context.dividerColor)),
      ],
    );
  }

  Widget _buildTermsText() {
    return Text.rich(
      TextSpan(
        text:
            context.l10n?.byContinuingYouAgree ??
            'By continuing you agree to our ',
        style: TextStyle(fontSize: 12, color: context.textSecondary),
        children: [
          WidgetSpan(
            child: GestureDetector(
              onTap: () => _launchUrl('https://compair.digital/terms'),
              child: Text(
                context.l10n?.termsLabel ?? 'Terms',
                style: TextStyle(
                  fontSize: 12,
                  color: AppTheme.neonCyan,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
          ),
          const TextSpan(text: ' and '),
          WidgetSpan(
            child: GestureDetector(
              onTap: () => _launchUrl('https://compair.digital/privacy'),
              child: Text(
                context.l10n?.privacyPolicy ?? 'Privacy Policy',
                style: TextStyle(
                  fontSize: 12,
                  color: AppTheme.neonCyan,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
          ),
        ],
      ),
      textAlign: TextAlign.center,
    );
  }
}
