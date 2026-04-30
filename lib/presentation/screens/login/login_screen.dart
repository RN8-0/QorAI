import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:qor_ai/core/theme.dart';
import 'package:qor_ai/core/errors.dart';
import 'package:qor_ai/presentation/providers/providers.dart';
import 'package:qor_ai/presentation/screens/quiz/quiz_screen.dart';
import 'package:qor_ai/routing/router.dart';

enum LoginMode { welcome, email, register }

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  LoginMode _mode = LoginMode.welcome;
  bool _isLoading = false;
  final Set<String> _prefetchedQuizCoverUrls = <String>{};

  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();
  final _nameController = TextEditingController();

  // Registration data
  DateTime? _birthDate;
  String? _gender;
  static const List<String> _genderValues = [
    'Male',
    'Female',
    'Non-binary',
    'Prefer not to say',
  ];

  String _localizedGender(BuildContext context, String gender) {
    switch (gender) {
      case 'Male':
        return context.l10n?.male ?? 'Male';
      case 'Female':
        return context.l10n?.female ?? 'Female';
      case 'Non-binary':
        return context.l10n?.nonBinary ?? 'Non-binary';
      case 'Prefer not to say':
        return context.l10n?.preferNotToSay ?? 'Prefer not to say';
      default:
        return gender;
    }
  }

  bool _obscurePassword = true;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    _confirmPasswordController.dispose();
    _nameController.dispose();
    super.dispose();
  }

  void _showError(String message) {
    if (!mounted) return;
    final localizedMessage = _normalizeAuthError(message);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(localizedMessage),
        behavior: SnackBarBehavior.floating,
        backgroundColor: AppTheme.error,
        margin: const EdgeInsets.all(20),
        duration: const Duration(seconds: 8),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
  }

  void _showSuccess(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        behavior: SnackBarBehavior.floating,
        backgroundColor: AppTheme.success,
        margin: const EdgeInsets.all(20),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
  }

  String _normalizeAuthError(String message) {
    final raw = message.trim();
    if (raw.isEmpty) return raw;

    final isTr =
        Localizations.localeOf(context).languageCode.toLowerCase() == 'tr';
    if (!isTr) return raw;

    final lower = raw.toLowerCase();
    if (lower.contains('already in use') ||
        lower.contains('already exists') ||
        lower.contains('email address is already in use')) {
      return 'Bu e-posta adresi zaten kullanımda.';
    }
    if (lower.contains('invalid login credentials') ||
        lower.contains('wrong password') ||
        lower.contains('login failed') ||
        lower.contains('invalid password') ||
        lower.contains('invalid email or password')) {
      return 'E-posta veya şifre hatalı.';
    }
    if (lower.contains('sign in cancelled') ||
        lower.contains('sign-in was cancelled') ||
        lower.contains('google sign-in was cancelled')) {
      return 'Giriş işlemi iptal edildi.';
    }
    if (lower.contains('timed out') || lower.contains('timeout')) {
      return 'İşlem zaman aşımına uğradı. Lütfen tekrar deneyin.';
    }
    if (lower.contains('password reset') &&
        lower.contains('could not be sent')) {
      return 'Şifre sıfırlama e-postası gönderilemedi.';
    }
    if (lower.contains('registration failed')) {
      return 'Kayıt işlemi başarısız oldu. Lütfen tekrar deneyin.';
    }
    if (lower.contains('authentication failed') ||
        lower.contains('failed to authenticate')) {
      return 'Kimlik doğrulama başarısız oldu.';
    }
    if (lower.startsWith('google sign-in failed:')) {
      return 'Google ile giriş başarısız oldu. Lütfen tekrar deneyin.';
    }
    return raw;
  }

  Future<void> _navigateAfterLogin(bool quizCompleted) async {
    if (quizCompleted) {
      context.go(AppRoutes.home);
    } else {
      setState(() => _isLoading = true);
      try {
        final covers = await ref.read(quizCategoryVisualsProvider.future);
        await _prefetchQuizCovers(covers.values);
      } catch (_) {
        // Preload failed — navigate to quiz anyway
      } finally {
        if (mounted) setState(() => _isLoading = false);
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
        (url) => precacheImage(
          CachedNetworkImageProvider(url),
          context,
        ).catchError((_) {}),
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

  Future<void> _continueAsGuest() async {
    setState(() => _isLoading = true);
    final result = await ref.read(authRepositoryProvider).signInAnonymously();
    if (!mounted) return;
    setState(() => _isLoading = false);

    switch (result) {
      case Success():
        context.go(AppRoutes.home);
      case Failure(error: final error):
        _showError(error.message);
    }
  }

  Future<void> _signInWithEmail() async {
    if (_emailController.text.isEmpty || _passwordController.text.isEmpty) {
      _showError(
        context.l10n?.pleaseEnterEmailAndPassword ??
            'Please enter email and password',
      );
      return;
    }

    setState(() => _isLoading = true);
    final result = await ref
        .read(authRepositoryProvider)
        .signInWithEmail(
          email: _emailController.text.trim(),
          password: _passwordController.text,
        );
    if (!mounted) return;
    setState(() => _isLoading = false);

    switch (result) {
      case Success(data: final user):
        _navigateAfterLogin(user.quizCompleted);
      case Failure(error: final error):
        _showError(error.message);
    }
  }

  Future<void> _signUpWithEmail() async {
    if (_nameController.text.isEmpty ||
        _emailController.text.isEmpty ||
        _passwordController.text.isEmpty ||
        _confirmPasswordController.text.isEmpty ||
        _birthDate == null ||
        _gender == null) {
      _showError(
        context.l10n?.pleaseFillAllFields ??
            'Please fill in all fields (Name, Email, Password, Birth Date, & Gender)',
      );
      return;
    }

    // Email format check
    final email = _emailController.text.trim();
    if (!email.contains('@') || !email.contains('.')) {
      _showError(
        context.l10n?.enterValidEmail ?? 'Enter a valid email address.',
      );
      return;
    }

    // Şifreler eşleşmeli
    if (_passwordController.text != _confirmPasswordController.text) {
      _showError(
        context.l10n?.passwordsDoNotMatch ?? 'Passwords do not match.',
      );
      return;
    }

    // COPPA compliance: users must be at least 13 years old
    final age = DateTime.now().difference(_birthDate!).inDays ~/ 365;
    if (age < 13) {
      _showError(
        context.l10n?.mustBe13OrOlder ??
            'You must be at least 13 years old to use Qor AI.',
      );
      return;
    }

    setState(() => _isLoading = true);
    final result = await ref
        .read(authRepositoryProvider)
        .signUpWithEmail(
          email: _emailController.text.trim(),
          password: _passwordController.text,
          displayName: _nameController.text.trim(),
          birthDate: _birthDate,
          gender: _gender,
        );
    if (!mounted) return;
    setState(() => _isLoading = false);

    switch (result) {
      case Success(data: final user):
        // Always clear local premium cache on new account creation so stale
        // SharedPreferences from a previous account don't bleed through.
        // Play Store will re-deliver any active entitlement via restorePurchases.
        await ref.read(subscriptionServiceProvider).clearLocalPremium();
        if (mounted) {
          // Doğrulama maili gönderildi bildirimi
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                context.l10n?.registrationSuccess ??
                    'Registration successful! A verification link has been sent to your email.',
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
              backgroundColor: AppTheme.success,
              behavior: SnackBarBehavior.floating,
              margin: const EdgeInsets.all(16),
              duration: const Duration(seconds: 5),
            ),
          );
          _navigateAfterLogin(user.user.quizCompleted);
        }
      case Failure(error: final error):
        _showError(error.message);
    }
  }

  Future<void> _forgotPassword() async {
    if (_emailController.text.isEmpty) {
      _showError(
        context.l10n?.pleaseEnterEmailToReset ??
            'Please enter your email to reset password',
      );
      return;
    }

    setState(() => _isLoading = true);
    final result = await ref
        .read(authRepositoryProvider)
        .sendPasswordResetEmail(_emailController.text.trim());
    if (!mounted) return;
    setState(() => _isLoading = false);

    switch (result) {
      case Success():
        _showSuccess(
          context.l10n?.passwordResetEmailSent ?? 'Password reset email sent!',
        );
      case Failure(error: final error):
        _showError(error.message);
    }
  }

  Future<void> _selectBirthDate() async {
    final DateTime? picked = await showDatePicker(
      context: context,
      initialDate: DateTime(2000),
      firstDate: DateTime(1920),
      lastDate: DateTime.now(),
      builder: (context, child) {
        final baseTheme = Theme.of(context);
        final isDark = baseTheme.brightness == Brightness.dark;
        return Theme(
          data: baseTheme.copyWith(
            colorScheme:
                (isDark ? const ColorScheme.dark() : const ColorScheme.light())
                    .copyWith(
                      primary: AppTheme.primaryBlue,
                      onPrimary: Colors.white,
                      surface: context.surfaceColor,
                      onSurface: context.textPrimary,
                    ),
            dialogTheme: baseTheme.dialogTheme.copyWith(
              backgroundColor: context.surfaceColor,
            ),
            datePickerTheme: baseTheme.datePickerTheme.copyWith(
              backgroundColor: context.surfaceColor,
              headerBackgroundColor: AppTheme.primaryBlue,
              headerForegroundColor: Colors.white,
              dayForegroundColor: WidgetStateProperty.resolveWith((states) {
                if (states.contains(WidgetState.selected)) {
                  return Colors.white;
                }
                return context.textPrimary;
              }),
              todayForegroundColor: WidgetStateProperty.all(
                AppTheme.primaryBlue,
              ),
              yearForegroundColor: WidgetStateProperty.resolveWith((states) {
                if (states.contains(WidgetState.selected)) {
                  return Colors.white;
                }
                return context.textPrimary;
              }),
              cancelButtonStyle: TextButton.styleFrom(
                foregroundColor: AppTheme.primaryBlue,
              ),
              confirmButtonStyle: TextButton.styleFrom(
                foregroundColor: AppTheme.primaryBlue,
              ),
            ),
          ),
          child: child!,
        );
      },
    );
    if (picked != null && picked != _birthDate) {
      setState(() {
        _birthDate = picked;
      });
    }
  }

  void _goBack() {
    setState(() {
      _mode = LoginMode.welcome;
    });
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
      resizeToAvoidBottomInset: true,
      body: Stack(
        children: [
          SafeArea(
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 600),
              child: _buildContent(),
            ),
          ),
          // Back button overlay — only for welcome mode (email/register have it in compact header)
          if (_mode == LoginMode.welcome)
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

  Widget _buildContent() {
    switch (_mode) {
      case LoginMode.welcome:
        return _buildWelcomeScreen();
      case LoginMode.email:
        return _buildEmailScreen();
      case LoginMode.register:
        return _buildRegisterScreen();
    }
  }

  // ─── MESH GRADIENT HERO ──────────────────────────────────────────────

  Widget _buildHeroSection({required double height, bool compact = false}) {
    if (compact) {
      // Compact header for email/register screens — aligned with content
      return Container(
        color: context.backgroundColor,
        padding: EdgeInsets.only(
          top: MediaQuery.of(context).padding.top + 8,
          bottom: 12,
          left: 4,
          right: 24,
        ),
        child: Row(
          children: [
            // Back button inline with logo
            IconButton(
              onPressed: _goBack,
              icon: const Icon(
                Icons.arrow_back_rounded,
                size: 22,
                color: AppTheme.neonCyan,
              ),
              padding: const EdgeInsets.all(8),
              constraints: const BoxConstraints(minWidth: 40, minHeight: 40),
            ),
            const SizedBox(width: 4),
            Container(
              width: 40,
              height: 40,
              padding: const EdgeInsets.all(4),
              decoration: BoxDecoration(
                color: Theme.of(context).brightness == Brightness.dark
                    ? Colors.white.withValues(alpha: 0.02)
                    : Colors.white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: Theme.of(context).brightness == Brightness.dark
                      ? Colors.white.withValues(alpha: 0.08)
                      : AppTheme.brandBlue.withValues(alpha: 0.12),
                ),
                boxShadow: [
                  BoxShadow(
                    color: AppTheme.brandCyan.withValues(alpha: 0.14),
                    blurRadius: 16,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: Image.asset(
                  'assets/logo/qor_ai_logo_512.png',
                  fit: BoxFit.contain,
                  filterQuality: FilterQuality.high,
                  isAntiAlias: true,
                  gaplessPlayback: true,
                ),
              ),
            ),
            const SizedBox(width: 8),
            ShaderMask(
              blendMode: BlendMode.srcIn,
              shaderCallback: (bounds) =>
                  const LinearGradient(
                    colors: [AppTheme.neonCyan, AppTheme.neonPurple],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ).createShader(
                    Rect.fromLTWH(0, 0, bounds.width, bounds.height * 1.2),
                  ),
              child: const Padding(
                padding: EdgeInsets.only(bottom: 2),
                child: Text(
                  'Qor AI',
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.5,
                    color: Colors.white,
                  ),
                ),
              ),
            ),
          ],
        ),
      );
    }
    return SizedBox(
      height: height,
      width: double.infinity,
      child: Container(
        color: context.backgroundColor,
        child: Stack(
          alignment: Alignment.center,
          children: [
            // Centered branding
            Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                SizedBox(
                  width: 122,
                  height: 122,
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(28),
                    child: Image.asset(
                      'assets/logo/qor_ai_logo_512.png',
                      fit: BoxFit.contain,
                      filterQuality: FilterQuality.high,
                      isAntiAlias: true,
                      gaplessPlayback: true,
                    ),
                  ),
                ),
                const SizedBox(height: 24),
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
                      context.l10n?.brandTitle ?? 'Qor AI',
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
      key: const ValueKey('welcome'),
      children: [
        _buildHeroSection(height: MediaQuery.of(context).size.height * 0.32),
        Expanded(
          child: Container(
            width: double.infinity,
            decoration: BoxDecoration(
              color: context.backgroundColor,
              borderRadius: BorderRadius.vertical(top: Radius.circular(32)),
            ),
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Column(
                children: [
                  const SizedBox(height: 32),
                  // Google button
                  _buildGoogleButton(),
                  const SizedBox(height: 16),
                  // Apple button
                  _buildAppleButton(),
                  const SizedBox(height: 16),
                  // Email button
                  _buildEmailGradientButton(),
                  const SizedBox(height: 24),
                  // Divider with "or"
                  _buildOrDivider(),
                  const SizedBox(height: 16),
                  // Guest
                  GestureDetector(
                    onTap: _isLoading ? null : _continueAsGuest,
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
                // Brand-matched "G" — uses app primary blue gradient
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

  Widget _buildEmailGradientButton() {
    return Container(
      decoration: BoxDecoration(
        gradient: AppTheme.primaryGradient,
        borderRadius: BorderRadius.circular(30),
        boxShadow: [
          BoxShadow(
            color: AppTheme.primaryBlue.withValues(alpha: 0.40),
            blurRadius: 16,
            offset: const Offset(0, 6),
          ),
          BoxShadow(
            color: AppTheme.brandCyan.withValues(alpha: 0.20),
            blurRadius: 6,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: () => setState(() => _mode = LoginMode.email),
          borderRadius: BorderRadius.circular(30),
          child: SizedBox(
            height: 56,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.mail_rounded, color: Colors.white, size: 22),
                const SizedBox(width: 12),
                Text(
                  context.l10n?.continueWithEmail ?? 'Continue with Email',
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
              onTap: () => _launchUrl('https://qorai.net/terms'),
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
              onTap: () => _launchUrl('https://qorai.net/privacy'),
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

  // ─── EMAIL SCREEN ────────────────────────────────────────────────────

  Widget _buildEmailScreen() {
    return Column(
      key: const ValueKey('email_form'),
      children: [
        _buildHeroSection(height: 120, compact: true),
        Expanded(
          child: Container(
            color: context.backgroundColor,
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const SizedBox(height: 32),
                  Text(
                    context.l10n?.welcomeBack ?? 'Welcome back',
                    style: TextStyle(
                      fontSize: 28,
                      fontWeight: FontWeight.w700,
                      color: context.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    context.l10n?.signInToYourAccount ??
                        'Sign in to your account',
                    style: TextStyle(
                      fontSize: 15,
                      color: context.textTertiaryColor,
                    ),
                  ),
                  const SizedBox(height: 28),
                  _buildTextField(
                    controller: _emailController,
                    hint: context.l10n?.email ?? 'Email',
                    icon: Icons.email_outlined,
                    keyboardType: TextInputType.emailAddress,
                  ),
                  const SizedBox(height: 14),
                  _buildTextField(
                    controller: _passwordController,
                    hint: context.l10n?.password ?? 'Password',
                    icon: Icons.lock_outline_rounded,
                    isPassword: true,
                    obscureText: _obscurePassword,
                    onToggle: () =>
                        setState(() => _obscurePassword = !_obscurePassword),
                  ),
                  Align(
                    alignment: Alignment.centerRight,
                    child: TextButton(
                      onPressed: _isLoading ? null : _forgotPassword,
                      child: Text(
                        context.l10n?.forgotPassword ?? 'Forgot Password?',
                        style: TextStyle(
                          color: AppTheme.neonCyan,
                          fontWeight: FontWeight.w600,
                          fontSize: 13,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  _buildGradientActionButton(
                    label: context.l10n?.signIn ?? 'Sign In',
                    onPressed: _signInWithEmail,
                    isLoading: _isLoading,
                  ),
                  const SizedBox(height: 28),
                  Center(
                    child: GestureDetector(
                      onTap: () => setState(() => _mode = LoginMode.register),
                      child: Text.rich(
                        TextSpan(
                          text:
                              context.l10n?.dontHaveAccount ??
                              "Don't have an account? ",
                          style: TextStyle(
                            fontSize: 14,
                            color: context.textTertiaryColor,
                          ),
                          children: [
                            TextSpan(
                              text: context.l10n?.createOne ?? 'Create one',
                              style: TextStyle(
                                color: AppTheme.neonCyan,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 32),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }

  // ─── REGISTER SCREEN ─────────────────────────────────────────────────

  Widget _buildRegisterScreen() {
    return Column(
      key: const ValueKey('register_form'),
      children: [
        _buildHeroSection(height: 120, compact: true),
        Expanded(
          child: Container(
            color: context.backgroundColor,
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const SizedBox(height: 32),
                  Text(
                    context.l10n?.createAccount ?? 'Create Account',
                    style: TextStyle(
                      fontSize: 28,
                      fontWeight: FontWeight.w700,
                      color: context.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    context.l10n?.joinSmarterWay ??
                        'Join the smarter way to decide',
                    style: TextStyle(
                      fontSize: 15,
                      color: context.textTertiaryColor,
                    ),
                  ),
                  const SizedBox(height: 24),
                  _buildTextField(
                    controller: _nameController,
                    hint: context.l10n?.fullName ?? 'Full Name',
                    icon: Icons.person_outline_rounded,
                  ),
                  const SizedBox(height: 14),
                  _buildTextField(
                    controller: _emailController,
                    hint: context.l10n?.email ?? 'Email',
                    icon: Icons.email_outlined,
                    keyboardType: TextInputType.emailAddress,
                  ),
                  const SizedBox(height: 14),
                  _buildTextField(
                    controller: _passwordController,
                    hint: context.l10n?.password ?? 'Password',
                    icon: Icons.lock_outline_rounded,
                    isPassword: true,
                    obscureText: _obscurePassword,
                    onToggle: () =>
                        setState(() => _obscurePassword = !_obscurePassword),
                  ),
                  const SizedBox(height: 14),
                  _buildTextField(
                    controller: _confirmPasswordController,
                    hint: context.l10n?.confirmPassword ?? 'Confirm Password',
                    icon: Icons.lock_outline_rounded,
                    isPassword: true,
                    obscureText: _obscurePassword,
                    onToggle: () =>
                        setState(() => _obscurePassword = !_obscurePassword),
                  ),
                  const SizedBox(height: 14),
                  // Birth Date Picker
                  GestureDetector(
                    onTap: _selectBirthDate,
                    child: Container(
                      height: 56,
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.06),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(
                          color: context.dividerColor,
                          width: 1.5,
                        ),
                      ),
                      child: Row(
                        children: [
                          Icon(
                            Icons.calendar_month_rounded,
                            color: context.textSecondary,
                            size: 20,
                          ),
                          const SizedBox(width: 12),
                          Text(
                            _birthDate == null
                                ? (context.l10n?.birthDate ?? 'Birth Date')
                                : DateFormat(
                                    'MMMM d, yyyy',
                                  ).format(_birthDate!),
                            style: TextStyle(
                              color: _birthDate == null
                                  ? context.textSecondary
                                  : context.textPrimary,
                              fontSize: 15,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),
                  // Gender Selection
                  Container(
                    height: 56,
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.06),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(
                        color: context.dividerColor,
                        width: 1.5,
                      ),
                    ),
                    child: DropdownButtonHideUnderline(
                      child: DropdownButton<String>(
                        value: _gender,
                        hint: Text(
                          context.l10n?.gender ?? 'Gender',
                          style: TextStyle(
                            color: context.textSecondary,
                            fontSize: 15,
                          ),
                        ),
                        dropdownColor: context.surfaceElevatedColor,
                        icon: Icon(
                          Icons.keyboard_arrow_down_rounded,
                          color: context.textSecondary,
                        ),
                        isExpanded: true,
                        items: _genderValues.map((String gender) {
                          return DropdownMenuItem<String>(
                            value: gender,
                            child: Text(
                              _localizedGender(context, gender),
                              style: TextStyle(
                                color: context.textPrimary,
                                fontSize: 15,
                              ),
                            ),
                          );
                        }).toList(),
                        onChanged: (String? newValue) {
                          setState(() {
                            _gender = newValue;
                          });
                        },
                      ),
                    ),
                  ),
                  const SizedBox(height: 28),
                  _buildGradientActionButton(
                    label: context.l10n?.createAccount ?? 'Create Account',
                    onPressed: _signUpWithEmail,
                    isLoading: _isLoading,
                  ),
                  const SizedBox(height: 28),
                  Center(
                    child: GestureDetector(
                      onTap: () => setState(() => _mode = LoginMode.email),
                      child: Text.rich(
                        TextSpan(
                          text:
                              context.l10n?.alreadyHaveAccount ??
                              'Already have an account? ',
                          style: TextStyle(
                            fontSize: 14,
                            color: context.textTertiaryColor,
                          ),
                          children: [
                            TextSpan(
                              text: context.l10n?.signInLink ?? 'Sign in',
                              style: TextStyle(
                                color: AppTheme.neonCyan,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 32),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }

  // ─── SHARED WIDGETS ──────────────────────────────────────────────────

  Widget _buildTextField({
    required TextEditingController controller,
    required String hint,
    required IconData icon,
    bool isPassword = false,
    bool obscureText = false,
    VoidCallback? onToggle,
    TextInputType? keyboardType,
  }) {
    return _FocusableTextField(
      controller: controller,
      hint: hint,
      icon: icon,
      isPassword: isPassword,
      obscureText: obscureText,
      onToggle: onToggle,
      keyboardType: keyboardType,
    );
  }

  Widget _buildGradientActionButton({
    required String label,
    required VoidCallback onPressed,
    bool isLoading = false,
  }) {
    return Container(
      width: double.infinity,
      height: 56,
      decoration: BoxDecoration(
        gradient: AppTheme.primaryGradient,
        borderRadius: BorderRadius.circular(16),
        boxShadow: AppTheme.primaryGlow,
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: isLoading ? null : onPressed,
          borderRadius: BorderRadius.circular(16),
          child: Center(
            child: isLoading
                ? const SizedBox(
                    width: 24,
                    height: 24,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.5,
                      color: Colors.white,
                    ),
                  )
                : Text(
                    label,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                      color: Colors.white,
                    ),
                  ),
          ),
        ),
      ),
    );
  }
}

// ─── FOCUSABLE TEXT FIELD (handles focus border state) ─────────────────

class _FocusableTextField extends StatefulWidget {
  final TextEditingController controller;
  final String hint;
  final IconData icon;
  final bool isPassword;
  final bool obscureText;
  final VoidCallback? onToggle;
  final TextInputType? keyboardType;

  const _FocusableTextField({
    required this.controller,
    required this.hint,
    required this.icon,
    this.isPassword = false,
    this.obscureText = false,
    this.onToggle,
    this.keyboardType,
  });

  @override
  State<_FocusableTextField> createState() => _FocusableTextFieldState();
}

class _FocusableTextFieldState extends State<_FocusableTextField> {
  bool _focused = false;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: _focused ? AppTheme.neonCyan : context.dividerColor,
          width: 1.5,
        ),
        boxShadow: _focused
            ? [
                BoxShadow(
                  color: AppTheme.neonCyan.withValues(alpha: 0.15),
                  blurRadius: 8,
                  offset: const Offset(0, 2),
                ),
              ]
            : null,
      ),
      child: Focus(
        onFocusChange: (focused) => setState(() => _focused = focused),
        child: TextField(
          controller: widget.controller,
          obscureText: widget.obscureText,
          keyboardType: widget.keyboardType,
          style: TextStyle(color: context.textPrimary, fontSize: 15),
          decoration: InputDecoration(
            hintText: widget.hint,
            hintStyle: TextStyle(color: context.textSecondary),
            prefixIcon: Icon(
              widget.icon,
              color: context.textSecondary,
              size: 20,
            ),
            suffixIcon: widget.isPassword
                ? IconButton(
                    icon: Icon(
                      widget.obscureText
                          ? Icons.visibility_off_rounded
                          : Icons.visibility_rounded,
                      color: context.textSecondary,
                      size: 20,
                    ),
                    onPressed: widget.onToggle,
                  )
                : null,
            border: InputBorder.none,
            contentPadding: const EdgeInsets.symmetric(
              vertical: 18,
              horizontal: 16,
            ),
          ),
        ),
      ),
    );
  }
}
