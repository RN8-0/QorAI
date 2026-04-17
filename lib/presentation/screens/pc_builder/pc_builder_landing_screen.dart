/// Compair — PC Builder Landing Screen
library;

import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:compair/core/theme.dart';
import 'package:compair/presentation/screens/pc_builder/pc_builder_localization.dart';
import 'package:compair/routing/router.dart';

const _grad = LinearGradient(
  colors: [AppTheme.brandDeepBlue, AppTheme.brandBlue, AppTheme.brandCyan],
  begin: Alignment.topLeft,
  end: Alignment.bottomRight,
);

class _Feature {
  final IconData icon;
  final Color color;
  final String title;
  final String desc;
  const _Feature(this.icon, this.color, this.title, this.desc);
}

class _Particle {
  final double x, y, size, speed, phase;
  final IconData icon;
  final Color color;
  const _Particle({
    required this.x,
    required this.y,
    required this.size,
    required this.speed,
    required this.phase,
    required this.icon,
    required this.color,
  });
}

class PcBuilderLandingScreen extends ConsumerStatefulWidget {
  const PcBuilderLandingScreen({super.key});

  @override
  ConsumerState<PcBuilderLandingScreen> createState() =>
      _PcBuilderLandingScreenState();
}

class _PcBuilderLandingScreenState extends ConsumerState<PcBuilderLandingScreen>
    with TickerProviderStateMixin {
  late final AnimationController _heroCtrl;
  late final AnimationController _particleCtrl;
  late final AnimationController _cardsCtrl;
  late final Animation<double> _heroScale;
  late final Animation<double> _heroOpacity;
  late final List<_Particle> _particles;

  @override
  void initState() {
    super.initState();

    _heroCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    );
    _heroScale = Tween<double>(
      begin: 0.85,
      end: 1.0,
    ).animate(CurvedAnimation(parent: _heroCtrl, curve: Curves.easeOutBack));
    _heroOpacity = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _heroCtrl, curve: const Interval(0.0, 0.6)),
    );

    _particleCtrl = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 6),
    )..repeat();

    _cardsCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    );
    _heroCtrl.forward().then((_) => _cardsCtrl.forward());

    final rng = math.Random(42);
    final icons = [
      Icons.memory_rounded,
      Icons.developer_board_rounded,
      Icons.sd_storage_rounded,
      Icons.videogame_asset_rounded,
      Icons.storage_rounded,
      Icons.bolt_rounded,
      Icons.computer_rounded,
      Icons.air_rounded,
      Icons.monitor_rounded,
      Icons.keyboard_rounded,
      Icons.mouse_rounded,
      Icons.headset_rounded,
    ];
    final colors = [
      AppTheme.brandBlue,
      AppTheme.brandCyan,
      AppTheme.brandDeepBlue,
      const Color(0xFF10B981),
      const Color(0xFFF59E0B),
      const Color(0xFFF97316),
    ];
    _particles = List.generate(
      14,
      (i) => _Particle(
        x: rng.nextDouble(),
        y: rng.nextDouble(),
        size: 12 + rng.nextDouble() * 14,
        speed: 0.4 + rng.nextDouble() * 0.6,
        phase: rng.nextDouble() * math.pi * 2,
        icon: icons[i % icons.length],
        color: colors[i % colors.length],
      ),
    );
  }

  @override
  void dispose() {
    _heroCtrl.dispose();
    _particleCtrl.dispose();
    _cardsCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final features = _featuresFor(context);
    return Scaffold(
      backgroundColor: context.backgroundColor,
      body: SafeArea(
        bottom: false,
        child: CustomScrollView(
          physics: const BouncingScrollPhysics(),
          slivers: [
            // Hero
            SliverToBoxAdapter(child: _buildHero(context, isDark)),
            // CTA button — right below hero
            SliverToBoxAdapter(child: _buildCta(context)),
            // Features
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
              sliver: SliverList(
                delegate: SliverChildBuilderDelegate(
                  (_, i) => _buildFeatureCard(context, i),
                  childCount: features.length,
                ),
              ),
            ),
            SliverToBoxAdapter(
              child: SizedBox(
                height:
                    MediaQuery.of(context).padding.bottom +
                    AppTheme.navBarHeight +
                    16,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHero(BuildContext context, bool isDark) {
    return AnimatedBuilder(
      animation: _heroCtrl,
      builder: (_, child) => Opacity(
        opacity: _heroOpacity.value,
        child: Transform.scale(scale: _heroScale.value, child: child),
      ),
      child: Container(
        height: 240,
        margin: const EdgeInsets.fromLTRB(16, 16, 16, 0),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [
              AppTheme.brandDeepBlue.withValues(alpha: isDark ? 0.35 : 0.12),
              AppTheme.brandBlue.withValues(alpha: isDark ? 0.25 : 0.06),
              AppTheme.brandCyan.withValues(alpha: isDark ? 0.15 : 0.04),
            ],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: AppTheme.brandBlue.withValues(alpha: 0.25)),
        ),
        child: Stack(
          children: [
            // Floating particles
            AnimatedBuilder(
              animation: _particleCtrl,
              builder: (_, __) => ClipRRect(
                borderRadius: BorderRadius.circular(24),
                child: Stack(
                  children: _particles.map((p) {
                    final t =
                        (_particleCtrl.value * p.speed +
                            p.phase / (2 * math.pi)) %
                        1.0;
                    final dy = math.sin(t * math.pi * 2) * 0.06;
                    final dx = math.cos(t * math.pi * 2 * 0.7 + p.phase) * 0.04;
                    return Positioned(
                      left: (p.x + dx) * 340,
                      top: (p.y + dy) * 220,
                      child: Opacity(
                        opacity:
                            (0.08 + 0.06 * math.sin(t * math.pi * 2 + p.phase))
                                .clamp(0.0, 1.0),
                        child: Icon(p.icon, size: p.size, color: p.color),
                      ),
                    );
                  }).toList(),
                ),
              ),
            ),
            // Central content
            Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Container(
                    width: 68,
                    height: 68,
                    decoration: BoxDecoration(
                      gradient: _grad,
                      borderRadius: BorderRadius.circular(18),
                      boxShadow: [
                        BoxShadow(
                          color: AppTheme.brandBlue.withValues(alpha: 0.4),
                          blurRadius: 20,
                          offset: const Offset(0, 8),
                        ),
                      ],
                    ),
                    child: const Icon(
                      Icons.computer_rounded,
                      size: 34,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(height: 14),
                  ShaderMask(
                    shaderCallback: (b) => _grad.createShader(b),
                    child: Text(
                      localizePcBuilderText(
                        context,
                        en: 'PC Builder',
                        tr: 'PC Toplayici',
                      ),
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 28,
                        fontWeight: FontWeight.w900,
                        color: Colors.white,
                        letterSpacing: -0.5,
                      ),
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    localizePcBuilderText(
                      context,
                      en: 'AI-powered compatibility check\nand performance analysis',
                      tr: 'YZ destekli uyumluluk kontrolu\nve performans analizi',
                    ),
                    textAlign: TextAlign.center,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 12,
                      color: context.textSecondary,
                      height: 1.5,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCta(BuildContext context) {
    return AnimatedBuilder(
      animation: _heroCtrl,
      builder: (_, child) {
        final t = _heroCtrl.value.clamp(0.0, 1.0);
        return Opacity(
          opacity: t,
          child: Transform.translate(
            offset: Offset(0, 12 * (1 - t)),
            child: child,
          ),
        );
      },
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
        child: GestureDetector(
          onTap: () => context.push(AppRoutes.pcBuilderStart),
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(vertical: 17),
            decoration: BoxDecoration(
              gradient: _grad,
              borderRadius: BorderRadius.circular(16),
              boxShadow: [
                BoxShadow(
                  color: AppTheme.brandBlue.withValues(alpha: 0.4),
                  blurRadius: 16,
                  offset: const Offset(0, 6),
                ),
              ],
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.build_rounded, size: 20, color: Colors.white),
                const SizedBox(width: 10),
                Text(
                  localizePcBuilderText(
                    context,
                    en: 'Start Building',
                    tr: 'Toplamaya Basla',
                  ),
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                    color: Colors.white,
                    letterSpacing: 0.2,
                  ),
                ),
                const SizedBox(width: 8),
                const Icon(
                  Icons.arrow_forward_rounded,
                  size: 18,
                  color: Colors.white,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildFeatureCard(BuildContext context, int index) {
    final f = _featuresFor(context)[index];
    final delay = index * 0.18;
    return AnimatedBuilder(
      animation: _cardsCtrl,
      builder: (_, child) {
        final t = ((_cardsCtrl.value - delay) / (1.0 - delay)).clamp(0.0, 1.0);
        final curve = Curves.easeOutCubic.transform(t);
        return Opacity(
          opacity: curve,
          child: Transform.translate(
            offset: Offset(0, 20 * (1 - curve)),
            child: child,
          ),
        );
      },
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: context.surfaceVariantColor,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: f.color.withValues(alpha: 0.2)),
        ),
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: f.color.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(f.icon, size: 22, color: f.color),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    f.title,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: context.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    f.desc,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 11,
                      color: context.textSecondary,
                      height: 1.4,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  List<_Feature> _featuresFor(BuildContext context) => [
    _Feature(
      Icons.memory_rounded,
      AppTheme.brandBlue,
      localizePcBuilderText(
        context,
        en: 'Compatibility Check',
        tr: 'Uyumluluk Kontrolu',
      ),
      localizePcBuilderText(
        context,
        en: 'Socket, RAM and PSU compatibility is verified automatically. Incompatible parts cannot be selected.',
        tr: 'Soket, RAM ve PSU uyumlulugu otomatik kontrol edilir. Uyumsuz parcalar secilemez.',
      ),
    ),
    _Feature(
      Icons.auto_awesome_rounded,
      AppTheme.brandCyan,
      localizePcBuilderText(
        context,
        en: 'AI Performance Analysis',
        tr: 'YZ Performans Analizi',
      ),
      localizePcBuilderText(
        context,
        en: 'Bottleneck detection, gaming FPS estimates and performance tier powered by Gemini AI.',
        tr: 'Darbogaz tespiti, oyun FPS tahmini ve performans seviyesi Gemini AI ile sunulur.',
      ),
    ),
    _Feature(
      Icons.bolt_rounded,
      const Color(0xFFF97316),
      localizePcBuilderText(
        context,
        en: 'Power Calculation',
        tr: 'Guc Hesaplama',
      ),
      localizePcBuilderText(
        context,
        en: 'Total power draw of selected components and PSU adequacy shown in real time.',
        tr: 'Secilen bilesenlerin toplam guc tuketimi ve PSU yeterliligi anlik gosterilir.',
      ),
    ),
    _Feature(
      Icons.devices_rounded,
      const Color(0xFF10B981),
      localizePcBuilderText(
        context,
        en: '12 Component Categories',
        tr: '12 Bilesen Kategorisi',
      ),
      localizePcBuilderText(
        context,
        en: 'From CPU to keyboard, monitor to headset — build a complete system on one screen.',
        tr: 'CPU dan klavyeye, monitorden kulakliga kadar tam sistemi tek ekranda kurun.',
      ),
    ),
  ];
}
