import 'dart:ui';
import 'dart:math' as math;
import 'package:qor_ai/core/pb_client.dart';
import 'package:flutter/material.dart';
import 'package:qor_ai/domain/entities/user_entity.dart';
import 'package:qor_ai/domain/entities/comparison_entity.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:qor_ai/core/theme.dart';
import 'package:qor_ai/presentation/providers/providers.dart';
import 'package:qor_ai/presentation/widgets/qor_badges.dart';
import 'package:qor_ai/presentation/widgets/paywall_sheet.dart';
import 'package:qor_ai/routing/router.dart';
import 'package:qor_ai/core/errors.dart';
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
        systemOverlayStyle: Theme.of(context).brightness == Brightness.dark
            ? SystemUiOverlayStyle.light
            : SystemUiOverlayStyle.dark,
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
              if (Theme.of(context).brightness != Brightness.dark) {
                return const SizedBox.shrink();
              }
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
              error: (error, stackTrace) {
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
  if (photoUrl.isEmpty || _isGeneratedAvatarUrl(photoUrl)) return null;
  return photoUrl;
}

/// Kullanıcı UID hash'inden deterministik renk üretir.
Color _avatarColorFromUid(String? uid) {
  const colors = [
    Color(0xFF7C3AED), // Violet
    Color(0xFF2563EB), // Blue
    Color(0xFF059669), // Emerald
    Color(0xFFD97706), // Amber
    Color(0xFFDC2626), // Red
    Color(0xFF0891B2), // Cyan
    Color(0xFFDB2777), // Pink
    Color(0xFF16A34A), // Green
  ];
  if (uid == null || uid.isEmpty) return AppTheme.brandBlue;
  final hash = uid.codeUnits.fold(0, (p, e) => p + e);
  return colors[hash % colors.length];
}

/// displayName > authStore fallback > email prefix > fallback sırasıyla etkili adı döndürür.
String _effectiveDisplayName(UserEntity? user, BuildContext context) {
  // 1. Try from loaded user entity
  final name = user?.displayName;
  if (name != null && name.isNotEmpty) return name;

  // 2. Try from live auth store record (catches Google/Apple users whose
  //    PocketBase record may not have displayName synced yet)
  final authRecord = pb.authStore.record;
  if (authRecord != null) {
    final authName = _resolveAuthRecordDisplayName(authRecord).trim();
    if (authName.isNotEmpty) return authName;
  }

  // 3. Try email prefix from loaded entity
  final email = user?.email;
  if (email != null && email.isNotEmpty) {
    final prefix = email.split('@').first;
    if (prefix.isNotEmpty) return prefix;
  }

  return context.l10n?.user ?? 'User';
}

/// Returns the resolved photo URL: user entity > auth store > null.
String? _resolvedPhotoUrl(UserEntity? user) {
  final fromEntity = (user?.photoURL ?? '').trim();
  if (fromEntity.isNotEmpty && !_isGeneratedAvatarUrl(fromEntity)) {
    return fromEntity;
  }

  final authRecord = pb.authStore.record;
  if (authRecord != null) {
    final fromAuth = _resolveAuthRecordPhotoUrl(authRecord);
    if (fromAuth != null && fromAuth.isNotEmpty) return fromAuth;
  }
  return null;
}

bool _isGeneratedAvatarUrl(String? photoUrl) {
  final value = (photoUrl ?? '').trim().toLowerCase();
  return value.contains('ui-avatars.com');
}

class _ProfileBody extends ConsumerWidget {
  final UserEntity? user;

  const _ProfileBody({required this.user});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isPremium = ref.watch(premiumProvider);
    final comparisonsAsync = ref.watch(userComparisonsProvider);
    final comparisonHistory =
        comparisonsAsync.valueOrNull?.when(
          success: (comparisons) => comparisons,
          failure: (_) => <ComparisonEntity>[],
        ) ??
        const <ComparisonEntity>[];
    final comparisonsCount = math.max(
      user?.comparisonsCount ?? 0,
      comparisonHistory.length,
    );
    final favoritesCount = user?.favorites.length ?? 0;
    final viewedAsync = ref.watch(viewedProductsProvider);
    final viewsCount = viewedAsync.valueOrNull?.length ?? 0;

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
                            AppTheme.brandBlue,
                            AppTheme.brandCyan,
                            AppTheme.brandSkyBlue,
                          ],
                        ),
                      ),
                      child: _UserAvatarWidget(user: user, radius: 36),
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
                                  _effectiveDisplayName(user, context),
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
                                        AppTheme.brandBlue,
                                        AppTheme.brandCyan,
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
                          if ((user?.email ?? '').isNotEmpty)
                            Text(
                              user!.email,
                              style: GoogleFonts.inter(
                                fontSize: 13,
                                color: context.textTertiaryColor,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
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
                      value: '$comparisonsCount',
                      label: context.l10n?.comparisons ?? 'Compares',
                      color: AppTheme.brandBlue,
                      onTap: () => context.push(AppRoutes.comparisons),
                    ),
                    const SizedBox(width: 8),
                    _StatPill(
                      value: '$favoritesCount',
                      label: context.l10n?.favorites ?? 'Favorites',
                      color: AppTheme.brandSkyBlue,
                      onTap: () => context.push(AppRoutes.collection),
                    ),
                    const SizedBox(width: 8),
                    _StatPill(
                      value: '$viewsCount',
                      label: context.l10n?.recentlyViewed ?? 'Views',
                      color: AppTheme.brandCyan,
                      onTap: () => context.push(AppRoutes.recentlyViewed),
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
                        AppTheme.brandBlue,
                        Color(0xFF8B5CF6),
                        AppTheme.brandCyan,
                      ],
                      begin: Alignment.centerLeft,
                      end: Alignment.centerRight,
                    ),
                    borderRadius: BorderRadius.circular(16),
                    boxShadow: [
                      BoxShadow(
                        color: AppTheme.brandBlue.withValues(alpha: 0.3),
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
              // Comparison History Preview
              _ContentSection(
                title: context.l10n?.comparisonHistory ?? 'Comparison History',
                icon: Icons.compare_arrows_rounded,
                color: AppTheme.brandBlue,
                onHeaderTap: () => context.push(AppRoutes.comparisons),
                child: _ComparisonPreviewList(
                  comparisons: comparisonHistory,
                  emptyMessage:
                      context.l10n?.noComparisonsYet ?? 'No comparisons yet',
                ),
              ),

              const SizedBox(height: 16),

              // Recently Viewed
              _ContentSection(
                title: context.l10n?.recentlyViewed ?? 'Recently Viewed',
                icon: Icons.history_rounded,
                color: AppTheme.brandDeepBlue,
                onHeaderTap: () => context.push(AppRoutes.recentlyViewed),
                child: _RecentlyViewedPreviewList(),
              ),

              const SizedBox(height: 16),

              // Yorumlarım
              _ContentSection(
                title: context.l10n?.userReviews ?? 'My Reviews',
                icon: Icons.rate_review_rounded,
                color: const Color(0xFF10B981),
                child: const _MyReviewsList(),
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
              colors: [
                AppTheme.brandDeepBlue,
                AppTheme.brandBlue,
                AppTheme.brandSkyBlue,
              ],
              begin: Alignment.centerLeft,
              end: Alignment.centerRight,
            ),
            borderRadius: BorderRadius.circular(16),
            boxShadow: [
              BoxShadow(
                color: AppTheme.brandDeepBlue.withOpacity(0.3),
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
                    'assets/logo/qor_ai_logo.png',
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

// ─── User Avatar Widget ────────────────────────────────────────────────────────
/// Shows network photo for OAuth users; gradient icon avatar for email users.
class _UserAvatarWidget extends StatelessWidget {
  final UserEntity? user;
  final double radius;

  const _UserAvatarWidget({required this.user, this.radius = 36});

  @override
  Widget build(BuildContext context) {
    final photoUrl = _resolvedPhotoUrl(user);

    if (photoUrl != null) {
      return CircleAvatar(
        radius: radius,
        backgroundColor: _avatarColorFromUid(user?.uid),
        child: ClipOval(
          child: CachedNetworkImage(
            imageUrl: photoUrl,
            width: radius * 2,
            height: radius * 2,
            fit: BoxFit.cover,
            memCacheWidth: (radius * 6).round(),
            maxWidthDiskCache: (radius * 6).round(),
            fadeInDuration: const Duration(milliseconds: 100),
            errorWidget: (_, __, ___) => _EmailAvatar(radius: radius),
          ),
        ),
      );
    }

    return _EmailAvatar(radius: radius);
  }
}

/// Consistent avatar for email/password users — same image for everyone.
class _EmailAvatar extends StatelessWidget {
  final double radius;
  const _EmailAvatar({this.radius = 36});

  @override
  Widget build(BuildContext context) {
    return CircleAvatar(
      radius: radius,
      backgroundImage: const AssetImage('assets/images/default_avatar.jpeg'),
      backgroundColor: AppTheme.brandBlue,
    );
  }
}

class _StatPill extends StatelessWidget {
  final String value;
  final String label;
  final Color color;
  final VoidCallback? onTap;
  const _StatPill({
    required this.value,
    required this.label,
    required this.color,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(14),
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 12),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: color.withValues(alpha: 0.12)),
              boxShadow: AppTheme.subtleShadow,
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
          border: Border.all(color: AppTheme.brandCyan.withValues(alpha: 0.15)),
          boxShadow: AppTheme.subtleShadow,
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
        border: Border.all(color: AppTheme.brandCyan.withValues(alpha: 0.15)),
        boxShadow: AppTheme.cardShadow,
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
                    Icon(Icons.arrow_forward_rounded, color: color, size: 20),
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

class _ComparisonPreviewList extends StatelessWidget {
  final List<ComparisonEntity> comparisons;
  final String emptyMessage;

  const _ComparisonPreviewList({
    required this.comparisons,
    required this.emptyMessage,
  });

  @override
  Widget build(BuildContext context) {
    if (comparisons.isEmpty) {
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
      children: comparisons.take(3).map((comparison) {
        final isTr = Localizations.localeOf(context).languageCode == 'tr';
        final subtitle = comparison.itemIds.length >= 2
            ? '${comparison.itemIds.length} ${isTr ? "ürün" : "items"} • ${_formatComparisonTimestamp(comparison.createdAt)}${comparison.occurrenceCount > 1 ? ' • ${comparison.occurrenceCount}x' : ''}'
            : (isTr ? 'Taslak karşılaştırma' : 'Draft comparison');
        return Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: InkWell(
            onTap: () =>
                context.push(AppRoutes.comparisonResult, extra: comparison),
            borderRadius: BorderRadius.circular(12),
            child: Row(
              children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [AppTheme.brandBlue, AppTheme.brandSkyBlue],
                    ),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(
                    Icons.compare_arrows_rounded,
                    color: Colors.white,
                    size: 22,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        (comparison.title ?? 'Comparison').trim().isEmpty
                            ? 'Comparison'
                            : comparison.title!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: context.textPrimary,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        subtitle,
                        style: TextStyle(
                          fontSize: 12,
                          color: context.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
                Icon(
                  Icons.chevron_right_rounded,
                  size: 20,
                  color: context.textTertiaryColor,
                ),
              ],
            ),
          ),
        );
      }).toList(),
    );
  }
}

String _formatComparisonTimestamp(DateTime date) {
  final now = DateTime.now();
  final hour = date.hour.toString().padLeft(2, '0');
  final minute = date.minute.toString().padLeft(2, '0');

  if (now.year == date.year && now.month == date.month && now.day == date.day) {
    return 'Today $hour:$minute';
  }

  final yesterday = now.subtract(const Duration(days: 1));
  if (yesterday.year == date.year &&
      yesterday.month == date.month &&
      yesterday.day == date.day) {
    return 'Yesterday $hour:$minute';
  }

  return '${date.day.toString().padLeft(2, '0')}/${date.month.toString().padLeft(2, '0')} $hour:$minute';
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
                  width: 56,
                  height: 56,
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: AppTheme.primaryBlue.withValues(alpha: 0.08),
                    ),
                  ),
                  clipBehavior: Clip.antiAlias,
                  child: product.imageURL.isNotEmpty
                      ? Padding(
                          padding: const EdgeInsets.all(4),
                          child: CachedNetworkImage(
                            imageUrl: product.imageURL,
                            fit: BoxFit.contain,
                            memCacheWidth: 168,
                            errorWidget: (_, __, ___) => Icon(
                              Icons.devices,
                              color: AppTheme.primaryBlue.withValues(alpha: 0.5),
                              size: 24,
                            ),
                          ),
                        )
                      : Icon(
                          Icons.devices,
                          color: AppTheme.primaryBlue.withValues(alpha: 0.5),
                          size: 24,
                        ),
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
        border: Border.all(color: AppTheme.brandCyan.withValues(alpha: 0.15)),
        boxShadow: AppTheme.cardShadow,
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
    final sub = ref.watch(subscriptionServiceProvider);

    final isTr = Localizations.localeOf(context).languageCode == 'tr';
    final totalCredits = FreemiumLimits.dailyCredits;
    final usedCredits = sub.usedDailyCredits;
    final remainingCredits = sub.remainingDailyCredits;
    final creditProgress = sub.isPremium
        ? 1.0
        : (usedCredits / totalCredits).clamp(0.0, 1.0);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.premiumBase.withValues(alpha: 0.15)),
        boxShadow: AppTheme.cardShadow,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                Icons.bolt_rounded,
                size: 18,
                color: AppTheme.premiumBase,
              ),
              const SizedBox(width: 8),
              Text(
                isTr ? 'Günlük AI Q' : 'Daily AI Q',
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
                  color: AppTheme.premiumBase.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  sub.isPremium ? 'PRO' : 'FREE',
                  style: GoogleFonts.inter(
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                    color: AppTheme.premiumBase,
                    letterSpacing: 0.5,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: sub.isPremium
                    ? [
                        AppTheme.premiumBase.withValues(alpha: 0.22),
                        AppTheme.brandCyan.withValues(alpha: 0.14),
                      ]
                    : [
                        AppTheme.premiumBase.withValues(alpha: 0.10),
                        AppTheme.brandBlue.withValues(alpha: 0.06),
                      ],
              ),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: AppTheme.premiumBase.withValues(alpha: 0.18),
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        sub.isPremium
                            ? (isTr
                              ? 'Sınırsız Q aktif'
                              : 'Unlimited Q active')
                            : (isTr
                              ? '$remainingCredits/$totalCredits Qor kaldı'
                              : '$remainingCredits/$totalCredits Qor left'),
                        style: GoogleFonts.inter(
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          color: context.textPrimary,
                        ),
                      ),
                    ),
                    QorBalanceBadge(
                      remaining: remainingCredits,
                      total: totalCredits,
                      unlimited: sub.isPremium,
                      color: AppTheme.premiumBase,
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  sub.isPremium
                      ? (isTr
                        ? 'Premium ile tüm AI akışlarında Qor sınırı olmadan devam edersiniz.'
                        : 'Premium removes Qor limits across all AI flows.')
                      : (isTr
                        ? 'Q bakiyesi günlük yenilenir. Ağır işlemler daha fazla Q tüketir.'
                        : 'Q balance refreshes daily. Heavier actions consume more Q.'),
                  style: GoogleFonts.inter(
                    fontSize: 12,
                    color: context.textSecondary,
                    height: 1.45,
                  ),
                ),
                if (!sub.isPremium) ...[
                  const SizedBox(height: 10),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(999),
                    child: LinearProgressIndicator(
                      value: creditProgress,
                      minHeight: 7,
                      backgroundColor: AppTheme.premiumBase.withValues(alpha: 0.14),
                      valueColor: const AlwaysStoppedAnimation(
                        AppTheme.premiumBase,
                      ),
                    ),
                  ),
                ],
              ],
            ),
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
  final int usageCount;
  final int creditCost;
  final bool isPremium;

  const _UsageRow({
    required this.label,
    required this.icon,
    required this.color,
    required this.usageCount,
    required this.creditCost,
    required this.isPremium,
  });

  @override
  Widget build(BuildContext context) {
    final isTr = Localizations.localeOf(context).languageCode == 'tr';

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: context.surfaceColor,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: color.withValues(alpha: 0.12)),
      ),
      child: Row(
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, size: 16, color: color),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: GoogleFonts.inter(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: context.textPrimary,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  isTr
                      ? '$usageCount kullanım bugün işlendi'
                      : '$usageCount uses processed today',
                  style: GoogleFonts.inter(
                    fontSize: 11,
                    fontWeight: FontWeight.w500,
                    color: context.textSecondary,
                  ),
                ),
              ],
            ),
          ),
          QorAmountBadge(
            amount: creditCost,
            unlimited: isPremium,
            color: color,
          ),
        ],
      ),
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
                context.l10n?.noReviewsYet ?? 'No reviews yet',
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
