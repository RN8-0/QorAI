part of 'providers.dart';

// ════════════════════════════════════════════════════
// ─── COMPARISON STATE ─── (StateNotifierProvider - kompleks state)
// ════════════════════════════════════════════════════

/// Comparison state - Section 3.3
final comparisonStateProvider =
    StateNotifierProvider<ComparisonNotifier, ComparisonState>((ref) {
      return ComparisonNotifier(
        comparisonRepo: ref.read(comparisonRepositoryProvider),
        ref: ref,
      );
    });

/// Comparison state
class ComparisonState {
  final List<String> selectedProductIds;
  final ComparisonResult? result;
  final bool isLoading;
  final String? loadingMessage; // Detailed message to display to the user
  final String? error;

  const ComparisonState({
    this.selectedProductIds = const [],
    this.result,
    this.isLoading = false,
    this.loadingMessage,
    this.error,
  });

  ComparisonState copyWith({
    List<String>? selectedProductIds,
    ComparisonResult? result,
    bool? isLoading,
    String? loadingMessage,
    String? error,
  }) {
    return ComparisonState(
      selectedProductIds: selectedProductIds ?? this.selectedProductIds,
      result: result ?? this.result,
      isLoading: isLoading ?? this.isLoading,
      loadingMessage: loadingMessage ?? this.loadingMessage,
      error: error,
    );
  }
}

/// Comparison state manager
class ComparisonNotifier extends StateNotifier<ComparisonState> {
  final ComparisonRepositoryImpl _comparisonRepo;
  final Ref _ref;

  ComparisonNotifier({
    required ComparisonRepositoryImpl comparisonRepo,
    required Ref ref,
  }) : _comparisonRepo = comparisonRepo,
       _ref = ref,
       super(const ComparisonState());

  /// Select/remove product
  void toggleProduct(String productId) {
    final current = List<String>.from(state.selectedProductIds);
    if (current.contains(productId)) {
      current.remove(productId);
    } else if (current.length < 4) {
      current.add(productId);
    }
    state = state.copyWith(selectedProductIds: current);
  }

  /// Clear selection
  void clearSelection() {
    state = const ComparisonState();
  }

  /// Start comparison
  Future<void> startComparison(UserEntity user) async {
    if (state.selectedProductIds.length < 2) return;

    state = state.copyWith(
      isLoading: true,
      error: null,
      loadingMessage: 'Gathering product data...',
    );

    // AI Decision Engine Steps (Simulated progress)
    _updateLoadingMessage('AI is comparing features...');

    final result = await _comparisonRepo.compareProducts(
      productIds: state.selectedProductIds,
      user: user,
    );

    result.when(
      success: (data) {
        state = state.copyWith(
          result: data,
          isLoading: false,
          loadingMessage: null,
        );
        _ref.invalidate(userComparisonsProvider);
      },
      failure: (error) {
        state = state.copyWith(
          error: error.message,
          isLoading: false,
          loadingMessage: null,
        );
      },
    );
  }

  void _updateLoadingMessage(String message) {
    if (state.isLoading) {
      state = state.copyWith(loadingMessage: message);
    }
  }
}

// ════════════════════════════════════════════════════
// ─── LINK PASTE PROVIDER ─── Section 9
// ════════════════════════════════════════════════════

final linkAnalysisProvider =
    StateNotifierProvider<LinkAnalysisNotifier, LinkAnalysisState>((ref) {
      return LinkAnalysisNotifier(
        aiRepo: ref.read(aiRepositoryProvider),
        ref: ref,
      );
    });

class LinkAnalysisState {
  final List<LinkAnalysisResult> results;
  final bool isLoading;
  final String? error;

  const LinkAnalysisState({
    this.results = const [],
    this.isLoading = false,
    this.error,
  });

  LinkAnalysisState copyWith({
    List<LinkAnalysisResult>? results,
    bool? isLoading,
    String? error,
  }) {
    return LinkAnalysisState(
      results: results ?? this.results,
      isLoading: isLoading ?? this.isLoading,
      error: error,
    );
  }
}

class LinkAnalysisNotifier extends StateNotifier<LinkAnalysisState> {
  final AIRepository _aiRepo;
  final Ref _ref;

  LinkAnalysisNotifier({required AIRepository aiRepo, required Ref ref})
    : _aiRepo = aiRepo,
      _ref = ref,
      super(const LinkAnalysisState());

  String get _appLang => _ref.read(localeProvider)?.languageCode ?? 'en';

  /// Analyze link - Section 9.1
  Future<void> analyzeLink(String url, UserEntity user) async {
    // Free tier limit check
    final limitResult = _ref
        .read(subscriptionServiceProvider)
        .recordLinkPaste();
    if (limitResult.isFailure) {
      state = state.copyWith(
        error:
            'You have reached the weekly link analysis limit. Upgrade to Premium for unlimited usage!',
        isLoading: false,
      );
      return;
    }

    state = state.copyWith(isLoading: true, error: null);

    final localizedUser = user.copyWith(language: _appLang);
    final result = await _aiRepo.analyzeLink(url: url, user: localizedUser);

    result.when(
      success: (data) {
        final updatedResults = [...state.results, data];
        state = state.copyWith(results: updatedResults, isLoading: false);
      },
      failure: (error) {
        state = state.copyWith(error: error.message, isLoading: false);
      },
    );
  }

  void clearResults() {
    state = const LinkAnalysisState();
  }
}

// ════════════════════════════════════════════════════
// ─── LINK QUIZ FLOW ─── (AI Quiz for Link Analysis)
// ════════════════════════════════════════════════════

enum LinkFlowPhase { idle, analyzing, quizLoading, quiz, computing, result }

class LinkQuizState {
  final LinkFlowPhase phase;
  final LinkAnalysisResult? baseResult;
  final ProductQuiz? quiz;
  final List<QuizQuestion> answeredQuestions;
  final EnhancedAnalysisResult? enhancedResult;
  final String? error;
  final int currentQuestionIndex;
  final ProductEntity? databaseMatch;
  final List<ProductEntity> similarProducts;

  const LinkQuizState({
    this.phase = LinkFlowPhase.idle,
    this.baseResult,
    this.quiz,
    this.answeredQuestions = const [],
    this.enhancedResult,
    this.error,
    this.currentQuestionIndex = 0,
    this.databaseMatch,
    this.similarProducts = const [],
  });

  LinkQuizState copyWith({
    LinkFlowPhase? phase,
    LinkAnalysisResult? baseResult,
    ProductQuiz? quiz,
    List<QuizQuestion>? answeredQuestions,
    EnhancedAnalysisResult? enhancedResult,
    String? error,
    int? currentQuestionIndex,
    ProductEntity? databaseMatch,
    List<ProductEntity>? similarProducts,
  }) {
    return LinkQuizState(
      phase: phase ?? this.phase,
      baseResult: baseResult ?? this.baseResult,
      quiz: quiz ?? this.quiz,
      answeredQuestions: answeredQuestions ?? this.answeredQuestions,
      enhancedResult: enhancedResult ?? this.enhancedResult,
      error: error,
      currentQuestionIndex: currentQuestionIndex ?? this.currentQuestionIndex,
      databaseMatch: databaseMatch ?? this.databaseMatch,
      similarProducts: similarProducts ?? this.similarProducts,
    );
  }
}

class LinkQuizNotifier extends StateNotifier<LinkQuizState> {
  final AIRepository _aiRepo;
  final GeminiService _gemini;
  final BehaviorTrackingService _behaviorTracking;
  final PbDataSource _pbDs;
  final Ref _ref;

  LinkQuizNotifier({
    required AIRepository aiRepo,
    required GeminiService gemini,
    required BehaviorTrackingService behaviorTracking,
    required PbDataSource pbDs,
    required Ref ref,
  }) : _aiRepo = aiRepo,
       _gemini = gemini,
       _behaviorTracking = behaviorTracking,
       _pbDs = pbDs,
       _ref = ref,
       super(const LinkQuizState());

  String get _appLang => _ref.read(localeProvider)?.languageCode ?? 'en';

  /// Step 1: Analyze link + validate product + generate quiz.
  Future<void> analyzeAndStartQuiz(String url, UserEntity user) async {
    // Rate limit
    final limitResult = _ref
        .read(subscriptionServiceProvider)
        .recordLinkPaste();
    if (limitResult.isFailure) {
      state = state.copyWith(
        phase: LinkFlowPhase.idle,
        error: 'Weekly link analysis limit reached. Upgrade to Premium!',
      );
      return;
    }

    // Clear ALL previous state before starting fresh analysis
    state = const LinkQuizState(phase: LinkFlowPhase.analyzing);

    // Analyze link
    final localizedUser = user.copyWith(language: _appLang);
    debugPrint('[LinkQuiz] Starting link analysis for: $url');
    final result = await _aiRepo.analyzeLink(url: url, user: localizedUser);
    final LinkAnalysisResult? baseResult;
    switch (result) {
      case Success<LinkAnalysisResult>(data: final data):
        debugPrint(
          '[LinkQuiz] Analysis succeeded: score=${data.aiScore}, category=${data.category}',
        );
        baseResult = data;
      case Failure<LinkAnalysisResult>(error: final error):
        debugPrint('[LinkQuiz] Analysis failed: ${error.message}');
        state = state.copyWith(phase: LinkFlowPhase.idle, error: error.message);
        baseResult = null;
    }
    if (baseResult == null) return;

    if (baseResult.isProduct == false) {
      state = state.copyWith(
        phase: LinkFlowPhase.idle,
        error: _appLang == 'tr'
            ? 'ℹ️ Bu bağlantıdaki ürünü tanıyamadık. Lütfen bir ürün sayfasının bağlantısını yapıştırmayı deneyin.'
            : 'ℹ️ We couldn\'t identify the product from this link. Please try pasting a product page URL.',
      );
      return;
    }

    state = state.copyWith(
      phase: LinkFlowPhase.quizLoading,
      baseResult: baseResult,
    );

    // Generate quiz
    try {
      final quiz = await _gemini.generateQuiz(
        category: baseResult.category ?? 'general',
        productTitle: baseResult.metadata.title ?? 'Product',
        url: url,
        language: _appLang,
      );

      if (quiz.questions.isEmpty) {
        debugPrint('[LinkQuiz] Quiz had no questions, showing base result');
        state = state.copyWith(
          phase: LinkFlowPhase.result,
          enhancedResult: EnhancedAnalysisResult(
            baseResult: baseResult,
            enhancedScore: baseResult.aiScore,
            factors: const [],
            detailedVerdict: baseResult.aiAnalysis,
          ),
        );
        return;
      }

      debugPrint(
        '[LinkQuiz] Quiz generated: ${quiz.questions.length} questions',
      );
      state = state.copyWith(
        phase: LinkFlowPhase.quiz,
        quiz: quiz,
        answeredQuestions: quiz.questions,
        currentQuestionIndex: 0,
      );
    } catch (e) {
      debugPrint('[LinkQuiz] Quiz generation failed: $e — showing base result');
      // If quiz generation fails, show base result directly
      state = state.copyWith(
        phase: LinkFlowPhase.result,
        enhancedResult: EnhancedAnalysisResult(
          baseResult: baseResult,
          enhancedScore: baseResult.aiScore,
          factors: const [],
          detailedVerdict: baseResult.aiAnalysis,
        ),
      );
    }
  }

  /// Step 2: Answer a quiz question.
  void answerQuestion(int questionIndex, String answer) {
    final updated = List<QuizQuestion>.from(state.answeredQuestions);
    updated[questionIndex] = updated[questionIndex].copyWith(
      selectedOption: answer,
    );

    final nextIndex = questionIndex + 1;
    state = state.copyWith(
      answeredQuestions: updated,
      currentQuestionIndex: nextIndex < updated.length
          ? nextIndex
          : questionIndex,
    );
  }

  /// Step 3: Submit quiz answers and compute enhanced analysis.
  Future<void> submitQuiz(UserEntity user) async {
    if (state.baseResult == null) return;
    state = state.copyWith(phase: LinkFlowPhase.computing);
    debugPrint('[LinkQuiz] submitQuiz — computing enhanced analysis');

    try {
      final enhanced = await _gemini.enhancedAnalysis(
        baseResult: state.baseResult!,
        answeredQuestions: state.answeredQuestions,
        profile: user.copyWith(language: _appLang),
      );

      debugPrint(
        '[LinkQuiz] Enhanced analysis done: score=${enhanced.enhancedScore}',
      );

      // Save to Firestore
      _saveAnalysisToFirestore(user, enhanced);

      // Persist quiz answers for algorithm training
      if (state.baseResult != null) {
        _behaviorTracking.trackQuizAnswers(
          url: state.baseResult!.url,
          category: state.baseResult!.category,
          answeredQuestions: state.answeredQuestions
              .map(
                (q) => {
                  'question': q.text,
                  'selectedOption': q.selectedOption,
                  'options': q.options,
                },
              )
              .toList(),
          matchScore: enhanced.enhancedScore,
        );
      }

      state = state.copyWith(
        phase: LinkFlowPhase.result,
        enhancedResult: enhanced,
      );
    } catch (e) {
      debugPrint(
        '[LinkQuiz] submitQuiz failed: $e — falling back to base result',
      );
      // Fallback to base result (guard against null)
      final base = state.baseResult;
      if (base != null) {
        state = state.copyWith(
          phase: LinkFlowPhase.result,
          enhancedResult: EnhancedAnalysisResult(
            baseResult: base,
            enhancedScore: base.aiScore,
            factors: const [],
            detailedVerdict: base.aiAnalysis,
          ),
        );
      } else {
        state = state.copyWith(
          phase: LinkFlowPhase.idle,
          error: 'Analysis failed. Please try again.',
        );
      }
    }
  }

  /// Skip the quiz and show base result.
  void skipQuiz() {
    if (state.baseResult == null) return;
    state = state.copyWith(
      phase: LinkFlowPhase.result,
      enhancedResult: EnhancedAnalysisResult(
        baseResult: state.baseResult!,
        enhancedScore: state.baseResult!.aiScore,
        factors: const [],
        detailedVerdict: state.baseResult!.aiAnalysis,
      ),
    );
  }

  /// Save analysis data to Firestore for user activity tracking
  void _saveAnalysisToFirestore(
    UserEntity user,
    EnhancedAnalysisResult enhanced,
  ) {
    final base = state.baseResult;
    if (base == null) return;

    // Save quiz history
    final quizData = state.answeredQuestions
        .where((q) => q.selectedOption != null)
        .map((q) => {'question': q.text, 'answer': q.selectedOption})
        .toList();
    if (quizData.isNotEmpty) {
      _pbDs.saveQuizHistory(user.uid, {
        'timestamp': DateTime.now().toIso8601String(),
        'productUrl': base.url,
        'productTitle': base.metadata.title,
        'category': base.category,
        'answers': quizData,
        'score': enhanced.enhancedScore,
      });
    }

    // Save analyzed product
    _pbDs.saveAnalyzedProduct(user.uid, {
      'timestamp': DateTime.now().toIso8601String(),
      'url': base.url,
      'title': base.metadata.title,
      'category': base.category,
      'score': enhanced.enhancedScore,
      'verdict': enhanced.detailedVerdict.substring(
        0,
        enhanced.detailedVerdict.length.clamp(0, 200),
      ),
      'factorCount': enhanced.factors.length,
    });
  }

  /// Search Compair product database for similar/matching products.
  void searchDatabase(List<ProductEntity> allProducts) {
    if (state.baseResult == null) return;
    final title = (state.baseResult!.metadata.title ?? '').toLowerCase();
    final category = (state.baseResult!.category ?? '').toLowerCase();
    if (title.isEmpty) return;

    final titleWords = title
        .replaceAll(RegExp(r'[^\w\s]'), '')
        .split(RegExp(r'\s+'))
        .where((w) => w.length > 2)
        .toList();

    ProductEntity? bestMatch;
    double bestScore = 0;
    final similar = <ProductEntity>[];

    for (final product in allProducts) {
      final pName = product.name.toLowerCase();
      int matchCount = 0;
      for (final word in titleWords) {
        if (pName.contains(word)) matchCount++;
      }
      final matchRatio = titleWords.isNotEmpty
          ? matchCount / titleWords.length
          : 0.0;

      if (matchRatio >= 0.6) {
        if (matchRatio > bestScore) {
          bestScore = matchRatio;
          bestMatch = product;
        }
      } else if (category.isNotEmpty &&
          product.category.toLowerCase() == category &&
          similar.length < 6) {
        similar.add(product);
      }
    }

    state = state.copyWith(databaseMatch: bestMatch, similarProducts: similar);
  }

  void reset() {
    state = const LinkQuizState();
  }

  /// Restore a previously saved analysis result from history.
  void restoreFromHistory(EnhancedAnalysisResult result) {
    state = LinkQuizState(
      phase: LinkFlowPhase.result,
      enhancedResult: result,
      baseResult: result.baseResult,
    );
  }
}

final linkQuizProvider = StateNotifierProvider<LinkQuizNotifier, LinkQuizState>(
  (ref) {
    return LinkQuizNotifier(
      aiRepo: ref.read(aiRepositoryProvider),
      gemini: ref.read(geminiServiceProvider),
      behaviorTracking: ref.read(behaviorTrackingProvider),
      pbDs: ref.read(pbDataSourceProvider),
      ref: ref,
    );
  },
);

// ════════════════════════════════════════════════════
// ─── COMPARE ANALYSIS FLOW ─── (Background-safe)
// ════════════════════════════════════════════════════

enum ComparePhase { idle, analyzingFirst, quiz, analyzing, done }

enum CompareErrorKind {
  none,
  invalidLinks,
  duplicateLinks,
  unrecognizedProducts,
  categoryMismatch,
  general,
}

/// Step type for the analyzing progress screen
enum AnalysisStepType { scanLink, aiAnalysis, profileMatch }

class AnalysisStep {
  final String label;
  final AnalysisStepType type;
  final bool isDone;
  final bool isActive;
  final bool hasError;
  const AnalysisStep(
    this.label,
    this.type, {
    this.isDone = false,
    this.isActive = false,
    this.hasError = false,
  });
  AnalysisStep withDone() => AnalysisStep(label, type, isDone: true);
  AnalysisStep withActive() => AnalysisStep(label, type, isActive: true);
  AnalysisStep withError() => AnalysisStep(label, type, hasError: true);
}

class CompareAnalysisState {
  final ComparePhase phase;
  final List<EnhancedAnalysisResult> results;
  final String? error;
  final int progress;
  final List<AnalysisStep> steps;
  final ProductQuiz? quiz;
  final List<QuizQuestion> quizAnswers;
  final int quizIndex;
  final LinkAnalysisResult? firstBaseResult;
  final List<LinkAnalysisResult> allBaseResults;
  final List<String> validUrls;
  final CompareErrorKind errorKind;
  final List<String> errorCategories;
  final String? redirectUrl;

  const CompareAnalysisState({
    this.phase = ComparePhase.idle,
    this.results = const [],
    this.error,
    this.progress = 0,
    this.steps = const [],
    this.quiz,
    this.quizAnswers = const [],
    this.quizIndex = 0,
    this.firstBaseResult,
    this.allBaseResults = const [],
    this.validUrls = const [],
    this.errorKind = CompareErrorKind.none,
    this.errorCategories = const [],
    this.redirectUrl,
  });

  bool get isWorking =>
      phase == ComparePhase.analyzingFirst || phase == ComparePhase.analyzing;

  CompareAnalysisState copyWith({
    ComparePhase? phase,
    List<EnhancedAnalysisResult>? results,
    String? error,
    int? progress,
    List<AnalysisStep>? steps,
    ProductQuiz? quiz,
    List<QuizQuestion>? quizAnswers,
    int? quizIndex,
    LinkAnalysisResult? firstBaseResult,
    List<LinkAnalysisResult>? allBaseResults,
    List<String>? validUrls,
    CompareErrorKind? errorKind,
    List<String>? errorCategories,
    String? redirectUrl,
  }) {
    return CompareAnalysisState(
      phase: phase ?? this.phase,
      results: results ?? this.results,
      error: error,
      progress: progress ?? this.progress,
      steps: steps ?? this.steps,
      quiz: quiz ?? this.quiz,
      quizAnswers: quizAnswers ?? this.quizAnswers,
      quizIndex: quizIndex ?? this.quizIndex,
      firstBaseResult: firstBaseResult ?? this.firstBaseResult,
      allBaseResults: allBaseResults ?? this.allBaseResults,
      validUrls: validUrls ?? this.validUrls,
      errorKind: errorKind ?? this.errorKind,
      errorCategories: errorCategories ?? this.errorCategories,
      redirectUrl: redirectUrl ?? this.redirectUrl,
    );
  }
}

class CompareAnalysisNotifier extends StateNotifier<CompareAnalysisState> {
  final AIRepository _aiRepo;
  final GeminiService _gemini;
  final BehaviorTrackingService _behaviorTracking;
  final PbDataSource _pbDs;

  CompareAnalysisNotifier({
    required AIRepository aiRepo,
    required GeminiService gemini,
    required BehaviorTrackingService behaviorTracking,
    required PbDataSource pbDs,
  }) : _aiRepo = aiRepo,
       _gemini = gemini,
       _behaviorTracking = behaviorTracking,
       _pbDs = pbDs,
       super(const CompareAnalysisState());

  static String normalizeCompareCategory(String? category) {
    final normalized = category?.trim().toLowerCase();
    if (normalized == null || normalized.isEmpty) {
      return '';
    }
    return normalized;
  }

  static String buildInvalidCompareLinksMessage(
    String lang, {
    required int invalidCount,
  }) {
    final hasMany = invalidCount > 1;
    return lang == 'tr'
        ? '⚠️ ${hasMany ? '$invalidCount bağlantı geçersiz.' : 'Bir bağlantı geçersiz.'} Karşılaştırma için tüm alanlara geçerli ürün sayfası linki girin.'
        : '⚠️ ${hasMany ? '$invalidCount links are invalid.' : 'One link is invalid.'} Enter valid product page URLs in all filled fields before comparing.';
  }

  static String buildDuplicateCompareLinksMessage(String lang) {
    return lang == 'tr'
        ? '⚠️ Aynı bağlantıyı iki kez girdiniz. Bu ürünü tekli analiz ekranında inceleyin.'
        : '⚠️ You entered the same link twice. Review this product in the single analysis screen.';
  }

  static String buildUnrecognizedCompareProductsMessage(
    String lang, {
    required int invalidCount,
  }) {
    final hasMany = invalidCount > 1;
    return lang == 'tr'
        ? '⚠️ ${hasMany ? '$invalidCount bağlantı ürün olarak tanınamadı.' : 'Bir bağlantı ürün olarak tanınamadı.'} Lütfen yalnızca ürün sayfası linkleriyle tekrar deneyin.'
        : '⚠️ ${hasMany ? '$invalidCount links could not be identified as products.' : 'One link could not be identified as a product.'} Please retry using only product page URLs.';
  }

  static String buildCategoryMismatchMessage(String lang) {
    return lang == 'tr'
        ? '⚠️ Bu ürünler aynı kategoride değil. Sadece aynı kategorideki ürünleri karşılaştırabilirsiniz.'
        : '⚠️ These products are not in the same category. You can only compare products from the same category.';
  }

  /// Phase 1: Scan ALL URLs → validate → generate quiz
  Future<void> startAnalysis(
    List<String> urls,
    UserEntity user,
    String lang,
  ) async {
    state = CompareAnalysisState(
      phase: ComparePhase.analyzingFirst,
      validUrls: urls,
      steps: [
        for (int i = 0; i < urls.length; i++)
          AnalysisStep(
            '${lang == 'tr' ? 'Tara' : 'Scan'} • ${lang == 'tr' ? 'Ürün' : 'Product'} ${i + 1}',
            AnalysisStepType.scanLink,
          ),
        AnalysisStep(
          lang == 'tr' ? 'Quiz Hazırlanıyor' : 'Preparing Quiz',
          AnalysisStepType.aiAnalysis,
        ),
      ],
    );

    final localizedUser = user.copyWith(language: lang);
    final baseResults = <LinkAnalysisResult>[];
    var invalidProductCount = 0;

    try {
      // Scan ALL URLs in parallel for speed
      final futures = <Future<Result<LinkAnalysisResult>>>[];
      for (int i = 0; i < urls.length; i++) {
        _updateStep(i, (s) => s.withActive());
        _behaviorTracking.trackLinkPaste(urls[i], null);
        debugPrint(
          '[Compare] Scanning URL ${i + 1}/${urls.length}: ${urls[i]}',
        );
        futures.add(_aiRepo.analyzeLink(url: urls[i], user: localizedUser));
      }

      final results = await Future.wait(futures);
      for (int i = 0; i < results.length; i++) {
        switch (results[i]) {
          case Success<LinkAnalysisResult>(data: final d):
            if (d.isProduct) {
              baseResults.add(d);
              _updateStep(i, (s) => s.withDone());
            } else {
              debugPrint('[Compare] URL ${urls[i]} is not a product, skipping');
              invalidProductCount++;
              _updateStep(i, (s) => s.withError());
            }
          case Failure<LinkAnalysisResult>(error: final err):
            debugPrint('[Compare] URL ${urls[i]} failed: ${err.message}');
            invalidProductCount++;
            _updateStep(i, (s) => s.withError());
        }
      }

      if (invalidProductCount > 0) {
        state = state.copyWith(
          phase: ComparePhase.idle,
          error: buildUnrecognizedCompareProductsMessage(
            lang,
            invalidCount: invalidProductCount,
          ),
          errorKind: CompareErrorKind.unrecognizedProducts,
          errorCategories: const [],
          redirectUrl: null,
        );
        return;
      }

      // Need at least 2 valid products for comparison
      if (baseResults.length < 2) {
        state = state.copyWith(
          phase: ComparePhase.idle,
          error: lang == 'tr'
              ? 'ℹ️ Karşılaştırma için en az 2 geçerli ürün bağlantısı gereklidir. Lütfen ürün sayfası bağlantıları yapıştırın.'
              : 'ℹ️ At least 2 valid product links are needed for comparison. Please paste product page URLs.',
          errorKind: CompareErrorKind.general,
          errorCategories: const [],
          redirectUrl: null,
        );
        return;
      }

      final normalizedCategories = baseResults
          .map((result) => normalizeCompareCategory(result.category))
          .where((category) => category.isNotEmpty)
          .toSet();
      if (normalizedCategories.length > 1) {
        state = state.copyWith(
          phase: ComparePhase.idle,
          error: buildCategoryMismatchMessage(lang),
          errorKind: CompareErrorKind.categoryMismatch,
          errorCategories: normalizedCategories.toList()..sort(),
          redirectUrl: null,
        );
        return;
      }

      // Check categories match (use first product's category)
      final primaryCategory = baseResults.first.category ?? 'general';

      // Generate quiz based on all products
      final quizStepIdx = urls.length;
      _updateStep(quizStepIdx, (s) => s.withActive());

      debugPrint('[Compare] Generating quiz for category: $primaryCategory');
      final allProductInfo = baseResults
          .map(
            (r) => {
              'title': r.metadata.title ?? 'Product',
              'url': r.url,
              'category': r.category ?? primaryCategory,
            },
          )
          .toList();
      final quiz = await _gemini.generateQuiz(
        category: primaryCategory,
        productTitle: baseResults
            .map((r) => r.metadata.title ?? 'Product')
            .join(' vs '),
        url: urls.first,
        language: lang,
        allProducts: allProductInfo,
      );
      _updateStep(quizStepIdx, (s) => s.withDone());

      if (quiz.questions.isNotEmpty) {
        state = state.copyWith(
          phase: ComparePhase.quiz,
          quiz: quiz,
          quizAnswers: List.from(quiz.questions),
          quizIndex: 0,
          firstBaseResult: baseResults.first,
          allBaseResults: baseResults,
        );
      } else {
        debugPrint('[Compare] No quiz questions, proceeding to analysis');
        await _runAnalysis(localizedUser, const [], null, baseResults);
      }
    } catch (e) {
      debugPrint('[Compare] Phase 1 failed: $e');
      state = state.copyWith(
        phase: ComparePhase.idle,
        error: 'Failed to prepare comparison: $e',
        errorKind: CompareErrorKind.general,
        errorCategories: const [],
        redirectUrl: null,
      );
    }
  }

  void answerQuestion(int index, String answer) {
    final answers = List<QuizQuestion>.from(state.quizAnswers);
    answers[index] = answers[index].copyWith(selectedOption: answer);
    state = state.copyWith(
      quizAnswers: answers,
      quizIndex: index < answers.length - 1 ? index + 1 : state.quizIndex,
    );
  }

  Future<void> submitQuiz(UserEntity user, String lang) async {
    final localizedUser = user.copyWith(language: lang);
    state = state.copyWith(phase: ComparePhase.analyzing, progress: 0);
    await _runAnalysis(
      localizedUser,
      state.quizAnswers,
      state.firstBaseResult,
      state.allBaseResults,
    );
  }

  Future<void> skipQuiz(UserEntity user, String lang) async {
    final localizedUser = user.copyWith(language: lang);
    state = state.copyWith(phase: ComparePhase.analyzing, progress: 0);
    await _runAnalysis(
      localizedUser,
      const [],
      state.firstBaseResult,
      state.allBaseResults,
    );
  }

  /// Phase 2: Enhanced analysis on all pre-scanned products
  Future<void> _runAnalysis(
    UserEntity user,
    List<QuizQuestion> quizAnswers,
    LinkAnalysisResult? firstBaseResult,
    List<LinkAnalysisResult> preScannedResults,
  ) async {
    final baseResults = preScannedResults.isNotEmpty
        ? preScannedResults
        : <LinkAnalysisResult>[];

    // Initialize steps — only AI analysis + profile match (products already scanned)
    state = state.copyWith(
      phase: ComparePhase.analyzing,
      steps: [
        for (int i = 0; i < baseResults.length; i++)
          AnalysisStep(
            'AI Analiz • ${baseResults[i].metadata.title?.split(' ').take(3).join(' ') ?? 'Ürün ${i + 1}'}',
            AnalysisStepType.aiAnalysis,
          ),
        const AnalysisStep('Profil Eşleştirme', AnalysisStepType.profileMatch),
      ],
      progress: 0,
    );

    if (baseResults.isEmpty) {
      state = state.copyWith(
        phase: ComparePhase.idle,
        error: 'No products to analyze.',
        errorKind: CompareErrorKind.general,
        errorCategories: const [],
        redirectUrl: null,
      );
      return;
    }

    final results = <EnhancedAnalysisResult>[];

    // Enhanced analysis for all products in parallel
    for (int i = 0; i < baseResults.length; i++) {
      _updateStep(i, (s) => s.withActive());
    }

    final enhancedFutures = <Future<EnhancedAnalysisResult>>[];
    for (int i = 0; i < baseResults.length; i++) {
      enhancedFutures.add(
        _gemini
            .enhancedAnalysis(
              baseResult: baseResults[i],
              answeredQuestions: quizAnswers,
              profile: user,
            )
            .then((enhanced) {
              debugPrint(
                '[Compare] Score for "${baseResults[i].metadata.title}": enhanced=${enhanced.enhancedScore}',
              );
              _updateStep(i, (s) => s.withDone());
              return enhanced;
            })
            .catchError((e) {
              debugPrint('[Compare] Enhanced analysis fallback: $e');
              _updateStep(i, (s) => s.withDone());
              return EnhancedAnalysisResult(
                baseResult: baseResults[i],
                enhancedScore: baseResults[i].aiScore,
                factors: const [],
                detailedVerdict: baseResults[i].aiAnalysis,
              );
            }),
      );
    }

    results.addAll(await Future.wait(enhancedFutures));

    // Profile matching step (brief visual)
    final profileIdx = baseResults.length;
    _updateStep(profileIdx, (s) => s.withActive());
    await Future.delayed(const Duration(milliseconds: 500));
    _updateStep(profileIdx, (s) => s.withDone());

    debugPrint(
      '[Compare] Done: ${results.length}/${baseResults.length} succeeded',
    );

    // Save each analyzed product
    for (final r in results) {
      _pbDs.saveAnalyzedProduct(user.uid, {
        'timestamp': DateTime.now().toIso8601String(),
        'url': r.baseResult.url,
        'title': r.baseResult.metadata.title,
        'category': r.baseResult.category,
        'score': r.enhancedScore,
        'verdict': r.detailedVerdict.substring(
          0,
          r.detailedVerdict.length.clamp(0, 200),
        ),
        'mode': 'compare',
      });
    }

    // Save quiz history if answered
    final answeredQs = quizAnswers
        .where((q) => q.selectedOption != null)
        .map((q) => {'question': q.text, 'answer': q.selectedOption})
        .toList();
    if (answeredQs.isNotEmpty) {
      _pbDs.saveQuizHistory(user.uid, {
        'timestamp': DateTime.now().toIso8601String(),
        'productUrls': state.validUrls,
        'mode': 'compare',
        'answers': answeredQs,
        'scores': results.map((r) => r.enhancedScore).toList(),
      });
    }

    state = state.copyWith(
      phase: ComparePhase.done,
      results: results,
      error: results.length < 2
          ? (results.isEmpty
                ? 'Could not analyze any of the provided links.'
                : 'Only 1 link could be analyzed — need at least 2 for comparison')
          : null,
    );
  }

  void _updateStep(int index, AnalysisStep Function(AnalysisStep) updater) {
    if (index >= state.steps.length) return;
    final steps = List<AnalysisStep>.from(state.steps);
    steps[index] = updater(steps[index]);
    state = state.copyWith(
      steps: steps,
      progress: steps.where((s) => s.isDone || s.hasError).length,
    );
  }

  void reset() {
    state = const CompareAnalysisState();
  }

  void showValidationError(
    String error, {
    List<String> validUrls = const [],
    CompareErrorKind errorKind = CompareErrorKind.general,
    List<String> errorCategories = const [],
    String? redirectUrl,
  }) {
    state = CompareAnalysisState(
      error: error,
      validUrls: validUrls,
      errorKind: errorKind,
      errorCategories: errorCategories,
      redirectUrl: redirectUrl,
    );
  }

  void restoreFromHistory(List<EnhancedAnalysisResult> results) {
    state = CompareAnalysisState(
      phase: ComparePhase.done,
      results: results,
      validUrls: results.map((result) => result.baseResult.url).toList(),
    );
  }
}

final compareAnalysisProvider =
    StateNotifierProvider<CompareAnalysisNotifier, CompareAnalysisState>((ref) {
      return CompareAnalysisNotifier(
        aiRepo: ref.read(aiRepositoryProvider),
        gemini: ref.read(geminiServiceProvider),
        behaviorTracking: ref.read(behaviorTrackingProvider),
        pbDs: ref.read(pbDataSourceProvider),
      );
    });

// ─── Subscription Intelligence Provider ────────────────────────────────────

enum SubFlowPhase { idle, quizLoading, quiz, analyzing, result }

class SubQuizState {
  final SubFlowPhase phase;
  final List<String> subscriptionNames;
  final ProductQuiz? quiz;
  final List<QuizQuestion> answeredQuestions;
  final int currentQuestionIndex;
  final String? analysisResult;
  final Map<String, double> scores;
  final Map<String, dynamic>? structured;
  final String? error;

  const SubQuizState({
    this.phase = SubFlowPhase.idle,
    this.subscriptionNames = const [],
    this.quiz,
    this.answeredQuestions = const [],
    this.currentQuestionIndex = 0,
    this.analysisResult,
    this.scores = const {},
    this.structured,
    this.error,
  });

  SubQuizState copyWith({
    SubFlowPhase? phase,
    List<String>? subscriptionNames,
    ProductQuiz? quiz,
    List<QuizQuestion>? answeredQuestions,
    int? currentQuestionIndex,
    String? analysisResult,
    Map<String, double>? scores,
    Map<String, dynamic>? structured,
    String? error,
  }) => SubQuizState(
    phase: phase ?? this.phase,
    subscriptionNames: subscriptionNames ?? this.subscriptionNames,
    quiz: quiz ?? this.quiz,
    answeredQuestions: answeredQuestions ?? this.answeredQuestions,
    currentQuestionIndex: currentQuestionIndex ?? this.currentQuestionIndex,
    analysisResult: analysisResult ?? this.analysisResult,
    scores: scores ?? this.scores,
    structured: structured ?? this.structured,
    error: error,
  );
}

class SubQuizNotifier extends StateNotifier<SubQuizState> {
  final DeepSeekService _deepseek;
  final GeminiService _gemini;
  final SubscriptionService _subService;
  final Ref _ref;

  SubQuizNotifier({
    required DeepSeekService deepseek,
    required GeminiService gemini,
    required SubscriptionService subService,
    required Ref ref,
  }) : _deepseek = deepseek,
       _gemini = gemini,
       _subService = subService,
       _ref = ref,
       super(const SubQuizState());

  String get _appLang => _ref.read(localeProvider)?.languageCode ?? 'en';

  void reset() => state = const SubQuizState();

  /// Clear only the error message without resetting phase/inputs.
  void clearError() {
    if (state.error != null) {
      state = state.copyWith(error: null);
    }
  }

  /// Restore a previously saved subscription analysis from history.
  void restoreFromHistory({
    required List<String> services,
    required String analysisResult,
    required Map<String, double> scores,
    Map<String, dynamic>? structured,
  }) {
    state = SubQuizState(
      phase: SubFlowPhase.result,
      subscriptionNames: services,
      analysisResult: analysisResult,
      scores: scores,
      structured: structured,
    );
  }

  /// Step 1: Generate AI quiz based on subscription names.
  Future<void> startQuiz(List<String> names) async {
    if (!_subService.canAnalyzeSubscription) {
      state = state.copyWith(
        phase: SubFlowPhase.idle,
        error:
            'Daily subscription analysis limit reached (${AppConstants.freeSubscriptionAnalysisLimit}/day). Upgrade to Premium!',
      );
      return;
    }

    state = SubQuizState(
      phase: SubFlowPhase.quizLoading,
      subscriptionNames: names,
    );

    try {
      final quiz = await _deepseek
          .generateSubscriptionQuiz(
            subscriptionNames: names,
            language: _appLang,
          )
          .timeout(const Duration(seconds: 25));

      if (quiz.questions.isEmpty) throw Exception('No questions generated');

      state = state.copyWith(
        phase: SubFlowPhase.quiz,
        quiz: quiz,
        answeredQuestions: quiz.questions,
        currentQuestionIndex: 0,
      );
    } catch (_) {
      // Fallback: skip quiz, go straight to analysis
      final subQuota = _subService.recordSubscriptionAnalysis();
      if (subQuota.isFailure) {
        state = state.copyWith(
          phase: SubFlowPhase.idle,
          error:
              'Daily subscription analysis limit reached. Upgrade to Premium!',
        );
        return;
      }
      state = state.copyWith(phase: SubFlowPhase.analyzing);
      await _runAnalysis(names, []);
    }
  }

  /// Step 2: Answer a quiz question.
  void answerQuestion(int index, String answer) {
    final updated = List<QuizQuestion>.from(state.answeredQuestions);
    updated[index] = updated[index].copyWith(selectedOption: answer);
    final next = index + 1;
    state = state.copyWith(
      answeredQuestions: updated,
      currentQuestionIndex: next < updated.length ? next : index,
    );
  }

  /// Step 3: Submit quiz + run enhanced grounded analysis.
  Future<void> submitQuiz() async {
    final subQuota = _subService.recordSubscriptionAnalysis();
    if (subQuota.isFailure) {
      state = state.copyWith(
        phase: SubFlowPhase.idle,
        error: 'Daily subscription analysis limit reached. Upgrade to Premium!',
      );
      return;
    }

    // Save quiz answers to Firestore
    try {
      final authState = _ref.read(authStateProvider).valueOrNull;
      if (authState != null) {
        final qaPairs = state.answeredQuestions
            .where((q) => q.selectedOption != null)
            .map((q) => {'question': q.text, 'answer': q.selectedOption})
            .toList();
        _ref.read(pbDataSourceProvider).saveQuizHistory(authState, {
          'timestamp': DateTime.now().toIso8601String(),
          'type': 'subscription',
          'services': state.subscriptionNames,
          'answers': qaPairs,
        });
      }
    } catch (_) {}

    state = state.copyWith(phase: SubFlowPhase.analyzing);
    await _runAnalysis(state.subscriptionNames, state.answeredQuestions);
  }

  /// Skip quiz → analyze with no quiz context.
  Future<void> skipQuiz() async {
    final subQuota = _subService.recordSubscriptionAnalysis();
    if (subQuota.isFailure) {
      state = state.copyWith(
        phase: SubFlowPhase.idle,
        error: 'Daily subscription analysis limit reached. Upgrade to Premium!',
      );
      return;
    }
    state = state.copyWith(phase: SubFlowPhase.analyzing);
    await _runAnalysis(state.subscriptionNames, []);
  }

  Future<void> _runAnalysis(
    List<String> names,
    List<QuizQuestion> answered,
  ) async {
    try {
      final user = _ref.read(userProfileProvider).valueOrNull;
      // Create a minimal profile if user is not loaded yet
      final profile =
          user ??
          UserEntity(
            uid: 'anonymous',
            email: '',
            displayName: 'User',
            country: _ref.read(selectedCountryProvider),
            language: _appLang,
            currency: _ref.read(currencyProvider),
            priorities: const [],
            subscriptions: const [],
            createdAt: DateTime.now(),
            updatedAt: DateTime.now(),
          );

      final result = await _gemini
          .enhancedSubscriptionAnalysis(
            subscriptionNames: names,
            answeredQuestions: answered,
            profile: profile.copyWith(language: _appLang),
          )
          .timeout(const Duration(seconds: 120));

      state = state.copyWith(
        phase: SubFlowPhase.result,
        analysisResult: result['analysis'] as String? ?? '',
        scores: Map<String, double>.from(result['scores'] as Map? ?? {}),
        structured: result['structured'] as Map<String, dynamic>?,
      );

      // Save subscription comparison to Firestore history
      try {
        final authState = _ref.read(authStateProvider).valueOrNull;
        if (authState != null) {
          final winnerData =
              (result['structured'] as Map<String, dynamic>?)?['winner'];
          final entry = {
            'timestamp': DateTime.now().toIso8601String(),
            'services': names,
            'scores': Map<String, double>.from(result['scores'] as Map? ?? {}),
            'winner': winnerData is Map ? winnerData['overall'] : null,
            'analysisResult': result['analysis'] as String? ?? '',
            'structured': result['structured'] as Map<String, dynamic>?,
          };
          // Anında yerel listeye ekle (optimistic update)
          _ref
              .read(pendingSubscriptionHistoryProvider.notifier)
              .update(
                (list) => [
                  entry,
                  ...list.where((e) => e['timestamp'] != entry['timestamp']),
                ],
              );
          // Firebase'e kaydet
          _ref
              .read(pbDataSourceProvider)
              .saveSubscriptionHistory(authState, entry)
              .then((_) => _ref.invalidate(subscriptionHistoryProvider))
              .catchError((_) {});
        }
      } catch (_) {}
    } catch (e) {
      debugPrint('=== COMPAIR: Sub analysis error: $e ===');
      final rawMessage = e is AppException
          ? e.message
          : e.toString().replaceAll('Exception: ', '');
      final errMsg = rawMessage.toLowerCase().contains('timeout')
          ? 'Analysis timed out. Check your connection.'
          : 'Analysis failed: $rawMessage';
      state = state.copyWith(phase: SubFlowPhase.idle, error: errMsg);
    }
  }
}

final subQuizProvider = StateNotifierProvider<SubQuizNotifier, SubQuizState>((
  ref,
) {
  return SubQuizNotifier(
    deepseek: ref.read(deepSeekServiceProvider),
    gemini: ref.read(geminiServiceProvider),
    subService: ref.read(subscriptionServiceProvider),
    ref: ref,
  );
});

/// Subscription comparison history for logged-in user
final subscriptionHistoryProvider = FutureProvider<List<Map<String, dynamic>>>((
  ref,
) async {
  final authState = ref.watch(authStateProvider).valueOrNull;
  if (authState == null) return [];
  return ref.read(pbDataSourceProvider).getSubscriptionHistory(authState);
});

/// Link analysis history for logged-in user (Firebase)
final linkAnalysisHistoryProvider = FutureProvider<List<Map<String, dynamic>>>((
  ref,
) async {
  final authState = ref.watch(authStateProvider).valueOrNull;
  if (authState == null) return [];
  return ref.read(pbDataSourceProvider).getLinkAnalysisHistory(authState);
});

/// Optimistic (yerel, anlık) subscription geçmişi — analiz biter bitmez görünsün
final pendingSubscriptionHistoryProvider =
    StateProvider<List<Map<String, dynamic>>>((ref) => []);

/// Optimistic (yerel, anlık) link analizi geçmişi — analiz biter bitmez görünsün
final pendingLinkAnalysisHistoryProvider =
    StateProvider<List<Map<String, dynamic>>>((ref) => []);

// ════════════════════════════════════════════════════
// ─── PROVIDER ALIASES ─── (Screen compatibility)
// ════════════════════════════════════════════════════

/// Screens use userProfileProvider
final userProfileProvider = userProfileStreamProvider;

/// Screens use themeModeProvider
// (themeProvider removed)

/// Screens use comparisonNotifierProvider
final comparisonNotifierProvider = comparisonStateProvider;

/// Subscription services from PocketBase (public read)
final subscriptionsProvider = FutureProvider<List<SubscriptionServiceModel>>((
  ref,
) async {
  final result = await pb
      .collection('subscription_services')
      .getList(filter: 'isActive = true', perPage: 100)
      .timeout(const Duration(seconds: 15));
  return result.items
      .map((record) => SubscriptionServiceModel.fromPb(record))
      .toList();
});

/// Session-level compare screen state — survives tab switches and navigation
class CompareSessionData {
  final List<String> selectedProductIds;
  final List<ProductEntity>? comparedProducts;
  final String? lockedCategory;
  final String? lockedSubcategory;
  // AI Analysis results - persist across navigation
  final String? aiAnalysis;
  final Map<String, dynamic>? aiStructured;
  final String? deepAnalysisResult;
  final String? alternativesResult;
  final Map<String, dynamic>? alternativesStructured;
  final String? advisorResult;
  final Map<String, dynamic>? advisorStructured;
  final String? predictionResult;
  final Map<String, dynamic>? predictionStructured;
  final String? quickVerdictResult;

  const CompareSessionData({
    this.selectedProductIds = const [],
    this.comparedProducts,
    this.lockedCategory,
    this.lockedSubcategory,
    this.aiAnalysis,
    this.aiStructured,
    this.deepAnalysisResult,
    this.alternativesResult,
    this.alternativesStructured,
    this.advisorResult,
    this.advisorStructured,
    this.predictionResult,
    this.predictionStructured,
    this.quickVerdictResult,
  });

  CompareSessionData copyWith({
    List<String>? selectedProductIds,
    List<ProductEntity>? comparedProducts,
    String? lockedCategory,
    String? lockedSubcategory,
    String? aiAnalysis,
    Map<String, dynamic>? aiStructured,
    String? deepAnalysisResult,
    String? alternativesResult,
    Map<String, dynamic>? alternativesStructured,
    String? advisorResult,
    Map<String, dynamic>? advisorStructured,
    String? predictionResult,
    Map<String, dynamic>? predictionStructured,
    String? quickVerdictResult,
    bool clearProducts = false,
    bool clearAiAnalysis = false,
  }) {
    return CompareSessionData(
      selectedProductIds: selectedProductIds ?? this.selectedProductIds,
      comparedProducts: clearProducts
          ? null
          : (comparedProducts ?? this.comparedProducts),
      lockedCategory: lockedCategory ?? this.lockedCategory,
      lockedSubcategory: lockedSubcategory ?? this.lockedSubcategory,
      aiAnalysis: clearAiAnalysis ? null : (aiAnalysis ?? this.aiAnalysis),
      aiStructured: clearAiAnalysis
          ? null
          : (aiStructured ?? this.aiStructured),
      deepAnalysisResult: clearAiAnalysis
          ? null
          : (deepAnalysisResult ?? this.deepAnalysisResult),
      alternativesResult: clearAiAnalysis
          ? null
          : (alternativesResult ?? this.alternativesResult),
      alternativesStructured: clearAiAnalysis
          ? null
          : (alternativesStructured ?? this.alternativesStructured),
      advisorResult: clearAiAnalysis
          ? null
          : (advisorResult ?? this.advisorResult),
      advisorStructured: clearAiAnalysis
          ? null
          : (advisorStructured ?? this.advisorStructured),
      predictionResult: clearAiAnalysis
          ? null
          : (predictionResult ?? this.predictionResult),
      predictionStructured: clearAiAnalysis
          ? null
          : (predictionStructured ?? this.predictionStructured),
      quickVerdictResult: clearAiAnalysis
          ? null
          : (quickVerdictResult ?? this.quickVerdictResult),
    );
  }

  bool get hasAiResults => aiAnalysis != null || aiStructured != null;
}

final compareSessionProvider = StateProvider<CompareSessionData>((ref) {
  return const CompareSessionData();
});

// ════════════════════════════════════════════════════
// ─── PC BUILDER SESSION STATE ───
// ════════════════════════════════════════════════════

/// Persists PC Builder selections across tab switches.
/// Keys are PcComponent.name strings, values are ProductEntity.
final pcBuilderSessionProvider = StateProvider<Map<String, ProductEntity>>((
  ref,
) {
  return {};
});

/// Persists PC Builder AI analysis across tab switches.
final pcBuilderAiProvider = StateProvider<String?>((ref) => null);

/// Screens use linkAnalysisNotifierProvider
final linkAnalysisNotifierProvider = linkAnalysisProvider;

/// User comparison history
final userComparisonsProvider =
    FutureProvider.autoDispose<Result<List<ComparisonEntity>>>((ref) async {
      final userAsync = ref.watch(userProfileProvider);
      final user = userAsync.valueOrNull;
      final userId = user?.uid ?? pb.authStore.record?.id;
      if (userId == null || userId.isEmpty) {
        return const Success([]);
      }

      final repo = ref.read(comparisonRepositoryProvider);
      var result = await repo.getUserComparisons(userId);

      if ((user?.comparisonsCount ?? 0) > 0) {
        switch (result) {
          case Success<List<ComparisonEntity>>(data: final comparisons)
              when comparisons.isEmpty:
            await Future<void>.delayed(const Duration(milliseconds: 350));
            result = await repo.getUserComparisons(userId);
          default:
            break;
        }
      }

      return result;
    });

/// Admin-curated comparisons (Battles)
final predefinedComparisonsProvider = FutureProvider<List<ComparisonEntity>>((
  ref,
) async {
  final category = ref.watch(selectedCategoryProvider);
  final result = await ref
      .read(comparisonRepositoryProvider)
      .getPredefinedComparisons(category: category, limit: 10);
  return result.when(
    success: (comparisons) => comparisons,
    failure: (_) => <ComparisonEntity>[],
  );
});

/// Reviews for a product (realtime stream)
final productReviewsProvider = StreamProvider.family<List<ReviewModel>, String>(
  (ref, productId) {
    return ref.read(pbDataSourceProvider).watchProductReviews(productId);
  },
);

/// Current user's reviews
final myReviewsProvider = StreamProvider<List<ReviewModel>>((ref) {
  final authState = ref.watch(authStateProvider);
  return authState.when(
    data: (user) {
      if (user == null) return Stream.value(<ReviewModel>[]);
      return ref.read(pbDataSourceProvider).watchUserReviews(user);
    },
    loading: () => Stream.value(<ReviewModel>[]),
    error: (_, _) => Stream.value(<ReviewModel>[]),
  );
});

/// Toggle favorite - returns new isFavorite state (true = now favorited).
/// Throws if the underlying PB write fails so callers can surface an error.
Future<bool> toggleFavorite(WidgetRef ref, String productId) async {
  final user = ref.read(userProfileProvider).valueOrNull;
  if (user == null) {
    throw const ValidationException(
      message: 'You need to be signed in to save favorites.',
    );
  }

  // Collection limit: only check when adding (not removing).
  final isFav = user.favorites.contains(productId);
  if (!isFav) {
    final sub = ref.read(subscriptionServiceProvider);
    if (!sub.isPremium &&
        user.favorites.length >= AppConstants.freeCollectionLimit) {
      return false;
    }
  }

  final ds = ref.read(pbDataSourceProvider);
  final result = await ds.toggleFavorite(user.uid, productId);
  // Poke the stream so UI updates even if realtime events are delayed.
  ref.invalidate(userProfileProvider);
  return result;
}

/// Check if product is favorited
bool isFavorite(WidgetRef ref, String productId) {
  final user = ref.read(userProfileProvider).valueOrNull;
  if (user == null) return false;
  return user.favorites.contains(productId);
}
