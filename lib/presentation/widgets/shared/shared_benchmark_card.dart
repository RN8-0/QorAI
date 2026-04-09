import 'dart:convert';
import 'dart:math' as dart_math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:compair/core/theme.dart';
import 'package:compair/domain/entities/product_entity.dart';
import 'package:compair/presentation/providers/providers.dart';

/// Shared benchmark scores card used by both detail and compare screens.
/// Auto-fetches AI benchmarks on init, shows animated score bars + AI verdict.
class SharedBenchmarkScoresCard extends ConsumerStatefulWidget {
  final ProductEntity product;
  const SharedBenchmarkScoresCard({super.key, required this.product});

  @override
  ConsumerState<SharedBenchmarkScoresCard> createState() =>
      _SharedBenchmarkScoresCardState();
}

class _SharedBenchmarkScoresCardState
    extends ConsumerState<SharedBenchmarkScoresCard>
    with TickerProviderStateMixin {
  bool _userTriggered = false;
  late AnimationController _barAnimController;
  late Animation<double> _barAnim;
  final Map<String, double> _parsedScores = {};
  final Map<String, List<Map<String, dynamic>>> _competitors = {};

  String _aiVerdict = '';
  String _targetAudience = '';
  List<String> _strengths = [];
  List<String> _weaknesses = [];
  double _pricePerformance = 0;
  bool _animStarted = false;

  @override
  void initState() {
    super.initState();
    _barAnimController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1500),
    );
    _barAnim = CurvedAnimation(
      parent: _barAnimController,
      curve: Curves.easeOutCubic,
    );
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _fetchAiBenchmarks();
    });
  }

  @override
  void dispose() {
    _barAnimController.dispose();
    super.dispose();
  }

  void _retryFetch() {
    _parsedScores.clear();
    _competitors.clear();
    _aiVerdict = '';
    _targetAudience = '';
    _strengths = [];
    _weaknesses = [];
    _pricePerformance = 0;
    _animStarted = false;
    ref.read(benchmarkCacheProvider(widget.product.id).notifier).reset();
    setState(() => _userTriggered = true);
    _fetchAiBenchmarks();
  }

  @override
  Widget build(BuildContext context) {
    final benchmarks = _getBenchmarksForCategory(widget.product);
    final benchmarkAsync = ref.watch(benchmarkCacheProvider(widget.product.id));
    final benchmarkResult = benchmarkAsync.valueOrNull;
    final isLoading = benchmarkAsync is AsyncLoading;
    final failed = benchmarkResult?.failed == true;
    final researched = benchmarkResult != null &&
        !failed &&
        benchmarkResult.rawScoresResponse.isNotEmpty;

    if (researched && _parsedScores.isEmpty) {
      _parseResponse(benchmarkResult.rawScoresResponse, benchmarks);
      if (_parsedScores.isNotEmpty && !_animStarted) {
        _animStarted = true;
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) {
            _barAnimController.forward(from: 0);
            if (benchmarkResult.rawVerdictResponse == null) {
              _fetchAiVerdict();
            }
          }
        });
      }
    }

    if (benchmarkResult?.rawVerdictResponse != null && _aiVerdict.isEmpty) {
      _parseVerdictResponse(benchmarkResult!.rawVerdictResponse!);
    }

    final loadingVerdict =
        researched && _parsedScores.isNotEmpty && benchmarkResult?.rawVerdictResponse == null;

    if (researched || isLoading || failed) {
      _userTriggered = true;
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            if (isLoading)
              SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: AppTheme.premiumPurple.withValues(alpha: 0.6),
                ),
              )
            else if (failed)
              GestureDetector(
                onTap: _retryFetch,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: Colors.orange.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.refresh_rounded, size: 11, color: Colors.orange),
                      const SizedBox(width: 4),
                      Text(
                        context.l10n?.retryAvailable ?? 'Retry',
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 10,
                          fontWeight: FontWeight.w600,
                          color: Colors.orange,
                        ),
                      ),
                    ],
                  ),
                ),
              )
            else if (researched && _parsedScores.isNotEmpty)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: AppTheme.green500.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.auto_awesome, size: 11, color: AppTheme.green500),
                    const SizedBox(width: 4),
                    Text(
                      context.l10n?.aiVerified ?? 'AI Verified',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 10,
                        fontWeight: FontWeight.w600,
                        color: AppTheme.green500,
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ),
        const SizedBox(height: 12),

        if (isLoading && _parsedScores.isEmpty) ...[
          ...benchmarks.map(
            (b) => Padding(
              padding: const EdgeInsets.only(bottom: 14),
              child: _buildShimmerRow(b),
            ),
          ),
        ] else ...[
          AnimatedBuilder(
            animation: _barAnim,
            builder: (context, _) => Column(
              children: benchmarks
                  .map(
                    (b) => Padding(
                      padding: const EdgeInsets.only(bottom: 14),
                      child: _buildBenchmarkRow(b, _barAnim.value),
                    ),
                  )
                  .toList(),
            ),
          ),

          if (failed && !isLoading) ...[
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: Colors.orange.withValues(alpha: 0.07),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: Colors.orange.withValues(alpha: 0.2)),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(Icons.info_outline_rounded, size: 16, color: Colors.orange),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      context.l10n?.benchmarkNotFound ??
                          'Bu ürün için benchmark testi bulunmuyor. Ürün çok yeni veya benchmark veritabanlarında kayıtlı olmayabilir.',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 12,
                        color: context.textSecondary,
                        height: 1.5,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],

          if (researched && _parsedScores.isEmpty && !failed) ...[
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: Colors.orange.withValues(alpha: 0.07),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: Colors.orange.withValues(alpha: 0.2)),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(Icons.search_off_rounded, size: 16, color: Colors.orange),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      context.l10n?.benchmarkNotFound ??
                          'Bu ürün için doğrulanmış benchmark puanı bulunamadı.',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 12,
                        color: context.textSecondary,
                        height: 1.5,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 10),
          ],

          if (researched && _parsedScores.isNotEmpty) _buildVerdictSection(loadingVerdict),
        ],
      ],
    );
  }

  Widget _buildShimmerRow(BenchmarkInfo info) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(info.icon, size: 14, color: info.color.withValues(alpha: 0.4)),
            const SizedBox(width: 6),
            Text(
              info.name,
              style: GoogleFonts.plusJakartaSans(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: context.textSecondary,
              ),
            ),
            const Spacer(),
            Container(
              width: 40,
              height: 12,
              decoration: BoxDecoration(
                color: context.dividerColor,
                borderRadius: BorderRadius.circular(4),
              ),
            ),
          ],
        ),
        const SizedBox(height: 6),
        ClipRRect(
          borderRadius: BorderRadius.circular(6),
          child: LinearProgressIndicator(
            value: null,
            minHeight: 7,
            backgroundColor: context.dividerColor,
            color: info.color.withValues(alpha: 0.3),
          ),
        ),
      ],
    );
  }

  Widget _buildBenchmarkRow(BenchmarkInfo info, double animProgress) {
    final score = _parsedScores[info.name];
    final hasScore = score != null && score > 0;
    final hasData = _parsedScores.isNotEmpty;
    final maxScore = info.maxScore;
    final targetRatio = hasScore ? (score / maxScore).clamp(0.0, 1.0) : 0.0;
    final ratio = hasData ? targetRatio * animProgress : 0.0;
    final animScore = hasScore ? score * animProgress : 0.0;
    final displayScore =
        hasScore && hasData ? _formatScore(animScore) : (hasData ? 'N/A' : '--');
    final comps = _competitors[info.name] ?? [];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Container(
              width: 28,
              height: 28,
              decoration: BoxDecoration(
                color: info.color.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(info.icon, size: 14, color: info.color),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Flexible(
                        child: Text(
                          info.name,
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: context.textPrimary,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      Text(
                        displayScore,
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 13,
                          fontWeight: FontWeight.w800,
                          color: hasScore && hasData ? info.color : context.dividerColor,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 5),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(5),
                    child: SizedBox(
                      height: 8,
                      child: Stack(
                        children: [
                          Container(
                            decoration: BoxDecoration(
                              color: info.color.withValues(alpha: 0.08),
                              borderRadius: BorderRadius.circular(5),
                            ),
                          ),
                          FractionallySizedBox(
                            widthFactor: ratio,
                            child: Container(
                              decoration: BoxDecoration(
                                gradient: LinearGradient(
                                  colors: [info.color.withValues(alpha: 0.6), info.color],
                                ),
                                borderRadius: BorderRadius.circular(5),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        if (comps.isNotEmpty && hasData) ...[
          const SizedBox(height: 6),
          ...comps.map((comp) {
            final compScore = (comp['score'] as num).toDouble();
            final compRatio = (compScore / maxScore).clamp(0.0, 1.0) * animProgress;
            return Padding(
              padding: const EdgeInsets.only(left: 38, bottom: 3),
              child: Row(
                children: [
                  Expanded(
                    flex: 3,
                    child: Text(
                      comp['name'] as String,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 10,
                        color: AppTheme.slate400,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    flex: 4,
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(3),
                      child: SizedBox(
                        height: 5,
                        child: Stack(
                          children: [
                            Container(color: info.color.withValues(alpha: 0.05)),
                            FractionallySizedBox(
                              widthFactor: compRatio,
                              child: Container(
                                decoration: BoxDecoration(
                                  color: info.color.withValues(alpha: 0.35),
                                  borderRadius: BorderRadius.circular(3),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 6),
                  Text(
                    _formatScore(compScore * animProgress),
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 10,
                      fontWeight: FontWeight.w600,
                      color: AppTheme.slate400,
                    ),
                  ),
                ],
              ),
            );
          }),
        ],
      ],
    );
  }

  Widget _buildVerdictSection(bool loadingVerdict) {
    if (loadingVerdict) {
      return Padding(
        padding: const EdgeInsets.only(top: 20),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            SizedBox(
              width: 16,
              height: 16,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: AppTheme.brandCyan.withValues(alpha: 0.6),
              ),
            ),
            const SizedBox(width: 10),
            Text(
              context.l10n?.generatingVerdict ?? 'AI analizi oluşturuluyor…',
              style: GoogleFonts.plusJakartaSans(
                fontSize: 12,
                color: AppTheme.slate400,
              ),
            ),
          ],
        ),
      );
    }

    if (_targetAudience.isEmpty && _aiVerdict.isEmpty) {
      return const SizedBox.shrink();
    }

    final ppColor = _pricePerformance >= 7
        ? AppTheme.green500
        : _pricePerformance >= 4
            ? Colors.orange
            : Colors.redAccent;

    return Padding(
      padding: const EdgeInsets.only(top: 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            height: 1,
            margin: const EdgeInsets.only(bottom: 16),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [
                  AppTheme.brandCyan.withValues(alpha: 0.0),
                  AppTheme.brandCyan.withValues(alpha: 0.3),
                  AppTheme.brandCyan.withValues(alpha: 0.0),
                ],
              ),
            ),
          ),
          Row(
            children: [
              const Text('🎯', style: TextStyle(fontSize: 16)),
              const SizedBox(width: 8),
              Text(
                context.l10n?.aiVerdict ?? 'AI Değerlendirmesi',
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: context.textPrimary,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),

          if (_targetAudience.isNotEmpty) ...[
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppTheme.brandCyan.withValues(alpha: 0.06),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: AppTheme.brandCyan.withValues(alpha: 0.15)),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('🎯', style: TextStyle(fontSize: 14)),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      _targetAudience,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: context.textPrimary,
                        height: 1.4,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
          ],

          if (_pricePerformance > 0) ...[
            Row(
              children: [
                Text(
                  context.l10n?.pricePerformance ?? 'Fiyat-Performans',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: context.textSecondary,
                  ),
                ),
                const Spacer(),
                Text(
                  '${_pricePerformance.toStringAsFixed(1)}/10',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                    color: ppColor,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            ClipRRect(
              borderRadius: BorderRadius.circular(5),
              child: SizedBox(
                height: 8,
                child: Stack(
                  children: [
                    Container(
                      decoration: BoxDecoration(
                        color: ppColor.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(5),
                      ),
                    ),
                    FractionallySizedBox(
                      widthFactor: (_pricePerformance / 10).clamp(0.0, 1.0),
                      child: Container(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            colors: [ppColor.withValues(alpha: 0.6), ppColor],
                          ),
                          borderRadius: BorderRadius.circular(5),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 14),
          ],

          if (_strengths.isNotEmpty) ...[
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: _strengths
                  .map(
                    (s) => Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                      decoration: BoxDecoration(
                        color: AppTheme.green500.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: AppTheme.green500.withValues(alpha: 0.2)),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Text('✅', style: TextStyle(fontSize: 11)),
                          const SizedBox(width: 4),
                          Text(
                            s,
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: AppTheme.green500,
                            ),
                          ),
                        ],
                      ),
                    ),
                  )
                  .toList(),
            ),
            const SizedBox(height: 8),
          ],

          if (_weaknesses.isNotEmpty) ...[
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: _weaknesses
                  .map(
                    (w) => Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                      decoration: BoxDecoration(
                        color: Colors.orange.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: Colors.orange.withValues(alpha: 0.2)),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Text('⚠️', style: TextStyle(fontSize: 11)),
                          const SizedBox(width: 4),
                          Text(
                            w,
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: Colors.orange,
                            ),
                          ),
                        ],
                      ),
                    ),
                  )
                  .toList(),
            ),
            const SizedBox(height: 12),
          ],

          if (_aiVerdict.isNotEmpty)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: context.surfaceColor,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: context.dividerColor),
              ),
              child: IntrinsicHeight(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Container(
                      width: 3,
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: [AppTheme.brandCyan, AppTheme.neonPurple],
                        ),
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        _aiVerdict,
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                          color: context.textPrimary,
                          height: 1.5,
                          fontStyle: FontStyle.italic,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }

  Future<void> _fetchAiBenchmarks() async {
    final benchmarks = _getBenchmarksForCategory(widget.product);
    final benchmarkNames = benchmarks.map((b) => b.name).join(', ');
    final brand = widget.product.brand ?? '';
    final name = widget.product.name;
    final cat = widget.product.categoryId.toLowerCase();
    final subcat = widget.product.subcategory;

    final prompt = StringBuffer();
    prompt.writeln('You are a tech benchmark database expert.');
    prompt.writeln('Find the REAL, VERIFIED benchmark scores for "$brand $name".');
    prompt.writeln(
      'Product category: $cat${subcat.isNotEmpty ? ', subcategory: $subcat' : ''}.',
    );
    prompt.writeln(
      'Search benchmark databases and tech review sites for actual tested scores.',
    );
    prompt.writeln('');
    prompt.writeln('I need these benchmarks: $benchmarkNames');
    prompt.writeln('');

    if (cat.contains('phone') ||
        cat.contains('mobile') ||
        cat.contains('smartphone')) {
      if (brand.toLowerCase().contains('apple') ||
          brand.toLowerCase().contains('iphone')) {
        prompt.writeln(
          'NOTE: Apple iPhones do NOT have AnTuTu scores. Skip AnTuTu for Apple devices.',
        );
        prompt.writeln(
          'For iPhones, focus on Geekbench scores from browser.geekbench.com and DxOMark from dxomark.com.',
        );
      } else {
        prompt.writeln(
          'Search AnTuTu scores from nanoreview.net or antutu.com ranking pages.',
        );
      }
      prompt.writeln('Search DxOMark camera scores from dxomark.com.');
      prompt.writeln('Search Geekbench scores from browser.geekbench.com.');
    } else if (cat.contains('laptop') || cat.contains('notebook')) {
      prompt.writeln(
        'Search Cinebench R23 multi-core scores from notebookcheck.net.',
      );
      prompt.writeln('Search PCMark 10 scores from ul benchmarks.');
      prompt.writeln(
        'Search 3DMark Time Spy scores from notebookcheck.net.',
      );
    } else if (cat.contains('monitor') ||
        cat.contains('display') ||
        cat.contains('tv')) {
      prompt.writeln(
        'Search Rtings.com overall score (0-10 scale) for this monitor/display.',
      );
      prompt.writeln(
        'Search Color Accuracy in Delta E (ΔE) from rtings.com or displayspecifications.com.',
      );
      prompt.writeln(
        'Use decimal values (e.g. Rtings Score: 7.2, Color Accuracy (ΔE): 1.4).',
      );
    }

    prompt.writeln('');
    prompt.writeln(
      'Also find 2-3 competitor products in the same segment with their scores for comparison.',
    );
    prompt.writeln('');
    prompt.writeln('RESPOND IN THIS EXACT FORMAT (one per line):');
    prompt.writeln('SCORES:');
    prompt.writeln('BenchmarkName: NumericScore');
    prompt.writeln('');
    prompt.writeln('COMPETITORS:');
    prompt.writeln('BenchmarkName|ProductName|Score');
    prompt.writeln('');
    prompt.writeln('Example:');
    prompt.writeln('SCORES:');
    prompt.writeln('Geekbench Multi: 7200');
    prompt.writeln('DxOMark Camera: 157');
    prompt.writeln('Rtings Score: 7.2');
    prompt.writeln('Color Accuracy (ΔE): 1.4');
    prompt.writeln('');
    prompt.writeln('COMPETITORS:');
    prompt.writeln('Geekbench Multi|Samsung Galaxy S24|5800');
    prompt.writeln('Geekbench Multi|Google Pixel 9|6100');
    prompt.writeln('DxOMark Camera|Samsung Galaxy S24|150');
    prompt.writeln('');
    prompt.writeln('Rules:');
    prompt.writeln(
      '- Only REAL scores from actual benchmark databases — DO NOT estimate or fabricate',
    );
    prompt.writeln(
      '- If a benchmark score cannot be found, write: BenchmarkName: N/A',
    );
    prompt.writeln('- Numeric values only (decimals allowed, e.g. 7.2)');
    prompt.writeln(
      '- Competitors should be same-generation, same price segment products',
    );
    prompt.writeln(
      '- Double-check scores against known ranges for this product category',
    );

    await ref
        .read(benchmarkCacheProvider(widget.product.id).notifier)
        .fetchBenchmarks(prompt.toString());
  }

  void _parseResponse(String response, List<BenchmarkInfo> benchmarks) {
    final scoreRegex = RegExp(r'([A-Za-z\s\d\.\-]+?):\s*([\d,\.]+)', multiLine: true);
    for (final match in scoreRegex.allMatches(response)) {
      final name = match.group(1)!.trim();
      final scoreStr = match.group(2)!.replaceAll(',', '');
      final score = double.tryParse(scoreStr);
      if (score == null || score <= 0) continue;

      final nNorm = name.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '');
      BenchmarkInfo? bestMatch;
      int bestLen = 0;
      for (final b in benchmarks) {
        final bNorm = b.name.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '');
        if (nNorm.contains(bNorm) || bNorm.contains(nNorm)) {
          if (bNorm.length > bestLen) {
            bestLen = bNorm.length;
            bestMatch = b;
          }
        }
      }
      if (bestMatch != null && !_parsedScores.containsKey(bestMatch.name)) {
        _parsedScores[bestMatch.name] = score;
      }
    }

    final compRegex = RegExp(r'([A-Za-z\s\d\.\-]+?)\|(.+?)\|([\d,\.]+)', multiLine: true);
    for (final match in compRegex.allMatches(response)) {
      final benchName = match.group(1)!.trim();
      final prodName = match.group(2)!.trim();
      final scoreStr = match.group(3)!.replaceAll(',', '');
      final score = double.tryParse(scoreStr);
      if (score == null) continue;

      final nNorm = benchName.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '');
      for (final b in benchmarks) {
        final bNorm = b.name.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '');
        if (nNorm.contains(bNorm) || bNorm.contains(nNorm)) {
          _competitors.putIfAbsent(b.name, () => []);
          if (_competitors[b.name]!.length < 3) {
            _competitors[b.name]!.add({'name': prodName, 'score': score});
          }
          break;
        }
      }
    }
  }

  Future<void> _fetchAiVerdict() async {
    if (_parsedScores.isEmpty) return;

    final brand = widget.product.brand ?? '';
    final name = widget.product.name;
    final cat = widget.product.category;
    final priceMap = widget.product.prices;
    final priceStr = priceMap.isNotEmpty
        ? priceMap.entries.map((e) => '${e.key}: ${e.value}').join(', ')
        : 'unknown';
    final scoresStr = _parsedScores.entries
        .map((e) => '${e.key}: ${_formatScore(e.value)}')
        .join(', ');

    final prompt = '''Analyze "$brand $name" ($cat category).
Benchmark scores: $scoresStr
Price: $priceStr

Respond in this EXACT JSON format (no markdown, no extra text):
{
  "targetAudience": "One sentence describing who this product is perfect for",
  "pricePerformance": 7.5,
  "strengths": ["Strength 1", "Strength 2", "Strength 3"],
  "weaknesses": ["Weakness 1", "Weakness 2", "Weakness 3"],
  "verdict": "One paragraph overall assessment of this product"
}

Rules:
- pricePerformance is 1-10 (10 = amazing value for money)
- Exactly 3 strengths and 3 weaknesses as short phrases
- targetAudience should mention specific user types (gamers, professionals, students, etc.)
- verdict should be 2-3 sentences max
- Base analysis on the benchmark scores provided and general knowledge of the product''';

    await ref
        .read(benchmarkCacheProvider(widget.product.id).notifier)
        .fetchVerdict(prompt);
  }

  void _parseVerdictResponse(String response) {
    try {
      final json = jsonDecode(response) as Map<String, dynamic>;
      _targetAudience = json['targetAudience'] as String? ?? '';
      _pricePerformance = (json['pricePerformance'] as num?)?.toDouble() ?? 0;
      _strengths = List<String>.from(json['strengths'] as List? ?? []);
      _weaknesses = List<String>.from(json['weaknesses'] as List? ?? []);
      _aiVerdict = json['verdict'] as String? ?? '';
    } catch (e) {
      debugPrint('=== COMPAIR: Verdict parse error: $e ===');
    }
  }

  String _formatScore(double score) {
    if (score >= 1000000) return '${(score / 1000000).toStringAsFixed(1)}M';
    if (score >= 1000) {
      return '${(score / 1000).toStringAsFixed(score >= 10000 ? 0 : 1)}K';
    }
    if (score < 10 && score > 0) return score.toStringAsFixed(1);
    return score.round().toString();
  }

  static List<BenchmarkInfo> _getBenchmarksForCategory(ProductEntity product) {
    final cat = product.categoryId.toLowerCase();
    final isApple = (product.brand ?? '').toLowerCase().contains('apple') ||
        product.name.toLowerCase().contains('iphone') ||
        product.name.toLowerCase().contains('ipad');

    if (cat.contains('phone') ||
        cat.contains('mobile') ||
        cat.contains('smartphone') ||
        cat.contains('tablet')) {
      if (isApple) {
        return [
          BenchmarkInfo('Geekbench Single', Icons.speed, AppTheme.neonCyan, 40, 4000),
          BenchmarkInfo('Geekbench Multi', Icons.speed, AppTheme.green500, 80, 8000),
          BenchmarkInfo(
            'DxOMark Camera',
            Icons.camera_alt,
            const Color(0xFFFF6B35),
            1.8,
            160,
          ),
        ];
      }
      return [
        BenchmarkInfo('Geekbench Single', Icons.speed, AppTheme.neonCyan, 40, 4000),
        BenchmarkInfo('Geekbench Multi', Icons.speed, AppTheme.green500, 80, 8000),
        BenchmarkInfo(
          'DxOMark Camera',
          Icons.camera_alt,
          const Color(0xFFFF6B35),
          1.8,
          160,
        ),
      ];
    } else if (cat.contains('laptop') ||
        cat.contains('notebook') ||
        cat.contains('desktop')) {
      return [
        BenchmarkInfo(
          'Cinebench R23',
          Icons.precision_manufacturing,
          const Color(0xFFFF6B35),
          200,
          20000,
        ),
        BenchmarkInfo('Geekbench Multi', Icons.speed, AppTheme.neonCyan, 80, 8000),
        BenchmarkInfo('PassMark', Icons.assessment, AppTheme.green500, 600, 60000),
      ];
    } else if (cat.contains('cpu') || cat.contains('processor')) {
      return [
        BenchmarkInfo(
          'Cinebench R23',
          Icons.precision_manufacturing,
          const Color(0xFFFF6B35),
          500,
          40000,
        ),
        BenchmarkInfo('Geekbench Single', Icons.speed, AppTheme.neonCyan, 40, 4000),
        BenchmarkInfo('PassMark CPU', Icons.assessment, AppTheme.green500, 600, 60000),
      ];
    } else if (cat.contains('gpu') || cat.contains('graphic')) {
      return [
        BenchmarkInfo('3DMark', Icons.games, const Color(0xFFFF6B35), 350, 30000),
        BenchmarkInfo('PassMark GPU', Icons.assessment, AppTheme.neonCyan, 500, 50000),
      ];
    } else if (cat.contains('camera')) {
      return [
        BenchmarkInfo(
          'DxOMark Camera',
          Icons.camera,
          const Color(0xFFFF6B35),
          1.5,
          160,
        ),
        BenchmarkInfo('DxOMark Video', Icons.videocam, AppTheme.neonCyan, 1.2, 120),
      ];
    }
    return [];
  }
}

/// Public benchmark info data class.
class BenchmarkInfo {
  final String name;
  final IconData icon;
  final Color color;
  final double multiplier;
  final double maxScore;
  const BenchmarkInfo(this.name, this.icon, this.color, this.multiplier, this.maxScore);
}

/// Gauge needle painter for benchmark visualization.
class GaugeNeedlePainter extends CustomPainter {
  final double ratio;
  final Color color;
  final Color backgroundColor;
  final Color dividerColor;
  final Color textPrimaryColor;

  GaugeNeedlePainter({
    required this.ratio,
    required this.color,
    required this.backgroundColor,
    required this.dividerColor,
    required this.textPrimaryColor,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height * 0.82);
    final radius = size.width * 0.42;
    const startAngle = 3.665;
    const sweepAngle = 2.094;
    const strokeWidth = 10.0;

    final bgPaint = Paint()
      ..color = backgroundColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round;
    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      startAngle,
      sweepAngle,
      false,
      bgPaint,
    );

    if (ratio > 0.001) {
      final filledSweep = sweepAngle * ratio;
      final gradientPaint = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = strokeWidth
        ..strokeCap = StrokeCap.round
        ..shader = SweepGradient(
          center: Alignment.center,
          startAngle: startAngle,
          endAngle: startAngle + filledSweep,
          colors: [
            color.withValues(alpha: 0.4),
            color.withValues(alpha: 0.7),
            color,
          ],
          stops: const [0.0, 0.5, 1.0],
        ).createShader(Rect.fromCircle(center: center, radius: radius));
      canvas.drawArc(
        Rect.fromCircle(center: center, radius: radius),
        startAngle,
        filledSweep,
        false,
        gradientPaint,
      );
    }

    final tickPaint = Paint()
      ..color = dividerColor
      ..strokeWidth = 1.0;
    for (int i = 0; i <= 10; i++) {
      final tickAngle = startAngle + (sweepAngle * i / 10);
      final innerR = radius - (i % 5 == 0 ? 14 : 8);
      final outerR = radius - 4;
      final inner = Offset(
        center.dx + innerR * _cos(tickAngle),
        center.dy + innerR * _sin(tickAngle),
      );
      final outer = Offset(
        center.dx + outerR * _cos(tickAngle),
        center.dy + outerR * _sin(tickAngle),
      );
      canvas.drawLine(inner, outer, tickPaint);
    }

    final needleAngle = startAngle + (sweepAngle * ratio);
    final needleLength = radius - 6;
    final needleTip = Offset(
      center.dx + needleLength * _cos(needleAngle),
      center.dy + needleLength * _sin(needleAngle),
    );

    final shadowPaint = Paint()
      ..color = Colors.white.withValues(alpha: 0.08)
      ..strokeWidth = 3.0
      ..strokeCap = StrokeCap.round;
    canvas.drawLine(
      Offset(center.dx + 1, center.dy + 1),
      Offset(needleTip.dx + 1, needleTip.dy + 1),
      shadowPaint,
    );

    final needlePaint = Paint()
      ..color = color
      ..strokeWidth = 2.5
      ..strokeCap = StrokeCap.round;
    canvas.drawLine(center, needleTip, needlePaint);

    final pivotOuter = Paint()..color = color;
    canvas.drawCircle(center, 5, pivotOuter);
    final pivotInner = Paint()..color = textPrimaryColor;
    canvas.drawCircle(center, 2.5, pivotInner);
  }

  static double _cos(double r) => r.isNaN ? 0 : dart_math.cos(r);
  static double _sin(double r) => r.isNaN ? 0 : dart_math.sin(r);

  @override
  bool shouldRepaint(covariant GaugeNeedlePainter oldDelegate) =>
      oldDelegate.ratio != ratio || oldDelegate.color != color;
}
