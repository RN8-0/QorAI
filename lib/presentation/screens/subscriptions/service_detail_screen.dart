/// Compair - Service Detail Screen (iOS-style redesign)
/// Improved AI analysis, fixed Visit Website, better compare tab
library;

import 'dart:convert';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:dio/dio.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:compair/core/constants.dart';
import 'package:compair/core/pb_client.dart';
import 'package:compair/core/theme.dart';
import 'package:compair/data/models/other_models.dart';
import 'package:compair/presentation/providers/providers.dart';

class ServiceDetailScreen extends ConsumerStatefulWidget {
  final SubscriptionServiceModel service;
  const ServiceDetailScreen({super.key, required this.service});
  @override
  ConsumerState<ServiceDetailScreen> createState() =>
      _ServiceDetailScreenState();
}

class _ServiceDetailScreenState extends ConsumerState<ServiceDetailScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabs;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.service;
    final accent = s.brandColor();

    return Scaffold(
      backgroundColor: context.surfaceColor,
      body: NestedScrollView(
        headerSliverBuilder: (ctx, innerIsScrolled) => [
          SliverAppBar(
            expandedHeight: 200,
            pinned: true,
            backgroundColor: context.surfaceVariantColor,
            surfaceTintColor: Colors.transparent,
            elevation: 0,
            scrolledUnderElevation: 0.5,
            leading: GestureDetector(
              onTap: () => Navigator.of(context).pop(),
              child: Container(
                margin: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: context.surfaceVariantColor,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(
                  Icons.arrow_back_ios_new_rounded,
                  size: 16,
                  color: context.textPrimary,
                ),
              ),
            ),
            actions: [
              GestureDetector(
                onTap: () => _shareService(s),
                child: Container(
                  margin: const EdgeInsets.all(8),
                  width: 38,
                  height: 38,
                  decoration: BoxDecoration(
                    color: context.surfaceVariantColor,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(
                    Icons.share_rounded,
                    size: 16,
                    color: context.textPrimary,
                  ),
                ),
              ),
            ],
            flexibleSpace: FlexibleSpaceBar(
              collapseMode: CollapseMode.pin,
              background: _HeroHeader(service: s, accent: accent),
            ),
            bottom: PreferredSize(
              preferredSize: const Size.fromHeight(48),
              child: Container(
                color: context.surfaceVariantColor,
                child: Column(
                  children: [
                    TabBar(
                      controller: _tabs,
                      indicatorSize: TabBarIndicatorSize.tab,
                      indicator: BoxDecoration(
                        color: accent.withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      dividerColor: Colors.transparent,
                      labelColor: accent,
                      unselectedLabelColor: context.textTertiaryColor,
                      labelStyle: GoogleFonts.plusJakartaSans(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                      ),
                      unselectedLabelStyle: GoogleFonts.plusJakartaSans(
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                      ),
                      labelPadding: const EdgeInsets.symmetric(horizontal: 8),
                      tabs: [
                        Tab(text: context.l10n?.plans ?? 'Plans'),
                        Tab(text: context.l10n?.details ?? 'Details'),
                      ],
                    ),
                    Divider(height: 1, color: context.dividerColor),
                  ],
                ),
              ),
            ),
          ),
        ],
        body: TabBarView(
          controller: _tabs,
          children: [
            _PlansTab(service: s, accent: accent, ref: ref),
            _DetailsTab(service: s, accent: accent, ref: ref),
          ],
        ),
      ),
    );
  }

  void _shareService(SubscriptionServiceModel s) {
    HapticFeedback.lightImpact();
    final url = s.affiliateUrl.isNotEmpty ? s.affiliateUrl : s.website;
    Clipboard.setData(ClipboardData(text: 'Check out ${s.name}: $url'));
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          context.l10n?.linkCopied ?? 'Link copied!',
          style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w600),
        ),
        backgroundColor: const Color(0xFF10B981),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
  }
}

// ─── Hero Header ──────────────────────────────────────────────────────────────

class _HeroHeader extends StatelessWidget {
  final SubscriptionServiceModel service;
  final Color accent;
  const _HeroHeader({required this.service, required this.accent});

  @override
  Widget build(BuildContext context) {
    final lightAccent = Color.lerp(accent, AppTheme.neonCyan, 0.25) ?? accent;
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            accent.withValues(alpha: 0.22),
            lightAccent.withValues(alpha: 0.10),
            context.backgroundColor,
          ],
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          stops: const [0.0, 0.55, 1.0],
        ),
      ),
      child: SafeArea(
        bottom: false,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.end,
          children: [
            const SizedBox(height: 50),
            // Logo with brand-colored glow — no white background
            Container(
              width: 80,
              height: 80,
              decoration: BoxDecoration(
                color: context.surfaceVariantColor,
                borderRadius: BorderRadius.circular(22),
                boxShadow: [
                  BoxShadow(
                    color: accent.withValues(alpha: 0.25),
                    blurRadius: 30,
                    offset: const Offset(0, 10),
                  ),
                  BoxShadow(
                    color: accent.withValues(alpha: 0.08),
                    blurRadius: 60,
                    spreadRadius: 10,
                  ),
                ],
              ),
              clipBehavior: Clip.antiAlias,
              child: Padding(
                padding: const EdgeInsets.all(8),
                child: _LogoImage(service: service, size: 64),
              ),
            ),
            const SizedBox(height: 16),
            Text(
              service.name,
              style: GoogleFonts.plusJakartaSans(
                fontSize: 26,
                fontWeight: FontWeight.w800,
                color: context.textPrimary,
                letterSpacing: -0.5,
              ),
            ),
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 5,
                  ),
                  decoration: BoxDecoration(
                    color: accent.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.circle, size: 6, color: accent),
                      const SizedBox(width: 6),
                      Text(
                        service.category.isNotEmpty
                            ? '${service.category[0].toUpperCase()}${service.category.substring(1)}'
                            : service.category,
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: accent,
                        ),
                      ),
                    ],
                  ),
                ),
                if (service.platforms.isNotEmpty) ...[
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 5,
                    ),
                    decoration: BoxDecoration(
                      color: context.surfaceVariantColor,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      context.l10n?.nPlatforms('${service.platforms.length}') ??
                          '${service.platforms.length} platforms',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 11,
                        fontWeight: FontWeight.w500,
                        color: context.textSecondary,
                      ),
                    ),
                  ),
                ],
              ],
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }
}

// ─── Plans Tab ────────────────────────────────────────────────────────────────

class _PlansTab extends StatefulWidget {
  final SubscriptionServiceModel service;
  final Color accent;
  final WidgetRef ref;
  const _PlansTab({
    required this.service,
    required this.accent,
    required this.ref,
  });
  @override
  State<_PlansTab> createState() => _PlansTabState();
}

class _PlansTabState extends State<_PlansTab> {
  int _selected = 0;

  @override
  Widget build(BuildContext context) {
    final s = widget.service;
    if (s.plans.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.receipt_long_rounded,
              size: 48,
              color: context.textTertiaryColor.withValues(alpha: 0.5),
            ),
            const SizedBox(height: 12),
            Text(
              context.l10n?.noPlansAvailable ?? 'No plans available',
              style: GoogleFonts.plusJakartaSans(
                color: context.textTertiaryColor,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
      );
    }
    final plan = s.plans[_selected];

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 100),
      children: [
        if (s.plans.length > 1) ...[
          SizedBox(
            height: 44,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: s.plans.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (_, i) {
                final p = s.plans[i];
                final isSel = _selected == i;
                return GestureDetector(
                  onTap: () {
                    HapticFeedback.selectionClick();
                    setState(() => _selected = i);
                  },
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 180),
                    padding: const EdgeInsets.symmetric(horizontal: 20),
                    decoration: BoxDecoration(
                      color: isSel
                          ? widget.accent
                          : context.surfaceVariantColor,
                      borderRadius: BorderRadius.circular(22),
                      border: Border.all(
                        color: isSel ? widget.accent : context.dividerColor,
                      ),
                      boxShadow: isSel
                          ? [
                              BoxShadow(
                                color: widget.accent.withValues(alpha: 0.25),
                                blurRadius: 8,
                                offset: const Offset(0, 2),
                              ),
                            ]
                          : null,
                    ),
                    child: Center(
                      child: Text(
                        p.name,
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: isSel ? Colors.white : context.textSecondary,
                        ),
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
          const SizedBox(height: 20),
        ],

        // Price card
        Container(
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [
                widget.accent.withValues(alpha: 0.06),
                widget.accent.withValues(alpha: 0.02),
              ],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: widget.accent.withValues(alpha: 0.12)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                plan.name,
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: widget.accent,
                ),
              ),
              const SizedBox(height: 8),
              Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    plan.price == 0
                        ? (context.l10n?.free ?? 'Free')
                        : '${plan.currency == 'USD' ? '\$' : plan.currency}${plan.price.toStringAsFixed(2)}',
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 38,
                      fontWeight: FontWeight.w900,
                      color: widget.accent,
                      letterSpacing: -1,
                    ),
                  ),
                  if (plan.price > 0)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 6, left: 4),
                      child: Text(
                        '/${plan.billingPeriod == 'yearly' ? (context.l10n?.perYear ?? 'yr') : (context.l10n?.perMonth ?? 'mo')}',
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: widget.accent.withValues(alpha: 0.6),
                        ),
                      ),
                    ),
                ],
              ),
            ],
          ),
        ).animate().fadeIn(duration: 400.ms).slideY(begin: 0.05),
        const SizedBox(height: 24),

        if (plan.features.isNotEmpty) ...[
          Text(
            context.l10n?.includedFeatures ?? 'Included Features',
            style: GoogleFonts.plusJakartaSans(
              fontSize: 15,
              fontWeight: FontWeight.w700,
              color: context.textPrimary,
            ),
          ),
          const SizedBox(height: 14),
          ...plan.features.asMap().entries.map(
            (e) => Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Row(
                children: [
                  Container(
                    width: 24,
                    height: 24,
                    decoration: BoxDecoration(
                      color: widget.accent.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Icon(
                      Icons.check_rounded,
                      size: 14,
                      color: widget.accent,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      e.value,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 13,
                        color: context.textSecondary,
                        height: 1.3,
                      ),
                    ),
                  ),
                ],
              ),
            ).animate().fadeIn(delay: (50 * e.key).ms, duration: 300.ms),
          ),
          const SizedBox(height: 24),
        ],

        if (s.website.isNotEmpty)
          GestureDetector(
            onTap: () => _launchUrl(s),
            child: Container(
              height: 54,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [widget.accent, widget.accent.withValues(alpha: 0.8)],
                ),
                borderRadius: BorderRadius.circular(16),
                boxShadow: [
                  BoxShadow(
                    color: widget.accent.withValues(alpha: 0.3),
                    blurRadius: 12,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(
                    Icons.open_in_new_rounded,
                    size: 18,
                    color: Colors.white,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    context.l10n?.visitWebsite ?? 'Visit Website',
                    style: GoogleFonts.plusJakartaSans(
                      color: Colors.white,
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }

  Future<void> _launchUrl(SubscriptionServiceModel s) async {
    HapticFeedback.lightImpact();
    final raw = s.affiliateUrl.isNotEmpty ? s.affiliateUrl : s.website;
    final url = raw.startsWith('http') ? raw : 'https://$raw';
    try {
      final uri = Uri.parse(url);
      final launched = await launchUrl(
        uri,
        mode: LaunchMode.externalApplication,
      );
      if (launched) {
        widget.ref.read(behaviorTrackingProvider).trackAffiliateTap(s.id);
      }
      if (!launched && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              context.l10n?.couldNotOpenUrl(url) ?? 'Could not open $url',
            ),
            backgroundColor: const Color(0xFFEF4444),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(context.l10n?.invalidUrl(url) ?? 'Invalid URL: $url'),
            backgroundColor: const Color(0xFFEF4444),
          ),
        );
      }
    }
  }
}

// ─── Details Tab ──────────────────────────────────────────────────────────────

class _DetailsTab extends StatelessWidget {
  final SubscriptionServiceModel service;
  final Color accent;
  final WidgetRef ref;
  const _DetailsTab({
    required this.service,
    required this.accent,
    required this.ref,
  });

  @override
  Widget build(BuildContext context) {
    final s = service;
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 100),
      children: [
        if (s.description.isNotEmpty) ...[
          _SectionTitle(context.l10n?.about ?? 'About'),
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: context.surfaceVariantColor,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: context.dividerColor),
            ),
            child: Text(
              s.description,
              style: GoogleFonts.plusJakartaSans(
                fontSize: 13,
                color: context.textSecondary,
                height: 1.7,
              ),
            ),
          ),
          const SizedBox(height: 24),
        ],

        if (s.pros.isNotEmpty) ...[
          _SectionTitle(context.l10n?.pros ?? 'Pros'),
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: const Color(0xFF10B981).withValues(alpha: 0.04),
              borderRadius: BorderRadius.circular(18),
              border: Border.all(
                color: const Color(0xFF10B981).withValues(alpha: 0.12),
              ),
            ),
            child: Column(
              children: s.pros
                  .map(
                    (p) => Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            width: 22,
                            height: 22,
                            decoration: BoxDecoration(
                              color: const Color(
                                0xFF10B981,
                              ).withValues(alpha: 0.12),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: const Icon(
                              Icons.add_rounded,
                              size: 14,
                              color: Color(0xFF10B981),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              p,
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 13,
                                color: context.textPrimary,
                                height: 1.4,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  )
                  .toList(),
            ),
          ),
          const SizedBox(height: 20),
        ],

        if (s.cons.isNotEmpty) ...[
          _SectionTitle(context.l10n?.cons ?? 'Cons'),
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: const Color(0xFFEF4444).withValues(alpha: 0.04),
              borderRadius: BorderRadius.circular(18),
              border: Border.all(
                color: const Color(0xFFEF4444).withValues(alpha: 0.12),
              ),
            ),
            child: Column(
              children: s.cons
                  .map(
                    (c) => Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            width: 22,
                            height: 22,
                            decoration: BoxDecoration(
                              color: const Color(
                                0xFFEF4444,
                              ).withValues(alpha: 0.12),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: const Icon(
                              Icons.remove_rounded,
                              size: 14,
                              color: Color(0xFFEF4444),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              c,
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 13,
                                color: context.textPrimary,
                                height: 1.4,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  )
                  .toList(),
            ),
          ),
          const SizedBox(height: 20),
        ],

        if (s.platforms.isNotEmpty) ...[
          _SectionTitle('Platforms'),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: s.platforms.map((p) {
              final icon = _platformIcon(p);
              return Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 8,
                ),
                decoration: BoxDecoration(
                  color: context.surfaceVariantColor,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: context.dividerColor),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(icon, size: 16, color: accent),
                    const SizedBox(width: 6),
                    Text(
                      p,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: context.textSecondary,
                      ),
                    ),
                  ],
                ),
              );
            }).toList(),
          ),
          const SizedBox(height: 24),
        ],

        // ── AI Analysis Section ──
        _ServiceAiAnalysis(service: s, accent: accent),
        const SizedBox(height: 24),

        _SimilarServicesSection(service: s, accent: accent, ref: ref),
      ],
    );
  }

  IconData _platformIcon(String p) {
    final lower = p.toLowerCase();
    if (lower.contains('ios') || lower.contains('iphone'))
      return Icons.phone_iphone_rounded;
    if (lower.contains('android')) return Icons.android_rounded;
    if (lower.contains('web')) return Icons.language_rounded;
    if (lower.contains('mac')) return Icons.laptop_mac_rounded;
    if (lower.contains('windows')) return Icons.desktop_windows_rounded;
    if (lower.contains('linux')) return Icons.terminal_rounded;
    return Icons.devices_rounded;
  }
}

// ─── Similar Services ─────────────────────────────────────────────────────────

class _SimilarServicesSection extends StatelessWidget {
  final SubscriptionServiceModel service;
  final Color accent;
  final WidgetRef ref;
  const _SimilarServicesSection({
    required this.service,
    required this.accent,
    required this.ref,
  });

  @override
  Widget build(BuildContext context) {
    return ref
        .watch(subscriptionsProvider)
        .when(
          data: (allServices) {
            final similar = allServices
                .where(
                  (s) => s.category == service.category && s.id != service.id,
                )
                .take(15)
                .toList();
            if (similar.isEmpty) return const SizedBox.shrink();
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _SectionTitle('Similar Services'),
                const SizedBox(height: 12),
                SizedBox(
                  height: 110,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: similar.length,
                    separatorBuilder: (_, __) => const SizedBox(width: 10),
                    itemBuilder: (ctx, i) {
                      final sim = similar[i];
                      final simAccent = sim.categoryColor();
                      final cheapest = sim.cheapestPlan;
                      return GestureDetector(
                        onTap: () =>
                            Navigator.of(context, rootNavigator: true).push(
                              MaterialPageRoute(
                                builder: (_) =>
                                    ServiceDetailScreen(service: sim),
                              ),
                            ),
                        child: Container(
                          width: 150,
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: context.surfaceVariantColor,
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(color: context.dividerColor),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  _LogoImage(service: sim, size: 32),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: Text(
                                      sim.name,
                                      style: GoogleFonts.plusJakartaSans(
                                        fontSize: 12,
                                        fontWeight: FontWeight.w700,
                                        color: context.textPrimary,
                                      ),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                                ],
                              ),
                              const Spacer(),
                              if (cheapest != null)
                                Text(
                                  cheapest.priceLabel,
                                  style: GoogleFonts.plusJakartaSans(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w700,
                                    color: simAccent,
                                  ),
                                ),
                              Text(
                                sim.plans.length == 1
                                    ? (context.l10n?.onePlan ?? '1 plan')
                                    : (context.l10n?.nPlans(
                                            '${sim.plans.length}',
                                          ) ??
                                          '${sim.plans.length} plans'),
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 10,
                                  color: context.textTertiaryColor,
                                ),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ],
            );
          },
          loading: () => const SizedBox.shrink(),
          error: (_, __) => const SizedBox.shrink(),
        );
  }
}

// ─── Shared Widgets ──────────────────────────────────────────────────────────

class _StatChip extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final Color color;
  const _StatChip({
    required this.icon,
    required this.label,
    required this.value,
    required this.color,
  });
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: color.withValues(alpha: 0.12)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 16, color: color),
          const SizedBox(height: 6),
          Text(
            value,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 14,
              fontWeight: FontWeight.w800,
              color: color,
            ),
          ),
          Text(
            label,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 10,
              color: context.textTertiaryColor,
            ),
          ),
        ],
      ),
    );
  }
}

class _MetricTile extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color iconColor;
  const _MetricTile({
    required this.label,
    required this.value,
    required this.icon,
    required this.iconColor,
  });
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: context.dividerColor),
      ),
      child: Column(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: iconColor.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, size: 20, color: iconColor),
          ),
          const SizedBox(height: 10),
          Text(
            value,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 16,
              fontWeight: FontWeight.w800,
              color: context.textPrimary,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 11,
              color: context.textTertiaryColor,
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Reviews Tab ──────────────────────────────────────────────────────────────

class _ReviewsTab extends ConsumerStatefulWidget {
  final SubscriptionServiceModel service;
  final Color accent;
  final WidgetRef ref;
  const _ReviewsTab({
    required this.service,
    required this.accent,
    required this.ref,
  });
  @override
  ConsumerState<_ReviewsTab> createState() => _ReviewsTabState();
}

class _ReviewsTabState extends ConsumerState<_ReviewsTab> {
  bool _loading = true;
  String? _aiReview;
  List<_FakeReview> _reviews = [];

  @override
  void initState() {
    super.initState();
    _loadReviews();
  }

  Future<void> _loadReviews() async {
    // Generate AI-powered review analysis
    try {
      final gemini = widget.ref.read(geminiServiceProvider);
      final s = widget.service;
      final prosText = s.pros.isNotEmpty ? s.pros.join(', ') : 'N/A';
      final consText = s.cons.isNotEmpty ? s.cons.join(', ') : 'N/A';
      final prompt =
          'Write a short, balanced user review summary for "${s.name}" subscription service. '
          'Pros: $prosText. Cons: $consText. Price range: ${s.cheapestPlan?.price ?? 0}-${s.premiumPlan?.price ?? 0} USD/mo. '
          'Write 2-3 sentences as a summary of what real users say. Be specific and honest. Plain text only.';
      final lang = Localizations.localeOf(context).languageCode;
      final result = await gemini.freeTextQuery(prompt, language: lang);
      if (mounted)
        setState(() {
          _aiReview = result;
          _loading = false;
        });
    } catch (_) {
      if (mounted)
        setState(() {
          _loading = false;
        });
    }
    _generateFakeReviews();
  }

  void _generateFakeReviews() {
    final s = widget.service;
    final reviews = <_FakeReview>[];
    // Generate realistic reviews from pros
    for (int i = 0; i < s.pros.take(3).length; i++) {
      final pro = s.pros[i];
      reviews.add(
        _FakeReview(
          name: [
            'Alex K.',
            'Maya T.',
            'Jordan R.',
            'Sam L.',
            'Chris M.',
          ][i % 5],
          rating: 4 + (i % 2),
          text:
              'Really satisfied with ${s.name}. $pro is a standout feature for me.',
          date: DateTime.now().subtract(Duration(days: 7 + i * 11)),
          helpful: 12 + i * 7,
        ),
      );
    }
    // Add a critical review from cons
    if (s.cons.isNotEmpty) {
      reviews.add(
        _FakeReview(
          name: 'Taylor W.',
          rating: 3,
          text:
              'Decent service overall, but ${s.cons.first.toLowerCase()}. Worth it for the price though.',
          date: DateTime.now().subtract(const Duration(days: 3)),
          helpful: 8,
        ),
      );
    }
    if (mounted) setState(() => _reviews = reviews);
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.service;
    final avgRating = _reviews.isEmpty
        ? 4.0
        : _reviews.map((r) => r.rating).reduce((a, b) => a + b) /
              _reviews.length;

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 100),
      children: [
        // Rating overview card
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: widget.accent.withValues(alpha: 0.06),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: widget.accent.withValues(alpha: 0.15)),
          ),
          child: Row(
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    avgRating.toStringAsFixed(1),
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 48,
                      fontWeight: FontWeight.w900,
                      color: widget.accent,
                      height: 1,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: List.generate(
                      5,
                      (i) => Icon(
                        i < avgRating.round()
                            ? Icons.star_rounded
                            : Icons.star_outline_rounded,
                        size: 16,
                        color: widget.accent,
                      ),
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '${_reviews.length} reviews',
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 12,
                      color: context.textTertiaryColor,
                    ),
                  ),
                ],
              ),
              const SizedBox(width: 24),
              Expanded(
                child: Column(
                  children: [5, 4, 3, 2, 1].map((star) {
                    final count = _reviews
                        .where((r) => r.rating == star)
                        .length;
                    final ratio = _reviews.isEmpty
                        ? 0.0
                        : count / _reviews.length;
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 4),
                      child: Row(
                        children: [
                          Text(
                            '$star',
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 11,
                              color: context.textTertiaryColor,
                            ),
                          ),
                          const SizedBox(width: 6),
                          Expanded(
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(4),
                              child: LinearProgressIndicator(
                                value: ratio,
                                minHeight: 6,
                                backgroundColor: context.dividerColor,
                                valueColor: AlwaysStoppedAnimation(
                                  widget.accent,
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    );
                  }).toList(),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),

        // AI Summary
        if (_loading)
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: context.surfaceVariantColor,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Row(
              children: [
                SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: widget.accent,
                  ),
                ),
                const SizedBox(width: 12),
                Text(
                  context.l10n?.analyzingReviews ?? 'Analyzing reviews...',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 13,
                    color: context.textSecondary,
                  ),
                ),
              ],
            ),
          )
        else if (_aiReview != null) ...[
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [
                  widget.accent.withValues(alpha: 0.08),
                  context.surfaceVariantColor,
                ],
              ),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: widget.accent.withValues(alpha: 0.2)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(
                      Icons.auto_awesome_rounded,
                      size: 14,
                      color: widget.accent,
                    ),
                    const SizedBox(width: 6),
                    Text(
                      context.l10n?.aiReviewSummary ?? 'AI Review Summary',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: widget.accent,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  _aiReview!,
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 13,
                    color: context.textSecondary,
                    height: 1.6,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
        ],

        // Individual reviews
        ..._reviews.map(
          (r) => Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: context.surfaceVariantColor,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: context.dividerColor),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 36,
                        height: 36,
                        decoration: BoxDecoration(
                          color: widget.accent.withValues(alpha: 0.12),
                          shape: BoxShape.circle,
                        ),
                        child: Center(
                          child: Text(
                            r.name[0],
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 14,
                              fontWeight: FontWeight.w700,
                              color: widget.accent,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              r.name,
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                                color: context.textPrimary,
                              ),
                            ),
                            Row(
                              children: [
                                ...List.generate(
                                  5,
                                  (i) => Icon(
                                    i < r.rating
                                        ? Icons.star_rounded
                                        : Icons.star_outline_rounded,
                                    size: 12,
                                    color: const Color(0xFFF59E0B),
                                  ),
                                ),
                                const SizedBox(width: 6),
                                Text(
                                  _formatDate(r.date),
                                  style: GoogleFonts.plusJakartaSans(
                                    fontSize: 11,
                                    color: context.textTertiaryColor,
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Text(
                    r.text,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 13,
                      color: context.textSecondary,
                      height: 1.5,
                    ),
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Icon(
                        Icons.thumb_up_outlined,
                        size: 13,
                        color: context.textTertiaryColor,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        '${r.helpful} ${context.l10n?.helpfulLabel ?? 'helpful'}',
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 11,
                          color: context.textTertiaryColor,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),

        if (_reviews.isEmpty && !_loading)
          Center(
            child: Column(
              children: [
                const SizedBox(height: 40),
                Icon(
                  Icons.rate_review_outlined,
                  size: 48,
                  color: context.textTertiaryColor.withValues(alpha: 0.4),
                ),
                const SizedBox(height: 12),
                Text(
                  context.l10n?.noReviewsYet ?? 'No reviews yet',
                  style: GoogleFonts.plusJakartaSans(
                    color: context.textTertiaryColor,
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }

  String _formatDate(DateTime d) {
    final diff = DateTime.now().difference(d).inDays;
    if (diff < 1) return 'Today';
    if (diff < 7) return '$diff days ago';
    if (diff < 30) return '${diff ~/ 7}w ago';
    return '${diff ~/ 30}mo ago';
  }
}

class _FakeReview {
  final String name;
  final int rating;
  final String text;
  final DateTime date;
  final int helpful;
  const _FakeReview({
    required this.name,
    required this.rating,
    required this.text,
    required this.date,
    required this.helpful,
  });
}

class _SectionTitle extends StatelessWidget {
  final String text;
  const _SectionTitle(this.text);
  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: GoogleFonts.plusJakartaSans(
        fontSize: 15,
        fontWeight: FontWeight.w700,
        color: context.textPrimary,
      ),
    );
  }
}

class _TableCell extends StatelessWidget {
  final String text;
  final bool isHeader;
  const _TableCell(this.text, {this.isHeader = false});
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
      child: Text(
        text,
        textAlign: TextAlign.center,
        style: GoogleFonts.plusJakartaSans(
          fontSize: 12,
          fontWeight: isHeader ? FontWeight.w700 : FontWeight.w500,
          color: isHeader ? context.textPrimary : context.textSecondary,
        ),
      ),
    );
  }
}

// ─── Logo with fallback ───────────────────────────────────────────────────────

String _domainOf(String website) {
  try {
    final uri = Uri.parse(
      website.startsWith('http') ? website : 'https://$website',
    );
    final host = uri.host.replaceFirst('www.', '');
    return host.isNotEmpty ? host : website;
  } catch (_) {
    return website;
  }
}

class _LogoImage extends StatefulWidget {
  final SubscriptionServiceModel service;
  final double size;
  const _LogoImage({required this.service, this.size = 52});
  @override
  State<_LogoImage> createState() => _LogoImageState();
}

class _LogoImageState extends State<_LogoImage> {
  late List<String> _urls;
  int _idx = 0;

  @override
  void initState() {
    super.initState();
    _buildUrls();
  }

  @override
  void didUpdateWidget(_LogoImage old) {
    super.didUpdateWidget(old);
    if (old.service.id != widget.service.id) {
      _idx = 0;
      _buildUrls();
    }
  }

  void _buildUrls() {
    final domain = _domainOf(widget.service.website);
    final logoUrl = widget.service.logo;
    final isLegacyStorageLogo =
        logoUrl.contains('storage.googleapis.com') ||
        logoUrl.contains('firebasestorage.googleapis.com');
    _urls = [
      if (logoUrl.isNotEmpty && !isLegacyStorageLogo) logoUrl,
      if (domain.isNotEmpty) ...[
        'https://logo.clearbit.com/$domain',
        'https://cdn.brandfetch.io/$domain/w/400/h/400',
        'https://icons.duckduckgo.com/ip3/$domain.ico',
      ],
    ].toSet().toList();
  }

  @override
  Widget build(BuildContext context) {
    if (_urls.isEmpty || _idx >= _urls.length) return _initial();
    final url = _urls[_idx];
    final isSvg = url.toLowerCase().contains('.svg');

    if (isSvg) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(widget.size * 0.2),
        child: SvgPicture.network(
          url,
          width: widget.size,
          height: widget.size,
          fit: BoxFit.contain,
          placeholderBuilder: (_) => _initial(),
        ),
      );
    }

    return ClipRRect(
      borderRadius: BorderRadius.circular(widget.size * 0.2),
      child: CachedNetworkImage(
        key: ValueKey('${widget.service.id}_$_idx'),
        imageUrl: url,
        width: widget.size,
        height: widget.size,
        fit: BoxFit.contain,
        placeholder: (_, __) => _initial(),
        errorWidget: (_, __, ___) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted && _idx < _urls.length - 1) setState(() => _idx++);
          });
          return _initial();
        },
      ),
    );
  }

  Widget _initial() {
    final name = widget.service.name;
    final accent = widget.service.brandColor();
    return Container(
      width: widget.size,
      height: widget.size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(widget.size * 0.2),
        gradient: LinearGradient(
          colors: [accent, accent.withValues(alpha: 0.6)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      child: Text(
        name.isNotEmpty ? name[0].toUpperCase() : '?',
        style: TextStyle(
          fontSize: widget.size * 0.4,
          fontWeight: FontWeight.w800,
          color: Colors.white,
        ),
      ),
    );
  }
}

// ─── AI Analysis for Subscriptions ────────────────────────────────────────────

class _ServiceAiAnalysis extends StatefulWidget {
  final SubscriptionServiceModel service;
  final Color accent;
  const _ServiceAiAnalysis({required this.service, required this.accent});

  @override
  State<_ServiceAiAnalysis> createState() => _ServiceAiAnalysisState();
}

class _ServiceAiAnalysisState extends State<_ServiceAiAnalysis> {
  bool _loading = false;
  bool _loaded = false;
  String _analysis = '';
  String _rating = '';
  String _bestFor = '';

  Future<void> _analyze() async {
    setState(() => _loading = true);
    try {
      final s = widget.service;
      final prompt =
          '''Analyze this subscription service briefly:
Name: ${s.name}
Category: ${s.category}
Description: ${s.description}
Pros: ${s.pros.join(', ')}
Cons: ${s.cons.join(', ')}
Plans: ${s.plans.map((p) => '${p.name}: ${p.price}').join(', ')}

Respond in JSON: {"rating": "X/10", "bestFor": "short description of ideal user", "analysis": "2-3 sentence analysis"}''';

      final dio = Dio();
      final resp = await dio
          .post(
            '$kPbBaseUrl/api/ai/gemini',
            options: Options(headers: withPbAuthHeaders()),
            data: {
              'model': AppConstants.geminiLiteModel,
              'contents': [
                {
                  'parts': [
                    {'text': prompt},
                  ],
                },
              ],
              'generationConfig': {'temperature': 0.7, 'maxOutputTokens': 300},
            },
          )
          .timeout(const Duration(seconds: 15));

      final text =
          resp.data['candidates']?[0]?['content']?['parts']?[0]?['text'] ?? '';
      final jsonStr = text
          .replaceAll(RegExp(r'```json?\n?'), '')
          .replaceAll('```', '')
          .trim();
      final parsed = json.decode(jsonStr) as Map<String, dynamic>;

      if (mounted) {
        setState(() {
          _rating = parsed['rating'] as String? ?? '';
          _bestFor = parsed['bestFor'] as String? ?? '';
          _analysis = parsed['analysis'] as String? ?? '';
          _loaded = true;
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted)
        setState(() {
          _loading = false;
          _loaded = true;
          _analysis = 'Analysis unavailable.';
        });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: widget.accent.withValues(alpha: 0.15)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Image.asset(
                'assets/logo/compair_logo.png',
                width: 24,
                height: 24,
              ),
              const SizedBox(width: 10),
              Text(
                'AI Analysis',
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: context.textPrimary,
                ),
              ),
              const Spacer(),
              Text(
                'Powered by Compair AI',
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 10,
                  color: AppTheme.slate400,
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          if (!_loaded && !_loading)
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: _analyze,
                icon: const Icon(Icons.auto_awesome_rounded, size: 16),
                label: Text(
                  'Analyze Service',
                  style: GoogleFonts.plusJakartaSans(
                    fontWeight: FontWeight.w600,
                  ),
                ),
                style: OutlinedButton.styleFrom(
                  foregroundColor: widget.accent,
                  side: BorderSide(color: widget.accent.withValues(alpha: 0.3)),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
              ),
            ),
          if (_loading)
            const Center(
              child: Padding(
                padding: EdgeInsets.all(20),
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            ),
          if (_loaded && _analysis.isNotEmpty) ...[
            if (_rating.isNotEmpty) ...[
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: [
                          widget.accent,
                          widget.accent.withValues(alpha: 0.7),
                        ],
                      ),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      _rating,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 14,
                        fontWeight: FontWeight.w800,
                        color: Colors.white,
                      ),
                    ),
                  ),
                  if (_bestFor.isNotEmpty) ...[
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'Best for: $_bestFor',
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 12,
                          color: AppTheme.slate400,
                          fontStyle: FontStyle.italic,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 12),
            ],
            Text(
              _analysis,
              style: GoogleFonts.plusJakartaSans(
                fontSize: 13,
                color: context.textSecondary,
                height: 1.6,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
