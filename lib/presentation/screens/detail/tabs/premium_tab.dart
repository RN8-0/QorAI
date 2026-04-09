part of '../product_detail_screen.dart';

class _AIAnalysisTab extends StatelessWidget {
  final ProductEntity product;
  final bool isDark;
  const _AIAnalysisTab({required this.product, required this.isDark});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: EdgeInsets.fromLTRB(16, 16, 16, MediaQuery.of(context).padding.bottom + 40),
      children: [
        _AIReviewAnalysisCard(product: product, isDark: isDark, cardBg: context.surfaceVariantColor),
        const SizedBox(height: 16),
        _PremiumFeaturesSection(product: product),
      ],
    );
  }
}

// ═══════════════════════════════════════════════════════════
// PREMIUM FEATURES SECTION
// ═══════════════════════════════════════════════════════════

class _PremiumFeaturesSection extends ConsumerStatefulWidget {
  final ProductEntity product;
  const _PremiumFeaturesSection({required this.product});

  @override
  ConsumerState<_PremiumFeaturesSection> createState() =>
      _PremiumFeaturesSectionState();
}

class _PremiumFeaturesSectionState
    extends ConsumerState<_PremiumFeaturesSection> {
  bool _deepAnalysisExpanded = false;
  bool _alternativesExpanded = false;
  bool _advisorExpanded = false;
  bool _predictionExpanded = false;

  // Track if user explicitly collapsed — prevents auto-expand from overriding
  bool _deepAnalysisUserCollapsed = false;
  bool _alternativesUserCollapsed = false;
  bool _advisorUserCollapsed = false;
  bool _predictionUserCollapsed = false;

  @override
  Widget build(BuildContext context) {
    final pid = widget.product.id;

    // Watch ALL providers (survives navigation / tab switches)
    final deepAnalysisAsync = ref.watch(deepAnalysisCacheProvider(pid));
    final deepAnalysis = deepAnalysisAsync.valueOrNull;
    final isLoadingAnalysis = deepAnalysisAsync is AsyncLoading;

    final alternativesAsync = ref.watch(alternativesCacheProvider(pid));
    final alternatives = alternativesAsync.valueOrNull;
    final isLoadingAlternatives = alternativesAsync is AsyncLoading;

    final advisorAsync = ref.watch(advisorCacheProvider(pid));
    final advisorResult = advisorAsync.valueOrNull;
    final isLoadingAdvisor = advisorAsync is AsyncLoading;

    final predictionAsync = ref.watch(predictionCacheProvider(pid));
    final predictionResult = predictionAsync.valueOrNull;
    final isLoadingPrediction = predictionAsync is AsyncLoading;

    // Auto-expand cards ONLY when results first arrive (not after user collapse)
    if (deepAnalysis != null && !_deepAnalysisExpanded && !_deepAnalysisUserCollapsed) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) setState(() => _deepAnalysisExpanded = true);
      });
    }
    if (alternatives != null && !_alternativesExpanded && !_alternativesUserCollapsed) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) setState(() => _alternativesExpanded = true);
      });
    }
    if (advisorResult != null && !_advisorExpanded && !_advisorUserCollapsed) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) setState(() => _advisorExpanded = true);
      });
    }
    if (predictionResult != null && !_predictionExpanded && !_predictionUserCollapsed) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) setState(() => _predictionExpanded = true);
      });
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // AI Deep Analysis
        _buildCollapsibleHeader(
          icon: Icons.psychology_rounded,
          title: context.l10n?.aiDeepAnalysis ?? 'AI Deep Analysis',
          subtitle: context.l10n?.aiDeepAnalysisDesc ?? 'Comprehensive AI-powered product evaluation',
          gradient: const [AppTheme.premiumPurple, Color(0xFF6366F1)],
          isExpanded: _deepAnalysisExpanded,
          isLoading: isLoadingAnalysis,
          hasContent: deepAnalysis != null,
          onTap: _toggleDeepAnalysis,
          expandedChild: deepAnalysis != null ? _buildDeepAnalysisVisual(deepAnalysis) : null,
        ),
        const SizedBox(height: 10),

        // Smart Alternatives
        _buildCollapsibleHeader(
          icon: Icons.swap_horizontal_circle_rounded,
          title: context.l10n?.smartAlternatives ?? 'Smart Alternatives',
          subtitle: context.l10n?.smartAlternativesDesc ?? 'AI-curated similar products you might prefer',
          gradient: const [AppTheme.warning, Color(0xFFF97316)],
          isExpanded: _alternativesExpanded,
          isLoading: isLoadingAlternatives,
          hasContent: alternatives != null,
          onTap: _toggleAlternatives,
          expandedChild: alternatives != null ? _buildAlternativesVisual(alternatives) : null,
        ),
        const SizedBox(height: 10),

        // AI Product Advisor
        _buildCollapsibleHeader(
          icon: Icons.support_agent_rounded,
          title: 'AI Product Advisor',
          subtitle: 'Personalized buying advice based on your needs',
          gradient: const [Color(0xFF3B82F6), Color(0xFF06B6D4)],
          isExpanded: _advisorExpanded,
          isLoading: isLoadingAdvisor,
          hasContent: advisorResult != null,
          onTap: _toggleAdvisor,
          expandedChild: advisorResult != null ? _buildAdvisorVisual(advisorResult) : null,
        ),
        const SizedBox(height: 10),

        // Price Prediction
        _buildCollapsibleHeader(
          icon: Icons.trending_down_rounded,
          title: 'Price Prediction',
          subtitle: 'AI-powered price trend analysis and best time to buy',
          gradient: const [Color(0xFF10B981), Color(0xFF059669)],
          isExpanded: _predictionExpanded,
          isLoading: isLoadingPrediction,
          hasContent: predictionResult != null,
          onTap: _togglePrediction,
          expandedChild: predictionResult != null ? _buildPredictionVisual(predictionResult) : null,
        ),

        // Benchmark Scores (only for supported categories)
        if (_hasBenchmarkSupport(widget.product)) ...[
          const SizedBox(height: 10),
          _BenchmarkCollapsibleCard(product: widget.product),
        ],
      ],
    );
  }

  bool _hasBenchmarkSupport(ProductEntity product) {
    final cat = product.categoryId.toLowerCase();
    // Show benchmarks only for these categories
    return cat.contains('phone') || cat.contains('mobile') || cat.contains('smartphone') ||
           cat.contains('tablet') || cat.contains('laptop') || cat.contains('notebook') ||
           cat.contains('desktop') ||
           cat.contains('cpu') || cat.contains('processor') ||
           cat.contains('gpu') || cat.contains('graphic') ||
           cat.contains('camera');
  }

  Widget _buildCollapsibleHeader({
    required IconData icon,
    required String title,
    required String subtitle,
    required List<Color> gradient,
    required bool isExpanded,
    required bool isLoading,
    required bool hasContent,
    required VoidCallback onTap,
    Widget? expandedChild,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeInOut,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: context.surfaceVariantColor,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: gradient[0].withValues(alpha: 0.15)),
          boxShadow: [BoxShadow(
            color: gradient[0].withValues(alpha: 0.08),
            blurRadius: 12, offset: const Offset(0, 4))]),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  gradient: LinearGradient(colors: gradient),
                  borderRadius: BorderRadius.circular(12)),
                child: Icon(icon, color: context.surfaceVariantColor, size: 20)),
              const SizedBox(width: 12),
              Expanded(child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: GoogleFonts.plusJakartaSans(
                    fontSize: 15, fontWeight: FontWeight.w700,
                    color: context.textPrimary)),
                  const SizedBox(height: 2),
                  Text(subtitle, style: GoogleFonts.plusJakartaSans(
                    fontSize: 12, color: context.textSecondary)),
                ])),
              if (isLoading)
                const SizedBox(width: 20, height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2))
              else
                Icon(isExpanded
                    ? Icons.expand_less_rounded
                    : Icons.expand_more_rounded,
                  color: gradient[0]),
            ]),
            if (isExpanded && expandedChild != null) ...[
              const SizedBox(height: 14),
              expandedChild,
            ],
          ],
        ),
      ),
    );
  }

  // ─── AI Deep Analysis Visual ───
  Widget _buildDeepAnalysisVisual(DeepAnalysisResult r) {
    if (r.rawFallback != null) return _buildRichContent(r.rawFallback!, AppTheme.premiumPurple);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Overall score circular indicator
        if (r.overallScore > 0) ...[
          Center(
            child: TweenAnimationBuilder<double>(
              tween: Tween(begin: 0, end: r.overallScore / 100),
              duration: const Duration(milliseconds: 1200),
              curve: Curves.easeOutCubic,
              builder: (context, value, _) {
                final score = (value * 100).round();
                final scoreColor = score >= 80 ? AppTheme.green500
                    : score >= 60 ? AppTheme.amber500
                    : AppTheme.rose500;
                return SizedBox(
                  width: 100, height: 100,
                  child: Stack(alignment: Alignment.center, children: [
                    SizedBox(
                      width: 100, height: 100,
                      child: CircularProgressIndicator(
                        value: value,
                        strokeWidth: 8,
                        backgroundColor: scoreColor.withValues(alpha: 0.12),
                        valueColor: AlwaysStoppedAnimation(scoreColor),
                        strokeCap: StrokeCap.round,
                      ),
                    ),
                    Column(mainAxisSize: MainAxisSize.min, children: [
                      Text('$score', style: GoogleFonts.plusJakartaSans(
                        fontSize: 28, fontWeight: FontWeight.w800, color: scoreColor)),
                      Text('/ 100', style: GoogleFonts.plusJakartaSans(
                        fontSize: 11, fontWeight: FontWeight.w500, color: context.textSecondary)),
                    ]),
                  ]),
                );
              },
            ),
          ),
          const SizedBox(height: 16),
        ],

        // Strengths
        if (r.strengths.isNotEmpty) ...[
          _buildSectionLabel(Icons.trending_up_rounded, 'Strengths', AppTheme.green500),
          const SizedBox(height: 8),
          ...r.strengths.map((s) => _buildAttributeBar(s, AppTheme.green500)),
          const SizedBox(height: 14),
        ],

        // Weaknesses
        if (r.weaknesses.isNotEmpty) ...[
          _buildSectionLabel(Icons.trending_down_rounded, 'Weaknesses', AppTheme.rose500),
          const SizedBox(height: 8),
          ...r.weaknesses.map((w) => _buildAttributeBar(w, AppTheme.rose500)),
          const SizedBox(height: 14),
        ],

        // Pros & Cons side by side
        if (r.pros.isNotEmpty || r.cons.isNotEmpty)
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (r.pros.isNotEmpty)
                Expanded(child: _buildProConCard(
                  icon: Icons.check_circle_rounded,
                  title: 'Pros',
                  items: r.pros,
                  color: AppTheme.green500,
                )),
              if (r.pros.isNotEmpty && r.cons.isNotEmpty) const SizedBox(width: 8),
              if (r.cons.isNotEmpty)
                Expanded(child: _buildProConCard(
                  icon: Icons.cancel_rounded,
                  title: 'Cons',
                  items: r.cons,
                  color: AppTheme.rose500,
                )),
            ],
          ),

        // Verdict
        if (r.verdict.isNotEmpty) ...[
          const SizedBox(height: 14),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppTheme.premiumPurple.withValues(alpha: 0.06),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: AppTheme.premiumPurple.withValues(alpha: 0.15)),
            ),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('💡', style: TextStyle(fontSize: 16)),
              const SizedBox(width: 8),
              Expanded(child: Text(r.verdict,
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 12.5, fontWeight: FontWeight.w500,
                  color: context.textPrimary, height: 1.5,
                  fontStyle: FontStyle.italic))),
            ]),
          ),
        ],
      ],
    );
  }

  Widget _buildSectionLabel(IconData icon, String label, Color color) {
    return Row(children: [
      Icon(icon, size: 16, color: color),
      const SizedBox(width: 6),
      Text(label, style: GoogleFonts.plusJakartaSans(
        fontSize: 13, fontWeight: FontWeight.w700, color: color)),
    ]);
  }

  Widget _buildAttributeBar(AnalysisAttribute attr, Color color) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Expanded(child: Text(attr.name,
              style: GoogleFonts.plusJakartaSans(
                fontSize: 12, fontWeight: FontWeight.w600, color: context.textPrimary))),
            Text('${attr.score}', style: GoogleFonts.plusJakartaSans(
              fontSize: 12, fontWeight: FontWeight.w800, color: color)),
          ]),
          const SizedBox(height: 4),
          TweenAnimationBuilder<double>(
            tween: Tween(begin: 0, end: (attr.score / 100).clamp(0, 1)),
            duration: const Duration(milliseconds: 800),
            curve: Curves.easeOutCubic,
            builder: (_, v, __) => ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: SizedBox(height: 6, child: Stack(children: [
                Container(color: color.withValues(alpha: 0.1)),
                FractionallySizedBox(widthFactor: v,
                  child: Container(decoration: BoxDecoration(
                    gradient: LinearGradient(colors: [color.withValues(alpha: 0.5), color]),
                    borderRadius: BorderRadius.circular(4)))),
              ])),
            ),
          ),
          if (attr.detail.isNotEmpty) ...[
            const SizedBox(height: 2),
            Text(attr.detail, style: GoogleFonts.plusJakartaSans(
              fontSize: 11, color: context.textSecondary, height: 1.3)),
          ],
        ],
      ),
    );
  }

  Widget _buildProConCard({
    required IconData icon,
    required String title,
    required List<String> items,
    required Color color,
  }) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: color.withValues(alpha: 0.15)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Icon(icon, size: 14, color: color),
            const SizedBox(width: 4),
            Text(title, style: GoogleFonts.plusJakartaSans(
              fontSize: 12, fontWeight: FontWeight.w700, color: color)),
          ]),
          const SizedBox(height: 6),
          ...items.map((item) => Padding(
            padding: const EdgeInsets.only(bottom: 3),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('•', style: TextStyle(fontSize: 11, color: color, fontWeight: FontWeight.w700)),
              const SizedBox(width: 4),
              Expanded(child: Text(item, style: GoogleFonts.plusJakartaSans(
                fontSize: 11, color: context.textPrimary, height: 1.3))),
            ]),
          )),
        ],
      ),
    );
  }

  // ─── Smart Alternatives Visual ───
  Widget _buildAlternativesVisual(AlternativesResult r) {
    if (r.rawFallback != null) return _buildRichContent(r.rawFallback!, AppTheme.warning);
    if (r.alternatives.isEmpty) return const SizedBox.shrink();

    return SizedBox(
      height: 195,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: r.alternatives.length,
        separatorBuilder: (_, __) => const SizedBox(width: 10),
        itemBuilder: (context, i) {
          final alt = r.alternatives[i];
          final priceColor = alt.priceComparison.toLowerCase().contains('cheap')
              ? AppTheme.green500
              : alt.priceComparison.toLowerCase().contains('pric')
                  ? AppTheme.rose500
                  : AppTheme.amber500;
          final priceIcon = alt.priceComparison.toLowerCase().contains('cheap')
              ? Icons.arrow_downward_rounded
              : alt.priceComparison.toLowerCase().contains('pric')
                  ? Icons.arrow_upward_rounded
                  : Icons.remove_rounded;

          return Container(
            width: 220,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: context.surfaceVariantColor,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppTheme.warning.withValues(alpha: 0.2)),
              boxShadow: [BoxShadow(
                color: AppTheme.warning.withValues(alpha: 0.06),
                blurRadius: 8, offset: const Offset(0, 2))],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Name + price badge
                Row(children: [
                  Expanded(child: Text(alt.name,
                    maxLines: 2, overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 12.5, fontWeight: FontWeight.w700,
                      color: context.textPrimary, height: 1.3))),
                  const SizedBox(width: 4),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: priceColor.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(6)),
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      Icon(priceIcon, size: 10, color: priceColor),
                      const SizedBox(width: 2),
                      Text(alt.priceComparison, style: GoogleFonts.plusJakartaSans(
                        fontSize: 9, fontWeight: FontWeight.w700, color: priceColor)),
                    ]),
                  ),
                ]),
                const SizedBox(height: 8),

                // Advantage
                if (alt.advantage.isNotEmpty)
                  _buildAltInfoRow(Icons.check_circle_outline_rounded, alt.advantage, AppTheme.green500),
                const SizedBox(height: 4),

                // Trade-off
                if (alt.tradeoff.isNotEmpty)
                  _buildAltInfoRow(Icons.warning_amber_rounded, alt.tradeoff, AppTheme.amber500),
                const Spacer(),

                // Why better badge
                if (alt.whyBetter.isNotEmpty)
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
                    decoration: BoxDecoration(
                      gradient: LinearGradient(colors: [
                        AppTheme.warning.withValues(alpha: 0.1),
                        const Color(0xFFF97316).withValues(alpha: 0.06),
                      ]),
                      borderRadius: BorderRadius.circular(6)),
                    child: Text('⭐ ${alt.whyBetter}',
                      maxLines: 2, overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 10, fontWeight: FontWeight.w600,
                        color: context.textPrimary, height: 1.3)),
                  ),

                // Best for
                if (alt.bestFor.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text('🎯 ${alt.bestFor}',
                    maxLines: 1, overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 10, color: context.textSecondary, fontWeight: FontWeight.w500)),
                ],
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildAltInfoRow(IconData icon, String text, Color color) {
    return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Icon(icon, size: 13, color: color),
      const SizedBox(width: 4),
      Expanded(child: Text(text,
        maxLines: 2, overflow: TextOverflow.ellipsis,
        style: GoogleFonts.plusJakartaSans(
          fontSize: 11, color: context.textPrimary, height: 1.3))),
    ]);
  }

  // ─── AI Product Advisor Visual ───
  Widget _buildAdvisorVisual(AdvisorResult r) {
    if (r.rawFallback != null) return _buildRichContent(r.rawFallback!, const Color(0xFF3B82F6));

    final ratingColor = r.valueRating >= 7 ? AppTheme.green500
        : r.valueRating >= 5 ? AppTheme.amber500 : AppTheme.rose500;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Value rating gauge
        if (r.valueRating > 0) ...[
          Center(
            child: Column(children: [
              TweenAnimationBuilder<double>(
                tween: Tween(begin: 0, end: r.valueRating / 10),
                duration: const Duration(milliseconds: 1000),
                curve: Curves.easeOutCubic,
                builder: (_, v, __) {
                  final stars = (v * 10).clamp(0, 10);
                  return Row(mainAxisSize: MainAxisSize.min, children: [
                    ...List.generate(5, (i) {
                      final starVal = stars - (i * 2);
                      if (starVal >= 2) return Icon(Icons.star_rounded, size: 24, color: ratingColor);
                      if (starVal >= 1) return Icon(Icons.star_half_rounded, size: 24, color: ratingColor);
                      return Icon(Icons.star_outline_rounded, size: 24, color: ratingColor.withValues(alpha: 0.3));
                    }),
                    const SizedBox(width: 8),
                    Text('${r.valueRating.toStringAsFixed(1)}/10', style: GoogleFonts.plusJakartaSans(
                      fontSize: 16, fontWeight: FontWeight.w800, color: ratingColor)),
                  ]);
                },
              ),
              if (r.ratingExplanation.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(r.ratingExplanation, textAlign: TextAlign.center,
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 11, color: context.textSecondary, fontStyle: FontStyle.italic)),
              ],
            ]),
          ),
          const SizedBox(height: 14),
        ],

        // Who Should Buy
        if (r.whoShouldBuy.isNotEmpty)
          _buildAdvisorBox(
            icon: Icons.person_add_rounded,
            title: 'Who Should Buy This',
            text: r.whoShouldBuy,
            color: AppTheme.green500,
          ),

        if (r.whoShouldBuy.isNotEmpty && r.whoShouldAvoid.isNotEmpty)
          const SizedBox(height: 10),

        // Who Should Avoid
        if (r.whoShouldAvoid.isNotEmpty)
          _buildAdvisorBox(
            icon: Icons.person_off_rounded,
            title: 'Who Should Avoid',
            text: r.whoShouldAvoid,
            color: AppTheme.rose500,
          ),

        // Reasons to Buy
        if (r.reasonsToBuy.isNotEmpty) ...[
          const SizedBox(height: 12),
          _buildSectionLabel(Icons.thumb_up_rounded, 'Reasons to Buy', AppTheme.green500),
          const SizedBox(height: 6),
          ...r.reasonsToBuy.map((reason) => _buildReasonItem(reason, AppTheme.green500, Icons.add_circle_rounded)),
        ],

        // Reasons to Skip
        if (r.reasonsToSkip.isNotEmpty) ...[
          const SizedBox(height: 12),
          _buildSectionLabel(Icons.thumb_down_rounded, 'Reasons to Skip', AppTheme.rose500),
          const SizedBox(height: 6),
          ...r.reasonsToSkip.map((reason) => _buildReasonItem(reason, AppTheme.rose500, Icons.remove_circle_rounded)),
        ],

        // Pro Tips
        if (r.proTips.isNotEmpty) ...[
          const SizedBox(height: 12),
          _buildSectionLabel(Icons.lightbulb_rounded, 'Pro Tips', AppTheme.amber500),
          const SizedBox(height: 6),
          ...r.proTips.map((tip) => _buildReasonItem(tip, AppTheme.amber500, Icons.auto_awesome_rounded)),
        ],
      ],
    );
  }

  Widget _buildAdvisorBox({
    required IconData icon,
    required String title,
    required String text,
    required Color color,
  }) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: color.withValues(alpha: 0.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Icon(icon, size: 16, color: color),
            const SizedBox(width: 6),
            Text(title, style: GoogleFonts.plusJakartaSans(
              fontSize: 12, fontWeight: FontWeight.w700, color: color)),
          ]),
          const SizedBox(height: 6),
          Text(text, style: GoogleFonts.plusJakartaSans(
            fontSize: 12, color: context.textPrimary, height: 1.4)),
        ],
      ),
    );
  }

  Widget _buildReasonItem(String text, Color color, IconData icon) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Icon(icon, size: 14, color: color),
        const SizedBox(width: 6),
        Expanded(child: Text(text, style: GoogleFonts.plusJakartaSans(
          fontSize: 12, color: context.textPrimary, height: 1.3))),
      ]),
    );
  }

  // ─── Price Prediction Visual ───
  Widget _buildPredictionVisual(PredictionResult r) {
    if (r.rawFallback != null) return _buildRichContent(r.rawFallback!, const Color(0xFF10B981));

    final trendLower = r.trend.toLowerCase();
    final trendColor = trendLower == 'down' ? AppTheme.green500
        : trendLower == 'up' ? AppTheme.rose500 : AppTheme.amber500;
    final trendIcon = trendLower == 'down' ? Icons.trending_down_rounded
        : trendLower == 'up' ? Icons.trending_up_rounded : Icons.trending_flat_rounded;
    final trendLabel = trendLower == 'down' ? 'Price Dropping'
        : trendLower == 'up' ? 'Price Rising'
        : 'Price Stable';

    final isBuy = r.buyOrWait.toLowerCase().contains('buy');
    final decisionColor = isBuy ? AppTheme.green500 : AppTheme.amber500;
    final decisionIcon = isBuy ? Icons.shopping_cart_rounded : Icons.hourglass_top_rounded;
    final decisionLabel = isBuy ? 'Buy Now' : 'Wait';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Trend indicator + Buy/Wait badge row
        Row(children: [
          // Trend card
          Expanded(
            child: Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: trendColor.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: trendColor.withValues(alpha: 0.2)),
              ),
              child: Column(children: [
                Icon(trendIcon, size: 28, color: trendColor),
                const SizedBox(height: 4),
                Text(trendLabel, textAlign: TextAlign.center,
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 12, fontWeight: FontWeight.w700, color: trendColor)),
                if (r.trendPercentage > 0) ...[
                  const SizedBox(height: 2),
                  Text('${trendLower == 'down' ? '-' : trendLower == 'up' ? '+' : '~'}${r.trendPercentage}%',
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 18, fontWeight: FontWeight.w800, color: trendColor)),
                ],
              ]),
            ),
          ),
          const SizedBox(width: 10),
          // Buy/Wait decision
          Expanded(
            child: Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                gradient: LinearGradient(colors: [
                  decisionColor.withValues(alpha: 0.12),
                  decisionColor.withValues(alpha: 0.06),
                ]),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: decisionColor.withValues(alpha: 0.3)),
              ),
              child: Column(children: [
                Icon(decisionIcon, size: 28, color: decisionColor),
                const SizedBox(height: 4),
                Text(decisionLabel,
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 14, fontWeight: FontWeight.w800, color: decisionColor)),
              ]),
            ),
          ),
        ]),

        // Expected change progress bar
        if (r.trendPercentage > 0) ...[
          const SizedBox(height: 14),
          Text('Expected Change',
            style: GoogleFonts.plusJakartaSans(
              fontSize: 12, fontWeight: FontWeight.w600, color: context.textSecondary)),
          const SizedBox(height: 6),
          TweenAnimationBuilder<double>(
            tween: Tween(begin: 0, end: (r.trendPercentage / 50).clamp(0, 1)),
            duration: const Duration(milliseconds: 800),
            curve: Curves.easeOutCubic,
            builder: (_, v, __) => ClipRRect(
              borderRadius: BorderRadius.circular(5),
              child: SizedBox(height: 8, child: Stack(children: [
                Container(color: trendColor.withValues(alpha: 0.1)),
                FractionallySizedBox(widthFactor: v,
                  child: Container(decoration: BoxDecoration(
                    gradient: LinearGradient(colors: [trendColor.withValues(alpha: 0.4), trendColor]),
                    borderRadius: BorderRadius.circular(5)))),
              ])),
            ),
          ),
        ],

        // Expected drop description
        if (r.expectedDrop.isNotEmpty) ...[
          const SizedBox(height: 10),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: trendColor.withValues(alpha: 0.05),
              borderRadius: BorderRadius.circular(8)),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('💰', style: TextStyle(fontSize: 14)),
              const SizedBox(width: 6),
              Expanded(child: Text(r.expectedDrop,
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 12, color: context.textPrimary, height: 1.4))),
            ]),
          ),
        ],

        // Best time to buy
        if (r.bestTimeToBuy.isNotEmpty) ...[
          const SizedBox(height: 8),
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Icon(Icons.schedule_rounded, size: 14, color: const Color(0xFF06B6D4)),
            const SizedBox(width: 6),
            Expanded(child: Text(r.bestTimeToBuy,
              style: GoogleFonts.plusJakartaSans(
                fontSize: 12, color: context.textPrimary, height: 1.3))),
          ]),
        ],

        // Reasoning
        if (r.reasoning.isNotEmpty) ...[
          const SizedBox(height: 10),
          Text(r.reasoning,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 11.5, color: context.textSecondary,
              height: 1.4, fontStyle: FontStyle.italic)),
        ],
      ],
    );
  }

  /// Renders AI content with full markdown support
  Widget _buildRichContent(String content, Color accentColor) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return MarkdownBody(
      data: content,
      selectable: true,
      styleSheet: MarkdownStyleSheet(
        p: GoogleFonts.plusJakartaSans(
          fontSize: 13, height: 1.6,
          color: isDark ? Colors.white.withValues(alpha: 0.9) : context.textPrimary),
        strong: GoogleFonts.plusJakartaSans(
          fontSize: 13, fontWeight: FontWeight.w700,
          color: isDark ? Colors.white : context.textPrimary),
        em: GoogleFonts.plusJakartaSans(
          fontSize: 13, fontStyle: FontStyle.italic,
          color: isDark ? Colors.white.withValues(alpha: 0.8) : context.textSecondary),
        h1: GoogleFonts.plusJakartaSans(
          fontSize: 16, fontWeight: FontWeight.w800,
          color: isDark ? Colors.white : context.textPrimary),
        h2: GoogleFonts.plusJakartaSans(
          fontSize: 15, fontWeight: FontWeight.w700,
          color: isDark ? Colors.white : context.textPrimary),
        h3: GoogleFonts.plusJakartaSans(
          fontSize: 14, fontWeight: FontWeight.w700,
          color: accentColor),
        listBullet: GoogleFonts.plusJakartaSans(
          fontSize: 13, color: accentColor),
        listIndent: 16,
        blockSpacing: 8,
        h1Padding: const EdgeInsets.only(top: 8, bottom: 4),
        h2Padding: const EdgeInsets.only(top: 8, bottom: 4),
        h3Padding: const EdgeInsets.only(top: 6, bottom: 2),
        pPadding: const EdgeInsets.symmetric(vertical: 2),
        blockquoteDecoration: BoxDecoration(
          color: accentColor.withValues(alpha: 0.06),
          borderRadius: BorderRadius.circular(8),
          border: Border(left: BorderSide(color: accentColor, width: 3)),
        ),
        blockquotePadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        codeblockDecoration: BoxDecoration(
          color: isDark ? Colors.white.withValues(alpha: 0.06) : const Color(0xFFF1F5F9),
          borderRadius: BorderRadius.circular(8),
        ),
        code: GoogleFonts.jetBrainsMono(
          fontSize: 12,
          color: isDark ? Colors.white.withValues(alpha: 0.8) : const Color(0xFF334155)),
      ),
    );
  }

  Widget _buildMatchScoreCard() {
    // Use Gemini match score (same provider as _ScoreDuo)
    final matchAsync = ref.watch(geminiMatchScoreProvider(widget.product.id));
    final matchResult = matchAsync.valueOrNull;
    int? matchScore;
    String? matchReason;
    if (matchResult != null && matchResult.matchScore > 0) {
      matchScore = matchResult.matchScore;
      matchReason = matchResult.reason;
    }
    final displayScore = matchScore != null ? '$matchScore%' : '--';
    final matchColor = matchScore == null ? AppTheme.premiumPurple :
        matchScore >= 80 ? AppTheme.green500 :
        matchScore >= 60 ? AppTheme.amber500 : AppTheme.rose500;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        gradient: LinearGradient(
          colors: [
            matchColor.withValues(alpha: 0.08),
            const Color(0xFFEC4899).withValues(alpha: 0.06),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight),
        border: Border.all(
          color: matchColor.withValues(alpha: 0.15))),
      child: Row(children: [
        Container(
          width: 56, height: 56,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: LinearGradient(
              colors: [matchColor, const Color(0xFFEC4899)])),
          child: Center(child: Text(
            displayScore,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 18, fontWeight: FontWeight.w900,
              color: context.surfaceVariantColor))),
        ),
        const SizedBox(width: 14),
        Expanded(child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(context.l10n?.personalizedMatch ?? 'Personalized Match', style: GoogleFonts.plusJakartaSans(
              fontSize: 15, fontWeight: FontWeight.w700,
              color: context.textPrimary)),
            const SizedBox(height: 4),
            Text(context.l10n?.basedOnBehavior ?? 'Based on your browsing history, preferences, and behavior patterns',
              style: GoogleFonts.plusJakartaSans(
                fontSize: 12, color: context.textSecondary,
                height: 1.4)),
          ])),
      ]),
    );
  }

  Future<void> _toggleDeepAnalysis() async {
    if (_deepAnalysisExpanded) {
      setState(() {
        _deepAnalysisExpanded = false;
        _deepAnalysisUserCollapsed = true;
      });
      return;
    }
    setState(() {
      _deepAnalysisExpanded = true;
      _deepAnalysisUserCollapsed = false;
    });
    final lang = Localizations.localeOf(context).languageCode;
    ref.read(deepAnalysisCacheProvider(widget.product.id).notifier)
        .startAnalysis(
          widget.product.name, 
          lang, 
          category: widget.product.category,
          brand: widget.product.brand,
        );
  }

  void _showPriceHistory(BuildContext context) {
    _showPriceComparison(context, widget.product);
  }

  Future<void> _toggleAlternatives() async {
    if (_alternativesExpanded) {
      setState(() {
        _alternativesExpanded = false;
        _alternativesUserCollapsed = true;
      });
      return;
    }
    setState(() {
      _alternativesExpanded = true;
      _alternativesUserCollapsed = false;
    });
    final lang = Localizations.localeOf(context).languageCode;
    ref.read(alternativesCacheProvider(widget.product.id).notifier)
        .startQuery(widget.product.name, widget.product.category, lang);
  }

  Future<void> _toggleAdvisor() async {
    if (_advisorExpanded) {
      setState(() {
        _advisorExpanded = false;
        _advisorUserCollapsed = true;
      });
      return;
    }
    setState(() {
      _advisorExpanded = true;
      _advisorUserCollapsed = false;
    });
    final lang = Localizations.localeOf(context).languageCode;
    final country = ref.read(selectedCountryProvider);
    final currency = ref.read(currencyProvider);
    final priceVal = widget.product.getPriceForCountry(country) 
        ?? (widget.product.prices.isNotEmpty ? widget.product.prices.values.first : 0.0);
    final price = priceVal > 0 ? AppUtils.formatCurrency(priceVal, currency) : 'unknown price';
    ref.read(advisorCacheProvider(widget.product.id).notifier)
        .startQuery(widget.product.name, widget.product.category, price, lang);
  }

  Future<void> _togglePrediction() async {
    if (_predictionExpanded) {
      setState(() {
        _predictionExpanded = false;
        _predictionUserCollapsed = true;
      });
      return;
    }
    setState(() {
      _predictionExpanded = true;
      _predictionUserCollapsed = false;
    });
    final lang = Localizations.localeOf(context).languageCode;
    final country = ref.read(selectedCountryProvider);
    final currency = ref.read(currencyProvider);
    final priceVal = widget.product.getPriceForCountry(country) 
        ?? (widget.product.prices.isNotEmpty ? widget.product.prices.values.first : 0.0);
    final price = priceVal > 0 ? AppUtils.formatCurrency(priceVal, currency) : 'unknown price';
    ref.read(predictionCacheProvider(widget.product.id).notifier)
        .startQuery(widget.product.name, widget.product.category, price, lang);
  }
}

// ── Collapsible Benchmark Card (premium-style wrapper) ──
class _BenchmarkCollapsibleCard extends StatefulWidget {
  final ProductEntity product;
  const _BenchmarkCollapsibleCard({required this.product});

  @override
  State<_BenchmarkCollapsibleCard> createState() => _BenchmarkCollapsibleCardState();
}

class _BenchmarkCollapsibleCardState extends State<_BenchmarkCollapsibleCard> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    const gradient = [AppTheme.premiumPurple, AppTheme.neonPurple];

    return GestureDetector(
      onTap: () => setState(() => _expanded = !_expanded),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeInOut,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: context.surfaceVariantColor,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: gradient[0].withValues(alpha: 0.15)),
          boxShadow: [BoxShadow(
            color: gradient[0].withValues(alpha: 0.08),
            blurRadius: 12, offset: const Offset(0, 4))]),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  gradient: LinearGradient(colors: gradient),
                  borderRadius: BorderRadius.circular(12)),
                child: Icon(Icons.speed_rounded, color: context.surfaceVariantColor, size: 20)),
              const SizedBox(width: 12),
              Expanded(child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(context.l10n?.benchmarkScores ?? 'Benchmark Scores', style: GoogleFonts.plusJakartaSans(
                    fontSize: 15, fontWeight: FontWeight.w700,
                    color: context.textPrimary)),
                  const SizedBox(height: 2),
                  Text('AI-powered benchmark lookup from real databases',
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 12, color: context.textSecondary)),
                ])),
              Icon(_expanded
                  ? Icons.expand_less_rounded
                  : Icons.expand_more_rounded,
                color: gradient[0]),
            ]),
            if (_expanded) ...[
              const SizedBox(height: 14),
              _BenchmarkScoresCard(product: widget.product),
            ],
          ],
        ),
      ),
    );
  }
}
