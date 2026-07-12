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

  /// Product category of the first item in the pool; all picks must match.
  final String? poolCategory;
  final ComparisonResult? result;
  final bool isLoading;
  final String? loadingMessage; // Detailed message to display to the user
  final String? error;

  const ComparisonState({
    this.selectedProductIds = const [],
    this.poolCategory,
    this.result,
    this.isLoading = false,
    this.loadingMessage,
    this.error,
  });

  ComparisonState copyWith({
    List<String>? selectedProductIds,
    String? poolCategory,
    bool setPoolCategory = false,
    ComparisonResult? result,
    bool? isLoading,
    String? loadingMessage,
    String? error,
  }) {
    return ComparisonState(
      selectedProductIds: selectedProductIds ?? this.selectedProductIds,
      poolCategory: setPoolCategory ? poolCategory : this.poolCategory,
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

  /// Add/remove a product in the global compare pool (max 4, same [productCategory]).
  void toggleProduct(String productId, {String? productCategory}) {
    var current = List<String>.from(state.selectedProductIds);
    var pool = state.poolCategory;
    final normalizedCategory = _normalizeCompareCategory(productCategory);

    if (current.contains(productId)) {
      current.remove(productId);
      if (current.isEmpty) {
        pool = null;
      }
    } else {
      if (current.length >= 4) {
        return;
      }
      if (current.isNotEmpty &&
          normalizedCategory != null &&
          pool != null &&
          normalizedCategory != pool) {
        // Different category: new pool with only this product
        current = <String>[];
        pool = null;
      }
      current.add(productId);
      if (current.length == 1) {
        pool = normalizedCategory;
      }
    }
    state = state.copyWith(
      selectedProductIds: current,
      setPoolCategory: true,
      poolCategory: current.isEmpty ? null : pool,
    );
  }

  String? _normalizeCompareCategory(String? raw) {
    final value = raw?.trim();
    if (value == null || value.isEmpty) return null;
    final resolved = key_specs.resolveCategory(value);
    return resolved.isNotEmpty ? resolved : value.toLowerCase();
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
        error: buildDailyQLimitMessage(_appLang),
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
        error: buildDailyQLimitMessage(_appLang),
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
        profile: localizedUser,
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
      unawaited(
        _pbDs.saveQuizHistory(user.uid, {
          'timestamp': DateTime.now().toIso8601String(),
          'status': 'generated',
          'productUrl': baseResult.url,
          'productTitle': baseResult.metadata.title,
          'category': baseResult.category,
          'mode': 'single',
          'questionCount': quiz.questions.length,
          'questions': quiz.questions
              .map((q) => {'question': q.text, 'options': q.options})
              .toList(),
        }),
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
        'status': 'completed',
        'productUrl': base.url,
        'productTitle': base.metadata.title,
        'category': base.category,
        'mode': 'single',
        'questionCount': state.answeredQuestions.length,
        'questions': state.answeredQuestions
            .map((q) => {'question': q.text, 'options': q.options})
            .toList(),
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
      'mode': 'single',
      'score': enhanced.enhancedScore,
      'verdict': enhanced.detailedVerdict.substring(
        0,
        enhanced.detailedVerdict.length.clamp(0, 200),
      ),
      'factorCount': enhanced.factors.length,
    });
  }

  /// Search Qor AI product database for similar/matching products.
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
          similar.length < 12) {
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
        profile: localizedUser,
      );
      _updateStep(quizStepIdx, (s) => s.withDone());

      if (quiz.questions.isNotEmpty) {
        unawaited(
          _pbDs.saveQuizHistory(user.uid, {
            'timestamp': DateTime.now().toIso8601String(),
            'status': 'generated',
            'productUrls': urls,
            'mode': 'compare',
            'category': primaryCategory,
            'questionCount': quiz.questions.length,
            'questions': quiz.questions
                .map((q) => {'question': q.text, 'options': q.options})
                .toList(),
          }),
        );
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
        'status': 'completed',
        'productUrls': state.validUrls,
        'mode': 'compare',
        'questionCount': quizAnswers.length,
        'questions': quizAnswers
            .map((q) => {'question': q.text, 'options': q.options})
            .toList(),
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

class SubscriptionSelectionValidation {
  final List<String> normalizedNames;
  final String? categoryKey;
  final String? error;

  const SubscriptionSelectionValidation({
    this.normalizedNames = const [],
    this.categoryKey,
    this.error,
  });

  bool get isValid => error == null;
}

/// Result returned by [SubQuizNotifier.validateSingleSubscriptionChip].
class ChipAddResult {
  final String? displayName;
  final String? categoryKey;
  final String? error;

  const ChipAddResult({this.displayName, this.categoryKey, this.error});

  bool get isValid => error == null;
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

  void showValidationError(String message) {
    state = state.copyWith(phase: SubFlowPhase.idle, error: message);
  }

  /// Clear only the error message without resetting phase/inputs.
  void clearError() {
    if (state.error != null) {
      state = state.copyWith(error: null);
    }
  }

  static bool _isTurkishLanguage(String lang) =>
      lang.toLowerCase().startsWith('tr');

  static bool looksLikeSubscriptionUrl(String value) {
    final lower = value.trim().toLowerCase();
    return lower.contains('http://') ||
        lower.contains('https://') ||
        lower.contains('www.') ||
        RegExp(r'\.[a-z]{2,}(/|$)').hasMatch(lower);
  }

  static String buildMissingSubscriptionMessage(String lang) {
    return _isTurkishLanguage(lang)
        ? 'Lütfen en az bir abonelik adı girin.'
        : 'Please enter at least one subscription name.';
  }

  static String buildInvalidSubscriptionInputMessage(
    String lang, {
    bool isUrl = false,
  }) {
    if (_isTurkishLanguage(lang)) {
      return isUrl
          ? 'Buraya yalnızca abonelik adı girebilirsin — link kabul edilmez.'
          : 'Bu metin bir abonelik servisine benzemiyor. Lütfen Netflix, Spotify gibi bir servis adı yaz.';
    }
    return isUrl
        ? 'Only subscription names are accepted here — links are not allowed.'
        : 'This doesn\'t look like a subscription service. Please enter a name like Netflix or Spotify.';
  }

  static String buildMixedSubscriptionCategoriesMessage(
    String lang, {
    required List<String> names,
  }) {
    if (_isTurkishLanguage(lang)) {
      return 'Bu abonelikler farklı kategorilerde yer alıyor — yalnızca aynı tür servisler karşılaştırılabilir. (${names.join(', ')})';
    }
    return 'These subscriptions belong to different categories — only services of the same type can be compared. (${names.join(', ')})';
  }

  static SubscriptionSelectionValidation validateSubscriptionSelection(
    List<String> rawNames,
    String lang,
  ) {
    final cleanedNames = <String>[];

    for (final rawName in rawNames) {
      final trimmed = rawName.trim();
      if (trimmed.isEmpty) continue;

      if (looksLikeSubscriptionUrl(trimmed)) {
        return SubscriptionSelectionValidation(
          error: buildInvalidSubscriptionInputMessage(lang, isUrl: true),
        );
      }
      cleanedNames.add(trimmed);
    }

    if (cleanedNames.isEmpty) {
      return SubscriptionSelectionValidation(
        error: buildMissingSubscriptionMessage(lang),
      );
    }

    return SubscriptionSelectionValidation(
      normalizedNames: List.unmodifiable(cleanedNames),
    );
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

  /// Validates a single subscription name typed by the user before adding it
  /// as a chip. Handles URL detection, duplicates, local catalog lookup, AI
  /// resolution for unknown services, and same-category enforcement.
  Future<ChipAddResult> validateSingleSubscriptionChip({
    required String rawName,
    required List<String> existingDisplayNames,
    required Map<String, String> chipCategoryMap,
  }) async {
    final lang = _appLang;
    final trimmed = rawName.trim();

    if (trimmed.isEmpty) {
      return ChipAddResult(error: buildMissingSubscriptionMessage(lang));
    }

    if (looksLikeSubscriptionUrl(trimmed)) {
      return ChipAddResult(
        error: buildInvalidSubscriptionInputMessage(lang, isUrl: true),
      );
    }

    // Raw-input duplicate check (fast path before any normalization)
    if (existingDisplayNames.any(
      (n) => n.trim().toLowerCase() == trimmed.toLowerCase(),
    )) {
      return ChipAddResult(
        error: _isTurkishLanguage(lang)
            ? '"$trimmed" zaten eklendi.'
            : '"$trimmed" is already added.',
      );
    }

    // Local catalog lookup (synchronous — no AI call needed)
    String? displayName = GeminiService.normalizeSubscriptionDisplayName(
      trimmed,
    );
    String? categoryKey = GeminiService.subscriptionCategoryKey(trimmed);

    // Unknown service — ask AI
    if (displayName == null || categoryKey == null) {
      try {
        final result = await _gemini.resolveSubscriptionSelection(
          rawNames: [trimmed],
          language: lang,
        );
        if (result.invalidNames.isNotEmpty || result.normalizedNames.isEmpty) {
          return ChipAddResult(
            error: buildInvalidSubscriptionInputMessage(lang),
          );
        }
        displayName = result.normalizedNames.first;
        categoryKey = result.sharedCategoryKey;
      } catch (e) {
        debugPrint('=== QOR AI: chip validation failed: $e ===');
        return ChipAddResult(
          error: _isTurkishLanguage(lang)
              ? 'Abonelik doğrulanırken hata oluştu. Lütfen tekrar deneyin.'
              : 'Could not validate subscription. Please try again.',
        );
      }
    }

    // After normalization: reject if category still unknown
    if (categoryKey == null || categoryKey.isEmpty) {
      return ChipAddResult(error: buildInvalidSubscriptionInputMessage(lang));
    }

    // Post-normalization duplicate check (e.g. "HBO Max" normalizes to "HBO")
    if (existingDisplayNames.any(
      (n) => n.trim().toLowerCase() == displayName!.toLowerCase(),
    )) {
      return ChipAddResult(
        error: _isTurkishLanguage(lang)
            ? '"$displayName" zaten eklendi.'
            : '"$displayName" is already added.',
      );
    }

    // Same-category enforcement
    if (chipCategoryMap.isNotEmpty) {
      final existingCategories = chipCategoryMap.values
          .where((k) => k.isNotEmpty)
          .toSet();
      if (existingCategories.isNotEmpty &&
          !existingCategories.contains(categoryKey)) {
        return ChipAddResult(
          error: buildMixedSubscriptionCategoriesMessage(
            lang,
            names: [...existingDisplayNames, displayName],
          ),
        );
      }
    }

    return ChipAddResult(displayName: displayName, categoryKey: categoryKey);
  }

  /// Step 1: Generate AI quiz based on subscription names.
  /// When [skipResolution] is true the names are treated as already validated
  /// (pre-checked at chip-add time) — the AI resolution step is skipped to
  /// avoid a redundant network call and potential contradictory results.
  Future<void> startQuiz(
    List<String> names, {
    bool skipResolution = false,
  }) async {
    final validation = validateSubscriptionSelection(names, _appLang);
    if (!validation.isValid) {
      showValidationError(validation.error!);
      return;
    }
    final pendingNames = validation.normalizedNames;

    if (!_subService.canAnalyzeSubscription) {
      state = state.copyWith(
        phase: SubFlowPhase.idle,
        error: buildDailyQLimitMessage(_appLang),
      );
      return;
    }

    state = SubQuizState(
      phase: SubFlowPhase.quizLoading,
      subscriptionNames: pendingNames,
    );

    // ── Phase A: AI validation (separate try block — errors must NOT fall through)
    List<String> normalizedNames;
    if (skipResolution) {
      // Chips were pre-validated at chip-add time — trust them directly.
      normalizedNames = pendingNames;
    } else {
      try {
        final resolution = await _gemini.resolveSubscriptionSelection(
          rawNames: pendingNames,
          language: _appLang,
        );
        if (resolution.invalidNames.isNotEmpty) {
          state = state.copyWith(
            phase: SubFlowPhase.idle,
            error: buildInvalidSubscriptionInputMessage(_appLang),
          );
          return;
        }
        if (resolution.mixedCategories) {
          state = state.copyWith(
            phase: SubFlowPhase.idle,
            error: buildMixedSubscriptionCategoriesMessage(
              _appLang,
              names: resolution.normalizedNames,
            ),
          );
          return;
        }
        if (resolution.normalizedNames.isEmpty) {
          state = state.copyWith(
            phase: SubFlowPhase.idle,
            error: buildInvalidSubscriptionInputMessage(_appLang),
          );
          return;
        }
        // Deduplicate by normalised name (same service entered twice)
        final seen = <String>{};
        final deduped = resolution.normalizedNames
            .where((name) => seen.add(name.toLowerCase()))
            .toList();
        if (deduped.length < resolution.normalizedNames.length) {
          // At least one duplicate was found — continue with deduplicated list
        }
        if (deduped.length == 1 && pendingNames.length > 1) {
          // All names resolved to the same service
          state = state.copyWith(
            phase: SubFlowPhase.idle,
            error: _isTurkishLanguage(_appLang)
                ? 'Aynı aboneliği birden fazla kez girdiniz.'
                : 'You entered the same subscription more than once.',
          );
          return;
        }
        normalizedNames = deduped;
      } catch (e) {
        debugPrint('=== QOR AI: resolveSubscriptionSelection failed: $e ===');
        state = state.copyWith(
          phase: SubFlowPhase.idle,
          error: _isTurkishLanguage(_appLang)
              ? 'Abonelik doğrulanırken bir hata oluştu. Lütfen tekrar deneyin.'
              : 'An error occurred while validating subscriptions. Please try again.',
        );
        return;
      }
    } // end !skipResolution

    // ── Phase B: Quiz generation (quiz failure falls through to direct analysis)
    try {
      ProductQuiz quiz;
      try {
        quiz = await _gemini
            .generateSubscriptionQuiz(
              subscriptionNames: normalizedNames,
              language: _appLang,
            )
            .timeout(const Duration(seconds: 25));
      } catch (_) {
        quiz = await _deepseek
            .generateSubscriptionQuiz(
              subscriptionNames: normalizedNames,
              language: _appLang,
            )
            .timeout(const Duration(seconds: 25));
      }

      if (quiz.questions.isEmpty) throw Exception('No questions generated');

      state = state.copyWith(
        phase: SubFlowPhase.quiz,
        quiz: quiz,
        answeredQuestions: quiz.questions,
        currentQuestionIndex: 0,
      );
    } catch (_) {
      // Fallback: quiz unavailable → go straight to analysis with validated names
      final subQuota = _subService.recordSubscriptionAnalysis();
      if (subQuota.isFailure) {
        state = state.copyWith(
          phase: SubFlowPhase.idle,
          error: buildDailyQLimitMessage(_appLang),
        );
        return;
      }
      state = state.copyWith(phase: SubFlowPhase.analyzing);
      await _runAnalysis(normalizedNames, []);
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
        error: buildDailyQLimitMessage(_appLang),
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
          'mode': 'subscription',
          'category': 'subscription',
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
        error: buildDailyQLimitMessage(_appLang),
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

      _ref.read(aiPageContextProvider.notifier).state = {
        'contextRoute': 'subscriptions',
        'activeAnalysisType': 'subscription analysis',
        'activeSubscriptionServices': names.join(' vs '),
        'activeSubscriptionScores': Map<String, double>.from(
          result['scores'] as Map? ?? {},
        ).toString(),
        'activeSubscriptionSummary': result['analysis'] as String? ?? '',
        'activeQuizAnswers': answered
            .where((q) => q.selectedOption != null)
            .map((q) => {'question': q.text, 'answer': q.selectedOption})
            .toList()
            .toString(),
      };

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

          // Mirror to analyzedProducts so admin panel sees it alongside link analyses
          final scoresMap = Map<String, double>.from(
            result['scores'] as Map? ?? {},
          );
          for (final service in names) {
            final sScore = scoresMap[service];
            _ref.read(pbDataSourceProvider).saveAnalyzedProduct(authState, {
              'timestamp': DateTime.now().toIso8601String(),
              'title': service,
              'category': 'subscription',
              'mode': 'subscription',
              'score': sScore,
              'verdict': (result['analysis'] as String? ?? '').substring(
                0,
                (result['analysis'] as String? ?? '').length.clamp(0, 200),
              ),
            });
          }
        }
      } catch (_) {}
    } catch (e) {
      debugPrint('=== QOR AI: Sub analysis error: $e ===');
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

/// Ürün (tekli) AI analiz geçmişi — giriş yapmış kullanıcı için
final productAnalysisHistoryProvider =
    FutureProvider<List<Map<String, dynamic>>>((ref) async {
      final authState = ref.watch(authStateProvider).valueOrNull;
      if (authState == null) return [];
      return ref.read(pbDataSourceProvider).getProductAnalysisHistory(authState);
    });

/// Çoklu ürün KARŞILAŞTIRMA AI analiz geçmişi — giriş yapmış kullanıcı için
final compareAnalysisHistoryProvider =
    FutureProvider<List<Map<String, dynamic>>>((ref) async {
      final authState = ref.watch(authStateProvider).valueOrNull;
      if (authState == null) return [];
      return ref.read(pbDataSourceProvider).getCompareAnalysisHistory(authState);
    });

/// Optimistic (yerel, anlık) ürün analizi geçmişi — analiz biter bitmez görünsün
final pendingProductAnalysisHistoryProvider =
    StateProvider<List<Map<String, dynamic>>>((ref) => []);

/// Optimistic (yerel, anlık) karşılaştırma analizi geçmişi
final pendingCompareAnalysisHistoryProvider =
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

/// Screens use linkAnalysisNotifierProvider
final linkAnalysisNotifierProvider = linkAnalysisProvider;

/// User comparison history
///
/// Watches authStateProvider only (not userProfileProvider) so that frequent
/// realtime updates to the user record don't continuously re-trigger the
/// fetch and leave the screen stuck on loading.
final userComparisonsProvider =
    FutureProvider.autoDispose<Result<List<ComparisonEntity>>>((ref) async {
      // Sadece uid değişimini dinle (record içi alan değişikliklerinde tekrar
      // tetiklenmemek için authStateProvider'dan select ile sadece uid çekiyoruz).
      final authUid = ref.watch(authStateProvider.select((a) => a.valueOrNull));
      final userId = authUid ?? pb.authStore.record?.id;
      if (userId == null || userId.isEmpty) {
        return const Success([]);
      }

      final repo = ref.read(comparisonRepositoryProvider);
      return repo.getUserComparisons(userId);
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

/// Reviews for a product (single load to keep detail startup quiet and stable)
final productReviewsProvider = FutureProvider.autoDispose
    .family<List<ReviewModel>, String>((ref, productId) {
      return ref.read(pbDataSourceProvider).getProductReviews(productId);
    });

/// Current user's reviews
final myReviewsProvider = StreamProvider<List<ReviewModel>>((ref) {
  // Use select so provider only rebuilds when the UID itself changes,
  // not on every auth token refresh that preserves the same UID.
  final uid = ref.watch(authStateProvider.select((v) => v.valueOrNull));
  if (uid == null) return Stream.value(<ReviewModel>[]);
  return ref.read(pbDataSourceProvider).watchUserReviews(uid);
});

/// Fetches this user's comparison reviews from the comparison_reviews collection.
final myComparisonReviewsProvider = FutureProvider<List<Map<String, dynamic>>>((
  ref,
) async {
  final uid = ref.watch(authStateProvider.select((v) => v.valueOrNull));
  if (uid == null) return [];
  try {
    final result = await pb
        .collection('comparison_reviews')
        .getList(filter: 'userId = "$uid"', sort: '-timestamp', perPage: 10)
        .timeout(const Duration(seconds: 10));
    return result.items.map((r) {
      final data = Map<String, dynamic>.from(r.data);
      data['id'] = r.id;
      return data;
    }).toList();
  } catch (_) {
    return [];
  }
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
