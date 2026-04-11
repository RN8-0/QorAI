part of '../product_detail_screen.dart';

class _ReviewsTab extends ConsumerStatefulWidget {
  final ProductEntity product;
  final bool isDark;
  const _ReviewsTab({required this.product, required this.isDark});

  @override
  ConsumerState<_ReviewsTab> createState() => _ReviewsTabState();
}

class _ReviewsTabState extends ConsumerState<_ReviewsTab> {

  @override
  Widget build(BuildContext context) {
    final cardBg = context.surfaceVariantColor;

    return ListView(
      padding: EdgeInsets.fromLTRB(16, 16, 16, MediaQuery.of(context).padding.bottom + 40),
      children: [
        // ── YouTube Reviews ──
        _YouTubeReviewsCard(product: widget.product, isDark: widget.isDark, cardBg: cardBg),
        const SizedBox(height: 12),

        // ── User Reviews ──
        _UserReviewsCard(product: widget.product, isDark: widget.isDark, cardBg: cardBg),
        const SizedBox(height: 16),
      ],
    );
  }
}

// ═══════════════════════════════════════════════════════════
// YOUTUBE REVIEWS CARD (YouTube Data API v3)
// ═══════════════════════════════════════════════════════════

/// Delegates to SharedYouTubeReviewsCard, adds floating player on tap.
class _YouTubeReviewsCard extends ConsumerStatefulWidget {
  final ProductEntity product;
  final bool isDark;
  final Color cardBg;
  const _YouTubeReviewsCard({required this.product, required this.isDark, required this.cardBg});

  @override
  ConsumerState<_YouTubeReviewsCard> createState() => _YouTubeReviewsCardState();
}

class _YouTubeReviewsCardState extends ConsumerState<_YouTubeReviewsCard> {
  OverlayEntry? _pipOverlayEntry;

  void _closePiP() {
    _pipOverlayEntry?.remove();
    _pipOverlayEntry = null;
  }

  Future<void> _launchUrl(String url, String title, String thumbnailUrl) async {
    final ytRegex = RegExp(r'(?:youtube\.com/watch\?v=|youtu\.be/)([\w-]+)');
    final match = ytRegex.firstMatch(url);
    if (match != null) {
      final videoId = match.group(1)!;
      if (!mounted) return;
      _closePiP();
      _pipOverlayEntry = OverlayEntry(
        builder: (overlayCtx) => _FloatingYouTubePlayer(
          videoId: videoId,
          title: title,
          thumbnailUrl: thumbnailUrl.isNotEmpty
              ? thumbnailUrl
              : 'https://img.youtube.com/vi/$videoId/mqdefault.jpg',
          onClose: _closePiP,
        ),
      );
      Overlay.of(context).insert(_pipOverlayEntry!);
      return;
    }
    final uri = Uri.parse(url);
    try {
      await launchUrl(uri, mode: LaunchMode.inAppBrowserView);
    } catch (_) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SharedYouTubeReviewsCard(
      product: widget.product,
      isDark: widget.isDark,
      cardBg: widget.cardBg,
      collapsible: true,
      onVideoTap: _launchUrl,
    );
  }
}

// ═══════════════════════════════════════════════════════════
// AI REVIEW ANALYSIS CARD
// ═══════════════════════════════════════════════════════════

class _AIReviewAnalysisCard extends ConsumerStatefulWidget {
  final ProductEntity product;
  final bool isDark;
  final Color cardBg;
  const _AIReviewAnalysisCard({required this.product, required this.isDark, required this.cardBg});

  @override
  ConsumerState<_AIReviewAnalysisCard> createState() => _AIReviewAnalysisCardState();
}

class _AIReviewAnalysisCardState extends ConsumerState<_AIReviewAnalysisCard> {
  bool _expanded = false;

  Future<void> _handleTap() async {
    final reviewAsync = ref.read(aiReviewCacheProvider(widget.product.id));
    final hasResult = reviewAsync.valueOrNull != null;
    final isLoading = reviewAsync is AsyncLoading;

    if (isLoading) return;
    if (hasResult) {
      setState(() => _expanded = !_expanded);
      return;
    }
    setState(() => _expanded = true);
    final lang = Localizations.localeOf(context).languageCode;
    ref.read(aiReviewCacheProvider(widget.product.id).notifier)
        .startAnalysis(widget.product.name, lang);
  }

  @override
  Widget build(BuildContext context) {
    const gradient = [AppTheme.accentTeal, Color(0xFF14B8A6)];

    final reviewAsync = ref.watch(aiReviewCacheProvider(widget.product.id));
    final result = reviewAsync.valueOrNull;
    final isLoading = reviewAsync is AsyncLoading;
    final loaded = result != null;

    // Auto-expand when result arrives
    if (loaded && !_expanded) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) setState(() => _expanded = true);
      });
    }

    return GestureDetector(
      onTap: _handleTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeInOut,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: context.surfaceVariantColor,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppTheme.accentTeal.withValues(alpha: 0.15)),
          boxShadow: [BoxShadow(
            color: AppTheme.accentTeal.withValues(alpha: 0.08),
            blurRadius: 12, offset: const Offset(0, 4))],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(colors: gradient),
                  borderRadius: BorderRadius.circular(12)),
                child: Icon(Icons.analytics_rounded,
                  color: context.surfaceVariantColor, size: 20)),
              const SizedBox(width: 12),
              Expanded(child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(context.l10n?.aiReviewSummary ?? 'AI Review Analysis',
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 15, fontWeight: FontWeight.w700,
                      color: context.textPrimary)),
                  const SizedBox(height: 2),
                  Text(context.l10n?.poweredByAi ?? 'Powered by Compair AI',
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 12, color: context.textSecondary)),
                ])),
              if (isLoading)
                const SizedBox(width: 20, height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2))
              else
                Icon(_expanded && loaded
                    ? Icons.expand_less_rounded
                    : Icons.expand_more_rounded,
                  color: AppTheme.accentTeal),
            ]),
            if (_expanded && loaded) ...[
              const SizedBox(height: 14),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: AppTheme.accentTeal.withValues(alpha: 0.04),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppTheme.accentTeal.withValues(alpha: 0.1))),
                child: result.summary.isEmpty && result.praised.isEmpty
                    ? Text(context.l10n?.noReviewsYet ?? 'No community reviews found for this product.',
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 13, color: context.textSecondary))
                    : _buildResult(result),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildResult(AIReviewResult result) {
    final satColor = result.satisfaction >= 75
        ? AppTheme.success
        : result.satisfaction >= 50
            ? AppTheme.warning
            : AppTheme.error;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Satisfaction gauge row
        if (result.satisfaction > 0) ...[
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: context.surfaceVariantColor,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppTheme.accentTeal.withValues(alpha: 0.2)),
            ),
            child: Row(
              children: [
                SizedBox(
                  width: 64, height: 64,
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      CircularProgressIndicator(
                        value: result.satisfaction / 100,
                        strokeWidth: 5,
                        backgroundColor: satColor.withValues(alpha: 0.12),
                        valueColor: AlwaysStoppedAnimation<Color>(satColor),
                      ),
                      Text(
                        '${result.satisfaction}%',
                        style: TextStyle(fontSize: 13, fontWeight: FontWeight.w900, color: satColor),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Community Satisfaction',
                        style: TextStyle(fontSize: 11, color: AppTheme.slate500, fontWeight: FontWeight.w600),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        result.satisfaction >= 80 ? (context.l10n?.highlyRecommended ?? 'Highly recommended') :
                        result.satisfaction >= 65 ? (context.l10n?.generallyPositive ?? 'Generally positive') :
                        result.satisfaction >= 45 ? (context.l10n?.mixedOpinions ?? 'Mixed opinions') : (context.l10n?.notableConcerns ?? 'Notable concerns'),
                        style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: satColor),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        context.l10n?.satisfactionSource ?? 'Based on Reddit, forums & community reviews',
                        style: TextStyle(fontSize: 10, color: AppTheme.slate400),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 10),
        ],
        // Summary text
        if (result.summary.isNotEmpty) ...[
          Text(
            result.summary,
            style: TextStyle(
              fontSize: 13,
              height: 1.6,
              color: context.textPrimary,
            ),
          ),
          const SizedBox(height: 12),
        ],
        // Praised chips
        if (result.praised.isNotEmpty) ...[
          Text('👍 ${context.l10n?.praised ?? 'Praised'}', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppTheme.slate500)),
          const SizedBox(height: 6),
          Wrap(
            spacing: 6, runSpacing: 6,
            children: result.praised.map((p) => Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: AppTheme.success.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: AppTheme.success.withValues(alpha: 0.3)),
              ),
              child: Text('✓ $p', style: const TextStyle(fontSize: 12, color: Color(0xFF16A34A), fontWeight: FontWeight.w600)),
            )).toList(),
          ),
          const SizedBox(height: 10),
        ],
        // Criticized chips
        if (result.criticized.isNotEmpty) ...[
          Text('👎 ${context.l10n?.criticized ?? 'Criticized'}', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppTheme.slate500)),
          const SizedBox(height: 6),
          Wrap(
            spacing: 6, runSpacing: 6,
            children: result.criticized.map((c) => Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: AppTheme.error.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: AppTheme.error.withValues(alpha: 0.3)),
              ),
              child: Text('✗ $c', style: const TextStyle(fontSize: 12, color: AppTheme.error, fontWeight: FontWeight.w600)),
            )).toList(),
          ),
        ],
        // AI disclosure label
        const SizedBox(height: 14),
        Row(
          children: [
            const Icon(Icons.auto_awesome, size: 11, color: AppTheme.slate400),
            const SizedBox(width: 4),
            Expanded(
              child: Text(
                'Generated by AI · Based on publicly available community reviews · May not be accurate',
                style: TextStyle(fontSize: 10, color: AppTheme.slate400, fontStyle: FontStyle.italic),
              ),
            ),
          ],
        ),
      ],
    );
  }

}

// ═══════════════════════════════════════════════════════════
// USER REVIEWS CARD
// ═══════════════════════════════════════════════════════════

class _UserReviewsCard extends ConsumerStatefulWidget {
  final ProductEntity product;
  final bool isDark;
  final Color cardBg;

  const _UserReviewsCard({
    required this.product,
    required this.isDark,
    required this.cardBg,
  });

  @override
  ConsumerState<_UserReviewsCard> createState() => _UserReviewsCardState();
}

class _UserReviewsCardState extends ConsumerState<_UserReviewsCard> {
  int _selectedFilter = 0; // 0=All, 1=Positive, 2=Critical

  @override
  Widget build(BuildContext context) {
    final reviewsAsync = ref.watch(productReviewsProvider(widget.product.id));
    final authState = ref.watch(authStateProvider);
    final currentUser = authState.valueOrNull;

    return Container(
      decoration: BoxDecoration(
        color: widget.cardBg,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: reviewsAsync.when(
              data: (reviews) {
                if (reviews.isEmpty) return _buildEmptyState(currentUser != null);
                return _buildReviewsContent(reviews, currentUser);
              },
              loading: () => const Center(
                child: Padding(
                  padding: EdgeInsets.all(24),
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
              error: (_, _) => Padding(
                padding: const EdgeInsets.all(16),
                child: Text(context.l10n?.couldNotLoadReviews ?? 'Could not load reviews'),
              ),
            ),
          ),
          // Sticky write review button
          if (currentUser != null)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: Container(
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [AppTheme.primaryBlue, AppTheme.neonPurple],
                  ),
                  borderRadius: BorderRadius.circular(14),
                  boxShadow: [
                    BoxShadow(
                      color: AppTheme.primaryBlue.withValues(alpha: 0.25),
                      blurRadius: 12, offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: Material(
                  color: Colors.transparent,
                  child: InkWell(
                    borderRadius: BorderRadius.circular(14),
                    onTap: () {
                      final uid = currentUser.uid;
                      _showWriteReviewSheet(context, uid);
                    },
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Icon(Icons.edit_note_rounded, size: 18, color: Colors.white),
                          const SizedBox(width: 8),
                          Text(
                            context.l10n?.writeAReview ?? 'Write a Review',
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 15, fontWeight: FontWeight.w700, color: Colors.white),
                          ),
                        ],
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

  Widget _buildReviewsContent(List<ReviewModel> reviews, dynamic currentUser) {
    final avgRating = reviews.isEmpty
        ? 0.0
        : reviews.map((r) => r.rating).reduce((a, b) => a + b) / reviews.length;

    // Filter reviews
    final filtered = _selectedFilter == 0
        ? reviews
        : _selectedFilter == 1
            ? reviews.where((r) => r.rating >= 4.0).toList()
            : reviews.where((r) => r.rating <= 2.0).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Rating summary header
        _buildRatingSummary(avgRating, reviews.length, reviews),
        const SizedBox(height: 16),

        // Pill-style filter tabs
        _buildFilterTabs(reviews),
        const SizedBox(height: 14),

        // Review cards
        if (filtered.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 24),
            child: Center(
              child: Text(
                'No reviews in this category',
                style: TextStyle(fontSize: 13, color: AppTheme.slate500),
              ),
            ),
          )
        else ...[
          ...filtered.take(5).map((review) => _buildReviewItem(review)),
          if (filtered.length > 5)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Center(
                child: Text(
                  '+ ${filtered.length - 5} more reviews',
                  style: TextStyle(fontSize: 13, color: AppTheme.slate500, fontWeight: FontWeight.w500),
                ),
              ),
            ),
        ],
      ],
    );
  }

  Widget _buildRatingSummary(double avgRating, int totalCount, List<ReviewModel> reviews) {
    // Distribution bars
    final dist = List.filled(5, 0);
    for (final r in reviews) {
      final idx = r.rating.round().clamp(1, 5) - 1;
      dist[idx]++;
    }

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppTheme.primaryBlue.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppTheme.primaryBlue.withValues(alpha: 0.1)),
      ),
      child: Row(
        children: [
          // Left: big number + stars + count
          Column(
            children: [
              Text(
                avgRating.toStringAsFixed(1),
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 40, fontWeight: FontWeight.w900, color: context.textPrimary, height: 1),
              ),
              const SizedBox(height: 6),
              _buildStarRow(avgRating, size: 18),
              const SizedBox(height: 4),
              Text(
                '$totalCount ${context.l10n?.reviews ?? 'reviews'}',
                style: GoogleFonts.plusJakartaSans(fontSize: 12, color: AppTheme.slate500),
              ),
            ],
          ),
          const SizedBox(width: 20),
          // Right: distribution bars
          Expanded(
            child: Column(
              children: List.generate(5, (i) {
                final star = 5 - i;
                final count = dist[star - 1];
                final pct = totalCount > 0 ? count / totalCount : 0.0;
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 2),
                  child: Row(
                    children: [
                      Text('$star', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppTheme.slate500)),
                      const SizedBox(width: 4),
                      Icon(Icons.star_rounded, size: 12, color: AppTheme.warning),
                      const SizedBox(width: 6),
                      Expanded(
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(4),
                          child: LinearProgressIndicator(
                            value: pct,
                            minHeight: 6,
                            backgroundColor: AppTheme.slate500.withValues(alpha: 0.15),
                            valueColor: AlwaysStoppedAnimation<Color>(AppTheme.warning),
                          ),
                        ),
                      ),
                      const SizedBox(width: 6),
                      SizedBox(
                        width: 24,
                        child: Text('$count', style: TextStyle(fontSize: 10, color: AppTheme.slate500)),
                      ),
                    ],
                  ),
                );
              }),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFilterTabs(List<ReviewModel> reviews) {
    final positiveCount = reviews.where((r) => r.rating >= 4.0).length;
    final criticalCount = reviews.where((r) => r.rating <= 2.0).length;

    final tabs = [
      ('All', reviews.length),
      ('Positive', positiveCount),
      ('Critical', criticalCount),
    ];

    return Row(
      children: List.generate(tabs.length, (i) {
        final isSelected = _selectedFilter == i;
        final (label, count) = tabs[i];
        return Padding(
          padding: const EdgeInsets.only(right: 8),
          child: GestureDetector(
            onTap: () => setState(() => _selectedFilter = i),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              decoration: BoxDecoration(
                color: isSelected
                    ? AppTheme.primaryBlue.withValues(alpha: 0.12)
                    : Colors.transparent,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(
                  color: isSelected
                      ? AppTheme.primaryBlue.withValues(alpha: 0.4)
                      : AppTheme.slate500.withValues(alpha: 0.2),
                ),
              ),
              child: Text(
                '$label ($count)',
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 12,
                  fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                  color: isSelected ? AppTheme.primaryBlue : AppTheme.slate500,
                ),
              ),
            ),
          ),
        );
      }),
    );
  }

  Widget _buildReviewItem(ReviewModel review) {
    final timeDiff = DateTime.now().difference(review.createdAt);
    String timeAgo;
    if (timeDiff.inDays > 365) {
      timeAgo = '${timeDiff.inDays ~/ 365}y ago';
    } else if (timeDiff.inDays > 30) {
      timeAgo = '${timeDiff.inDays ~/ 30}mo ago';
    } else if (timeDiff.inDays > 0) {
      timeAgo = '${timeDiff.inDays}d ago';
    } else if (timeDiff.inHours > 0) {
      timeAgo = '${timeDiff.inHours}h ago';
    } else {
      timeAgo = 'Just now';
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: context.surfaceColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: context.dividerColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 14,
                backgroundColor: AppTheme.brandBlue.withValues(alpha: 0.15),
                child: Text(
                  review.userId.isNotEmpty ? review.userId[0].toUpperCase() : '?',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 11, fontWeight: FontWeight.w700, color: AppTheme.brandBlue),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(child: Text('User',
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 12, fontWeight: FontWeight.w600, color: context.textPrimary),
                maxLines: 1, overflow: TextOverflow.ellipsis)),
              if (review.rating > 0) ...[
                _buildStarRow(review.rating, size: 13),
                const SizedBox(width: 6),
              ],
              Text(timeAgo,
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 11, color: context.textTertiaryColor)),
            ],
          ),
          if (review.text.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(review.text,
              style: GoogleFonts.plusJakartaSans(
                fontSize: 13, height: 1.5, color: context.textSecondary)),
          ],
        ],
      ),
    );
  }

  Widget _buildEmptyState(bool isLoggedIn) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 24),
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(children: [
        Icon(Icons.rate_review_outlined, size: 32, color: context.textTertiaryColor),
        const SizedBox(height: 8),
        Text(context.l10n?.noReviewsYet ?? 'No reviews yet',
          style: GoogleFonts.plusJakartaSans(
            fontSize: 14, fontWeight: FontWeight.w600, color: context.textPrimary)),
        const SizedBox(height: 4),
        Text(
          isLoggedIn
            ? (context.l10n?.beFirstToReview ?? 'Be the first to share your thoughts!')
            : (context.l10n?.signInToReview ?? 'Sign in to write a review'),
          style: GoogleFonts.plusJakartaSans(
            fontSize: 12, color: context.textTertiaryColor)),
      ]),
    );
  }

  Widget _buildStarRow(double rating, {double size = 16}) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: List.generate(5, (i) {
        if (i < rating.floor()) {
          return Icon(Icons.star_rounded,
              color: AppTheme.warning, size: size);
        } else if (i < rating) {
          return Icon(Icons.star_half_rounded,
              color: AppTheme.warning, size: size);
        }
        return Icon(Icons.star_outline_rounded,
            color: AppTheme.slate400, size: size);
      }),
    );
  }

  void _showWriteReviewSheet(BuildContext context, String userId) {
    final textController = TextEditingController();

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) => Container(
          padding: EdgeInsets.only(
            left: 20,
            right: 20,
            top: 0,
            bottom: MediaQuery.of(ctx).viewInsets.bottom + 20,
          ),
          decoration: BoxDecoration(
            color: context.backgroundColor,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Gradient header
              Container(
                width: double.infinity,
                padding: const EdgeInsets.fromLTRB(0, 16, 0, 20),
                child: Column(
                  children: [
                    // Handle bar
                    Container(
                      width: 40,
                      height: 4,
                      decoration: BoxDecoration(
                        color: AppTheme.slate400.withValues(alpha: 0.5),
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                    const SizedBox(height: 20),
                    // Product image + name
                    Row(
                      children: [
                        Container(
                          width: 48, height: 48,
                          decoration: BoxDecoration(
                            color: AppTheme.warning.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: const Icon(Icons.rate_review_rounded, 
                            color: AppTheme.warning, size: 24),
                        ),
                        const SizedBox(width: 14),
                        Expanded(child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              context.l10n?.writeAReview ?? 'Write a Review',
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 20, fontWeight: FontWeight.w800,
                                color: context.textPrimary),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              widget.product.name,
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 13, color: context.textSecondary),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ],
                        )),
                      ],
                    ),
                  ],
                ),
              ),

              // Comment field with modern design
              TextField(
                controller: textController,
                maxLines: 4,
                maxLength: 500,
                onChanged: (_) => setSheetState(() {}),
                style: GoogleFonts.plusJakartaSans(fontSize: 14, height: 1.5),
                decoration: InputDecoration(
                  hintText: context.l10n?.shareYourExperience ?? 'Share your experience...',
                  hintStyle: GoogleFonts.plusJakartaSans(
                    color: AppTheme.slate400, fontSize: 14),
                  filled: true,
                  fillColor: context.surfaceVariantColor,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(16),
                    borderSide: BorderSide.none,
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(16),
                    borderSide: BorderSide(
                      color: AppTheme.warning.withValues(alpha: 0.5), width: 1.5),
                  ),
                  contentPadding: const EdgeInsets.all(16),
                  counterStyle: GoogleFonts.plusJakartaSans(
                    fontSize: 11, color: context.textSecondary),
                ),
              ),
              const SizedBox(height: 16),

              // Submit button with gradient
              SizedBox(
                width: double.infinity,
                height: 52,
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: textController.text.trim().isNotEmpty
                      ? const LinearGradient(
                          colors: [AppTheme.primaryBlue, AppTheme.neonPurple])
                      : null,
                    color: textController.text.trim().isNotEmpty
                      ? null : context.textTertiaryColor,
                    borderRadius: BorderRadius.circular(16),
                    boxShadow: textController.text.trim().isNotEmpty
                      ? [BoxShadow(
                          color: AppTheme.primaryBlue.withValues(alpha: 0.3),
                          blurRadius: 12, offset: const Offset(0, 4))]
                      : null,
                  ),
                  child: ElevatedButton.icon(
                    onPressed: textController.text.trim().isNotEmpty
                        ? () => _submitReview(
                              ctx,
                              userId,
                              0.0,
                              textController.text.trim(),
                            )
                        : null,
                    icon: const Icon(Icons.send_rounded, size: 18),
                    label: Text(
                      'Submit Review',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 15, fontWeight: FontWeight.w700),
                    ),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.transparent,
                      foregroundColor: Colors.white,
                      shadowColor: Colors.transparent,
                      disabledBackgroundColor: Colors.transparent,
                      disabledForegroundColor: Colors.white54,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16)),
                      elevation: 0,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // _ratingLabel removed — star ratings no longer used

  Future<void> _submitReview(
    BuildContext ctx,
    String userId,
    double rating,
    String text,
  ) async {
    final review = ReviewModel(
      id: '',
      userId: userId,
      productId: widget.product.id,
      rating: rating,
      text: text,
      createdAt: DateTime.now(),
    );

    try {
      final repo = ref.read(productRepositoryProvider);
      final result = await repo.addReview(review);
      result.when(
        success: (_) {
          ref.invalidate(productReviewsProvider(widget.product.id));
          if (ctx.mounted) {
            Navigator.of(ctx).pop();
            ScaffoldMessenger.of(ctx).showSnackBar(
              SnackBar(
                content: Text(ctx.l10n?.reviewSubmittedStar ?? 'Review submitted!'),
                behavior: SnackBarBehavior.floating,
              ),
            );
          }
        },
        failure: (e) {
          if (ctx.mounted) {
            ScaffoldMessenger.of(ctx).showSnackBar(
              SnackBar(
                content: Text(ctx.l10n?.errorMessage('$e') ?? 'Error: $e'),
                behavior: SnackBarBehavior.floating,
              ),
            );
          }
        },
      );
    } catch (e) {
      if (ctx.mounted) {
        ScaffoldMessenger.of(ctx).showSnackBar(
          SnackBar(
            content: Text(ctx.l10n?.errorMessage('$e') ?? 'Error: $e'),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    }
  }
}
