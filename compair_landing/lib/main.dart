import 'dart:math' as math;
import 'package:flutter/material.dart';

void main() {
  runApp(const CompairWebApp());
}

// ─── App Colors (uygulamayla birebir) ───
const _bg = Color(0xFF000000);
const _blue = Color(0xFF4A90D9);
const _navy = Color(0xFF1B365D);
const _cyan = Color(0xFF00BCD4);
const _textPrimary = Color(0xFFF8FAFC);
const _textSecondary = Color(0xFFCBD5E1);
const _textTertiary = Color(0xFF64748B);
const _surface = Color(0xFF131B2E);
const _divider = Color(0xFF334155);

class CompairWebApp extends StatelessWidget {
  const CompairWebApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Compair — The Intelligent Choice Engine',
      theme: ThemeData(
        useMaterial3: true,
        brightness: Brightness.dark,
        scaffoldBackgroundColor: _bg,
        colorScheme: const ColorScheme.dark(
          primary: _blue,
          secondary: _cyan,
          surface: _surface,
        ),
      ),
      initialRoute: '/',
      routes: {
        '/': (context) => const WelcomeScreen(),
        '/privacy': (context) => const PrivacyScreen(),
      },
      debugShowCheckedModeBanner: false,
    );
  }
}

// ════════════════════════════════════════
// WELCOME SCREEN (uygulamayla birebir aynı tasarım)
// ════════════════════════════════════════
class WelcomeScreen extends StatefulWidget {
  const WelcomeScreen({super.key});

  @override
  State<WelcomeScreen> createState() => _WelcomeScreenState();
}

class _WelcomeScreenState extends State<WelcomeScreen>
    with TickerProviderStateMixin {
  late AnimationController _c1, _c2, _c3;

  @override
  void initState() {
    super.initState();
    _c1 = AnimationController(vsync: this, duration: const Duration(seconds: 6))
      ..repeat(reverse: true);
    _c2 = AnimationController(vsync: this, duration: const Duration(seconds: 8))
      ..repeat(reverse: true);
    _c3 = AnimationController(vsync: this, duration: const Duration(seconds: 7))
      ..repeat(reverse: true);
  }

  @override
  void dispose() {
    _c1.dispose();
    _c2.dispose();
    _c3.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final w = MediaQuery.of(context).size.width;
    final isMobile = w < 600;

    return Scaffold(
      backgroundColor: _bg,
      body: Stack(
        children: [
          // Animated background blobs (uygulamayla aynı)
          _AnimatedCircle(controller: _c1, color: Color(0x664A90D9), size: 500, top: -150, left: -100),
          _AnimatedCircle(controller: _c2, color: Color(0x4D00BCD4), size: 550, bottom: -100, right: -100),
          _AnimatedCircle(controller: _c3, color: Color(0x336200EA), size: 400, top: 300, right: -150),

          // Content
          SafeArea(
            child: SingleChildScrollView(
              child: ConstrainedBox(
                constraints: BoxConstraints(
                  minHeight: MediaQuery.of(context).size.height,
                ),
                child: Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 440),
                    child: Padding(
                      padding: EdgeInsets.symmetric(horizontal: isMobile ? 32 : 40),
                      child: Column(
                        children: [
                          const SizedBox(height: 80),

                          // Logo
                          Image.network(
                            '/compair_logo.png',
                            width: 110,
                            height: 110,
                            fit: BoxFit.contain,
                            errorBuilder: (_, __, ___) => Container(
                              width: 110,
                              height: 110,
                              decoration: BoxDecoration(
                                gradient: const LinearGradient(
                                  colors: [_blue, _navy],
                                  begin: Alignment.topLeft,
                                  end: Alignment.bottomRight,
                                ),
                                borderRadius: BorderRadius.circular(28),
                              ),
                              child: const Icon(Icons.compare_arrows, color: Colors.white, size: 54),
                            ),
                          ),

                          const SizedBox(height: 32),

                          // App name
                          const Text(
                            'Compair',
                            style: TextStyle(
                              color: _textPrimary,
                              fontSize: 48,
                              fontWeight: FontWeight.w900,
                              letterSpacing: -1.5,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            'The Intelligent Choice Engine',
                            style: TextStyle(
                              color: Colors.white.withOpacity(0.5),
                              fontSize: 16,
                              fontWeight: FontWeight.w500,
                              letterSpacing: 0.5,
                            ),
                          ),

                          const SizedBox(height: 56),

                          // Download buttons (uygulamayla aynı stil)
                          _PremiumButton(
                            icon: Icons.apple,
                            label: 'Download on App Store',
                            backgroundColor: Colors.white,
                            textColor: Colors.black,
                            onTap: () {},
                          ),
                          const SizedBox(height: 14),
                          _PremiumButton(
                            icon: Icons.android,
                            label: 'Get it on Google Play',
                            backgroundColor: Colors.white,
                            textColor: Colors.black,
                            onTap: () {},
                          ),
                          const SizedBox(height: 14),
                          _PremiumButton(
                            icon: Icons.language_rounded,
                            label: 'Use on Web (Coming Soon)',
                            backgroundColor: Color(0x1AFFFFFF),
                            textColor: Colors.white,
                            isOutlined: true,
                            onTap: () {},
                          ),

                          const SizedBox(height: 32),

                          // Terms
                          Text(
                            'By continuing, you agree to our Terms of Service.',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              fontSize: 11,
                              color: Colors.white.withOpacity(0.35),
                              height: 1.6,
                            ),
                          ),
                          const SizedBox(height: 12),
                          GestureDetector(
                            onTap: () => Navigator.pushNamed(context, '/privacy'),
                            child: Text(
                              'Privacy Policy',
                              style: TextStyle(
                                fontSize: 13,
                                color: Colors.white.withOpacity(0.55),
                                decoration: TextDecoration.underline,
                                decorationColor: Colors.white.withOpacity(0.3),
                              ),
                            ),
                          ),

                          const SizedBox(height: 80),

                          // Feature chips
                          Wrap(
                            spacing: 10,
                            runSpacing: 10,
                            alignment: WrapAlignment.center,
                            children: const [
                              _Chip(label: '🤖  AI Scoring', color: _blue),
                              _Chip(label: '💰  Price Tracking', color: Color(0xFF10B981)),
                              _Chip(label: '⚖️  Compare', color: Color(0xFF8B5CF6)),
                              _Chip(label: '🌍  19 Countries', color: _cyan),
                            ],
                          ),

                          const SizedBox(height: 60),

                          // Feature cards
                          const _FeatureCard(
                            icon: Icons.auto_awesome_rounded,
                            title: 'AI Decision Engine',
                            desc: 'Scores every product for your specific budget, ecosystem, and lifestyle.',
                            color: _blue,
                          ),
                          const SizedBox(height: 16),
                          const _FeatureCard(
                            icon: Icons.link_rounded,
                            title: 'Paste Any Link',
                            desc: 'Just paste an Amazon link — Compair extracts specs, prices and reviews instantly.',
                            color: _cyan,
                          ),
                          const SizedBox(height: 16),
                          const _FeatureCard(
                            icon: Icons.price_check_rounded,
                            title: 'Global Prices',
                            desc: 'Track prices across 19 Amazon markets. Best deal for your region, always.',
                            color: Color(0xFF10B981),
                          ),
                          const SizedBox(height: 16),
                          const _FeatureCard(
                            icon: Icons.compare_arrows_rounded,
                            title: 'Head-to-Head Battles',
                            desc: 'Put two products against each other. Get a clear AI-backed recommendation.',
                            color: Color(0xFF8B5CF6),
                          ),

                          const SizedBox(height: 60),

                          // Footer
                          const Divider(color: _divider, thickness: 0.5),
                          const SizedBox(height: 20),
                          Text('© 2026 Compair Digital. All rights reserved.',
                              style: TextStyle(fontSize: 12, color: _textTertiary)),
                          const SizedBox(height: 6),
                          GestureDetector(
                            onTap: () => Navigator.pushNamed(context, '/privacy'),
                            child: const Text('Privacy Policy',
                                style: TextStyle(fontSize: 12, color: _blue)),
                          ),
                          const SizedBox(height: 6),
                          const Text('contact@arain.digital',
                              style: TextStyle(fontSize: 12, color: _textTertiary)),
                          const SizedBox(height: 40),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ════════════════════════════════════════
// PRIVACY POLICY SCREEN
// ════════════════════════════════════════
class PrivacyScreen extends StatelessWidget {
  const PrivacyScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _bg,
      body: Stack(
        children: [
          Positioned(
            top: -100,
            left: -80,
            child: Container(
              width: 350,
              height: 350,
              decoration: const BoxDecoration(
                shape: BoxShape.circle,
                color: Color(0x0C4A90D9),
              ),
            ),
          ),
          SafeArea(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 780),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      GestureDetector(
                        onTap: () => Navigator.pop(context),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.arrow_back_ios_rounded, color: _blue, size: 16),
                            const SizedBox(width: 6),
                            const Text('Back',
                                style: TextStyle(color: _blue, fontSize: 14, fontWeight: FontWeight.w600)),
                          ],
                        ),
                      ),
                      const SizedBox(height: 40),

                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            padding: const EdgeInsets.all(14),
                            decoration: const BoxDecoration(
                              color: Color(0x1A4A90D9),
                              borderRadius: BorderRadius.all(Radius.circular(16)),
                            ),
                            child: const Icon(Icons.privacy_tip_outlined, color: _blue, size: 30),
                          ),
                          const SizedBox(width: 20),
                          const Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Privacy Policy',
                                  style: TextStyle(
                                      fontSize: 34,
                                      fontWeight: FontWeight.w800,
                                      color: _textPrimary,
                                      letterSpacing: -0.5),
                                ),
                                SizedBox(height: 4),
                                Text('Last updated: March 7, 2026',
                                    style: TextStyle(fontSize: 13, color: _textTertiary)),
                              ],
                            ),
                          ),
                        ],
                      ),

                      const SizedBox(height: 48),
                      const Divider(color: _divider),
                      const SizedBox(height: 32),

                      const _PolicySection(
                        title: '1. Introduction',
                        content:
                            'Welcome to Compair ("we," "our," or "us"). Compair is an AI-powered product comparison platform that helps users make smarter purchase decisions. We are committed to protecting your personal information and your right to privacy.\n\n'
                            'This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our mobile application (iOS and Android) and website at compair.digital.',
                      ),
                      const _PolicySection(
                        title: '2. Information We Collect',
                        content:
                            '• Account Information: Email address and display name (via Google, Apple, or email/password sign-up).\n'
                            '• Usage Data: Products viewed, comparisons created, links pasted, and features used.\n'
                            '• Device Information: Device type, OS version, app version, and an anonymous device ID for crash reporting.\n'
                            '• Location Data (approximate): Country-level only — used to display your local Amazon marketplace prices. We do NOT collect GPS location.\n'
                            '• Preferences: Category preferences, ecosystem choice (Apple/Android), and notification settings.\n'
                            '• Crash & Performance Logs: Anonymized logs via Firebase Crashlytics. No personal data included.',
                      ),
                      const _PolicySection(
                        title: '3. How We Use Your Information',
                        content:
                            '• Create and manage your account\n'
                            '• Personalize AI-powered product recommendations\n'
                            '• Display localized Amazon prices based on your country\n'
                            '• Improve app performance and features\n'
                            '• Send opt-in notifications (price drops, new comparisons)\n'
                            '• Detect and prevent fraud\n'
                            '• Comply with legal obligations',
                      ),
                      const _PolicySection(
                        title: '4. Affiliate Links & Third-Party Sites',
                        content:
                            'Compair may display Amazon affiliate links. We may earn a small commission on qualifying purchases at no extra cost to you. External sites have their own privacy policies — we are not responsible for their practices.',
                      ),
                      const _PolicySection(
                        title: '5. Data Sharing & Third Parties',
                        content:
                            'We do not sell your personal data.\n\n'
                            '• Service Providers: Firebase (Google) for auth, database, and analytics; DeepSeek AI for anonymous product scoring.\n'
                            '• Legal Requirements: Disclosure if required by law or to protect our rights.\n'
                            '• Business Transfers: In case of acquisition, data transfers under the same protections.',
                      ),
                      const _PolicySection(
                        title: '6. Data Retention',
                        content:
                            'Account data is retained while your account is active. Upon account deletion, personal data is removed within 30 days. Anonymous analytics logs may be retained up to 24 months.',
                      ),
                      const _PolicySection(
                        title: '7. Your Rights & Account Deletion',
                        content:
                            '• Access — Request a copy of your data\n'
                            '• Correction — Fix inaccurate data\n'
                            '• Deletion — Delete your account and all associated data\n'
                            '• Portability — Receive your data in a portable format\n'
                            '• Objection — Object to certain processing\n\n'
                            'To request account deletion, send an email to:\n'
                            'contact@arain.digital\n\n'
                            'Please include your registered email address in the request. Your account and all associated data will be permanently deleted within 30 days.',
                      ),
                      const _PolicySection(
                        title: "8. Children's Privacy",
                        content:
                            'Compair is not directed to children under 13. We do not knowingly collect data from children. Contact us immediately if you believe a child has shared data with us.',
                      ),
                      const _PolicySection(
                        title: '9. Security',
                        content:
                            'We use TLS encryption in transit, Firebase Security Rules for access control, and regular security reviews. No internet transmission is 100% secure — use a strong, unique password.',
                      ),
                      const _PolicySection(
                        title: '10. Changes to This Policy',
                        content:
                            'We may update this policy periodically. Significant changes will be communicated via in-app notification or email. The "Last updated" date reflects the most recent revision.',
                      ),
                      const _PolicySection(
                        title: '11. Contact Us',
                        content:
                            'For general inquiries:\n'
                            'Email: contact@arain.digital\n'
                            'Website: https://compair.digital\n\n'
                            'For account deletion requests:\n'
                            'Email: contact@arain.digital\n'
                            'Please include your registered email address. We will permanently delete your account and all associated data within 30 days.\n\n'
                            'We respond to all inquiries within 72 hours.',
                      ),

                      const SizedBox(height: 60),
                      const Divider(color: _divider),
                      const SizedBox(height: 20),
                      Center(
                        child: Text('© 2026 Compair Digital. All rights reserved.',
                            style: TextStyle(fontSize: 12, color: _textTertiary)),
                      ),
                      const SizedBox(height: 32),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Animated Circle ───
class _AnimatedCircle extends StatelessWidget {
  final AnimationController controller;
  final Color color;
  final double size;
  final double? top, bottom, left, right;

  const _AnimatedCircle({
    required this.controller,
    required this.color,
    required this.size,
    this.top,
    this.bottom,
    this.left,
    this.right,
  });

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: controller,
      builder: (context, _) {
        final dy = math.sin(controller.value * math.pi) * 30;
        return Positioned(
          top: top != null ? top! + dy : null,
          bottom: bottom != null ? bottom! - dy : null,
          left: left,
          right: right,
          child: Container(
            width: size,
            height: size,
            decoration: BoxDecoration(shape: BoxShape.circle, color: color),
          ),
        );
      },
    );
  }
}

// ─── Chip ───
class _Chip extends StatelessWidget {
  final String label;
  final Color color;
  const _Chip({required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
      decoration: BoxDecoration(
        color: Color.fromRGBO(color.red, color.green, color.blue, 0.12),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: Color.fromRGBO(color.red, color.green, color.blue, 0.25),
        ),
      ),
      child: Text(label,
          style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w600)),
    );
  }
}

// ─── Premium Button (uygulamayla aynı stil) ───
class _PremiumButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color backgroundColor;
  final Color textColor;
  final bool isOutlined;
  final VoidCallback onTap;

  const _PremiumButton({
    required this.icon,
    required this.label,
    required this.backgroundColor,
    required this.textColor,
    required this.onTap,
    this.isOutlined = false,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(16),
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 18, horizontal: 24),
            decoration: BoxDecoration(
              color: backgroundColor,
              borderRadius: BorderRadius.circular(16),
              border: isOutlined
                  ? Border.all(color: Color(0x26FFFFFF))
                  : null,
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(icon, color: textColor, size: 22),
                const SizedBox(width: 12),
                Text(
                  label,
                  style: TextStyle(
                      color: textColor,
                      fontSize: 16,
                      fontWeight: FontWeight.w700),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ─── Feature Card ───
class _FeatureCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String desc;
  final Color color;
  const _FeatureCard(
      {required this.icon,
      required this.title,
      required this.desc,
      required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: _surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: _divider),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: Color.fromRGBO(color.red, color.green, color.blue, 0.12),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, color: color, size: 22),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title,
                    style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                        color: _textPrimary)),
                const SizedBox(height: 6),
                Text(desc,
                    style: const TextStyle(
                        fontSize: 13, color: _textSecondary, height: 1.5)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Policy Section ───
class _PolicySection extends StatelessWidget {
  final String title;
  final String content;
  const _PolicySection({required this.title, required this.content});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 32),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title,
              style: const TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w700,
                  color: _textPrimary)),
          const SizedBox(height: 12),
          Text(content,
              style: const TextStyle(
                  fontSize: 15, color: _textSecondary, height: 1.7)),
          const SizedBox(height: 4),
          const Divider(color: _divider, thickness: 0.4),
        ],
      ),
    );
  }
}
