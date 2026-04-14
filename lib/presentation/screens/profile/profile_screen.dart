import 'dart:ui';
import 'package:compair/core/pb_client.dart';
import 'package:flutter/material.dart';
import 'package:compair/domain/entities/user_entity.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:compair/core/theme.dart';
import 'package:compair/presentation/providers/providers.dart';
import 'package:compair/presentation/widgets/paywall_sheet.dart';
import 'package:compair/routing/router.dart';
import 'package:compair/core/errors.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:pocketbase/pocketbase.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final userProfile = ref.watch(userProfileProvider);

    return Scaffold(
      backgroundColor: context.backgroundColor,
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        systemOverlayStyle: SystemUiOverlayStyle.light,
        title: Text(
          context.l10n?.profile ?? 'Profile',
          style: AppTheme.lightTheme.textTheme.titleLarge?.copyWith(
            color: context.textPrimary,
            fontWeight: FontWeight.w700,
          ),
        ),
        centerTitle: true,
        actions: [
          Container(
            margin: const EdgeInsets.only(right: 16),
            decoration: BoxDecoration(
              color: context.surfaceVariantColor,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: context.dividerColor),
            ),
            child: IconButton(
              icon: const Icon(Icons.settings_outlined, size: 20),
              color: context.textPrimary,
              onPressed: () => context.push(AppRoutes.settings),
              style: IconButton.styleFrom(
                padding: EdgeInsets.zero,
                minimumSize: const Size(40, 40),
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
            ),
          ),
        ],
      ),
      body: Stack(
        children: [
          // Adaptive background — beyaz (light) / koyu mesh (dark)
          Positioned.fill(
            child: Builder(
              builder: (context) {
                final isDark = Theme.of(context).brightness == Brightness.dark;
                return Container(
                  decoration: BoxDecoration(
                    gradient: isDark ? AppTheme.meshBackgroundGradient : null,
                    color: isDark ? null : AppTheme.backgroundLightMode,
                  ),
                );
              },
            ),
          ),

          // Dekoratif glow çemberleri — sadece dark modda
          Builder(
            builder: (context) {
              if (Theme.of(context).brightness != Brightness.dark)
                return const SizedBox.shrink();
              return Stack(
                children: [
                  Positioned(
                    top: -100,
                    right: -100,
                    child: Container(
                      width: 300,
                      height: 300,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: RadialGradient(
                          colors: [
                            AppTheme.primaryBlue.withValues(alpha: 0.15),
                            Colors.transparent,
                          ],
                        ),
                      ),
                      child: BackdropFilter(
                        filter: ImageFilter.blur(sigmaX: 60, sigmaY: 60),
                        child: const SizedBox(),
                      ),
                    ),
                  ),
                  Positioned(
                    top: 100,
                    left: -50,
                    child: Container(
                      width: 200,
                      height: 200,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: RadialGradient(
                          colors: [
                            AppTheme.accentCyan.withValues(alpha: 0.10),
                            Colors.transparent,
                          ],
                        ),
                      ),
                      child: BackdropFilter(
                        filter: ImageFilter.blur(sigmaX: 40, sigmaY: 40),
                        child: const SizedBox(),
                      ),
                    ),
                  ),
                ],
              );
            },
          ),

          // İçerik — show UI immediately, no spinner ever
          SafeArea(
            bottom: false,
            child: userProfile.when(
              data: (user) => _ProfileBody(user: user),
              // Loading: build minimal UserEntity from PB auth store
              loading: () {
                return _ProfileBody(user: _buildAuthStoreFallbackUser());
              },
              error: (_, __) {
                return _ProfileBody(user: _buildAuthStoreFallbackUser());
              },
            ),
          ),
        ],
      ),
    );
  }
}

UserEntity? _buildAuthStoreFallbackUser() {
  final auth = pb.authStore.record;
  if (auth == null) return null;

  final now = DateTime.now();
  return UserEntity(
    uid: auth.id,
    email: auth.getStringValue('email'),
    displayName: _resolveAuthRecordDisplayName(auth),
    photoURL: _resolveAuthRecordPhotoUrl(auth),
    createdAt: now,
    updatedAt: now,
  );
}

String _resolveAuthRecordDisplayName(RecordModel auth) {
  final displayName = auth.getStringValue('displayName').trim();
  if (displayName.isNotEmpty) return displayName;

  final name = auth.getStringValue('name').trim();
  if (name.isNotEmpty) return name;

  final email = auth.getStringValue('email').trim();
  if (email.isNotEmpty) return email.split('@').first;

  return '';
}

String? _resolveAuthRecordPhotoUrl(RecordModel auth) {
  final photoUrl = auth.getStringValue('photoURL').trim();
  return photoUrl.isEmpty ? null : photoUrl;
}

class _ProfileBody extends ConsumerWidget {
  final UserEntity? user;

  const _ProfileBody({required this.user});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isPremium = ref.watch(premiumProvider);
    return CustomScrollView(
      physics: const BouncingScrollPhysics(),
      slivers: [
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(24, 10, 24, 8),
            child: Column(
              children: [
                // Compact avatar + info row
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(3),
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: const LinearGradient(
                          colors: [
                            Color(0xFF6366F1),
                            Color(0xFFEC4899),
                            Color(0xFF06B6D4),
                          ],
                        ),
                      ),
                      child: CircleAvatar(
                        radius: 36,
                        backgroundColor: context.surfaceElevatedColor,
                        backgroundImage: (user?.photoURL ?? '').isNotEmpty
                            ? NetworkImage(user!.photoURL!)
                            : null,
                        child: (user?.photoURL ?? '').isEmpty
                            ? Text(
                                ((user?.displayName ?? '').isEmpty
                                        ? 'U'
                                        : user!.displayName)
                                    .substring(0, 1)
                                    .toUpperCase(),
                                style: GoogleFonts.inter(
                                  fontSize: 28,
                                  fontWeight: FontWeight.w800,
                                  color: const Color(0xFF6366F1),
                                ),
                              )
                            : null,
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Flexible(
                                child: Text(
                                  user?.displayName ??
                                      (context.l10n?.user ?? 'User'),
                                  style: GoogleFonts.inter(
                                    fontSize: 20,
                                    fontWeight: FontWeight.w800,
                                    color: context.textPrimary,
                                    letterSpacing: -0.5,
                                  ),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                              if (isPremium) ...[
                                const SizedBox(width: 8),
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 7,
                                    vertical: 3,
                                  ),
                                  decoration: BoxDecoration(
                                    gradient: const LinearGradient(
                                      colors: [
                                        Color(0xFF6366F1),
                                        Color(0xFFEC4899),
                                      ],
                                    ),
                                    borderRadius: BorderRadius.circular(8),
                                  ),
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      const Icon(
                                        Icons.diamond_rounded,
                                        color: Colors.white,
                                        size: 10,
                                      ),
                                      const SizedBox(width: 3),
                                      Text(
                                        'Premium',
                                        style: GoogleFonts.inter(
                                          fontSize: 10,
                                          fontWeight: FontWeight.w800,
                                          color: Colors.white,
                                          letterSpacing: 0.5,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ],
                          ),
                          const SizedBox(height: 2),
                          Text(
                            user?.email ?? '',
                            style: GoogleFonts.inter(
                              fontSize: 13,
                              color: context.textTertiaryColor,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),

                const SizedBox(height: 20),

                // Stats row - modern pill design
                Row(
                  children: [
                    _StatPill(
                      value: '${user?.comparisonsCount ?? 0}',
                      label: context.l10n?.comparisons ?? 'Compares',
                      color: const Color(0xFF6366F1),
                    ),
                    const SizedBox(width: 8),
                    _StatPill(
                      value: '${(user?.ownedProducts as List?)?.length ?? 0}',
                      label: context.l10n?.collection ?? 'Collection',
                      color: const Color(0xFF06B6D4),
                    ),
                    const SizedBox(width: 8),
                    _StatPill(
                      value: '${user?.affiliateClicks ?? 0}',
                      label: context.l10n?.clicks ?? 'Clicks',
                      color: const Color(0xFFEC4899),
                    ),
                  ],
                ),
              ],
            ),
          ).animate().fadeIn(duration: 400.ms),
        ),

        // ─── Upgrade Banner (if free) ───
        if (!isPremium)
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
              child: GestureDetector(
                onTap: () => showPaywallSheet(context),
                child: Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [
                        Color(0xFF6366F1),
                        Color(0xFF8B5CF6),
                        Color(0xFFEC4899),
                      ],
                      begin: Alignment.centerLeft,
                      end: Alignment.centerRight,
                    ),
                    borderRadius: BorderRadius.circular(16),
                    boxShadow: [
                      BoxShadow(
                        color: const Color(0xFF6366F1).withValues(alpha: 0.3),
                        blurRadius: 16,
                        offset: const Offset(0, 6),
                        spreadRadius: -4,
                      ),
                    ],
                  ),
                  child: Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.2),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: const Icon(
                          Icons.diamond_rounded,
                          color: Colors.white,
                          size: 20,
                        ),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              context.l10n?.unlockPro ?? 'Unlock Premium',
                              style: GoogleFonts.inter(
                                fontSize: 15,
                                fontWeight: FontWeight.w800,
                                color: Colors.white,
                              ),
                            ),
                            Text(
                              context.l10n?.unlimitedComparisons ??
                                  'Unlimited comparisons & AI analysis',
                              style: GoogleFonts.inter(
                                fontSize: 12,
                                color: Colors.white.withValues(alpha: 0.8),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const Icon(
                        Icons.arrow_forward_ios_rounded,
                        color: Colors.white,
                        size: 16,
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),

        // ─── Freemium Usage (if free) ───
        if (!isPremium)
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 4),
              child: _FreemiumUsageCard(),
            ),
          ),

        // ─── Content Sections ───
        SliverPadding(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
          sliver: SliverList(
            delegate: SliverChildListDelegate([
              // Quick Actions Grid
              Row(
                children: [
                  Expanded(
                    child: _QuickActionCard(
                      icon: Icons.history_rounded,
                      color: const Color(0xFF6366F1),
                      title: context.l10n?.comparisonHistory ?? 'History',
                      onTap: () => context.push(AppRoutes.comparisons),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _QuickActionCard(
                      icon: Icons.bar_chart_rounded,
                      color: const Color(0xFFF59E0B),
                      title: context.l10n?.behaviorReport ?? 'Behavior',
                      onTap: () => context.push(AppRoutes.behaviorReport),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 20),

              // My Collection
              _ContentSection(
                title: context.l10n?.myCollectionTitle ?? 'My Collection',
                icon: Icons.folder_open_rounded,
                color: const Color(0xFF6366F1),
                onHeaderTap: () => context.push(AppRoutes.collection),
                child: _ProductPreviewList(
                  products: (user?.ownedProducts as List?) ?? [],
                  emptyMessage:
                      context.l10n?.noProductsInCollection ??
                      'No products in collection',
                ),
              ),

              const SizedBox(height: 16),

              // Favorites
              _ContentSection(
                title: context.l10n?.favorites ?? 'Favorites',
                icon: Icons.favorite_rounded,
                color: const Color(0xFFEF4444),
                child: _ProductPreviewList(
                  products: (user?.favorites as List?) ?? [],
                  emptyMessage: context.l10n?.noFavorites ?? 'No favorites yet',
                ),
              ),

              const SizedBox(height: 16),

              // Recently Viewed
              _ContentSection(
                title: context.l10n?.recentlyViewed ?? 'Recently Viewed',
                icon: Icons.history_rounded,
                color: const Color(0xFFF59E0B),
                child: _RecentlyViewedPreviewList(),
              ),

              const SizedBox(height: 16),

              // Yorumlarım
              _ContentSection(
                title: 'Yorumlarım',
                icon: Icons.rate_review_rounded,
                color: const Color(0xFF10B981),
                child: const _MyReviewsList(),
              ),

              const SizedBox(height: 24),

              // Log Out
              GestureDetector(
                onTap: () async {
                  final confirmed = await showDialog<bool>(
                    context: context,
                    builder: (ctx) => AlertDialog(
                      backgroundColor: context.surfaceColor,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16),
                      ),
                      title: Text(
                        context.l10n?.signOut ?? 'Sign Out',
                        style: TextStyle(color: context.textPrimary),
                      ),
                      content: Text(
                        context.l10n?.signOutConfirm ??
                            'Are you sure you want to sign out?',
                        style: TextStyle(color: context.textSecondary),
                      ),
                      actions: [
                        TextButton(
                          onPressed: () => Navigator.pop(ctx, false),
                          child: Text(context.l10n?.cancel ?? 'Cancel'),
                        ),
                        TextButton(
                          onPressed: () => Navigator.pop(ctx, true),
                          child: Text(
                            context.l10n?.signOut ?? 'Sign Out',
                            style: const TextStyle(color: Color(0xFFEF4444)),
                          ),
                        ),
                      ],
                    ),
                  );
                  if (confirmed == true && context.mounted) {
                    await ref.read(authRepositoryProvider).signOut();
                  }
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  decoration: BoxDecoration(
                    color: const Color(0xFFEF4444).withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                      color: const Color(0xFFEF4444).withValues(alpha: 0.15),
                    ),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(
                        Icons.logout_rounded,
                        size: 18,
                        color: Color(0xFFEF4444),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        context.l10n?.logOut ?? 'Log Out',
                        style: GoogleFonts.inter(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: const Color(0xFFEF4444),
                        ),
                      ),
                    ],
                  ),
                ),
              ),

              const SizedBox(height: 16),
              Center(
                child: Text(
                  'Compair v1.0.0',
                  style: GoogleFonts.inter(
                    fontSize: 11,
                    color: context.textTertiaryColor,
                  ),
                ),
              ),
              const SizedBox(height: 100),
            ]),
          ),
        ),
      ],
    );
  }
}

// ─── My Subscriptions Section ───

// Subscription Intelligence entry
class _SubscriptionsSection extends StatelessWidget {
  const _SubscriptionsSection();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 0, vertical: 4),
      child: GestureDetector(
        onTap: () => context.push(AppRoutes.subscriptions),
        child: Container(
          height: 80,
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [Color(0xFF7C3AED), Color(0xFF4F46E5), Color(0xFF06B6D4)],
              begin: Alignment.centerLeft,
              end: Alignment.centerRight,
            ),
            borderRadius: BorderRadius.circular(16),
            boxShadow: [
              BoxShadow(
                color: const Color(0xFF7C3AED).withOpacity(0.3),
                blurRadius: 12,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Row(
            children: [
              const SizedBox(width: 16),
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: Image.asset(
                    'assets/logo/compair_logo.png',
                    width: 28,
                    height: 28,
                    fit: BoxFit.contain,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      context.l10n?.subscriptionIntelligence ??
                          'Subscription Intelligence',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      context.l10n?.subscriptionIntelligenceSubtitle ??
                          'AI-powered analysis',
                      style: TextStyle(
                        color: Colors.white.withOpacity(0.7),
                        fontSize: 11,
                      ),
                    ),
                  ],
                ),
              ),
              const Icon(
                Icons.arrow_forward_ios_rounded,
                color: Colors.white,
                size: 13,
              ),
              const SizedBox(width: 14),
            ],
          ),
        ),
      ),
    );
  }
}

class _DatePickerRow extends StatelessWidget {
  final String label;
  final DateTime? date;
  final VoidCallback onTap;

  const _DatePickerRow({
    required this.label,
    required this.date,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: AppTheme.surfaceVariantLight,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          children: [
            Icon(
              Icons.calendar_today_rounded,
              size: 18,
              color: context.textTertiaryColor,
            ),
            const SizedBox(width: 10),
            Text(
              label,
              style: TextStyle(fontSize: 13, color: context.textTertiaryColor),
            ),
            const Spacer(),
            Text(
              date != null
                  ? '${date!.day}/${date!.month}/${date!.year}'
                  : 'Not set',
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
            ),
          ],
        ),
      ),
    );
  }
}

class _StatPill extends StatelessWidget {
  final String value;
  final String label;
  final Color color;
  const _StatPill({
    required this.value,
    required this.label,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: color.withValues(alpha: 0.12)),
        ),
        child: Column(
          children: [
            Text(
              value,
              style: GoogleFonts.inter(
                fontSize: 18,
                fontWeight: FontWeight.w800,
                color: color,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              label,
              style: GoogleFonts.inter(
                fontSize: 10,
                fontWeight: FontWeight.w500,
                color: context.textTertiaryColor,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _QuickActionCard extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String title;
  final VoidCallback onTap;
  const _QuickActionCard({
    required this.icon,
    required this.color,
    required this.title,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 16),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: color.withValues(alpha: 0.12)),
        ),
        child: Column(
          children: [
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [color, color.withValues(alpha: 0.6)],
                ),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(icon, size: 18, color: Colors.white),
            ),
            const SizedBox(height: 8),
            Text(
              title,
              style: GoogleFonts.inter(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: context.textPrimary,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

class _ContentSection extends StatelessWidget {
  final String title;
  final IconData icon;
  final Color color;
  final Widget child;
  final VoidCallback? onHeaderTap;

  const _ContentSection({
    required this.title,
    required this.icon,
    required this.color,
    required this.child,
    this.onHeaderTap,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: context.dividerColor),
      ),
      child: Column(
        children: [
          InkWell(
            onTap: onHeaderTap,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(12)),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: color.withValues(alpha: 0.1),
                      shape: BoxShape.circle,
                    ),
                    child: Icon(icon, color: color, size: 18),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      title,
                      style: AppTheme.lightTheme.textTheme.titleMedium
                          ?.copyWith(
                            fontWeight: FontWeight.w700,
                            color: context.textPrimary,
                          ),
                    ),
                  ),
                  if (onHeaderTap != null)
                    Icon(
                      Icons.arrow_forward_rounded,
                      color: context.textTertiaryColor,
                      size: 20,
                    ),
                ],
              ),
            ),
          ),
          Divider(
            height: 1,
            thickness: 0.5,
            color: context.dividerColor.withValues(alpha: 0.5),
          ),
          Padding(padding: const EdgeInsets.all(16), child: child),
        ],
      ),
    );
  }
}

class _ProductPreviewList extends ConsumerWidget {
  final List<dynamic> products;
  final String emptyMessage;

  const _ProductPreviewList({
    required this.products,
    required this.emptyMessage,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (products.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 16),
          child: Text(
            emptyMessage,
            style: AppTheme.lightTheme.textTheme.bodySmall?.copyWith(
              color: context.textTertiaryColor,
            ),
          ),
        ),
      );
    }

    return Column(
      children: products.take(3).map((productId) {
        return Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: _ProductListItem(productId: productId.toString()),
        );
      }).toList(),
    );
  }
}

class _RecentlyViewedPreviewList extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final viewedAsync = ref.watch(viewedProductsProvider);
    final viewed = viewedAsync.valueOrNull ?? [];

    if (viewed.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 16),
          child: Text(
            'No recently viewed products',
            style: AppTheme.lightTheme.textTheme.bodySmall?.copyWith(
              color: context.textTertiaryColor,
            ),
          ),
        ),
      );
    }

    return Column(
      children: viewed.take(3).map((productId) {
        return Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: _ProductListItem(productId: productId),
        );
      }).toList(),
    );
  }
}

class _ProductListItem extends ConsumerWidget {
  final String productId;
  const _ProductListItem({required this.productId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final productAsync = ref.watch(productDetailProvider(productId));
    return productAsync.when(
      data: (result) {
        return switch (result) {
          Success(data: final product) => InkWell(
            onTap: () => context.push('/product/${product.id}'),
            borderRadius: BorderRadius.circular(12),
            child: Row(
              children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: AppTheme.surfaceVariantLight,
                    borderRadius: BorderRadius.circular(10),
                    image: product.imageURL.isNotEmpty
                        ? DecorationImage(
                            image: CachedNetworkImageProvider(product.imageURL),
                            fit: BoxFit.cover,
                          )
                        : null,
                  ),
                  child: product.imageURL.isEmpty
                      ? Icon(
                          Icons.devices,
                          color: AppTheme.primaryBlue.withValues(alpha: 0.5),
                          size: 24,
                        )
                      : null,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        product.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: context.textPrimary,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        product.brand ?? 'Unknown Brand',
                        style: TextStyle(
                          fontSize: 12,
                          color: context.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
                Icon(
                  Icons.chevron_right,
                  size: 20,
                  color: context.textTertiaryColor,
                ),
              ],
            ),
          ),
          Failure() => const SizedBox.shrink(),
        };
      },
      loading: () => Row(
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: AppTheme.surfaceVariantLight,
              borderRadius: BorderRadius.circular(10),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  height: 14,
                  width: 100,
                  color: AppTheme.surfaceVariantLight,
                ),
                const SizedBox(height: 4),
                Container(
                  height: 10,
                  width: 60,
                  color: AppTheme.surfaceVariantLight,
                ),
              ],
            ),
          ),
        ],
      ),
      error: (_, __) => const SizedBox.shrink(),
    );
  }
}

class _ModernStatItem extends StatelessWidget {
  final String value;
  final String label;
  final IconData icon;
  final Color color;

  const _ModernStatItem({
    required this.value,
    required this.label,
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.1),
            shape: BoxShape.circle,
          ),
          child: Icon(icon, color: color, size: 20),
        ),
        const SizedBox(height: 8),
        Text(
          value,
          style: AppTheme.lightTheme.textTheme.titleLarge?.copyWith(
            fontWeight: FontWeight.w700,
            color: context.textPrimary,
          ),
        ),
        Text(
          label,
          style: AppTheme.lightTheme.textTheme.labelSmall?.copyWith(
            color: context.textSecondary,
          ),
        ),
      ],
    );
  }
}

class _SectionTitle extends StatelessWidget {
  final String title;

  const _SectionTitle({required this.title});

  @override
  Widget build(BuildContext context) {
    return Text(
      title.toUpperCase(),
      style: AppTheme.lightTheme.textTheme.labelSmall?.copyWith(
        fontWeight: FontWeight.w700,
        letterSpacing: 1.2,
        color: context.textTertiaryColor,
      ),
    );
  }
}

class _ModernMenuCard extends StatelessWidget {
  final List<Widget> items;

  const _ModernMenuCard({required this.items});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: context.dividerColor),
      ),
      child: Column(
        children: List.generate(items.length, (index) {
          return Column(
            children: [
              items[index],
              if (index != items.length - 1)
                Divider(
                  height: 1,
                  thickness: 0.5,
                  indent: 60,
                  endIndent: 20,
                  color: context.dividerColor.withValues(alpha: 0.5),
                ),
            ],
          );
        }),
      ),
    );
  }
}

class _MenuItem extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? subtitle;
  final Color color;
  final VoidCallback onTap;
  final Color? textColor;
  final bool showArrow;
  final Widget? trailing;
  final Widget? child;

  const _MenuItem({
    required this.icon,
    required this.title,
    this.subtitle,
    required this.color,
    required this.onTap,
    this.textColor,
    this.showArrow = true,
    this.trailing,
    this.child,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
          child: Column(
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: color.withValues(alpha: 0.1),
                      shape: BoxShape.circle,
                    ),
                    child: Icon(icon, color: color, size: 20),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          title,
                          style: AppTheme.lightTheme.textTheme.titleMedium
                              ?.copyWith(
                                fontWeight: FontWeight.w600,
                                color: textColor ?? context.textPrimary,
                              ),
                        ),
                        if (subtitle != null)
                          Text(
                            subtitle!,
                            style: AppTheme.lightTheme.textTheme.bodySmall
                                ?.copyWith(color: context.textSecondary),
                          ),
                      ],
                    ),
                  ),
                  if (trailing != null)
                    trailing!
                  else if (showArrow)
                    Icon(
                      Icons.chevron_right_rounded,
                      color: context.textTertiaryColor,
                      size: 20,
                    ),
                ],
              ),
              if (child != null) child!,
            ],
          ),
        ),
      ),
    );
  }
}

class _PreferenceChip extends StatelessWidget {
  final String label;

  const _PreferenceChip({required this.label});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: AppTheme.surfaceVariantLight,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: context.dividerColor),
      ),
      child: Text(
        label,
        style: AppTheme.lightTheme.textTheme.labelSmall?.copyWith(
          color: context.textSecondary,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

// ─── Freemium Usage Card ──────────────────────────────────────────────────────

class _FreemiumUsageCard extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final comparisons = ref.watch(freemiumUsageProvider('comparison'));
    final aiChats = ref.watch(freemiumUsageProvider('ai_chat'));
    final linkAnalyses = ref.watch(freemiumUsageProvider('link_analysis'));

    return Container(
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
              Icon(
                Icons.pie_chart_rounded,
                size: 18,
                color: const Color(0xFF6366F1),
              ),
              const SizedBox(width: 8),
              Text(
                'Daily Usage',
                style: GoogleFonts.inter(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: context.textPrimary,
                ),
              ),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: const Color(0xFF6366F1).withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  'FREE',
                  style: GoogleFonts.inter(
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                    color: const Color(0xFF6366F1),
                    letterSpacing: 0.5,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          _UsageRow(
            label: context.l10n?.comparisons ?? 'Comparisons',
            icon: Icons.compare_arrows_rounded,
            color: const Color(0xFF6366F1),
            used: comparisons,
            limit: FreemiumLimits.comparisonsPerDay,
            period: 'today',
          ),
          const SizedBox(height: 10),
          _UsageRow(
            label: context.l10n?.aiChat ?? 'AI Chat',
            icon: Icons.auto_awesome_rounded,
            color: const Color(0xFFEC4899),
            used: aiChats,
            limit: FreemiumLimits.aiChatsPerDay,
            period: 'today',
          ),
          const SizedBox(height: 10),
          _UsageRow(
            label: context.l10n?.linkAnalysis ?? 'Link Analysis',
            icon: Icons.link_rounded,
            color: const Color(0xFF06B6D4),
            used: linkAnalyses,
            limit: FreemiumLimits.linkAnalysesPerWeek,
            period: 'this week',
          ),
        ],
      ),
    );
  }
}

class _UsageRow extends StatelessWidget {
  final String label;
  final IconData icon;
  final Color color;
  final int used;
  final int limit;
  final String period;

  const _UsageRow({
    required this.label,
    required this.icon,
    required this.color,
    required this.used,
    required this.limit,
    required this.period,
  });

  @override
  Widget build(BuildContext context) {
    final remaining = (limit - used).clamp(0, limit);
    final progress = (used / limit).clamp(0.0, 1.0);
    final isExhausted = remaining == 0;

    return Row(
      children: [
        Icon(icon, size: 16, color: color),
        const SizedBox(width: 8),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Text(
                    label,
                    style: GoogleFonts.inter(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: context.textPrimary,
                    ),
                  ),
                  const Spacer(),
                  Text(
                    isExhausted ? '0 left' : '$remaining/$limit $period',
                    style: GoogleFonts.inter(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: isExhausted
                          ? const Color(0xFFEF4444)
                          : context.textTertiaryColor,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                  value: progress,
                  minHeight: 4,
                  backgroundColor: color.withValues(alpha: 0.12),
                  valueColor: AlwaysStoppedAnimation(
                    isExhausted ? const Color(0xFFEF4444) : color,
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _MyReviewsList extends ConsumerWidget {
  const _MyReviewsList();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reviewsAsync = ref.watch(myReviewsProvider);

    return reviewsAsync.when(
      loading: () => const Padding(
        padding: EdgeInsets.all(16),
        child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
      ),
      error: (_, _) => const SizedBox.shrink(),
      data: (reviews) {
        if (reviews.isEmpty) {
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 16),
            child: Center(
              child: Text(
                'Henüz yorum yapmadın',
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 13,
                  color: AppTheme.slate500,
                ),
              ),
            ),
          );
        }

        final feed = ref.watch(homeFeedProvider);
        final allProducts = feed.valueOrNull?.all ?? [];

        return Column(
          children: reviews.take(5).map((review) {
            final product = allProducts
                .where((p) => p.id == review.productId)
                .firstOrNull;
            final displayName = product?.name ?? review.productId;

            return GestureDetector(
              onTap: () => context.push('/product/${review.productId}'),
              child: Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: context.surfaceVariantColor,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: context.dividerColor),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 36,
                      height: 36,
                      decoration: BoxDecoration(
                        color: const Color(0xFF10B981).withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Icon(
                        Icons.rate_review_rounded,
                        size: 18,
                        color: Color(0xFF10B981),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            displayName,
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: context.textPrimary,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          if (review.text.isNotEmpty)
                            Text(
                              review.text,
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 11,
                                color: context.textSecondary,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                        ],
                      ),
                    ),
                    const Icon(
                      Icons.chevron_right_rounded,
                      size: 18,
                      color: AppTheme.slate400,
                    ),
                  ],
                ),
              ),
            );
          }).toList(),
        );
      },
    );
  }
}
