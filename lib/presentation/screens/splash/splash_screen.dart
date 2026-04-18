import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:compair/core/theme.dart';
import 'package:compair/routing/router.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double> _scale;
  late final Animation<double> _fade;
  late final Animation<double> _glow;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    );

    _scale = Tween<double>(begin: 0.6, end: 1.0).animate(
      CurvedAnimation(
        parent: _ctrl,
        curve: const Interval(0.0, 0.65, curve: Curves.easeOutBack),
      ),
    );

    _fade = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(
        parent: _ctrl,
        curve: const Interval(0.0, 0.55, curve: Curves.easeOut),
      ),
    );

    _glow = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(
        parent: _ctrl,
        curve: const Interval(0.3, 1.0, curve: Curves.easeInOut),
      ),
    );

    _ctrl.forward().then((_) async {
      await Future<void>.delayed(const Duration(milliseconds: 300));
      if (mounted) context.go(AppRoutes.home);
    });
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final brightness = MediaQuery.platformBrightnessOf(context);
    final isDark = brightness == Brightness.dark;

    final bgColor = isDark ? const Color(0xFF0A0A0F) : Colors.white;
    final glowColor = isDark
        ? AppTheme.neonCyan.withValues(alpha: 0.35)
        : AppTheme.brandCyan.withValues(alpha: 0.18);
    final subtitleColor = isDark
        ? Colors.white.withValues(alpha: 0.45)
        : const Color(0xFF64748B);

    return Scaffold(
      backgroundColor: bgColor,
      body: AnimatedBuilder(
        animation: _ctrl,
        builder: (context, _) {
          return Stack(
            fit: StackFit.expand,
            children: [
              // Subtle gradient background
              Positioned.fill(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: RadialGradient(
                      center: Alignment.center,
                      radius: 0.9,
                      colors: [
                        isDark
                            ? AppTheme.brandCyan
                                .withValues(alpha: 0.08 * _glow.value)
                            : AppTheme.brandCyan
                                .withValues(alpha: 0.05 * _glow.value),
                        bgColor,
                      ],
                    ),
                  ),
                ),
              ),
              // Center logo + name
              Center(
                child: FadeTransition(
                  opacity: _fade,
                  child: ScaleTransition(
                    scale: _scale,
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        // Logo with glow
                        Stack(
                          alignment: Alignment.center,
                          children: [
                            // Glow ring
                            Container(
                              width: 112,
                              height: 112,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                boxShadow: [
                                  BoxShadow(
                                    color: glowColor,
                                    blurRadius: 40 * _glow.value,
                                    spreadRadius: 8 * _glow.value,
                                  ),
                                ],
                              ),
                            ),
                            // Logo image
                            ClipRRect(
                              borderRadius: BorderRadius.circular(26),
                              child: Image.asset(
                                'assets/logo/compair_logo_512.png',
                                width: 100,
                                height: 100,
                                fit: BoxFit.contain,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 24),
                        // App name
                        Text(
                          'Compair',
                          style: TextStyle(
                            fontSize: 32,
                            fontWeight: FontWeight.w800,
                            letterSpacing: -0.5,
                            color: isDark ? Colors.white : const Color(0xFF0F172A),
                            fontFamily: 'PlusJakartaSans',
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          'AI Product Advisor',
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w500,
                            letterSpacing: 0.3,
                            color: subtitleColor,
                            fontFamily: 'PlusJakartaSans',
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              // Bottom brand dots
              Positioned(
                bottom: 48,
                left: 0,
                right: 0,
                child: FadeTransition(
                  opacity: _glow,
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      _Dot(color: AppTheme.neonCyan),
                      const SizedBox(width: 6),
                      _Dot(color: AppTheme.brandCyan),
                      const SizedBox(width: 6),
                      _Dot(
                        color: isDark
                            ? Colors.white.withValues(alpha: 0.3)
                            : const Color(0xFFCBD5E1),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _Dot extends StatelessWidget {
  final Color color;
  const _Dot({required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 6,
      height: 6,
      decoration: BoxDecoration(shape: BoxShape.circle, color: color),
    );
  }
}
