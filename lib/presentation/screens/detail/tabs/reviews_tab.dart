part of '../product_detail_screen.dart';

class _ReviewsTab extends ConsumerStatefulWidget {
  final ProductEntity product;
  final bool isDark;
  const _ReviewsTab({required this.product, required this.isDark});

  @override
  ConsumerState<_ReviewsTab> createState() => _ReviewsTabState();
}

class _ReviewsTabState extends ConsumerState<_ReviewsTab> {
  bool _showYouTubeSection = false;
  bool _showUserReviewsSection = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      Future<void>.delayed(const Duration(milliseconds: 120), () {
        if (!mounted) return;
        setState(() => _showYouTubeSection = true);
      });
      Future<void>.delayed(const Duration(milliseconds: 260), () {
        if (!mounted) return;
        setState(() => _showUserReviewsSection = true);
      });
    });
  }

  @override
  Widget build(BuildContext context) {
    final cardBg = context.surfaceVariantColor;

    return ListView(
      padding: EdgeInsets.fromLTRB(
        16,
        16,
        16,
        MediaQuery.of(context).padding.bottom + 40,
      ),
      children: [
        // ── Google Shopping Prices ──
        _GoogleShoppingCard(product: widget.product, isDark: widget.isDark, cardBg: cardBg),
        const SizedBox(height: 12),

        // ── YouTube Reviews ──
        if (_showYouTubeSection)
          _YouTubeReviewsCard(
            product: widget.product,
            isDark: widget.isDark,
            cardBg: cardBg,
          )
        else
          const _DeferredReviewCardPlaceholder(height: 220),
        const SizedBox(height: 12),

        // ── User Reviews ──
        if (_showUserReviewsSection)
          _UserReviewsCard(
            product: widget.product,
            isDark: widget.isDark,
            cardBg: cardBg,
          )
        else
          const _DeferredReviewCardPlaceholder(height: 260),
        const SizedBox(height: 16),
      ],
    );
  }
}

class _DeferredReviewCardPlaceholder extends StatelessWidget {
  final double height;

  const _DeferredReviewCardPlaceholder({required this.height});

  @override
  Widget build(BuildContext context) {
    return Container(
      height: height,
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Center(
        child: SizedBox(
          width: 22,
          height: 22,
          child: CircularProgressIndicator(
            strokeWidth: 2,
            color: context.textTertiaryColor.withValues(alpha: 0.45),
          ),
        ),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════
// YOUTUBE REVIEWS CARD (public YouTube search parsing)
// ═══════════════════════════════════════════════════════════

/// Delegates to SharedYouTubeReviewsCard, adds floating player on tap.
class _YouTubeReviewsCard extends ConsumerStatefulWidget {
  final ProductEntity product;
  final bool isDark;
  final Color cardBg;
  const _YouTubeReviewsCard({
    required this.product,
    required this.isDark,
    required this.cardBg,
  });

  @override
  ConsumerState<_YouTubeReviewsCard> createState() =>
      _YouTubeReviewsCardState();
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

String _localizedCommunitySatisfactionLabel(BuildContext context) {
  final languageCode = Localizations.localeOf(
    context,
  ).languageCode.toLowerCase();
  const labels = <String, String>{
    'ar': 'رضا المجتمع',
    'de': 'Community-Zufriedenheit',
    'en': 'Community Satisfaction',
    'es': 'Satisfaccion de la comunidad',
    'fr': 'Satisfaction de la communaute',
    'it': 'Soddisfazione della community',
    'ja': 'コミュニティ満足度',
    'nl': 'Communitytevredenheid',
    'pl': 'Satysfakcja spolecznosci',
    'pt': 'Satisfacao da comunidade',
    'sv': 'Communitynojdhet',
    'tr': 'Topluluk Memnuniyeti',
  };
  return labels[languageCode] ?? labels['en']!;
}

String _localizedAiReviewDisclosure(BuildContext context) {
  final languageCode = Localizations.localeOf(
    context,
  ).languageCode.toLowerCase();
  const labels = <String, String>{
    'ar':
        'تم إنشاؤه بالذكاء الاصطناعي · يعتمد على مراجعات المجتمع العامة · قد لا يكون دقيقًا بالكامل',
    'de':
        'KI-generiert · Basiert auf offentlich verfugbaren Community-Bewertungen · Kann ungenau sein',
    'en':
        'Generated by AI · Based on publicly available community reviews · May not be accurate',
    'es':
        'Generado por IA · Basado en opiniones publicas de la comunidad · Puede no ser preciso',
    'fr':
        'Genere par IA · Base sur des avis publics de la communaute · Peut etre inexact',
    'it':
        'Generato dall\'IA · Basato su recensioni pubbliche della community · Potrebbe non essere accurato',
    'ja': 'AI 生成 · 公開されているコミュニティレビューに基づく · 正確でない場合があります',
    'nl':
        'Gegenereerd door AI · Gebaseerd op openbaar beschikbare communityreviews · Kan onnauwkeurig zijn',
    'pl':
        'Wygenerowane przez AI · Oparte na publicznie dostepnych opiniach spolecznosci · Moze byc niedokladne',
    'pt':
        'Gerado por IA · Baseado em avaliacoes publicas da comunidade · Pode nao ser preciso',
    'sv':
        'Genererat av AI · Baserat pa offentliga communityrecensioner · Kan vara felaktigt',
    'tr':
        'Yapay zeka tarafindan uretildi · Herkese acik topluluk yorumlarina dayanir · Tam dogru olmayabilir',
  };
  return labels[languageCode] ?? labels['en']!;
}

class _AIReviewAnalysisCard extends ConsumerStatefulWidget {
  final ProductEntity product;
  final bool isDark;
  final Color cardBg;
  const _AIReviewAnalysisCard({
    required this.product,
    required this.isDark,
    required this.cardBg,
  });

  @override
  ConsumerState<_AIReviewAnalysisCard> createState() =>
      _AIReviewAnalysisCardState();
}

class _AIReviewAnalysisCardState extends ConsumerState<_AIReviewAnalysisCard> {
  bool _expanded = false;

  Future<void> _handleTap() async {
    if (!requireAuth(context)) return;
    final languageCode = Localizations.localeOf(context).languageCode;
    final reviewKey = LocalizedProductKey(
      productId: widget.product.id,
      languageCode: languageCode,
    );
    final reviewAsync = ref.read(aiReviewCacheProvider(reviewKey));
    final hasResult = reviewAsync.valueOrNull != null;
    final isLoading = reviewAsync is AsyncLoading;

    if (isLoading) return;
    if (hasResult) {
      setState(() => _expanded = !_expanded);
      return;
    }
    // Check detail AI limit before fetching
    final sub = ref.read(subscriptionServiceProvider);
    if (!sub.canUseDetailAi) {
      showLimitReachedDialog(context, featureName: 'detail-ai');
      return;
    }
    sub.recordDetailAi();
    setState(() => _expanded = true);
    ref
        .read(aiReviewCacheProvider(reviewKey).notifier)
        .startAnalysis(widget.product.name);
  }

  @override
  Widget build(BuildContext context) {
    const gradient = [AppTheme.accentTeal, Color(0xFF14B8A6)];
    final reviewKey = LocalizedProductKey(
      productId: widget.product.id,
      languageCode: Localizations.localeOf(context).languageCode,
    );

    final reviewAsync = ref.watch(aiReviewCacheProvider(reviewKey));
    final result = reviewAsync.valueOrNull;
    final isLoading = reviewAsync is AsyncLoading;
    final loaded = result != null;

    final isPremium = ref.watch(
      subscriptionServiceProvider.select((service) => service.isPremium),
    );
    final detailAiCost = ref.watch(
      subscriptionServiceProvider.select(
        (service) => service.creditCostForFeature('detail_ai'),
      ),
    );

    // AI step message (replaces subtitle when loading)
    final stepMessage = ref.watch(
      aiOperationStepProvider('${widget.product.id}_review'),
    );

    // Auto-expand via ref.listen — avoids addPostFrameCallback rebuild cascade.
    ref.listen(aiReviewCacheProvider(reviewKey), (_, next) {
      if (next.valueOrNull != null && !_expanded) {
        setState(() => _expanded = true);
      }
    });

    return GestureDetector(
      onTap: _handleTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeInOut,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: context.surfaceVariantColor,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: AppTheme.accentTeal.withValues(alpha: 0.15),
          ),
          boxShadow: [
            BoxShadow(
              color: AppTheme.accentTeal.withValues(alpha: 0.08),
              blurRadius: 12,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(colors: gradient),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(
                    Icons.analytics_rounded,
                    color: context.surfaceVariantColor,
                    size: 20,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              context.l10n?.aiReviewSummary ?? 'AI Review Analysis',
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 15,
                                fontWeight: FontWeight.w700,
                                color: context.textPrimary,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          if (!isPremium && !loaded)
                            QorAmountBadge(
                              amount: detailAiCost,
                              color: AppTheme.accentTeal,
                              fontSize: 10,
                              padding: const EdgeInsets.symmetric(
                                horizontal: 7,
                                vertical: 3,
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(height: 2),
                      AnimatedSwitcher(
                        duration: const Duration(milliseconds: 250),
                        child: Text(
                          key: ValueKey(
                            isLoading && stepMessage.isNotEmpty
                                ? stepMessage
                                : 'subtitle',
                          ),
                          isLoading && stepMessage.isNotEmpty
                              ? stepMessage
                              : (loaded && (result?.summary.isNotEmpty ?? false)
                                  ? result!.summary
                                  : (Localizations.localeOf(context)
                                              .languageCode ==
                                          'tr'
                                      ? 'Topluluk yorumlarından oluşturulan AI özeti'
                                      : 'AI summary built from community reviews')),
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 12,
                            color: isLoading && stepMessage.isNotEmpty
                                ? AppTheme.accentTeal.withValues(alpha: 0.9)
                                : context.textSecondary,
                            fontStyle: isLoading && stepMessage.isNotEmpty
                                ? FontStyle.italic
                                : FontStyle.normal,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                ),
                if (isLoading)
                  const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                else
                  Icon(
                    _expanded && loaded
                        ? Icons.expand_less_rounded
                        : Icons.expand_more_rounded,
                    color: AppTheme.accentTeal,
                  ),
              ],
            ),
            if (_expanded && loaded) ...[
              const SizedBox(height: 14),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: AppTheme.accentTeal.withValues(alpha: 0.04),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: AppTheme.accentTeal.withValues(alpha: 0.1),
                  ),
                ),
                child: result.summary.isEmpty && result.praised.isEmpty
                    ? Text(
                        context.l10n?.noReviewsYet ??
                            'No community reviews found for this product.',
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 13,
                          color: context.textSecondary,
                        ),
                      )
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
              border: Border.all(
                color: AppTheme.accentTeal.withValues(alpha: 0.2),
              ),
            ),
            child: Row(
              children: [
                SizedBox(
                  width: 64,
                  height: 64,
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
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w900,
                          color: satColor,
                        ),
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
                        _localizedCommunitySatisfactionLabel(context),
                        style: TextStyle(
                          fontSize: 11,
                          color: AppTheme.slate500,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        result.satisfaction >= 80
                            ? (context.l10n?.highlyRecommended ??
                                  'Highly recommended')
                            : result.satisfaction >= 65
                            ? (context.l10n?.generallyPositive ??
                                  'Generally positive')
                            : result.satisfaction >= 45
                            ? (context.l10n?.mixedOpinions ?? 'Mixed opinions')
                            : (context.l10n?.notableConcerns ??
                                  'Notable concerns'),
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: satColor,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        context.l10n?.satisfactionSource ??
                            'Based on Reddit, forums & community reviews',
                        style: TextStyle(
                          fontSize: 10,
                          color: AppTheme.slate400,
                        ),
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
          Text(
            '👍 ${context.l10n?.praised ?? 'Praised'}',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: AppTheme.slate500,
            ),
          ),
          const SizedBox(height: 6),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: result.praised
                .map(
                  (p) => Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 5,
                    ),
                    decoration: BoxDecoration(
                      color: AppTheme.success.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(
                        color: AppTheme.success.withValues(alpha: 0.3),
                      ),
                    ),
                    child: Text(
                      '✓ $p',
                      style: const TextStyle(
                        fontSize: 12,
                        color: Color(0xFF16A34A),
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                )
                .toList(),
          ),
          const SizedBox(height: 10),
        ],
        // Criticized chips
        if (result.criticized.isNotEmpty) ...[
          Text(
            '👎 ${context.l10n?.criticized ?? 'Criticized'}',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: AppTheme.slate500,
            ),
          ),
          const SizedBox(height: 6),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: result.criticized
                .map(
                  (c) => Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 5,
                    ),
                    decoration: BoxDecoration(
                      color: AppTheme.error.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(
                        color: AppTheme.error.withValues(alpha: 0.3),
                      ),
                    ),
                    child: Text(
                      '✗ $c',
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppTheme.error,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                )
                .toList(),
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
                _localizedAiReviewDisclosure(context),
                style: TextStyle(
                  fontSize: 10,
                  color: AppTheme.slate400,
                  fontStyle: FontStyle.italic,
                ),
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

enum _ReviewSort { top, newest }

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
  _ReviewSort _sort = _ReviewSort.top;

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
                if (reviews.isEmpty)
                  return _buildEmptyState(currentUser != null);
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
                child: Text(
                  context.l10n?.couldNotLoadReviews ?? 'Could not load reviews',
                ),
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
                      blurRadius: 12,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: Material(
                  color: Colors.transparent,
                  child: InkWell(
                    borderRadius: BorderRadius.circular(14),
                    onTap: () {
                      final uid = currentUser;
                      _showWriteReviewSheet(context, uid);
                    },
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Icon(
                            Icons.edit_note_rounded,
                            size: 18,
                            color: Colors.white,
                          ),
                          const SizedBox(width: 8),
                          Text(
                            context.l10n?.writeAReview ?? 'Write a Review',
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 15,
                              fontWeight: FontWeight.w700,
                              color: Colors.white,
                            ),
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
    final currentUserId = currentUser as String?;

    // YouTube-style sort: Top = likes - dislikes (score), Newest = createdAt desc
    final sorted = List<ReviewModel>.from(reviews);
    if (_sort == _ReviewSort.top) {
      sorted.sort((a, b) {
        final scoreA = a.likedBy.length - a.dislikedBy.length;
        final scoreB = b.likedBy.length - b.dislikedBy.length;
        return scoreB.compareTo(scoreA);
      });
    } else {
      sorted.sort((a, b) => b.createdAt.compareTo(a.createdAt));
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Header row: count + sort selector
        Padding(
          padding: const EdgeInsets.only(bottom: 14),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  '${reviews.length} ${context.l10n?.reviews ?? 'yorum'}',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: context.textSecondary,
                  ),
                ),
              ),
              // Sort toggle
              GestureDetector(
                onTap: () => setState(() {
                  _sort = _sort == _ReviewSort.top
                      ? _ReviewSort.newest
                      : _ReviewSort.top;
                }),
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 5,
                  ),
                  decoration: BoxDecoration(
                    color: AppTheme.brandBlue.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(
                      color: AppTheme.brandBlue.withValues(alpha: 0.2),
                    ),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        _sort == _ReviewSort.top
                            ? Icons.thumb_up_alt_outlined
                            : Icons.access_time_rounded,
                        size: 12,
                        color: AppTheme.brandBlue,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        _sort == _ReviewSort.top
                            ? (context.l10n?.topComments ?? 'Top Comments')
                            : (context.l10n?.newestFirst ?? 'Newest First'),
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: AppTheme.brandBlue,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),

        // Review cards
        ...sorted
            .take(5)
            .map((review) => _buildReviewItem(review, currentUserId)),
        if (sorted.length > 5)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Center(
              child: Text(
                '+ ${sorted.length - 5} more reviews',
                style: TextStyle(
                  fontSize: 13,
                  color: AppTheme.slate500,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
          ),
      ],
    );
  }

  Widget _buildReviewItem(ReviewModel review, String? currentUserId) {
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

    return _ReviewCard(
      reviewId: review.id,
      productId: widget.product.id,
      firestoreCollection: AppConstants.reviewsCollection,
      userId: review.userId,
      displayName: _resolveReviewDisplayName(review, currentUserId),
      currentUserPhotoUrl: _resolveReviewPhotoUrl(review, currentUserId),
      timeAgo: timeAgo,
      text: review.text,
      rating: review.rating,
      likedBy: review.likedBy,
      dislikedBy: review.dislikedBy,
      currentUserId: currentUserId,
      onDelete: review.userId == currentUserId
          ? () async {
              final confirmed = await showDialog<bool>(
                context: context,
                builder: (ctx) => AlertDialog(
                  backgroundColor: context.surfaceColor,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                  title: Text(
                    context.l10n?.deleteReview ?? 'Delete Review',
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  content: Text(
                    context.l10n?.deleteReviewConfirm ??
                        'Are you sure you want to delete this review? All replies will also be removed.',
                    style: GoogleFonts.plusJakartaSans(fontSize: 14),
                  ),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.pop(ctx, false),
                      child: Text(context.l10n?.cancel ?? 'Cancel'),
                    ),
                    TextButton(
                      onPressed: () => Navigator.pop(ctx, true),
                      child: Text(
                        context.l10n?.delete ?? 'Delete',
                        style: TextStyle(
                          fontWeight: FontWeight.w700,
                          color: AppTheme.error,
                        ),
                      ),
                    ),
                  ],
                ),
              );
              if (confirmed == true) {
                await ref
                    .read(productRepositoryProvider)
                    .deleteReview(review.id);
                ref.invalidate(productReviewsProvider(widget.product.id));
              }
            }
          : null,
    );
  }

  /// Resolves display name for a review:
  ///  - own review → live profile name
  ///  - other user's review with snapshot → snapshot name
  ///  - other user's review without snapshot → "User"
  ///  - account deleted (userId blanked by delete_account hook) → localized
  ///    "Silinen Hesap" / "Deleted Account"
  String _resolveReviewDisplayName(ReviewModel review, String? currentUserId) {
    if (review.isAuthorDeleted) {
      return context.l10n?.deletedAccountName ?? 'Silinen Hesap';
    }
    if (review.userId == currentUserId) {
      final user = ref.read(userProfileProvider).valueOrNull;
      final dn = user?.displayName.trim();
      if (dn != null && dn.isNotEmpty) return dn;
      final r = pb.authStore.record;
      if (r != null) {
        final authDn = r.getStringValue('displayName').trim();
        if (authDn.isNotEmpty) return authDn;
        final authN = r.getStringValue('name').trim();
        if (authN.isNotEmpty) return authN;
      }
      final email = user?.email ?? '';
      if (email.isNotEmpty) return email.split('@').first;
    }
    final snapshot = review.authorDisplayName.trim();
    if (snapshot.isNotEmpty) return snapshot;
    return 'User';
  }

  String? _resolveReviewPhotoUrl(ReviewModel review, String? currentUserId) {
    if (review.isAuthorDeleted) return null;
    if (review.userId == currentUserId) {
      return _resolveCurrentUserPhotoUrl(currentUserId);
    }
    final snapshot = review.authorPhotoURL.trim();
    return snapshot.isEmpty ? null : snapshot;
  }

  /// Resolves current user's photo URL for avatar display.
  String? _resolveCurrentUserPhotoUrl(String? currentUserId) {
    if (currentUserId == null) return null;
    final user = ref.read(userProfileProvider).valueOrNull;
    final photo = (user?.photoURL ?? '').trim();
    if (photo.isNotEmpty) return photo;
    final r = pb.authStore.record;
    if (r != null) {
      final authPhoto = r.getStringValue('photoURL').trim();
      if (authPhoto.isNotEmpty) return authPhoto;
    }
    return null;
  }

  Widget _buildEmptyState(bool isLoggedIn) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 24),
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        children: [
          Icon(
            Icons.rate_review_outlined,
            size: 32,
            color: context.textTertiaryColor,
          ),
          const SizedBox(height: 8),
          Text(
            context.l10n?.noReviewsYet ?? 'No reviews yet',
            style: GoogleFonts.plusJakartaSans(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: context.textPrimary,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            isLoggedIn
                ? (context.l10n?.beFirstToReview ??
                      'Be the first to share your thoughts!')
                : (context.l10n?.signInToReview ?? 'Sign in to write a review'),
            style: GoogleFonts.plusJakartaSans(
              fontSize: 12,
              color: context.textTertiaryColor,
            ),
          ),
        ],
      ),
    );
  }

  void _showWriteReviewSheet(BuildContext context, String userId) {
    final textController = TextEditingController();

    showDialog(
      context: context,
      barrierDismissible: true,
      builder: (dialogCtx) => StatefulBuilder(
        builder: (dialogCtx, setDialogState) {
          final theme = Theme.of(dialogCtx);
          final hasText = textController.text.trim().isNotEmpty;
          return Dialog(
            backgroundColor: theme.colorScheme.surface,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(20),
            ),
            insetPadding: const EdgeInsets.symmetric(
              horizontal: 24,
              vertical: 40,
            ),
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    context.l10n?.writeAReview ?? 'Yorum Yaz',
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                      color: theme.colorScheme.onSurface,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    widget.product.name,
                    textAlign: TextAlign.center,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 12,
                      color: theme.colorScheme.onSurface.withValues(alpha: 0.5),
                    ),
                  ),
                  const SizedBox(height: 20),
                  TextField(
                    controller: textController,
                    maxLines: 4,
                    minLines: 2,
                    autofocus: true,
                    onChanged: (_) => setDialogState(() {}),
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 14,
                      color: theme.colorScheme.onSurface,
                    ),
                    decoration: InputDecoration(
                      hintText:
                          context.l10n?.shareYourExperience ??
                          'Deneyiminizi paylaşın...',
                      hintStyle: GoogleFonts.plusJakartaSans(
                        fontSize: 14,
                        color: theme.colorScheme.onSurface.withValues(
                          alpha: 0.4,
                        ),
                      ),
                      filled: true,
                      fillColor: theme.colorScheme.surfaceContainerHighest,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                        borderSide: BorderSide.none,
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),
                  Row(
                    children: [
                      Expanded(
                        child: GestureDetector(
                          onTap: () => Navigator.of(dialogCtx).pop(),
                          child: Container(
                            padding: const EdgeInsets.symmetric(vertical: 12),
                            decoration: BoxDecoration(
                              color: theme.colorScheme.surfaceContainerHighest,
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Center(
                              child: Text(
                                context.l10n?.cancel ?? 'İptal',
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w600,
                                  color: theme.colorScheme.onSurface.withValues(
                                    alpha: 0.7,
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: GestureDetector(
                          onTap: hasText
                              ? () async {
                                  HapticFeedback.mediumImpact();
                                  await _submitReview(
                                    dialogCtx,
                                    userId,
                                    0.0,
                                    textController.text.trim(),
                                  );
                                }
                              : null,
                          child: Container(
                            padding: const EdgeInsets.symmetric(vertical: 12),
                            decoration: BoxDecoration(
                              gradient: hasText
                                  ? const LinearGradient(
                                      colors: [
                                        AppTheme.primaryBlue,
                                        AppTheme.neonPurple,
                                      ],
                                    )
                                  : null,
                              color: hasText
                                  ? null
                                  : theme.colorScheme.onSurface.withValues(
                                      alpha: 0.2,
                                    ),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Center(
                              child: Text(
                                context.l10n?.submitReview ?? 'Gönder',
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w700,
                                  color: Colors.white,
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          );
        },
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
    // Snapshot author identity at creation so the review survives an account
    // delete with a meaningful name (or shows "Silinen Hesap" when blanked).
    final authUser = ref.read(userProfileProvider).valueOrNull;
    final authRecord = pb.authStore.record;
    String snapshotName =
        (authUser?.displayName ?? '').trim().isNotEmpty
            ? authUser!.displayName.trim()
            : (authRecord?.getStringValue('displayName').trim().isNotEmpty == true
                ? authRecord!.getStringValue('displayName').trim()
                : (authRecord?.getStringValue('name').trim() ?? ''));
    if (snapshotName.isEmpty) {
      final email = (authUser?.email ?? authRecord?.getStringValue('email') ?? '').trim();
      if (email.contains('@')) snapshotName = email.split('@').first;
    }
    final snapshotPhoto = (authUser?.photoURL ?? '').trim().isNotEmpty
        ? (authUser!.photoURL ?? '').trim()
        : (authRecord?.getStringValue('photoURL').trim() ?? '');

    final review = ReviewModel(
      id: '',
      userId: userId,
      productId: widget.product.id,
      rating: rating,
      text: text,
      createdAt: DateTime.now(),
      authorDisplayName: snapshotName,
      authorPhotoURL: snapshotPhoto,
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
                content: Text(
                  ctx.l10n?.reviewSubmittedStar ?? 'Review submitted!',
                ),
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

class _LikeDislikeButton extends StatelessWidget {
  final bool isLike;
  final int count;
  final bool isActive;
  final VoidCallback? onTap;

  const _LikeDislikeButton({
    required this.isLike,
    required this.count,
    required this.isActive,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final activeColor = isLike ? AppTheme.success : AppTheme.error;
    final icon = isLike
        ? Icons.thumb_up_alt_rounded
        : Icons.thumb_down_alt_rounded;
    final outlineIcon = isLike
        ? Icons.thumb_up_alt_outlined
        : Icons.thumb_down_alt_outlined;

    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: isActive
              ? activeColor.withValues(alpha: 0.12)
              : Colors.transparent,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: isActive
                ? activeColor.withValues(alpha: 0.4)
                : AppTheme.slate500.withValues(alpha: 0.2),
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              isActive ? icon : outlineIcon,
              size: 14,
              color: isActive ? activeColor : AppTheme.slate500,
            ),
            if (count > 0) ...[
              const SizedBox(width: 4),
              Text(
                '$count',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: isActive ? activeColor : AppTheme.slate500,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _DeleteReviewButton extends ConsumerWidget {
  final String reviewId;
  final String productId;

  const _DeleteReviewButton({required this.reviewId, required this.productId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return GestureDetector(
      onTap: () async {
        final confirmed = await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            backgroundColor: context.surfaceColor,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
            ),
            title: Text(
              context.l10n?.deleteReview ?? 'Delete Review',
              style: GoogleFonts.plusJakartaSans(
                fontSize: 16,
                fontWeight: FontWeight.w700,
              ),
            ),
            content: Text(
              context.l10n?.deleteReviewConfirm ??
                  'Are you sure you want to delete this review? All replies will also be removed.',
              style: GoogleFonts.plusJakartaSans(fontSize: 14),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx, false),
                child: Text(context.l10n?.cancel ?? 'Cancel'),
              ),
              TextButton(
                onPressed: () => Navigator.pop(ctx, true),
                child: Text(
                  context.l10n?.delete ?? 'Delete',
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    color: AppTheme.error,
                  ),
                ),
              ),
            ],
          ),
        );
        if (confirmed == true) {
          await ref.read(productRepositoryProvider).deleteReview(reviewId);
          ref.invalidate(productReviewsProvider(productId));
        }
      },
      child: Icon(
        Icons.delete_outline_rounded,
        size: 18,
        color: AppTheme.error.withValues(alpha: 0.7),
      ),
    );
  }
}

// ─── Shared Review Card with Replies ───

class _ReviewCard extends ConsumerStatefulWidget {
  final String reviewId;
  final String productId;
  final String firestoreCollection;
  final String userId;
  final String displayName;
  final String? currentUserPhotoUrl;
  final String timeAgo;
  final String text;
  final double rating;
  final List<String> likedBy;
  final List<String> dislikedBy;
  final String? currentUserId;
  final VoidCallback? onDelete;

  const _ReviewCard({
    required this.reviewId,
    required this.productId,
    required this.firestoreCollection,
    required this.userId,
    required this.displayName,
    this.currentUserPhotoUrl,
    required this.timeAgo,
    required this.text,
    required this.rating,
    required this.likedBy,
    required this.dislikedBy,
    this.currentUserId,
    this.onDelete,
  });

  @override
  ConsumerState<_ReviewCard> createState() => _ReviewCardState();
}

class _ReviewCardState extends ConsumerState<_ReviewCard> {
  bool _repliesExpanded = false;
  bool _replyInputVisible = false;
  bool _textExpanded = false;
  bool _isEditing = false;
  bool _savingEdit = false;
  final TextEditingController _replyCtrl = TextEditingController();
  late TextEditingController _editCtrl;
  bool _submitting = false;

  // Optimistic local state for like/dislike
  late List<String> _likedBy;
  late List<String> _dislikedBy;
  // Local override for text (so edit reflects immediately)
  late String _localText;

  @override
  void initState() {
    super.initState();
    _likedBy = List<String>.from(widget.likedBy);
    _dislikedBy = List<String>.from(widget.dislikedBy);
    _localText = widget.text;
    _editCtrl = TextEditingController(text: widget.text);
  }

  @override
  void didUpdateWidget(covariant _ReviewCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.text != widget.text && !_isEditing) {
      _localText = widget.text;
      _editCtrl.text = widget.text;
    }
  }

  Future<void> _saveEdit() async {
    final text = _editCtrl.text.trim();
    if (text.isEmpty || text == _localText) {
      setState(() => _isEditing = false);
      return;
    }
    setState(() => _savingEdit = true);
    final result = await ref
        .read(productRepositoryProvider)
        .updateReview(widget.reviewId, text);
    if (!mounted) return;
    result.when(
      success: (_) {
        setState(() {
          _localText = text;
          _isEditing = false;
          _savingEdit = false;
        });
        ref.invalidate(productReviewsProvider(widget.productId));
      },
      failure: (e) {
        setState(() => _savingEdit = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('$e')),
        );
      },
    );
  }

  Future<void> _toggleLike() async {
    final uid = widget.currentUserId;
    if (uid == null) return;
    HapticFeedback.lightImpact();
    // Optimistic update — no invalidate (avoids unmount/remount cycle)
    setState(() {
      if (_likedBy.contains(uid)) {
        _likedBy.remove(uid);
      } else {
        _likedBy.add(uid);
        _dislikedBy.remove(uid);
      }
    });
    await ref.read(productRepositoryProvider).toggleReviewLike(widget.reviewId, uid);
  }

  Future<void> _toggleDislike() async {
    final uid = widget.currentUserId;
    if (uid == null) return;
    HapticFeedback.lightImpact();
    // Optimistic update — no invalidate (avoids unmount/remount cycle)
    setState(() {
      if (_dislikedBy.contains(uid)) {
        _dislikedBy.remove(uid);
      } else {
        _dislikedBy.add(uid);
        _likedBy.remove(uid);
      }
    });
    await ref.read(productRepositoryProvider).toggleReviewDislike(widget.reviewId, uid);
  }

  @override
  void dispose() {
    _replyCtrl.dispose();
    _editCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final displayChar = widget.displayName.isNotEmpty
        ? widget.displayName[0].toUpperCase()
        : (widget.userId.isNotEmpty ? widget.userId[0].toUpperCase() : '?');

    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      decoration: BoxDecoration(
        color: context.surfaceColor,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: context.dividerColor),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 12,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── Header: Avatar + Name + Time + Delete ──
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
            child: Builder(
              builder: (context) {
                final isOwner = widget.userId == widget.currentUserId;
                Widget avatarWidget;
                if (isOwner && widget.currentUserPhotoUrl != null) {
                  avatarWidget = CachedNetworkImage(
                    imageUrl: widget.currentUserPhotoUrl!,
                    memCacheWidth: 132,
                    maxWidthDiskCache: 132,
                    fadeInDuration: const Duration(milliseconds: 100),
                    imageBuilder: (_, img) =>
                        CircleAvatar(radius: 22, backgroundImage: img),
                    errorWidget: (_, __, ___) => ClipOval(
                      child: Image.asset(
                        'assets/images/default_avatar.jpeg',
                        width: 44,
                        height: 44,
                        fit: BoxFit.cover,
                      ),
                    ),
                  );
                } else if (isOwner) {
                  avatarWidget = ClipOval(
                    child: Image.asset(
                      'assets/images/default_avatar.jpeg',
                      width: 44,
                      height: 44,
                      fit: BoxFit.cover,
                    ),
                  );
                } else {
                  avatarWidget = CircleAvatar(
                    radius: 22,
                    backgroundColor: AppTheme.brandBlue.withValues(alpha: 0.15),
                    child: Text(
                      displayChar,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                        color: AppTheme.brandBlue,
                      ),
                    ),
                  );
                }
                return Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    avatarWidget,
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            widget.displayName.isNotEmpty
                                ? widget.displayName
                                : 'User',
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 14,
                              fontWeight: FontWeight.w700,
                              color: context.textPrimary,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            widget.timeAgo,
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 11,
                              color: context.textTertiaryColor,
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (isOwner && !_isEditing)
                      GestureDetector(
                        onTap: () => setState(() {
                          _isEditing = true;
                          _editCtrl.text = _localText;
                        }),
                        child: Padding(
                          padding: const EdgeInsets.only(left: 8, top: 2),
                          child: Icon(
                            Icons.edit_outlined,
                            size: 18,
                            color: AppTheme.brandBlue.withValues(alpha: 0.7),
                          ),
                        ),
                      ),
                    if (widget.onDelete != null && !_isEditing)
                      GestureDetector(
                        onTap: widget.onDelete,
                        child: Padding(
                          padding: const EdgeInsets.only(left: 8, top: 2),
                          child: Icon(
                            Icons.delete_outline_rounded,
                            size: 20,
                            color: AppTheme.error.withValues(alpha: 0.6),
                          ),
                        ),
                      ),
                  ],
                );
              },
            ),
          ),
          // ── Review text (collapsible) or edit field ──
          if (_isEditing)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  TextField(
                    controller: _editCtrl,
                    maxLines: 5,
                    minLines: 2,
                    autofocus: true,
                    cursorColor: AppTheme.brandBlue,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 14,
                      color: context.textPrimary,
                    ),
                    decoration: InputDecoration(
                      filled: true,
                      fillColor: context.surfaceVariantColor,
                      contentPadding: const EdgeInsets.all(12),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide.none,
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide(
                          color: AppTheme.brandBlue.withValues(alpha: 0.5),
                          width: 1.5,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      TextButton(
                        onPressed: _savingEdit
                            ? null
                            : () => setState(() => _isEditing = false),
                        child: Text(
                          context.l10n?.cancel ?? 'Cancel',
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 13,
                            color: context.textTertiaryColor,
                          ),
                        ),
                      ),
                      const SizedBox(width: 4),
                      ElevatedButton(
                        onPressed: _savingEdit ? null : _saveEdit,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppTheme.brandBlue,
                          foregroundColor: Colors.white,
                          elevation: 0,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10),
                          ),
                          padding: const EdgeInsets.symmetric(
                              horizontal: 16, vertical: 8),
                        ),
                        child: _savingEdit
                            ? const SizedBox(
                                width: 14,
                                height: 14,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : Text(
                                context.l10n?.save ?? 'Save',
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                      ),
                    ],
                  ),
                ],
              ),
            )
          else if (_localText.isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  GestureDetector(
                    onTap: () => setState(() => _textExpanded = !_textExpanded),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _localText,
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 14,
                            height: 1.6,
                            color: context.textPrimary,
                          ),
                          maxLines: _textExpanded ? null : 4,
                          overflow: _textExpanded
                              ? TextOverflow.visible
                              : TextOverflow.ellipsis,
                        ),
                        if (!_textExpanded && _localText.length > 200)
                          Padding(
                            padding: const EdgeInsets.only(top: 4),
                            child: Text(
                              context.l10n?.readMore ?? 'Read more',
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 12,
                                color: AppTheme.brandBlue,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 8),
                  _SeeTranslationButton(text: _localText),
                ],
              ),
            ),

          // ── Action bar: Like / Dislike / Reply ──
          if (!_isEditing) Padding(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
            child: Row(
              children: [
                _LikeDislikeButton(
                  isLike: true,
                  count: _likedBy.length,
                  isActive:
                      widget.currentUserId != null &&
                      _likedBy.contains(widget.currentUserId),
                  onTap: widget.currentUserId != null ? _toggleLike : null,
                ),
                const SizedBox(width: 8),
                _LikeDislikeButton(
                  isLike: false,
                  count: _dislikedBy.length,
                  isActive:
                      widget.currentUserId != null &&
                      _dislikedBy.contains(widget.currentUserId),
                  onTap: widget.currentUserId != null ? _toggleDislike : null,
                ),
                const Spacer(),
                if (widget.currentUserId != null)
                  GestureDetector(
                    onTap: () => setState(() {
                      _replyInputVisible = !_replyInputVisible;
                      if (_replyInputVisible) _repliesExpanded = true;
                    }),
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 200),
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 6,
                      ),
                      decoration: BoxDecoration(
                        color: _replyInputVisible
                            ? AppTheme.brandBlue.withValues(alpha: 0.1)
                            : Colors.transparent,
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(
                          color: _replyInputVisible
                              ? AppTheme.brandBlue.withValues(alpha: 0.4)
                              : context.dividerColor,
                        ),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            Icons.reply_rounded,
                            size: 15,
                            color: _replyInputVisible
                                ? AppTheme.brandBlue
                                : context.textTertiaryColor,
                          ),
                          const SizedBox(width: 5),
                          Text(
                            context.l10n?.replyAction ?? 'Reply',
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: _replyInputVisible
                                  ? AppTheme.brandBlue
                                  : context.textTertiaryColor,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),

          // ── Replies section ──
          _ReviewRepliesSection(
            reviewId: widget.reviewId,
            firestoreCollection: widget.firestoreCollection,
            currentUserId: widget.currentUserId,
            isExpanded: _repliesExpanded,
            showInput: _replyInputVisible,
            replyController: _replyCtrl,
            submitting: _submitting,
            onToggleExpand: () =>
                setState(() => _repliesExpanded = !_repliesExpanded),
            onSubmitReply: _submitReply,
          ),
        ],
      ),
    );
  }

  Future<void> _submitReply() async {
    final text = _replyCtrl.text.trim();
    if (text.isEmpty) return;
    final uid = widget.currentUserId;
    if (uid == null) return;
    setState(() => _submitting = true);
    try {
      HapticFeedback.mediumImpact();
      final user = ref.read(userProfileProvider).valueOrNull;
      final displayName = user?.displayName.isNotEmpty == true
          ? user!.displayName
          : (user?.email.isNotEmpty == true
                ? user!.email.split('@').first
                : 'User');
      await ref
          .read(pbDataSourceProvider)
          .addReviewReply(
            collection: widget.firestoreCollection,
            reviewId: widget.reviewId,
            userId: uid,
            displayName: displayName,
            text: text,
          );
      // Send notification to review owner
      if (widget.userId != uid) {
        ref
            .read(pbDataSourceProvider)
            .createNotification(
              recipientId: widget.userId,
              senderId: uid,
              senderName: displayName,
              type: 'review_reply',
              title: 'New reply to your review',
              body: text.length > 100 ? '${text.substring(0, 100)}...' : text,
              referenceId: widget.reviewId,
            );
      }
      _replyCtrl.clear();
      setState(() {
        _replyInputVisible = false;
        _repliesExpanded = true;
      });
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }
}

class _ReviewRepliesSection extends ConsumerStatefulWidget {
  final String reviewId;
  final String firestoreCollection;
  final String? currentUserId;
  final bool isExpanded;
  final bool showInput;
  final TextEditingController replyController;
  final bool submitting;
  final VoidCallback onToggleExpand;
  final VoidCallback onSubmitReply;

  const _ReviewRepliesSection({
    required this.reviewId,
    required this.firestoreCollection,
    required this.currentUserId,
    required this.isExpanded,
    required this.showInput,
    required this.replyController,
    required this.submitting,
    required this.onToggleExpand,
    required this.onSubmitReply,
  });

  @override
  ConsumerState<_ReviewRepliesSection> createState() =>
      _ReviewRepliesSectionState();
}

class _ReviewRepliesSectionState extends ConsumerState<_ReviewRepliesSection> {
  late Stream<List<Map<String, dynamic>>> _repliesStream;

  @override
  void initState() {
    super.initState();
    _repliesStream = ref
        .read(pbDataSourceProvider)
        .watchReviewReplies(widget.firestoreCollection, widget.reviewId);
  }

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<List<Map<String, dynamic>>>(
      stream: _repliesStream,
      builder: (context, snapshot) {
        final replies = snapshot.data ?? [];
        final replyCount = replies.length;

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (replyCount > 0)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                child: GestureDetector(
                  onTap: widget.onToggleExpand,
                  child: Row(
                    children: [
                      Container(
                        width: 2,
                        height: 14,
                        color: AppTheme.brandBlue.withValues(alpha: 0.3),
                        margin: const EdgeInsets.only(right: 8),
                      ),
                      Text(
                        widget.isExpanded
                            ? (context.l10n?.hideReplies ?? 'Hide replies')
                            : (context.l10n?.viewRepliesCount(replyCount) ?? '$replyCount replies'),
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: AppTheme.brandBlue,
                        ),
                      ),
                      const SizedBox(width: 4),
                      Icon(
                        widget.isExpanded
                            ? Icons.keyboard_arrow_up_rounded
                            : Icons.keyboard_arrow_down_rounded,
                        size: 16,
                        color: AppTheme.brandBlue,
                      ),
                    ],
                  ),
                ),
              ),

            if (widget.isExpanded && replyCount > 0)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                child: Column(
                  children: replies.map((reply) {
                    return _ReplyItem(
                      key: ValueKey('reply-${reply['id']}'),
                      reply: reply,
                      reviewId: widget.reviewId,
                      collection: widget.firestoreCollection,
                      currentUserId: widget.currentUserId,
                    );
                  }).toList(),
                ),
              ),

            if (widget.showInput)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Expanded(
                      child: TextField(
                        controller: widget.replyController,
                        maxLines: 3,
                        minLines: 1,
                        autofocus: true,
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 13,
                          color: context.textPrimary,
                        ),
                        decoration: InputDecoration(
                          hintText: context.l10n?.replyHint ?? 'Write your reply...',
                          hintStyle: GoogleFonts.plusJakartaSans(
                            fontSize: 13,
                            color: context.textTertiaryColor,
                          ),
                          filled: true,
                          fillColor: context.surfaceVariantColor,
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 14,
                            vertical: 10,
                          ),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(14),
                            borderSide: BorderSide.none,
                          ),
                          focusedBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(14),
                            borderSide: BorderSide(
                              color: AppTheme.brandBlue.withValues(alpha: 0.5),
                              width: 1.5,
                            ),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    GestureDetector(
                      onTap: widget.submitting ? null : widget.onSubmitReply,
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 200),
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(
                          gradient: const LinearGradient(
                            colors: [AppTheme.primaryBlue, AppTheme.neonPurple],
                          ),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: widget.submitting
                            ? const Padding(
                                padding: EdgeInsets.all(10),
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : const Icon(
                                Icons.send_rounded,
                                color: Colors.white,
                                size: 18,
                              ),
                      ),
                    ),
                  ],
                ),
              ),
          ],
        );
      },
    );
  }
}

// ─── Reply item with like/dislike/edit/delete ───

class _ReplyItem extends ConsumerStatefulWidget {
  final Map<String, dynamic> reply;
  final String reviewId;
  final String collection;
  final String? currentUserId;

  const _ReplyItem({
    super.key,
    required this.reply,
    required this.reviewId,
    required this.collection,
    required this.currentUserId,
  });

  @override
  ConsumerState<_ReplyItem> createState() => _ReplyItemState();
}

class _ReplyItemState extends ConsumerState<_ReplyItem> {
  bool _isEditing = false;
  bool _saving = false;
  late TextEditingController _editCtrl;
  late List<String> _likedBy;
  late List<String> _dislikedBy;
  late String _localText;
  // Stream override koruması: bu zamana kadar reaction sync'i atla
  DateTime? _reactionLockUntil;

  @override
  void initState() {
    super.initState();
    _localText = widget.reply['text'] as String? ?? '';
    _editCtrl = TextEditingController(text: _localText);
    _likedBy = List<String>.from(widget.reply['likedBy'] as List? ?? []);
    _dislikedBy = List<String>.from(widget.reply['dislikedBy'] as List? ?? []);
  }

  @override
  void didUpdateWidget(covariant _ReplyItem oldWidget) {
    super.didUpdateWidget(oldWidget);
    final newText = widget.reply['text'] as String? ?? '';
    if (!_isEditing && newText != _localText) {
      _localText = newText;
      _editCtrl.text = newText;
    }
    // Reaction sync: lock süresi dolmadan stream override'ı yapma
    if (_reactionLockUntil != null &&
        DateTime.now().isBefore(_reactionLockUntil!)) {
      return;
    }
    final newLiked = List<String>.from(widget.reply['likedBy'] as List? ?? []);
    final newDisliked =
        List<String>.from(widget.reply['dislikedBy'] as List? ?? []);
    if (!_listEq(newLiked, _likedBy)) _likedBy = newLiked;
    if (!_listEq(newDisliked, _dislikedBy)) _dislikedBy = newDisliked;
  }

  bool _listEq(List<String> a, List<String> b) {
    if (a.length != b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (a[i] != b[i]) return false;
    }
    return true;
  }

  @override
  void dispose() {
    _editCtrl.dispose();
    super.dispose();
  }

  Future<void> _toggleLike() async {
    final uid = widget.currentUserId;
    if (uid == null) return;
    HapticFeedback.lightImpact();
    _reactionLockUntil =
        DateTime.now().add(const Duration(seconds: 4));
    setState(() {
      if (_likedBy.contains(uid)) {
        _likedBy.remove(uid);
      } else {
        _likedBy.add(uid);
        _dislikedBy.remove(uid);
      }
    });
    try {
      await ref
          .read(pbDataSourceProvider)
          .toggleReplyLike(widget.reply['id'] as String, uid);
      // Server güncellendi, stream'in kendi event'iyle senkron olabilsin
      _reactionLockUntil = DateTime.now();
    } catch (_) {
      // Hata: state'i geri al
      if (!mounted) return;
      setState(() {
        if (_likedBy.contains(uid)) {
          _likedBy.remove(uid);
        } else {
          _likedBy.add(uid);
        }
      });
    }
  }

  Future<void> _toggleDislike() async {
    final uid = widget.currentUserId;
    if (uid == null) return;
    HapticFeedback.lightImpact();
    _reactionLockUntil =
        DateTime.now().add(const Duration(seconds: 4));
    setState(() {
      if (_dislikedBy.contains(uid)) {
        _dislikedBy.remove(uid);
      } else {
        _dislikedBy.add(uid);
        _likedBy.remove(uid);
      }
    });
    try {
      await ref
          .read(pbDataSourceProvider)
          .toggleReplyDislike(widget.reply['id'] as String, uid);
      _reactionLockUntil = DateTime.now();
    } catch (_) {
      if (!mounted) return;
      setState(() {
        if (_dislikedBy.contains(uid)) {
          _dislikedBy.remove(uid);
        } else {
          _dislikedBy.add(uid);
        }
      });
    }
  }

  Future<void> _saveEdit() async {
    final text = _editCtrl.text.trim();
    if (text.isEmpty || text == _localText) {
      setState(() => _isEditing = false);
      return;
    }
    setState(() => _saving = true);
    try {
      await ref.read(pbDataSourceProvider).updateReviewReply(
            replyId: widget.reply['id'] as String,
            text: text,
          );
      if (!mounted) return;
      setState(() {
        _localText = text;
        _isEditing = false;
        _saving = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  Future<void> _confirmDelete() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: context.surfaceColor,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Text(
          context.l10n?.deleteReview ?? 'Delete Reply',
          style: GoogleFonts.plusJakartaSans(
              fontSize: 16, fontWeight: FontWeight.w700),
        ),
        content: Text(
          context.l10n?.deleteReviewConfirm ??
              'Are you sure you want to delete this reply?',
          style: GoogleFonts.plusJakartaSans(fontSize: 14),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(context.l10n?.cancel ?? 'Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(
              context.l10n?.delete ?? 'Delete',
              style: TextStyle(
                fontWeight: FontWeight.w700,
                color: AppTheme.error,
              ),
            ),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    await ref.read(pbDataSourceProvider).deleteReviewReply(
          collection: widget.collection,
          reviewId: widget.reviewId,
          replyId: widget.reply['id'] as String,
        );
  }

  @override
  Widget build(BuildContext context) {
    final replyUserId = widget.reply['userId'] as String? ?? '';
    final replyName = widget.reply['displayName'] as String? ?? 'User';
    final replyTs = DateTime.tryParse(
            widget.reply['createdAt']?.toString() ?? '') ??
        DateTime.now();
    final diff = DateTime.now().difference(replyTs);
    final timeStr = diff.inDays > 0
        ? '${diff.inDays}g'
        : diff.inHours > 0
            ? '${diff.inHours}s'
            : '${diff.inMinutes}d';
    final isOwner =
        widget.currentUserId != null && widget.currentUserId == replyUserId;

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: AppTheme.brandBlue.withValues(alpha: 0.08),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 2,
            height: 36,
            color: AppTheme.brandBlue.withValues(alpha: 0.25),
            margin: const EdgeInsets.only(right: 10),
          ),
          CircleAvatar(
            radius: 14,
            backgroundColor: AppTheme.brandBlue.withValues(alpha: 0.1),
            child: Text(
              replyName.isNotEmpty ? replyName[0].toUpperCase() : '?',
              style: GoogleFonts.plusJakartaSans(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: AppTheme.brandBlue,
              ),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        replyName,
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: context.textPrimary,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    Text(
                      timeStr,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 10,
                        color: context.textTertiaryColor,
                      ),
                    ),
                    if (isOwner && !_isEditing) ...[
                      const SizedBox(width: 8),
                      GestureDetector(
                        onTap: () => setState(() {
                          _isEditing = true;
                          _editCtrl.text = _localText;
                        }),
                        child: Icon(
                          Icons.edit_outlined,
                          size: 14,
                          color: AppTheme.brandBlue.withValues(alpha: 0.7),
                        ),
                      ),
                      const SizedBox(width: 8),
                      GestureDetector(
                        onTap: _confirmDelete,
                        child: Icon(
                          Icons.close_rounded,
                          size: 14,
                          color: AppTheme.error.withValues(alpha: 0.6),
                        ),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 3),
                if (_isEditing)
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      TextField(
                        controller: _editCtrl,
                        maxLines: 4,
                        minLines: 2,
                        autofocus: true,
                        cursorColor: AppTheme.brandBlue,
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 13,
                          color: context.textPrimary,
                        ),
                        decoration: InputDecoration(
                          isDense: true,
                          filled: true,
                          fillColor: context.surfaceColor,
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 8,
                          ),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(10),
                            borderSide: BorderSide.none,
                          ),
                          focusedBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(10),
                            borderSide: BorderSide(
                              color: AppTheme.brandBlue.withValues(alpha: 0.5),
                              width: 1.5,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 6),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.end,
                        children: [
                          GestureDetector(
                            onTap: _saving
                                ? null
                                : () => setState(() => _isEditing = false),
                            child: Padding(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 10, vertical: 4),
                              child: Text(
                                context.l10n?.cancel ?? 'Cancel',
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 12,
                                  color: context.textTertiaryColor,
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(width: 4),
                          GestureDetector(
                            onTap: _saving ? null : _saveEdit,
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 12, vertical: 6),
                              decoration: BoxDecoration(
                                color: AppTheme.brandBlue,
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: _saving
                                  ? const SizedBox(
                                      width: 12,
                                      height: 12,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 1.5,
                                        color: Colors.white,
                                      ),
                                    )
                                  : Text(
                                      context.l10n?.save ?? 'Save',
                                      style: GoogleFonts.plusJakartaSans(
                                        fontSize: 12,
                                        fontWeight: FontWeight.w700,
                                        color: Colors.white,
                                      ),
                                    ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  )
                else ...[
                  Text(
                    _localText,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 13,
                      height: 1.5,
                      color: context.textSecondary,
                    ),
                  ),
                  if (_localText.isNotEmpty) ...[
                    const SizedBox(height: 6),
                    _SeeTranslationButton(text: _localText),
                  ],
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      _LikeDislikeButton(
                        isLike: true,
                        count: _likedBy.length,
                        isActive: widget.currentUserId != null &&
                            _likedBy.contains(widget.currentUserId),
                        onTap: widget.currentUserId == null ? null : _toggleLike,
                      ),
                      const SizedBox(width: 6),
                      _LikeDislikeButton(
                        isLike: false,
                        count: _dislikedBy.length,
                        isActive: widget.currentUserId != null &&
                            _dislikedBy.contains(widget.currentUserId),
                        onTap:
                            widget.currentUserId == null ? null : _toggleDislike,
                      ),
                    ],
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

// ═══════════════════════════════════════════════════════════
// GOOGLE SHOPPING CARD
// ═══════════════════════════════════════════════════════════

class _GoogleShoppingCard extends StatelessWidget {
  final ProductEntity product;
  final bool isDark;
  final Color cardBg;
  const _GoogleShoppingCard({
    required this.product,
    required this.isDark,
    required this.cardBg,
  });

  String _buildShoppingUrl() {
    final q = Uri.encodeQueryComponent(product.name);
    return 'https://www.google.com/search?tbm=shop&q=$q';
  }

  Future<void> _openShopping(BuildContext context) async {
    final url = Uri.parse(_buildShoppingUrl());
    try {
      final launched = await launchUrl(url, mode: LaunchMode.externalApplication);
      if (!launched && context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Tarayıcı açılamadı.')),
        );
      }
    } catch (_) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Tarayıcı açılamadı.')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final isEn = Localizations.localeOf(context).languageCode != 'tr';
    final accent = AppTheme.brandCyan;
    final accentSoft = AppTheme.primaryBlue;
    return GestureDetector(
      onTap: () => _openShopping(context),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              context.surfaceVariantColor,
              context.surfaceColor,
            ],
          ),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: accent.withValues(alpha: 0.20)),
          boxShadow: [
            BoxShadow(
              color: accent.withValues(alpha: 0.08),
              blurRadius: 14,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Row(
          children: [
            Container(
              width: 46,
              height: 46,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [accent, accentSoft],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Icon(
                Icons.shopping_cart_outlined,
                color: Colors.white,
                size: 22,
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    isEn ? 'Google Shopping Prices' : 'Google Shopping Fiyatları',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: context.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    isEn
                        ? 'Compare prices from multiple stores'
                        : 'Farklı mağazaların fiyatlarını karşılaştır',
                    style: TextStyle(
                      fontSize: 12,
                      color: context.textSecondary.withValues(alpha: 0.9),
                    ),
                  ),
                ],
              ),
            ),
            Icon(
              Icons.open_in_new_rounded,
              size: 16,
              color: accent.withValues(alpha: 0.9),
            ),
          ],
        ),
      ),
    );
  }
}
