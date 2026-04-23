/// Qor AI - Onboarding Screen
/// Blueprint Section 5.1 - 3 immersive onboarding pages (light theme)
/// Custom animated page indicator with gradient fills

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:qor_ai/core/theme.dart';
import 'package:qor_ai/routing/router.dart';

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final PageController _pageController = PageController();
  int _currentPage = 0;

  List<_OnboardingPage> _getPages(BuildContext context) => [
    _OnboardingPage(
      icon: Icons.compare_arrows_rounded,
      title: context.l10n?.compareSmarter ?? 'Compare Smarter',
      description: context.l10n?.compareSmarterDesc ??
          'AI-powered side-by-side comparison of any product. Every spec, every detail.',
      gradient: AppTheme.primaryGradient,
      accentColor: AppTheme.neonCyan,
    ),
    _OnboardingPage(
      icon: Icons.person_pin_rounded,
      title: context.l10n?.personalizedForYou ?? 'Personalized For You',
      description: context.l10n?.personalizedForYouDesc ??
          'Every recommendation is powered by your unique profile.',
      gradient: AppTheme.aiGradient,
      accentColor: AppTheme.neonCyan,
    ),
    _OnboardingPage(
      icon: Icons.trending_up_rounded,
      title: context.l10n?.decideWithConfidence ?? 'Decide With Confidence',
      description: context.l10n?.decideWithConfidenceDesc ??
          'Expert reviews, AI analysis, community scores, and price history — all in one place.',
      gradient: AppTheme.scoreGradient,
      accentColor: AppTheme.scoreExcellent,
    ),
  ];

  @override
  Widget build(BuildContext context) {
    final pages = _getPages(context);
    return Scaffold(
      backgroundColor: context.surfaceColor,
      body: SafeArea(
        child: Column(
          children: [
            // Skip button
            Align(
              alignment: Alignment.topRight,
              child: Padding(
                padding: const EdgeInsets.only(top: 8, right: 8),
                child: TextButton(
                  onPressed: () => context.go(AppRoutes.quiz),
                  child: Text(
                    context.l10n?.skip ?? 'Skip',
                    style: TextStyle(
                      color: context.textSecondary,
                      fontWeight: FontWeight.w500,
                      fontSize: 14,
                    ),
                  ),
                ),
              ),
            ),

            // PageView
            Expanded(
              child: PageView.builder(
                controller: _pageController,
                itemCount: pages.length,
                onPageChanged: (index) {
                  setState(() => _currentPage = index);
                },
                itemBuilder: (context, index) {
                  final page = pages[index];
                  return Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 32),
                    child: Column(
                      children: [
                        const Spacer(flex: 2),
                        // Visual area — 55% feel
                        _buildVisualArea(page),
                        const SizedBox(height: 48),
                        Text(
                          page.title,
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontSize: 32,
                            fontWeight: FontWeight.w800,
                            color: context.textPrimary,
                            letterSpacing: -1.0,
                          ),
                        ),
                        const SizedBox(height: 16),
                        ConstrainedBox(
                          constraints: const BoxConstraints(maxWidth: 300),
                          child: Text(
                            page.description,
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              color: context.textTertiaryColor,
                              fontSize: 16,
                              fontWeight: FontWeight.w400,
                              height: 1.5,
                            ),
                          ),
                        ),
                        const Spacer(flex: 3),
                      ],
                    ),
                  );
                },
              ),
            ),

            // Page indicator + navigation button
            Padding(
              padding: const EdgeInsets.fromLTRB(40, 0, 40, 40),
              child: Column(
                children: [
                  _buildPageIndicator(pages),
                  const SizedBox(height: 32),
                  _buildNavigationButton(pages),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildVisualArea(_OnboardingPage page) {
    return SizedBox(
      width: 260,
      height: 260,
      child: Stack(
        alignment: Alignment.center,
        children: [
          // Decorative floating circles
          ..._buildFloatingCircles(page.accentColor),
          // Main icon circle
          Container(
            width: 120,
            height: 120,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: page.gradient,
              boxShadow: [
                BoxShadow(
                  color: page.accentColor.withValues(alpha: 0.3),
                  blurRadius: 30,
                  offset: const Offset(0, 10),
                ),
              ],
            ),
            child: Icon(
              page.icon,
              size: 56,
              color: context.surfaceVariantColor,
            ),
          ),
        ],
      ),
    );
  }

  List<Widget> _buildFloatingCircles(Color accent) {
    final tint = accent.withValues(alpha: 0.08);
    return [
      Positioned(
        top: 10,
        left: 20,
        child: Container(
          width: 60,
          height: 60,
          decoration: BoxDecoration(shape: BoxShape.circle, color: tint),
        ),
      ),
      Positioned(
        top: 30,
        right: 10,
        child: Container(
          width: 80,
          height: 80,
          decoration: BoxDecoration(shape: BoxShape.circle, color: tint),
        ),
      ),
      Positioned(
        bottom: 15,
        left: 5,
        child: Container(
          width: 50,
          height: 50,
          decoration: BoxDecoration(shape: BoxShape.circle, color: tint),
        ),
      ),
      Positioned(
        bottom: 10,
        right: 30,
        child: Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(shape: BoxShape.circle, color: tint),
        ),
      ),
      Positioned(
        top: 80,
        left: 0,
        child: Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(shape: BoxShape.circle, color: tint),
        ),
      ),
    ];
  }

  Widget _buildPageIndicator(List<_OnboardingPage> pages) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: List.generate(pages.length, (index) {
        final isActive = index == _currentPage;
        return AnimatedContainer(
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeInOut,
          margin: const EdgeInsets.symmetric(horizontal: 4),
          width: isActive ? 24 : 8,
          height: 8,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(4),
            gradient: isActive ? pages[_currentPage].gradient : null,
            color: isActive ? null : context.dividerColor,
          ),
        );
      }),
    );
  }

  Widget _buildNavigationButton(List<_OnboardingPage> pages) {
    final isLastPage = _currentPage == pages.length - 1;
    final buttonWidth = isLastPage ? 200.0 : 160.0;

    return Container(
      width: buttonWidth,
      height: 52,
      decoration: BoxDecoration(
        gradient: AppTheme.primaryGradient,
        borderRadius: BorderRadius.circular(26),
        boxShadow: [
          BoxShadow(
            color: AppTheme.primaryBlue.withValues(alpha: 0.35),
            blurRadius: 16,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(26),
          onTap: () {
            if (_currentPage < pages.length - 1) {
              _pageController.nextPage(
                duration: const Duration(milliseconds: 300),
                curve: Curves.easeInOut,
              );
            } else {
              context.go(AppRoutes.quiz);
            }
          },
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                isLastPage ? (context.l10n?.getStarted ?? 'Get Started') : (context.l10n?.next ?? 'Next'),
                style: TextStyle(
                  color: context.surfaceVariantColor,
                  fontWeight: FontWeight.w600,
                  fontSize: 16,
                ),
              ),
              const SizedBox(width: 8),
              Icon(
                isLastPage ? Icons.auto_awesome : Icons.arrow_forward,
                color: context.surfaceVariantColor,
                size: 18,
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }
}

class _OnboardingPage {
  final IconData icon;
  final String title;
  final String description;
  final LinearGradient gradient;
  final Color accentColor;

  const _OnboardingPage({
    required this.icon,
    required this.title,
    required this.description,
    required this.gradient,
    required this.accentColor,
  });
}
