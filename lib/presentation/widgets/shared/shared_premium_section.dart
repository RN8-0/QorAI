import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:qor_ai/core/email_verification_gate.dart';
import 'package:qor_ai/core/product_filter.dart';
import 'package:qor_ai/core/theme.dart';
import 'package:qor_ai/core/utils.dart';
import 'package:qor_ai/domain/entities/product_entity.dart';
import 'package:qor_ai/domain/entities/ai_entities.dart';
import 'package:qor_ai/presentation/providers/providers.dart';
import 'package:qor_ai/services/ai_report_service.dart';
import 'package:qor_ai/presentation/widgets/shared/ai_report_view.dart';
import 'package:qor_ai/presentation/widgets/shared/shared_quiz_view.dart';
import 'package:qor_ai/presentation/widgets/qor_badges.dart';
import 'package:qor_ai/presentation/widgets/limit_reached_dialog.dart';
import 'package:qor_ai/presentation/widgets/login_required_dialog.dart';

/// Shared premium features section used by both detail and compare screens.
/// Shows expandable AI analysis sections: Deep Analysis, Alternatives, Advisor, Prediction.
class SharedPremiumFeaturesSection extends ConsumerStatefulWidget {
  final ProductEntity product;

  /// Optional callback for price history action. If null, no price history button shown.
  final VoidCallback? onShowPriceHistory;

  const SharedPremiumFeaturesSection({
    super.key,
    required this.product,
    this.onShowPriceHistory,
  });

  @override
  ConsumerState<SharedPremiumFeaturesSection> createState() =>
      SharedPremiumFeaturesSectionState();
}

class SharedPremiumFeaturesSectionState
    extends ConsumerState<SharedPremiumFeaturesSection> {
  bool _deepAnalysisExpanded = false;
  bool _alternativesExpanded = false;
  bool _advisorExpanded = false;
  bool _predictionExpanded = false;
  bool _unifiedAiExpanded = false;
  bool _unifiedAiRunning = false;
  // ignore: unused_field
  bool _unifiedAiUserCollapsed = false;
  bool _unifiedAiAutoStarted = false;
  // ignore: unused_field
  String _unifiedAiStep = '';

  // Web-parity unified product report (product_full_report).
  Map<String, dynamic>? _fullReport;
  bool _fullReportRunning = false;
  bool _fullReportError = false;
  AiReportStageLite _fullReportStage = AiReportStageLite.prep;
  // HIZ: web araştırmasını quiz cevaplanırken paralel çalıştırmak için.
  Future<String>? _researchFuture;

  // Web-parity quiz step (shown before the report — same UI as link/sub quiz).
  ProductQuiz? _quiz;
  List<QuizQuestion> _quizAnswers = const [];
  int _quizIndex = 0;
  bool _quizLoading = false;

  // ignore: unused_field
  bool _deepAnalysisUserCollapsed = false;
  // ignore: unused_field
  bool _alternativesUserCollapsed = false;
  // ignore: unused_field
  bool _advisorUserCollapsed = false;
  // ignore: unused_field
  bool _predictionUserCollapsed = false;

  bool get _isTurkish => Localizations.localeOf(context).languageCode == 'tr';

  String _txt({required String tr, required String en}) {
    return _isTurkish ? tr : en;
  }

  String _predictionProductContext(ProductEntity product) {
    final releaseYear = ProductFilter.getExactReleaseYear(product);
    final details = <String>[
      'brand: ${product.brand?.trim().isNotEmpty == true ? product.brand!.trim() : 'unknown'}',
      'category: ${product.category}',
    ];
    if (product.subcategory.trim().isNotEmpty) {
      details.add('subcategory: ${product.subcategory.trim()}');
    }
    if (releaseYear != null) {
      details.add('release year: $releaseYear');
    }
    if (product.techScore > 0) {
      details.add('tech score: ${product.techScore.toStringAsFixed(1)}/100');
    }
    final highlightedSpecs = product.keySpecs.entries
        .where(
          (entry) =>
              entry.key.trim().isNotEmpty && entry.value.trim().isNotEmpty,
        )
        .take(4)
        .map((entry) => '${entry.key}: ${entry.value}')
        .toList();
    if (highlightedSpecs.isNotEmpty) {
      details.add('key specs: ${highlightedSpecs.join(' | ')}');
    }
    return details.join(', ');
  }

  @override
  void initState() {
    super.initState();
    // No auto-start: like the website, the AI report runs only when the user
    // taps the explicit "Start analysis" button. This also stops opening the
    // tab from silently spending a product-AI credit.
  }

  // Retained for reference; the product AI is now user-triggered.
  // ignore: unused_element
  void _scheduleUnifiedAiAutoStart() {
    if (_unifiedAiAutoStarted) return;
    _unifiedAiAutoStarted = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _toggleUnifiedAnalysis(autoStart: true);
    });
  }

  @override
  Widget build(BuildContext context) {
    // Web-parity unified AI report (product_full_report). User-triggered via an
    // explicit Start button; renders identically to the website.
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        RepaintBoundary(child: _buildFullReportSection()),
      ],
    );
  }

  String get _reportLang => Localizations.localeOf(context).languageCode;

  AiReportStageLite _mapStage(AiReportStage s) => switch (s) {
    AiReportStage.prep => AiReportStageLite.prep,
    AiReportStage.research => AiReportStageLite.research,
    AiReportStage.report => AiReportStageLite.report,
  };

  Map<String, dynamic> _buildAiProfile() {
    final u = ref.read(userProfileProvider).valueOrNull;
    if (u == null) return const {};
    final m = <String, dynamic>{};
    void put(String k, dynamic v) {
      if (v == null) return;
      if (v is String && v.trim().isEmpty) return;
      if (v is List && v.isEmpty) return;
      m[k] = v;
    }

    put('country', u.country);
    put('language', u.language);
    if (u.ecosystem != 'mixed') put('ecosystem', u.ecosystem);
    put('budget', u.budgetRange);
    put('priorities', u.priorities);
    put('profession', u.profession);
    put('interests', u.interestCategories);
    return m;
  }

  Widget _buildFullReportSection() {
    if (_quizLoading) {
      // TEK STANDART loader: küçük "Sorular hazırlanıyor" kartı yerine, analiz
      // aşamasıyla (ve abonelik akışıyla) AYNI adım-listeli workboard kullan.
      // Quiz üretimi de analiz de aynı formatta görünür.
      return AiReportWorkboard(
        lang: _reportLang,
        mode: 'product',
        stage: AiReportStageLite.prep,
      );
    }
    if (_quiz != null && _fullReport == null && !_fullReportRunning) {
      return _buildQuizCard();
    }
    if (_fullReportRunning) {
      return AiReportWorkboard(
        lang: _reportLang,
        mode: 'product',
        stage: _fullReportStage,
      );
    }
    if (_fullReport != null) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AiReportView(
            kind: 'productFull',
            data: _fullReport!,
            lang: _reportLang,
          ),
          const SizedBox(height: 6),
          Center(
            child: TextButton.icon(
              onPressed: _runProductFullReport,
              icon: const Icon(Icons.refresh_rounded, size: 16),
              label: Text(
                _txt(tr: 'Yeniden Analiz Et', en: 'Re-run analysis'),
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
        ],
      );
    }
    return _buildFullReportStartCard();
  }

  Widget _buildQuizSurround({required Widget child}) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: context.dividerColor.withValues(alpha: 0.55)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 38,
                height: 38,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [AppTheme.premiumPurple, AppTheme.primaryBlue],
                  ),
                  borderRadius: BorderRadius.circular(11),
                ),
                child: const Icon(
                  Icons.tune_rounded,
                  color: Colors.white,
                  size: 19,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _txt(tr: 'Sana Göre Kişiselleştir', en: 'Personalize'),
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                        color: context.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      _txt(
                        tr: 'Birkaç soruyu yanıtla, analiz sana göre olsun',
                        en: 'Answer a few questions for a tailored analysis',
                      ),
                      style: GoogleFonts.inter(
                        fontSize: 11.5,
                        height: 1.35,
                        color: context.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          child,
        ],
      ),
    );
  }

  Widget _buildQuizCard() {
    final p = widget.product;
    return _buildQuizSurround(
      child: SharedQuizView(
        products: [
          SharedQuizProduct(
            title: p.nameForLanguage(_reportLang),
            imageUrl: p.imageUrl,
            fallbackImages: p.allImages,
            subtitle: p.brand,
          ),
        ],
        questions: _quizAnswers,
        currentIndex: _quizIndex,
        onAnswer: _onQuizAnswer,
        onSubmit: _submitQuiz,
        onSkip: _skipQuiz,
        submitLabel: _txt(tr: 'Analizi Başlat', en: 'See analysis'),
        skipLabel: _txt(tr: 'Quizi atla & analiz et', en: 'Skip & analyze'),
      ),
    );
  }

  Widget _buildFullReportStartCard() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: context.dividerColor.withValues(alpha: 0.55)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 38,
                height: 38,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [AppTheme.premiumPurple, AppTheme.primaryBlue],
                  ),
                  borderRadius: BorderRadius.circular(11),
                ),
                child: const Icon(
                  Icons.auto_awesome_rounded,
                  color: Colors.white,
                  size: 19,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _txt(tr: 'AI Analizi', en: 'AI Analysis'),
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                        color: context.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      _txt(
                        tr: 'Yorumlar, teknik analiz, tavsiye ve fiyat tahmini',
                        en: 'Reviews, specs, advice and price prediction',
                      ),
                      style: GoogleFonts.inter(
                        fontSize: 11.5,
                        height: 1.35,
                        color: context.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          if (_fullReportError)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Text(
                _txt(
                  tr: 'AI analizi tamamlanamadı. Lütfen tekrar dene.',
                  en: 'AI analysis could not be completed. Please try again.',
                ),
                style: GoogleFonts.inter(fontSize: 12, color: AppTheme.error),
              ),
            ),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: _runProductFullReport,
              style: FilledButton.styleFrom(
                backgroundColor: AppTheme.brandBlue,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 13),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
              icon: const Icon(Icons.auto_awesome_rounded, size: 18),
              label: Text(
                _fullReportError
                    ? _txt(tr: 'Tekrar Dene', en: 'Try Again')
                    : _txt(tr: 'Analizi Başlat', en: 'Start Analysis'),
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 14,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// "Analizi Başlat" → web paritesi: önce ürüne özel quiz üret + göster
  /// (link/abonelik analizindeki AYNI quiz UI'ı), sonra cevaplarla raporu
  /// çalıştır. Quiz üretilemezse zarifçe doğrudan rapora geçer.
  Future<void> _runProductFullReport() async {
    if (_fullReportRunning || _quizLoading) return;
    if (!await _checkAiFeatureLimit()) return;
    if (!mounted) return;
    setState(() {
      _quizLoading = true;
      _quiz = null;
      _fullReportError = false;
    });
    // HIZ: web araştırmasını ŞİMDİ başlat (quiz üretimi + kullanıcının quiz'i
    // yanıtlaması ile paralel çalışsın). Submit'te rapor, biten araştırmayı
    // beklemeden kullanır → analiz belirgin şekilde daha hızlı görünür.
    _researchFuture = AiReportService.prefetchProductResearch(
      ref,
      widget.product,
      _reportLang,
    );
    // Web paritesi: Gemini öncelikli (link/abonelik akışıyla aynı), DeepSeek
    // fallback — DeepSeek proxy zaman zaman "temporarily unavailable" dönüyor.
    final cat = widget.product.category;
    final title = widget.product.nameForLanguage(_reportLang);
    final aiProfile = ref.read(userProfileProvider).valueOrNull;
    ProductQuiz? quiz;
    try {
      quiz = await ref
          .read(geminiServiceProvider)
          .generateQuiz(
            category: cat,
            productTitle: title,
            url: '',
            language: _reportLang,
            profile: aiProfile,
          )
          .timeout(const Duration(seconds: 45));
    } catch (e) {
      debugPrint('[Qor AI] product quiz (gemini) failed, trying deepseek: $e');
      try {
        quiz = await ref
            .read(deepSeekServiceProvider)
            .generateQuiz(
              category: cat,
              productTitle: title,
              url: '',
              language: _reportLang,
            )
            .timeout(const Duration(seconds: 45));
      } catch (e2) {
        debugPrint('[Qor AI] product quiz generation failed: $e2');
      }
    }
    if (!mounted) return;
    if (quiz != null && quiz.questions.isNotEmpty) {
      setState(() {
        _quiz = quiz;
        _quizAnswers = quiz!.questions.map((q) => q.copyWith()).toList();
        _quizIndex = 0;
        _quizLoading = false;
      });
    } else {
      setState(() => _quizLoading = false);
      await _runReport(const []);
    }
  }

  void _onQuizAnswer(int index, String answer) {
    if (index < 0 || index >= _quizAnswers.length) return;
    setState(() {
      _quizAnswers[index] =
          _quizAnswers[index].copyWith(selectedOption: answer);
      if (index == _quizIndex && _quizIndex < _quizAnswers.length - 1) {
        _quizIndex++;
      }
    });
  }

  Future<void> _submitQuiz() async {
    final answers = _quizAnswers;
    _persistQuizAnswers(answers); // best-effort: profile + tanıma algoritması
    setState(() => _quiz = null);
    await _runReport(answers);
  }

  /// Ürün-detay quizinin cevaplarını kullanıcı profiline (quizHistory) yazar —
  /// link/abonelik akışlarındaki AYNI desen. quizHistory, eşleşme/tanıma
  /// algoritması tarafından (cache_providers match-cache + weightVector)
  /// okunduğu için cevaplar kullanıcı tanımaya da katkı sağlar.
  void _persistQuizAnswers(List<QuizQuestion> answers) {
    final uid = ref.read(userProfileProvider).valueOrNull?.uid;
    if (uid == null || uid.isEmpty) return;
    final answered = answers
        .where((q) => q.selectedOption != null)
        .map((q) => {'question': q.text, 'answer': q.selectedOption})
        .toList();
    if (answered.isEmpty) return;
    final p = widget.product;
    unawaited(
      ref
          .read(pbDataSourceProvider)
          .saveQuizHistory(uid, {
            'timestamp': DateTime.now().toIso8601String(),
            'status': 'completed',
            'productId': p.id,
            'productTitle': p.nameForLanguage(_reportLang),
            'category': p.category,
            'mode': 'product',
            'questionCount': answers.length,
            'questions': answers
                .map((q) => {'question': q.text, 'options': q.options})
                .toList(),
            'answers': answered,
          })
          .catchError((_) {}),
    );
  }

  Future<void> _skipQuiz() async {
    setState(() => _quiz = null);
    await _runReport(const []);
  }

  /// Runs the product_full_report with the collected quiz answers. The AI
  /// feature limit is recorded by [_runProductFullReport] before the quiz, so
  /// this does NOT re-gate.
  Future<void> _runReport(List<QuizQuestion> quizAnswers) async {
    if (_fullReportRunning) return;
    if (!mounted) return;
    final lang = _reportLang;
    setState(() {
      _fullReportRunning = true;
      _fullReportError = false;
      _fullReportStage = AiReportStageLite.prep;
    });
    try {
      // Fetch Qor catalog "similar products" so the AI can reuse REAL catalog
      // products (with their image) as smart alternatives — web parity with
      // ProductDetail.runFullAnalysis. Best-effort: the report still runs if
      // the lookup fails or is empty.
      List<ProductEntity> similar = const [];
      try {
        similar = await ref.read(
          similarProductsProvider(widget.product).future,
        );
      } catch (_) {}
      final report = await AiReportService.runProductReport(
        ref: ref,
        product: widget.product,
        lang: lang,
        profile: _buildAiProfile(),
        quizAnswers: quizAnswers,
        similarProducts: similar,
        researchFuture: _researchFuture,
        onStage: (s) {
          if (!mounted) return;
          setState(() => _fullReportStage = _mapStage(s));
        },
      );
      if (!mounted) return;
      setState(() {
        _fullReportRunning = false;
        if (report != null) {
          _fullReport = report;
          _fullReportError = false;
        } else {
          _fullReportError = true;
        }
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _fullReportRunning = false;
        _fullReportError = true;
      });
    }
  }

  // ignore: unused_element
  Widget _buildCollapsibleHeader({
    required IconData icon,
    required String title,
    required String subtitle,
    required List<Color> gradient,
    required bool isExpanded,
    required bool isLoading,
    required bool hasContent,
    required VoidCallback onTap,
    int? cost,
    String stepMessage = '',
    Widget? expandedChild,
  }) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 300),
      curve: Curves.easeInOut,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: context.dividerColor.withValues(alpha: 0.55)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.035),
            blurRadius: 14,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: onTap,
            child: Row(
              children: [
                Container(
                  width: 38,
                  height: 38,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: gradient[0].withValues(alpha: 0.09),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                      color: gradient[0].withValues(alpha: 0.16),
                    ),
                  ),
                  child: Icon(icon, color: gradient[0], size: 19),
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
                              title,
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 14.5,
                                fontWeight: FontWeight.w800,
                                color: context.textPrimary,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          if (cost != null) ...[
                            const SizedBox(width: 8),
                            QorAmountBadge(
                              amount: cost,
                              color: gradient[0],
                              fontSize: 10,
                              padding: const EdgeInsets.symmetric(
                                horizontal: 6,
                                vertical: 2,
                              ),
                            ),
                          ],
                        ],
                      ),
                      const SizedBox(height: 2),
                      AnimatedSwitcher(
                        duration: const Duration(milliseconds: 250),
                        child: Text(
                          key: ValueKey(
                            isLoading && stepMessage.isNotEmpty
                                ? stepMessage
                                : subtitle,
                          ),
                          isLoading && stepMessage.isNotEmpty
                              ? stepMessage
                              : subtitle,
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 11.5,
                            color: isLoading && stepMessage.isNotEmpty
                                ? gradient[0].withValues(alpha: 0.85)
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
                else ...[
                  Container(
                    width: 28,
                    height: 28,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: gradient[0].withValues(alpha: 0.08),
                      shape: BoxShape.circle,
                    ),
                    child: Icon(
                      isExpanded
                          ? Icons.expand_less_rounded
                          : Icons.expand_more_rounded,
                      size: 19,
                      color: gradient[0],
                    ),
                  ),
                ],
              ],
            ),
          ),
          if (isExpanded && expandedChild != null) ...[
            const SizedBox(height: 14),
            expandedChild,
          ],
        ],
      ),
    );
  }

  // ignore: unused_element
  Widget _buildUnifiedAnalysisVisual({
    required AIReviewResult? review,
    required DeepAnalysisResult? deepAnalysis,
    required AdvisorResult? advisor,
    required AlternativesResult? alternatives,
    required PredictionResult? prediction,
    required bool isLoading,
  }) {
    final sections = <Widget>[];
    if (review != null && !review.failed) {
      sections.add(
        _buildUnifiedSection(
          icon: Icons.forum_rounded,
          title: _txt(tr: 'Yorum Memnuniyeti', en: 'Review Sentiment'),
          color: AppTheme.accentCyan,
          child: _buildReviewSentimentVisual(review),
        ),
      );
    }
    if (deepAnalysis?.hasUsableContent == true) {
      sections.add(
        _buildUnifiedSection(
          icon: Icons.psychology_rounded,
          title: _txt(tr: 'Teknik Oncelikler', en: 'Technical Priorities'),
          color: AppTheme.premiumPurple,
          child: _buildDeepAnalysisVisual(deepAnalysis!),
        ),
      );
    }
    if (advisor?.hasUsableContent == true) {
      sections.add(
        _buildUnifiedSection(
          icon: Icons.support_agent_rounded,
          title: _txt(tr: 'Satin Alma Karari', en: 'Buying Decision'),
          color: AppTheme.primaryBlue,
          child: _buildAdvisorVisual(advisor!),
        ),
      );
    }
    if (alternatives?.hasUsableContent == true) {
      sections.add(
        _buildUnifiedSection(
          icon: Icons.swap_horizontal_circle_rounded,
          title: _txt(
            tr: 'Daha Mantikli Alternatifler',
            en: 'Better Alternatives',
          ),
          color: AppTheme.warning,
          child: _buildAlternativesVisual(alternatives!),
        ),
      );
    }
    if (prediction?.hasUsableContent == true) {
      sections.add(
        _buildUnifiedSection(
          icon: Icons.trending_down_rounded,
          title: _txt(tr: 'Fiyat Zamanlamasi', en: 'Price Timing'),
          color: AppTheme.green500,
          child: _buildPredictionVisual(prediction!),
        ),
      );
    }
    if (sections.isEmpty) {
      return _buildAiLoadingPlaceholder(isLoading);
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (var i = 0; i < sections.length; i++) ...[
          if (i > 0) const SizedBox(height: 16),
          sections[i],
        ],
        if (isLoading) ...[
          const SizedBox(height: 16),
          _buildAiLoadingPlaceholder(true),
        ],
      ],
    );
  }

  Widget _buildUnifiedSection({
    required IconData icon,
    required String title,
    required Color color,
    required Widget child,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildSectionLabel(icon, title, color),
        const SizedBox(height: 10),
        child,
      ],
    );
  }

  Widget _buildReviewSentimentVisual(AIReviewResult result) {
    final satisfaction = result.satisfaction.clamp(0, 100).toInt();
    final confidence = result.confidence.clamp(0, 100).toInt();
    final scoreColor = satisfaction >= 80
        ? AppTheme.green500
        : satisfaction >= 60
        ? AppTheme.amber500
        : AppTheme.rose500;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            SizedBox(
              width: 92,
              height: 92,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  SizedBox(
                    width: 92,
                    height: 92,
                    child: CircularProgressIndicator(
                      value: satisfaction / 100.0,
                      strokeWidth: 8,
                      strokeCap: StrokeCap.round,
                      backgroundColor: scoreColor.withValues(alpha: 0.12),
                      valueColor: AlwaysStoppedAnimation(scoreColor),
                    ),
                  ),
                  Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        '$satisfaction%',
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 20,
                          fontWeight: FontWeight.w900,
                          color: scoreColor,
                        ),
                      ),
                      Text(
                        _txt(tr: 'memnun', en: 'satisfied'),
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 10,
                          fontWeight: FontWeight.w600,
                          color: context.textSecondary,
                        ),
                      ),
                    ],
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
                    result.summary,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 12.5,
                      height: 1.45,
                      color: context.textPrimary,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  if (confidence > 0) ...[
                    const SizedBox(height: 8),
                    Text(
                      _txt(
                        tr: 'Kaynak guveni: $confidence/100',
                        en: 'Source confidence: $confidence/100',
                      ),
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 11,
                        color: context.textSecondary,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
        if (result.praised.isNotEmpty || result.criticized.isNotEmpty) ...[
          const SizedBox(height: 14),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (result.praised.isNotEmpty)
                Expanded(
                  child: _buildProConCard(
                    icon: Icons.thumb_up_alt_rounded,
                    title: _txt(tr: 'Ovulenler', en: 'Praised'),
                    items: result.praised.take(4).toList(),
                    color: AppTheme.green500,
                  ),
                ),
              if (result.praised.isNotEmpty && result.criticized.isNotEmpty)
                const SizedBox(width: 8),
              if (result.criticized.isNotEmpty)
                Expanded(
                  child: _buildProConCard(
                    icon: Icons.report_problem_rounded,
                    title: _txt(tr: 'Sikayetler', en: 'Complaints'),
                    items: result.criticized.take(4).toList(),
                    color: AppTheme.rose500,
                  ),
                ),
            ],
          ),
        ],
        if (result.sources.isNotEmpty) ...[
          const SizedBox(height: 12),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: result.sources.take(6).map((source) {
              return Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: AppTheme.accentCyan.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                    color: AppTheme.accentCyan.withValues(alpha: 0.18),
                  ),
                ),
                child: Text(
                  source,
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 10.5,
                    fontWeight: FontWeight.w700,
                    color: AppTheme.accentCyan,
                  ),
                ),
              );
            }).toList(),
          ),
        ],
      ],
    );
  }

  Widget _buildAiLoadingPlaceholder(bool isLoading) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: context.dividerColor),
      ),
      child: Row(
        children: [
          if (isLoading)
            const SizedBox(
              width: 18,
              height: 18,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          else
            Icon(
              Icons.auto_awesome_rounded,
              size: 18,
              color: context.textTertiaryColor,
            ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              isLoading
                  ? _txt(
                      tr: 'Analiz hazirlaniyor...',
                      en: 'Preparing analysis...',
                    )
                  : _txt(tr: 'Analizi baslat', en: 'Start analysis'),
              style: GoogleFonts.plusJakartaSans(
                fontSize: 12.5,
                fontWeight: FontWeight.w700,
                color: context.textSecondary,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDeepAnalysisVisual(DeepAnalysisResult r) {
    if (r.rawFallback != null) {
      return _buildRichContent(r.rawFallback!, AppTheme.premiumPurple);
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (r.overallScore > 0) ...[
          Center(
            child: TweenAnimationBuilder<double>(
              tween: Tween(begin: 0, end: r.overallScore / 100),
              duration: const Duration(milliseconds: 1200),
              curve: Curves.easeOutCubic,
              builder: (context, value, _) {
                final score = (value * 100).round();
                final scoreColor = score >= 80
                    ? AppTheme.green500
                    : score >= 60
                    ? AppTheme.amber500
                    : AppTheme.rose500;
                return SizedBox(
                  width: 100,
                  height: 100,
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      SizedBox(
                        width: 100,
                        height: 100,
                        child: CircularProgressIndicator(
                          value: value,
                          strokeWidth: 8,
                          backgroundColor: scoreColor.withValues(alpha: 0.12),
                          valueColor: AlwaysStoppedAnimation(scoreColor),
                          strokeCap: StrokeCap.round,
                        ),
                      ),
                      Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            '$score',
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 28,
                              fontWeight: FontWeight.w800,
                              color: scoreColor,
                            ),
                          ),
                          Text(
                            '/ 100',
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 11,
                              fontWeight: FontWeight.w500,
                              color: context.textSecondary,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                );
              },
            ),
          ),
          const SizedBox(height: 16),
        ],

        if (r.strengths.isNotEmpty) ...[
          _buildSectionLabel(
            Icons.trending_up_rounded,
            _txt(tr: 'Güçlü Yönler', en: 'Strengths'),
            AppTheme.green500,
          ),
          const SizedBox(height: 8),
          ...r.strengths.map((s) => _buildAttributeBar(s, AppTheme.green500)),
          const SizedBox(height: 14),
        ],

        if (r.weaknesses.isNotEmpty) ...[
          _buildSectionLabel(
            Icons.trending_down_rounded,
            _txt(tr: 'Zayif Yonler', en: 'Weaknesses'),
            AppTheme.rose500,
          ),
          const SizedBox(height: 8),
          ...r.weaknesses.map((w) => _buildAttributeBar(w, AppTheme.rose500)),
          const SizedBox(height: 14),
        ],

        if (r.pros.isNotEmpty || r.cons.isNotEmpty)
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (r.pros.isNotEmpty)
                Expanded(
                  child: _buildProConCard(
                    icon: Icons.check_circle_rounded,
                    title: _txt(tr: 'Artilar', en: 'Pros'),
                    items: r.pros,
                    color: AppTheme.green500,
                  ),
                ),
              if (r.pros.isNotEmpty && r.cons.isNotEmpty)
                const SizedBox(width: 8),
              if (r.cons.isNotEmpty)
                Expanded(
                  child: _buildProConCard(
                    icon: Icons.cancel_rounded,
                    title: _txt(tr: 'Eksiler', en: 'Cons'),
                    items: r.cons,
                    color: AppTheme.rose500,
                  ),
                ),
            ],
          ),

        if (r.verdict.isNotEmpty) ...[
          const SizedBox(height: 14),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppTheme.premiumPurple.withValues(alpha: 0.06),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                color: AppTheme.premiumPurple.withValues(alpha: 0.15),
              ),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('💡', style: TextStyle(fontSize: 16)),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    r.verdict,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 12.5,
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
        ],
      ],
    );
  }

  Widget _buildSectionLabel(IconData icon, String label, Color color) {
    return Row(
      children: [
        Icon(icon, size: 16, color: color),
        const SizedBox(width: 6),
        Text(
          label,
          style: GoogleFonts.plusJakartaSans(
            fontSize: 13,
            fontWeight: FontWeight.w700,
            color: color,
          ),
        ),
      ],
    );
  }

  Widget _buildAttributeBar(AnalysisAttribute attr, Color color) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  attr.name,
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: context.textPrimary,
                  ),
                ),
              ),
              Text(
                '${attr.score}',
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                  color: color,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          TweenAnimationBuilder<double>(
            tween: Tween(begin: 0, end: (attr.score / 100).clamp(0, 1)),
            duration: const Duration(milliseconds: 800),
            curve: Curves.easeOutCubic,
            builder: (_, v, _) => ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: SizedBox(
                height: 6,
                child: Stack(
                  children: [
                    Container(color: color.withValues(alpha: 0.1)),
                    FractionallySizedBox(
                      widthFactor: v,
                      child: Container(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            colors: [color.withValues(alpha: 0.5), color],
                          ),
                          borderRadius: BorderRadius.circular(4),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          if (attr.detail.isNotEmpty) ...[
            const SizedBox(height: 2),
            Text(
              attr.detail,
              style: GoogleFonts.plusJakartaSans(
                fontSize: 11,
                color: context.textSecondary,
                height: 1.3,
              ),
            ),
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
          Row(
            children: [
              Icon(icon, size: 14, color: color),
              const SizedBox(width: 4),
              Text(
                title,
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: color,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          ...items.map(
            (item) => Padding(
              padding: const EdgeInsets.only(bottom: 3),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '•',
                    style: TextStyle(
                      fontSize: 11,
                      color: color,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(width: 4),
                  Expanded(
                    child: Text(
                      item,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 11,
                        color: context.textPrimary,
                        height: 1.3,
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

  Widget _buildAlternativesVisual(AlternativesResult r) {
    if (r.rawFallback != null) {
      return _buildRichContent(r.rawFallback!, AppTheme.warning);
    }
    if (r.alternatives.isEmpty) return const SizedBox.shrink();

    return SizedBox(
      height: 248,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: r.alternatives.length,
        separatorBuilder: (_, _) => const SizedBox(width: 10),
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
              border: Border.all(
                color: AppTheme.warning.withValues(alpha: 0.2),
              ),
              boxShadow: [
                BoxShadow(
                  color: AppTheme.warning.withValues(alpha: 0.06),
                  blurRadius: 8,
                  offset: const Offset(0, 2),
                ),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        alt.name,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 12.5,
                          fontWeight: FontWeight.w700,
                          color: context.textPrimary,
                          height: 1.3,
                        ),
                      ),
                    ),
                    const SizedBox(width: 4),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 6,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: priceColor.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(priceIcon, size: 10, color: priceColor),
                          const SizedBox(width: 2),
                          Text(
                            alt.priceComparison,
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 9,
                              fontWeight: FontWeight.w700,
                              color: priceColor,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                if (alt.advantage.isNotEmpty)
                  _buildAltInfoRow(
                    Icons.check_circle_outline_rounded,
                    alt.advantage,
                    AppTheme.green500,
                  ),
                const SizedBox(height: 4),
                if (alt.tradeoff.isNotEmpty)
                  _buildAltInfoRow(
                    Icons.warning_amber_rounded,
                    alt.tradeoff,
                    AppTheme.amber500,
                  ),
                if (alt.whyBetter.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 5,
                    ),
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: [
                          AppTheme.warning.withValues(alpha: 0.1),
                          const Color(0xFFF97316).withValues(alpha: 0.06),
                        ],
                      ),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      '⭐ ${alt.whyBetter}',
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 10,
                        fontWeight: FontWeight.w600,
                        color: context.textPrimary,
                        height: 1.3,
                      ),
                    ),
                  ),
                ],
                if (alt.bestFor.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(
                    '🎯 ${alt.bestFor}',
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 10,
                      color: context.textSecondary,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildAltInfoRow(IconData icon, String text, Color color) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 13, color: color),
        const SizedBox(width: 4),
        Expanded(
          child: Text(
            text,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 11,
              color: context.textPrimary,
              height: 1.3,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildAdvisorVisual(AdvisorResult r) {
    if (r.rawFallback != null) {
      return _buildRichContent(r.rawFallback!, const Color(0xFF3B82F6));
    }

    final ratingColor = r.valueRating >= 7
        ? AppTheme.green500
        : r.valueRating >= 5
        ? AppTheme.amber500
        : AppTheme.rose500;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (r.valueRating > 0) ...[
          Center(
            child: Column(
              children: [
                TweenAnimationBuilder<double>(
                  tween: Tween(begin: 0, end: r.valueRating),
                  duration: const Duration(milliseconds: 1000),
                  curve: Curves.easeOutCubic,
                  builder: (_, v, _) {
                    final roundedValue = v == v.roundToDouble()
                        ? v.toStringAsFixed(0)
                        : v.toStringAsFixed(1);
                    return Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 8,
                      ),
                      decoration: BoxDecoration(
                        color: ratingColor.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(999),
                        border: Border.all(
                          color: ratingColor.withValues(alpha: 0.24),
                        ),
                      ),
                      child: Text(
                        '$roundedValue / 10',
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          color: ratingColor,
                        ),
                      ),
                    );
                  },
                ),
                if (r.ratingExplanation.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(
                    r.ratingExplanation,
                    textAlign: TextAlign.center,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 11,
                      color: context.textSecondary,
                      fontStyle: FontStyle.italic,
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 14),
        ],

        if (r.whoShouldBuy.isNotEmpty)
          _buildAdvisorBox(
            icon: Icons.person_add_rounded,
            title: _txt(tr: 'Kimler Almali', en: 'Who Should Buy'),
            text: r.whoShouldBuy,
            color: AppTheme.green500,
          ),
        if (r.whoShouldBuy.isNotEmpty && r.whoShouldAvoid.isNotEmpty)
          const SizedBox(height: 10),
        if (r.whoShouldAvoid.isNotEmpty)
          _buildAdvisorBox(
            icon: Icons.person_off_rounded,
            title: _txt(tr: 'Kimler Almamali', en: 'Who Should Avoid'),
            text: r.whoShouldAvoid,
            color: AppTheme.rose500,
          ),

        if (r.reasonsToBuy.isNotEmpty) ...[
          const SizedBox(height: 12),
          _buildSectionLabel(
            Icons.thumb_up_rounded,
            _txt(tr: 'Alma Nedenleri', en: 'Reasons to Buy'),
            AppTheme.green500,
          ),
          const SizedBox(height: 6),
          ...r.reasonsToBuy.map(
            (reason) => _buildReasonItem(
              reason,
              AppTheme.green500,
              Icons.add_circle_rounded,
            ),
          ),
        ],

        if (r.reasonsToSkip.isNotEmpty) ...[
          const SizedBox(height: 12),
          _buildSectionLabel(
            Icons.thumb_down_rounded,
            _txt(tr: 'Almama Nedenleri', en: 'Reasons to Skip'),
            AppTheme.rose500,
          ),
          const SizedBox(height: 6),
          ...r.reasonsToSkip.map(
            (reason) => _buildReasonItem(
              reason,
              AppTheme.rose500,
              Icons.remove_circle_rounded,
            ),
          ),
        ],

        if (r.proTips.isNotEmpty) ...[
          const SizedBox(height: 12),
          _buildSectionLabel(
            Icons.lightbulb_rounded,
            _txt(tr: 'Profesyonel Ipuclari', en: 'Pro Tips'),
            AppTheme.amber500,
          ),
          const SizedBox(height: 6),
          ...r.proTips.map(
            (tip) => _buildReasonItem(
              tip,
              AppTheme.amber500,
              Icons.auto_awesome_rounded,
            ),
          ),
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
          Row(
            children: [
              Icon(icon, size: 16, color: color),
              const SizedBox(width: 6),
              Text(
                title,
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: color,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            text,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 12,
              color: context.textPrimary,
              height: 1.4,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildReasonItem(String text, Color color, IconData icon) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 14, color: color),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              text,
              style: GoogleFonts.plusJakartaSans(
                fontSize: 12,
                color: context.textPrimary,
                height: 1.3,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPredictionVisual(PredictionResult r) {
    if (r.rawFallback != null) {
      return _buildRichContent(r.rawFallback!, const Color(0xFF10B981));
    }

    final trendLower = r.trend.toLowerCase();
    final trendColor = trendLower == 'down'
        ? AppTheme.green500
        : trendLower == 'up'
        ? AppTheme.rose500
        : AppTheme.amber500;
    final trendIcon = trendLower == 'down'
        ? Icons.trending_down_rounded
        : trendLower == 'up'
        ? Icons.trending_up_rounded
        : Icons.trending_flat_rounded;
    final trendLabel = trendLower == 'down'
        ? _txt(tr: 'Fiyat Dusuyor', en: 'Price Falling')
        : trendLower == 'up'
        ? _txt(tr: 'Fiyat Yukseliyor', en: 'Price Rising')
        : _txt(tr: 'Fiyat Sabit', en: 'Price Stable');

    final isBuy = r.buyOrWait.toLowerCase().contains('buy');
    final decisionColor = isBuy ? AppTheme.green500 : AppTheme.amber500;
    final decisionIcon = isBuy
        ? Icons.shopping_cart_rounded
        : Icons.hourglass_top_rounded;
    final decisionLabel = isBuy
        ? _txt(tr: 'Simdi Al', en: 'Buy Now')
        : _txt(tr: 'Bekle', en: 'Wait');

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: trendColor.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: trendColor.withValues(alpha: 0.2)),
                ),
                child: Column(
                  children: [
                    Icon(trendIcon, size: 28, color: trendColor),
                    const SizedBox(height: 4),
                    Text(
                      trendLabel,
                      textAlign: TextAlign.center,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: trendColor,
                      ),
                    ),
                    if (r.trendPercentage > 0) ...[
                      const SizedBox(height: 2),
                      Text(
                        '${trendLower == 'down'
                            ? '-'
                            : trendLower == 'up'
                            ? '+'
                            : '~'}${r.trendPercentage}%',
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                          color: trendColor,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [
                      decisionColor.withValues(alpha: 0.12),
                      decisionColor.withValues(alpha: 0.06),
                    ],
                  ),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                    color: decisionColor.withValues(alpha: 0.3),
                  ),
                ),
                child: Column(
                  children: [
                    Icon(decisionIcon, size: 28, color: decisionColor),
                    const SizedBox(height: 4),
                    Text(
                      decisionLabel,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 14,
                        fontWeight: FontWeight.w800,
                        color: decisionColor,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),

        if (r.trendPercentage > 0) ...[
          const SizedBox(height: 16),
          Text(
            _txt(
              tr: 'Tahmini Fiyat Trendi (6 Ay)',
              en: 'Estimated Price Trend (6 Months)',
            ),
            style: GoogleFonts.plusJakartaSans(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: context.textSecondary,
            ),
          ),
          const SizedBox(height: 8),
          _buildPriceTrendChart(
            r.trendPercentage.toDouble(),
            trendLower,
            trendColor,
          ),
          const SizedBox(height: 4),
        ],

        if (r.expectedDrop.isNotEmpty) ...[
          const SizedBox(height: 10),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: trendColor.withValues(alpha: 0.05),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('💰', style: TextStyle(fontSize: 14)),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    r.expectedDrop,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 12,
                      color: context.textPrimary,
                      height: 1.4,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],

        if (r.bestTimeToBuy.isNotEmpty) ...[
          const SizedBox(height: 8),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(
                Icons.schedule_rounded,
                size: 14,
                color: const Color(0xFF06B6D4),
              ),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  r.bestTimeToBuy,
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 12,
                    color: context.textPrimary,
                    height: 1.3,
                  ),
                ),
              ),
            ],
          ),
        ],

        if (r.reasoning.isNotEmpty) ...[
          const SizedBox(height: 10),
          Text(
            r.reasoning,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 11.5,
              color: context.textSecondary,
              height: 1.4,
              fontStyle: FontStyle.italic,
            ),
          ),
        ],
      ],
    );
  }

  /// Ham JSON veya fallback metni hiçbir zaman kullanıcıya JSON formatında göstermez.
  /// JSON ise parse edip anlamlı kartlara dönüştürür, değilse temiz metin olarak render eder.
  /// fl_chart ile basit fiyat trend grafiği (6 aylık projeksiyon)
  Widget _buildPriceTrendChart(
    double trendPct,
    String direction,
    Color trendColor,
  ) {
    // 100 baz fiyat kabul edip trendi uygula
    final isDown = direction == 'down';
    final isUp = direction == 'up';
    final delta = trendPct.clamp(0, 50).toDouble();
    final spots = List.generate(7, (i) {
      double y;
      if (isDown) {
        y = 100 - (delta * i / 6);
      } else if (isUp) {
        y = 100 + (delta * i / 6);
      } else {
        // Stable with small noise
        y = 100 + (i % 2 == 0 ? 1.0 : -1.0) * (delta * 0.2);
      }
      return FlSpot(i.toDouble(), y);
    });

    final minY = (spots.map((s) => s.y).reduce((a, b) => a < b ? a : b) - 5)
        .clamp(0, 9999)
        .toDouble();
    final maxY = (spots.map((s) => s.y).reduce((a, b) => a > b ? a : b) + 5)
        .toDouble();

    return SizedBox(
      height: 110,
      child: LineChart(
        LineChartData(
          minY: minY,
          maxY: maxY,
          gridData: FlGridData(
            show: true,
            drawVerticalLine: false,
            horizontalInterval: delta > 10 ? delta / 2 : 5,
            getDrawingHorizontalLine: (_) => FlLine(
              color: trendColor.withValues(alpha: 0.08),
              strokeWidth: 1,
            ),
          ),
          borderData: FlBorderData(show: false),
          titlesData: FlTitlesData(
            leftTitles: const AxisTitles(
              sideTitles: SideTitles(showTitles: false),
            ),
            rightTitles: const AxisTitles(
              sideTitles: SideTitles(showTitles: false),
            ),
            topTitles: const AxisTitles(
              sideTitles: SideTitles(showTitles: false),
            ),
            bottomTitles: AxisTitles(
              sideTitles: SideTitles(
                showTitles: true,
                interval: 1,
                getTitlesWidget: (val, _) {
                  final months = _isTurkish
                      ? const ['Su an', '1A', '2A', '3A', '4A', '5A', '6A']
                      : const ['Now', '1M', '2M', '3M', '4M', '5M', '6M'];
                  final idx = val.toInt();
                  if (idx < 0 || idx >= months.length) {
                    return const SizedBox.shrink();
                  }
                  return Text(
                    months[idx],
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 9,
                      color: context.textSecondary,
                    ),
                  );
                },
              ),
            ),
          ),
          lineBarsData: [
            LineChartBarData(
              spots: spots,
              isCurved: true,
              curveSmoothness: 0.3,
              color: trendColor,
              barWidth: 2.5,
              isStrokeCapRound: true,
              dotData: FlDotData(
                show: true,
                getDotPainter: (spot, pct, bar, idx) {
                  if (idx != 0 && idx != spots.length - 1) {
                    return FlDotCirclePainter(
                      radius: 0,
                      color: Colors.transparent,
                      strokeColor: Colors.transparent,
                      strokeWidth: 0,
                    );
                  }
                  return FlDotCirclePainter(
                    radius: 4,
                    color: trendColor,
                    strokeColor: context.surfaceVariantColor,
                    strokeWidth: 2,
                  );
                },
              ),
              belowBarData: BarAreaData(
                show: true,
                gradient: LinearGradient(
                  colors: [
                    trendColor.withValues(alpha: 0.2),
                    trendColor.withValues(alpha: 0.01),
                  ],
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildRichContent(String content, Color accentColor) {
    final trimmed = content.trim();

    // JSON mi? Parse edip visual cards göster.
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        final decoded = jsonDecode(trimmed);
        return _buildJsonVisualCards(decoded, accentColor);
      } catch (_) {
        // Parse edilemedi, temiz metin olarak devam et.
      }
    }

    // JSON-benzeri karakterleri temizle (kurşun geçirmez fallback)
    final cleaned = _stripJsonSyntax(trimmed);
    if (cleaned.isEmpty) return const SizedBox.shrink();

    return _buildCleanTextContent(cleaned, accentColor);
  }

  /// JSON objesini/dizisini anlamlı kartlara dönüştürür; hiçbir JSON anahtarı kullanıcıya gösterilmez.
  Widget _buildJsonVisualCards(dynamic data, Color accentColor) {
    if (data is Map<String, dynamic>) {
      // Bilinen alanları çıkar
      final List<String> pros = _extractStringList(data, [
        'pros',
        'strengths',
        'artılar',
        'güçlüYönler',
      ]);
      final List<String> cons = _extractStringList(data, [
        'cons',
        'weaknesses',
        'eksiler',
        'zayıfYönler',
      ]);
      final String verdict = _extractString(data, [
        'verdict',
        'karar',
        'summary',
        'özet',
        'conclusion',
      ]);
      final String text = _extractString(data, [
        'text',
        'description',
        'analysis',
        'content',
        'message',
        'result',
      ]);

      final widgets = <Widget>[];

      if (pros.isNotEmpty) {
        widgets.add(
          _buildSimpleListCard(
            Icons.check_circle_rounded,
            'Artılar',
            pros,
            AppTheme.green500,
          ),
        );
        widgets.add(const SizedBox(height: 8));
      }
      if (cons.isNotEmpty) {
        widgets.add(
          _buildSimpleListCard(
            Icons.cancel_rounded,
            'Eksiler',
            cons,
            AppTheme.rose500,
          ),
        );
        widgets.add(const SizedBox(height: 8));
      }
      if (verdict.isNotEmpty) {
        widgets.add(_buildVerdictBox(verdict, accentColor));
        widgets.add(const SizedBox(height: 8));
      }
      if (text.isNotEmpty && widgets.isEmpty) {
        widgets.add(_buildCleanTextContent(text, accentColor));
      }

      if (widgets.isEmpty) {
        // Tüm değerleri metin olarak düzleştir
        final allText = data.values
            .whereType<String>()
            .where((s) => s.isNotEmpty)
            .join('\n\n');
        if (allText.isNotEmpty) {
          return _buildCleanTextContent(allText, accentColor);
        }
        return const SizedBox.shrink();
      }

      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: widgets,
      );
    }

    if (data is List) {
      final items = data
          .map((e) {
            if (e is String) return e;
            if (e is Map<String, dynamic>) {
              return _extractString(e, [
                    'name',
                    'title',
                    'text',
                    'description',
                    'item',
                  ]).isNotEmpty
                  ? _extractString(e, [
                      'name',
                      'title',
                      'text',
                      'description',
                      'item',
                    ])
                  : e.values.whereType<String>().firstOrNull ?? '';
            }
            return e.toString();
          })
          .where((s) => s.isNotEmpty)
          .toList();

      return _buildSimpleListCard(
        Icons.info_outline_rounded,
        'Analiz',
        items,
        accentColor,
      );
    }

    return const SizedBox.shrink();
  }

  Widget _buildSimpleListCard(
    IconData icon,
    String title,
    List<String> items,
    Color color,
  ) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: color.withValues(alpha: 0.15)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 14, color: color),
              const SizedBox(width: 6),
              Text(
                title,
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: color,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          ...items.map(
            (item) => Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.arrow_right_rounded, size: 16, color: color),
                  const SizedBox(width: 4),
                  Expanded(
                    child: Text(
                      item,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 12,
                        color: context.textPrimary,
                        height: 1.3,
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

  Widget _buildVerdictBox(String text, Color color) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: color.withValues(alpha: 0.2)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('💡', style: TextStyle(fontSize: 16)),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              style: GoogleFonts.plusJakartaSans(
                fontSize: 12.5,
                fontWeight: FontWeight.w500,
                color: context.textPrimary,
                height: 1.5,
                fontStyle: FontStyle.italic,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCleanTextContent(String text, Color accentColor) {
    final paragraphs = text
        .split('\n')
        .where((l) => l.trim().isNotEmpty)
        .toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: paragraphs
          .map(
            (p) => Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Text(
                p.trim(),
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 13,
                  height: 1.6,
                  color: context.textPrimary,
                ),
              ),
            ),
          )
          .toList(),
    );
  }

  /// JSON syntax karakterlerini metinden temizler
  static String _stripJsonSyntax(String input) {
    if (!input.startsWith('{') && !input.startsWith('[')) return input;
    // Tüm JSON-like yapıyı düzleştir
    var s = input
        .replaceAll(RegExp(r'[{}\[\]]'), '')
        .replaceAll(RegExp(r'"(\w+)"\s*:\s*'), '')
        .replaceAll(RegExp(r',\s*\n'), '\n')
        .replaceAll('"', '')
        .replaceAll('  ', ' ')
        .trim();
    return s;
  }

  static List<String> _extractStringList(
    Map<String, dynamic> map,
    List<String> keys,
  ) {
    for (final key in keys) {
      final val = map[key];
      if (val is List) return val.whereType<String>().toList();
    }
    // Case-insensitive search
    for (final key in keys) {
      final entry = map.entries
          .where((e) => e.key.toLowerCase() == key.toLowerCase())
          .firstOrNull;
      if (entry != null && entry.value is List) {
        return (entry.value as List).whereType<String>().toList();
      }
    }
    return [];
  }

  static String _extractString(Map<String, dynamic> map, List<String> keys) {
    for (final key in keys) {
      final val = map[key];
      if (val is String && val.isNotEmpty) return val;
    }
    for (final key in keys) {
      final entry = map.entries
          .where((e) => e.key.toLowerCase() == key.toLowerCase())
          .firstOrNull;
      if (entry != null &&
          entry.value is String &&
          (entry.value as String).isNotEmpty) {
        return entry.value as String;
      }
    }
    return '';
  }

  Widget buildMatchScoreCard() {
    final matchAsync = ref.watch(
      geminiMatchScoreProvider(
        LocalizedProductKey(
          productId: widget.product.id,
          languageCode: Localizations.localeOf(context).languageCode,
        ),
      ),
    );
    final matchResult = matchAsync.valueOrNull;
    int? matchScore;
    String? matchReason;
    if (matchResult != null && matchResult.matchScore > 0) {
      matchScore = matchResult.matchScore;
      matchReason = matchResult.reason;
    }
    final displayScore = matchScore != null ? '$matchScore%' : '--';
    final matchColor = matchScore == null
        ? AppTheme.premiumPurple
        : matchScore >= 80
        ? AppTheme.green500
        : matchScore >= 60
        ? AppTheme.amber500
        : AppTheme.rose500;

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
          end: Alignment.bottomRight,
        ),
        border: Border.all(color: matchColor.withValues(alpha: 0.15)),
      ),
      child: Row(
        children: [
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: LinearGradient(
                colors: [matchColor, const Color(0xFFEC4899)],
              ),
            ),
            child: Center(
              child: Text(
                displayScore,
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 18,
                  fontWeight: FontWeight.w900,
                  color: context.surfaceVariantColor,
                ),
              ),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  context.l10n?.personalizedMatch ?? 'Kişisel Eşleşme',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: context.textPrimary,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  matchReason ??
                      (context.l10n?.basedOnBehavior ??
                          'Göz atma geçmişinize ve tercihlerinize göre'),
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 12,
                    color: context.textSecondary,
                    height: 1.4,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _toggleUnifiedAnalysis({bool autoStart = false}) async {
    if (_unifiedAiRunning) return;
    if (_unifiedAiExpanded) {
      if (autoStart) return;
      setState(() {
        _unifiedAiExpanded = false;
        _unifiedAiUserCollapsed = true;
      });
      return;
    }

    final lang = Localizations.localeOf(context).languageCode;
    final key = LocalizedProductKey(
      productId: widget.product.id,
      languageCode: lang,
    );
    final review = ref.read(aiReviewCacheProvider(key)).valueOrNull;
    final deep = ref.read(deepAnalysisCacheProvider(key)).valueOrNull;
    final advisor = ref.read(advisorCacheProvider(key)).valueOrNull;
    final alternatives = ref.read(alternativesCacheProvider(key)).valueOrNull;
    final prediction = ref.read(predictionCacheProvider(key)).valueOrNull;
    final needsReview = review == null || review.failed;
    final needsDeep = deep?.hasUsableContent != true;
    final needsAdvisor = advisor?.hasUsableContent != true;
    final needsAlternatives = alternatives?.hasUsableContent != true;
    final needsPrediction = prediction?.hasUsableContent != true;
    final hasMissing =
        needsReview ||
        needsDeep ||
        needsAdvisor ||
        needsAlternatives ||
        needsPrediction;

    if (hasMissing && !await _checkAiFeatureLimit()) return;
    if (!mounted) return;
    setState(() {
      _unifiedAiExpanded = true;
      _unifiedAiUserCollapsed = false;
      _unifiedAiRunning = hasMissing;
      _unifiedAiStep = '';
    });
    if (!hasMissing) return;

    final country = ref.read(selectedCountryProvider);
    final currency = ref.read(currencyProvider);
    final priceVal =
        widget.product.getPriceForCountry(country) ??
        (widget.product.prices.isNotEmpty
            ? widget.product.prices.values.first
            : 0.0);
    final price = priceVal > 0
        ? AppUtils.formatCurrency(priceVal, currency)
        : 'unknown price';

    try {
      if (mounted) {
        setState(
          () => _unifiedAiStep = _txt(
            tr: 'AI analizleri aynı anda başlatılıyor...',
            en: 'Starting AI analyses in parallel...',
          ),
        );
      }
      final tasks = <Future<void>>[
        if (needsReview)
          ref
              .read(aiReviewCacheProvider(key).notifier)
              .startAnalysis(widget.product.name, product: widget.product),
        if (needsDeep)
          ref
              .read(deepAnalysisCacheProvider(key).notifier)
              .startAnalysis(
                widget.product.name,
                category: widget.product.category,
                brand: widget.product.brand,
                year: ProductFilter.getExactReleaseYear(widget.product),
              ),
        if (needsAdvisor)
          ref
              .read(advisorCacheProvider(key).notifier)
              .startQuery(
                widget.product.name,
                widget.product.category,
                price,
                productContext: _predictionProductContext(widget.product),
              ),
        if (needsAlternatives)
          ref
              .read(alternativesCacheProvider(key).notifier)
              .startQuery(widget.product.name, widget.product.category),
        if (needsPrediction)
          ref
              .read(predictionCacheProvider(key).notifier)
              .startQuery(
                widget.product.name,
                widget.product.category,
                price,
                productContext: _predictionProductContext(widget.product),
              ),
      ];
      await Future.wait(tasks);
    } finally {
      if (mounted) {
        setState(() {
          _unifiedAiRunning = false;
          _unifiedAiStep = '';
        });
      }
    }
  }

  // ignore: unused_element
  Future<void> _toggleDeepAnalysis() async {
    if (_deepAnalysisExpanded) {
      setState(() {
        _deepAnalysisExpanded = false;
        _deepAnalysisUserCollapsed = true;
      });
      return;
    }
    final lang = Localizations.localeOf(context).languageCode;
    final key = LocalizedProductKey(
      productId: widget.product.id,
      languageCode: lang,
    );
    final hasData =
        ref.read(deepAnalysisCacheProvider(key)).valueOrNull != null;
    if (!hasData && !await _checkAiFeatureLimit()) return;
    if (!mounted) return;
    setState(() {
      _deepAnalysisExpanded = true;
      _deepAnalysisUserCollapsed = false;
    });
    ref
        .read(deepAnalysisCacheProvider(key).notifier)
        .startAnalysis(
          widget.product.name,
          category: widget.product.category,
          brand: widget.product.brand,
        );
  }

  // ignore: unused_element
  Future<void> _toggleAlternatives() async {
    if (_alternativesExpanded) {
      setState(() {
        _alternativesExpanded = false;
        _alternativesUserCollapsed = true;
      });
      return;
    }
    final lang = Localizations.localeOf(context).languageCode;
    final key = LocalizedProductKey(
      productId: widget.product.id,
      languageCode: lang,
    );
    final hasData =
        ref.read(alternativesCacheProvider(key)).valueOrNull != null;
    if (!hasData && !await _checkAiFeatureLimit()) return;
    if (!mounted) return;
    setState(() {
      _alternativesExpanded = true;
      _alternativesUserCollapsed = false;
    });
    ref
        .read(alternativesCacheProvider(key).notifier)
        .startQuery(widget.product.name, widget.product.category);
  }

  // ignore: unused_element
  Future<void> _toggleAdvisor() async {
    if (_advisorExpanded) {
      setState(() {
        _advisorExpanded = false;
        _advisorUserCollapsed = true;
      });
      return;
    }
    final lang = Localizations.localeOf(context).languageCode;
    final key = LocalizedProductKey(
      productId: widget.product.id,
      languageCode: lang,
    );
    final hasData = ref.read(advisorCacheProvider(key)).valueOrNull != null;
    if (!hasData && !await _checkAiFeatureLimit()) return;
    if (!mounted) return;
    setState(() {
      _advisorExpanded = true;
      _advisorUserCollapsed = false;
    });
    final country = ref.read(selectedCountryProvider);
    final currency = ref.read(currencyProvider);
    final priceVal =
        widget.product.getPriceForCountry(country) ??
        (widget.product.prices.isNotEmpty
            ? widget.product.prices.values.first
            : 0.0);
    final price = priceVal > 0
        ? AppUtils.formatCurrency(priceVal, currency)
        : 'unknown price';
    ref
        .read(advisorCacheProvider(key).notifier)
        .startQuery(widget.product.name, widget.product.category, price);
  }

  // ignore: unused_element
  Future<void> _togglePrediction() async {
    if (_predictionExpanded) {
      setState(() {
        _predictionExpanded = false;
        _predictionUserCollapsed = true;
      });
      return;
    }
    final lang = Localizations.localeOf(context).languageCode;
    final key = LocalizedProductKey(
      productId: widget.product.id,
      languageCode: lang,
    );
    final hasData = ref.read(predictionCacheProvider(key)).valueOrNull != null;
    if (!hasData && !await _checkAiFeatureLimit()) return;
    if (!mounted) return;
    setState(() {
      _predictionExpanded = true;
      _predictionUserCollapsed = false;
    });
    final country = ref.read(selectedCountryProvider);
    final currency = ref.read(currencyProvider);
    final priceVal =
        widget.product.getPriceForCountry(country) ??
        (widget.product.prices.isNotEmpty
            ? widget.product.prices.values.first
            : 0.0);
    final price = priceVal > 0
        ? AppUtils.formatCurrency(priceVal, currency)
        : 'unknown price';
    ref
        .read(predictionCacheProvider(key).notifier)
        .startQuery(
          widget.product.name,
          widget.product.category,
          price,
          productContext: _predictionProductContext(widget.product),
        );
  }

  /// Check detail AI feature limit — returns true if allowed
  Future<bool> _checkAiFeatureLimit() async {
    if (!requireAuth(context)) return false;
    if (!await ensureEmailVerified(context, ref)) return false;
    if (!mounted) return false;
    final sub = ref.read(subscriptionServiceProvider);
    if (!sub.isPremium || !sub.canUseDetailAi) {
      showLimitReachedDialog(context, featureName: 'detail-ai');
      return false;
    }
    sub.recordDetailAi();
    return true;
  }
}

// (Eski _jsonToReadableMarkdown kaldırıldı — artık _buildJsonVisualCards kullanılıyor)
