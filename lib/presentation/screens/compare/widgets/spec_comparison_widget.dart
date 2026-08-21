part of '../compare_screen.dart';

enum _AiPanelType { deepAnalysis, alternatives, advisor, prediction }

enum _CompareValueRank { neutral, better, weaker }

// ignore: unused_element
String _previewTabLabel(BuildContext context) {
  switch (Localizations.localeOf(context).languageCode.toLowerCase()) {
    case 'tr':
      return 'Önizleme';
    case 'fr':
      return 'Aperçu';
    case 'es':
      return 'Vista previa';
    case 'it':
      return 'Anteprima';
    case 'pt':
      return 'Prévia';
    case 'ar':
      return 'معاينة';
    case 'ja':
      return 'プレビュー';
    case 'nl':
      return 'Voorbeeld';
    case 'pl':
      return 'Podgląd';
    case 'sv':
      return 'Förhandsvisning';
    default:
      return 'Preview';
  }
}

class _SpecComparisonView extends ConsumerStatefulWidget {
  final List<ProductEntity> products;
  final VoidCallback onReset;
  final void Function(String productId)? onRemoveProduct;
  const _SpecComparisonView({
    required this.products,
    required this.onReset,
    this.onRemoveProduct,
  });

  @override
  ConsumerState<_SpecComparisonView> createState() =>
      _SpecComparisonViewState();
}

class _SpecComparisonViewState extends ConsumerState<_SpecComparisonView> {
  late Map<String, Map<String, List<String>>> _groupedSpecs;

  // Deep Analysis state (merged with AI Analysis structured)
  bool _deepAnalysisExpanded = false;
  bool _deepAnalysisLoading = false;
  String? _deepAnalysisResult;
  Map<String, dynamic>? _deepAnalysisStructured;
  // ignore: unused_field
  bool _deepAnalysisError = false;
  // ignore: unused_field
  String? _deepAnalysisErrorMsg;

  // Smart Alternatives state
  bool _alternativesExpanded = false;
  bool _alternativesLoading = false;
  String? _alternativesResult;
  Map<String, dynamic>? _alternativesStructured;
  // ignore: unused_field
  bool _alternativesError = false;
  // ignore: unused_field
  String? _alternativesErrorMsg;

  // AI Advisor state
  bool _advisorExpanded = false;
  bool _advisorLoading = false;
  String? _advisorResult;
  Map<String, dynamic>? _advisorStructured;
  // ignore: unused_field
  bool _advisorError = false;
  // ignore: unused_field
  String? _advisorErrorMsg;

  // Price Prediction state
  bool _predictionExpanded = false;
  bool _predictionLoading = false;
  String? _predictionResult;
  Map<String, dynamic>? _predictionStructured;
  // ignore: unused_field
  bool _predictionError = false;
  // ignore: unused_field
  String? _predictionErrorMsg;

  // Personalized Match state
  bool _matchScoreExpanded = false;
  bool _matchScoreFetched = false;
  final Map<_AiPanelType, String> _aiProgressText = {};
  bool _unifiedAiExpanded = false;
  bool _unifiedAiRunning = false;
  bool _unifiedAiAutoStarted = false;
  // ignore: unused_field
  String _unifiedAiProgress = '';

  // ── KARŞILAŞTIRMA ANALİZİ DURUMU ARTIK GLOBAL ──────────────────────────────
  // Eskiden quiz/rapor/faz bu widget'ın State'inde tutuluyordu; kullanıcı
  // sekmeden çıkınca widget dispose oluyor ve üretilen quiz/rapor ÇÖPE
  // gidiyordu (baloncuk sonsuza kadar dönüyordu). Durum `compareAiProvider`'da,
  // motor MainShell'de. Burası yalnız ANLIK GÖRÜNTÜYÜ çizer.
  //
  // `build()` içinde `ref.watch` ile tazelenir; yalnız BU ürün kümesine ait iş
  // gösterilir (kullanıcı başka bir karşılaştırma başlatmış olabilir).
  CompareAiState _ai = const CompareAiState();

  String get _compareKey => compareAiKey(widget.products.map((p) => p.id));

  Map<String, dynamic>? get _fullCompareReport => _ai.report;
  bool get _fullCompareRunning => _ai.phase == CompareAiPhase.running;
  bool get _fullCompareError => _ai.phase == CompareAiPhase.error;
  AiReportStageLite get _fullCompareStage => _ai.stage;
  ProductQuiz? get _compareQuiz => _ai.quiz;
  List<QuizQuestion> get _compareQuizAnswers => _ai.answers;
  int get _compareQuizIndex => _ai.quizIndex;
  bool get _compareQuizLoading =>
      _ai.phase == CompareAiPhase.quizLoading ||
      _ai.phase == CompareAiPhase.startRequested;
  DateTime? get _compareWorkStartedAt => _ai.workStartedAt;
  // Kayıtlı karşılaştırma analizinde "verdiğin cevaplar" bölümü açık mı?
  bool _compareSavedAnswersExpanded = false;

  // Cached reviews future — created once, avoids infinite loading on rebuild
  Future<List<RecordModel>>? _reviewsFuture;

  // Cached key specs — computed once and reused in every build
  List<_CompareSpecRow> _cachedKeySpecs = [];

  // Floating YouTube player overlay
  OverlayEntry? _pipOverlay;

  void _closePiP() {
    _pipOverlay?.remove();
    _pipOverlay = null;
  }

  void _onVideoTap(String url, String title, String thumbnailUrl) {
    final ytRegex = RegExp(r'(?:youtube\.com/watch\?v=|youtu\.be/)([\w-]+)');
    final match = ytRegex.firstMatch(url);
    if (match != null) {
      final videoId = match.group(1)!;
      if (!mounted) return;
      _closePiP();
      _pipOverlay = OverlayEntry(
        builder: (_) => _CompareFloatingPlayer(
          videoId: videoId,
          title: title,
          thumbnailUrl: thumbnailUrl.isNotEmpty
              ? thumbnailUrl
              : 'https://img.youtube.com/vi/$videoId/hqdefault.jpg',
          onClose: _closePiP,
        ),
      );
      Overlay.of(context).insert(_pipOverlay!);
    }
  }

  /// Riverpod dispose'ta `ref` kullanmayı yasaklar → notifier referansı burada
  /// saklanır (product detay ekranıyla aynı desen).
  CompareAiNotifier? _aiNotifier;
  String _viewingKey = '';

  @override
  void dispose() {
    _closePiP();
    // Ekran kapanıyor: "bu karşılaştırma açık" işaretini bırak (bildirim
    // bastırma). İŞİ İPTAL ETME — arka planda sürmeli.
    if (_viewingKey.isNotEmpty) _aiNotifier?.clearViewingIfMatches(_viewingKey);
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    _aiNotifier = ref.read(compareAiProvider.notifier);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _viewingKey = _compareKey;
      ref.read(compareAiProvider.notifier).setViewing(_viewingKey);
    });
    // Full spec table is built in a background isolate to avoid first-frame
    // jank; it is (re)computed in didChangeDependencies once a locale exists.
    _groupedSpecs = {};
    // Restore AI analysis from session if available
    _restoreFromSession();
  }

  // Specs are rendered from the baked, per-language payloads
  // (`localizedSpecSections`) — the exact same source the admin modal and the
  // product-detail Specs tab use. They must therefore be (re)built once the
  // locale is known and again whenever the user switches language. initState
  // has no Localizations yet, so the first build happens here.
  String? _specsLocale;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final locale = Localizations.localeOf(context).languageCode.toLowerCase();
    if (locale == _specsLocale) return;
    _specsLocale = locale;
    // Highlights summary is cheap (≤6 rows) → build synchronously.
    _cachedKeySpecs = _collectCompareKeySpecs(locale);
    _computeGroupedSpecsAsync(locale);
  }

  void _computeGroupedSpecsAsync(String locale) {
    // Feed the aligner the already-localized, correction-cleaned sections so the
    // compare table is byte-for-byte the admin/detail spec data — no in-app
    // re-translation, no NLLB hallucinations (e.g. "6.9 İnç" → "6.9 I'm not").
    final input = widget.products
        .map((p) => p.localizedSpecSections(locale))
        .toList();
    compute(_alignLocalizedCompareSpecs, input).then((grouped) {
      if (!mounted) return;
      setState(() {
        _groupedSpecs = grouped;
      });
    });
  }

  /// Locale helper — true when app language is Turkish
  bool get _isTr => Localizations.localeOf(context).languageCode == 'tr';
  String get _appLang =>
      Localizations.localeOf(context).languageCode.toLowerCase();

  String _languageName(String code) {
    const map = {
      'en': 'English',
      'tr': 'Turkish',
      'fr': 'French',
      'es': 'Spanish',
      'pt': 'Portuguese',
      'it': 'Italian',
      'ja': 'Japanese',
      'nl': 'Dutch',
      'pl': 'Polish',
      'sv': 'Swedish',
      'ar': 'Arabic',
    };
    return map[code] ?? 'English';
  }

  String _localizedFeature(String feature) => '${feature}_$_appLang';

  String _detailCtaLabel() => _isTr ? 'Detay' : 'Detail';

  String _sentenceCaseLocalized(String text) {
    final t = text.trim();
    if (t.isEmpty) return t;
    final first = t[0];
    final upper = switch (first) {
      'i' => 'İ',
      'ı' => 'I',
      _ => first.toUpperCase(),
    };
    return '$upper${t.substring(1)}';
  }

  String _predictionProductContext(ProductEntity product) {
    final details = <String>[
      'brand: ${product.brand?.trim().isNotEmpty == true ? product.brand!.trim() : 'unknown'}',
      'category: ${product.category}',
    ];
    if (product.subcategory.trim().isNotEmpty) {
      details.add('subcategory: ${product.subcategory.trim()}');
    }
    final releaseYear = ProductFilter.getExactReleaseYear(product);
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

  Widget _buildMatchScoreRing({
    required double progress,
    required Color color,
    required double size,
    required double strokeWidth,
    required double fontSize,
  }) {
    final clampedProgress = progress.clamp(0.0, 1.0);
    final innerSize = max(size - (strokeWidth * 2) - 8, 0.0);
    return SizedBox(
      width: size,
      height: size,
      child: Stack(
        alignment: Alignment.center,
        children: [
          CustomPaint(
            size: Size.square(size),
            painter: _MatchScoreRingPainter(
              progress: clampedProgress,
              color: color,
              backgroundColor: color.withValues(alpha: 0.14),
              strokeWidth: strokeWidth,
            ),
          ),
          Container(
            width: innerSize,
            height: innerSize,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: Theme.of(context).colorScheme.surface,
              border: Border.all(color: color.withValues(alpha: 0.08)),
            ),
            child: FittedBox(
              fit: BoxFit.scaleDown,
              child: Text(
                '${(clampedProgress * 100).toInt()}%',
                textAlign: TextAlign.center,
                style: GoogleFonts.plusJakartaSans(
                  fontSize: fontSize,
                  fontWeight: FontWeight.w900,
                  color: color,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// Cache key for Firestore AI result cache
  String get _aiCacheDocId {
    final ids = widget.products.map((p) => p.id).toList()..sort();
    return ids.join('_');
  }

  /// Try to load a cached AI result from PocketBase
  Future<Map<String, dynamic>?> _loadAiCache(String feature) async {
    try {
      final record = await pb
          .collection('ai_compare_cache')
          .getFirstListItem(
            'cacheKey = "$_aiCacheDocId" && feature = "$feature"',
          )
          .timeout(const Duration(seconds: 5));
      final data = record.data;
      final ts = DateTime.tryParse(data['timestamp']?.toString() ?? '');
      if (ts == null) return null;
      // 24h TTL
      if (DateTime.now().difference(ts).inHours > 24) return null;
      debugPrint('[Qor AI] ✅ Cache HIT for $feature');
      return data;
    } catch (e) {
      if (e is ClientException && e.statusCode == 404) return null;
      debugPrint('[Qor AI] Cache read skipped ($feature): $e');
      return null;
    }
  }

  /// Save an AI result to PocketBase cache
  Future<void> _saveAiCache(String feature, Map<String, dynamic> data) async {
    try {
      final body = {
        ...data,
        'cacheKey': _aiCacheDocId,
        'feature': feature,
        'timestamp': DateTime.now().toUtc().toIso8601String(),
      };
      try {
        final existing = await pb
            .collection('ai_compare_cache')
            .getFirstListItem(
              'cacheKey = "$_aiCacheDocId" && feature = "$feature"',
            );
        await pb.collection('ai_compare_cache').update(existing.id, body: body);
      } catch (_) {
        await pb.collection('ai_compare_cache').create(body: body);
      }
    } catch (e) {
      if (e is ClientException &&
          (e.statusCode == 403 || e.statusCode == 404)) {
        return;
      }
      debugPrint('[Qor AI] Cache write skipped ($feature): $e');
    }
  }

  /// Restore AI analysis results from session (survives navigation)
  void _restoreFromSession() {
    final session = ref.read(compareSessionProvider);
    final sessionIds = session.selectedProductIds.toSet();
    final currentIds = widget.products.map((p) => p.id).toSet();
    if (sessionIds.isNotEmpty &&
        sessionIds.difference(currentIds).isEmpty &&
        currentIds.difference(sessionIds).isEmpty) {
      if (session.deepAnalysisResult != null) {
        _deepAnalysisResult = session.deepAnalysisResult;
      }
      if (session.aiStructured != null) {
        _deepAnalysisStructured = session.aiStructured;
      }
      if (session.alternativesResult != null) {
        _alternativesResult = session.alternativesResult;
      }
      if (session.alternativesStructured != null) {
        _alternativesStructured = session.alternativesStructured;
      }
      if (session.advisorResult != null) _advisorResult = session.advisorResult;
      if (session.advisorStructured != null) {
        _advisorStructured = session.advisorStructured;
      }
      if (session.predictionResult != null) {
        _predictionResult = session.predictionResult;
      }
      if (session.predictionStructured != null) {
        _predictionStructured = session.predictionStructured;
      }
    }
  }

  /// Save AI analysis results to session
  void _saveToSession() {
    ref
        .read(compareSessionProvider.notifier)
        .update(
          (state) => state.copyWith(
            aiStructured: _deepAnalysisStructured,
            deepAnalysisResult: _deepAnalysisResult,
            alternativesResult: _alternativesResult,
            alternativesStructured: _alternativesStructured,
            advisorResult: _advisorResult,
            advisorStructured: _advisorStructured,
            predictionResult: _predictionResult,
            predictionStructured: _predictionStructured,
          ),
        );
  }

  /// Parse JSON from AI response, handling markdown code blocks and truncated responses
  Map<String, dynamic>? _tryParseJson(String raw) {
    try {
      var clean = raw.trim();
      final codeBlockMatch = RegExp(
        r'```(?:json)?\s*\n?([\s\S]*?)\n?\s*```',
      ).firstMatch(clean);
      if (codeBlockMatch != null) clean = codeBlockMatch.group(1)!.trim();
      final jsonStart = clean.indexOf('{');
      final jsonEnd = clean.lastIndexOf('}');
      if (jsonStart >= 0 && jsonEnd > jsonStart) {
        clean = clean.substring(jsonStart, jsonEnd + 1);
      } else if (jsonStart >= 0) {
        // No closing brace — truncated JSON, try repair
        clean = _repairTruncatedJson(clean.substring(jsonStart));
        debugPrint('[Qor AI] _tryParseJson: attempted JSON repair');
      }
      final decoded = jsonDecode(clean);
      if (decoded is Map<String, dynamic>) return decoded;
      return null;
    } catch (e) {
      // Try repair as last resort
      try {
        final repaired = _repairTruncatedJson(raw.trim());
        final decoded = jsonDecode(repaired);
        if (decoded is Map<String, dynamic>) {
          debugPrint('[Qor AI] _tryParseJson: repair succeeded');
          return decoded;
        }
      } catch (_) {}
      debugPrint(
        '[Qor AI] _tryParseJson failed: $e | raw snippet: ${raw.length > 200 ? raw.substring(0, 200) : raw}',
      );
      return null;
    }
  }

  /// Attempt to repair truncated JSON by closing open strings, arrays, and objects
  String _repairTruncatedJson(String truncated) {
    var inString = false;
    var escaped = false;
    final stack = <String>[]; // tracks '{' and '['

    for (var i = 0; i < truncated.length; i++) {
      final c = truncated[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (c == '\\' && inString) {
        escaped = true;
        continue;
      }
      if (c == '"') {
        inString = !inString;
        continue;
      }
      if (!inString) {
        if (c == '{') {
          stack.add('{');
        } else if (c == '[') {
          stack.add('[');
        } else if (c == '}' && stack.isNotEmpty && stack.last == '{') {
          stack.removeLast();
        } else if (c == ']' && stack.isNotEmpty && stack.last == '[') {
          stack.removeLast();
        }
      }
    }

    var repaired = truncated;
    // Close open string
    if (inString) repaired += '"';
    // Remove trailing incomplete key-value (e.g. `"key": ` or `, "key"`)
    repaired = repaired.replaceAll(
      RegExp(r',\s*"[^"]*"\s*:\s*"?[^"{}[\]]*$'),
      '',
    );
    repaired = repaired.replaceAll(RegExp(r',\s*"[^"]*"\s*$'), '');
    repaired = repaired.replaceAll(RegExp(r',\s*$'), '');
    // Close remaining open brackets/braces in reverse order
    for (var i = stack.length - 1; i >= 0; i--) {
      repaired += stack[i] == '{' ? '}' : ']';
    }
    return repaired;
  }

  /// Parse JSON array from AI response
  // ignore: unused_element
  List<dynamic>? _tryParseJsonArray(String raw) {
    try {
      var clean = raw.trim();
      final codeBlockMatch = RegExp(
        r'```(?:json)?\s*\n?([\s\S]*?)\n?\s*```',
      ).firstMatch(clean);
      if (codeBlockMatch != null) clean = codeBlockMatch.group(1)!.trim();
      final arrStart = clean.indexOf('[');
      final arrEnd = clean.lastIndexOf(']');
      if (arrStart >= 0 && arrEnd > arrStart) {
        clean = clean.substring(arrStart, arrEnd + 1);
      }
      final decoded = jsonDecode(clean);
      if (decoded is List) return decoded;
      return null;
    } catch (e) {
      debugPrint('[Qor AI] _tryParseJsonArray failed: $e');
      return null;
    }
  }

  /// Fetch from Gemini Flash (primary) with DeepSeek fallback on persistent failures.
  Future<({Map<String, dynamic>? data, String? error})> _fetchWithRetry(
    String prompt,
    String label,
    String lang, {
    int maxTokens = 4096,
    void Function(String message)? onProgress,
    bool allowGeminiFallback = false,
    bool useGrounding = false,
  }) async {
    final gemini = ref.read(geminiServiceProvider);
    String? lastError;
    final maxAttempts = useGrounding ? 1 : 3;
    for (var attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        onProgress?.call(
          _isTr
              ? 'AI analizi yapılıyor ($attempt/$maxAttempts)…'
              : 'Analyzing… ($attempt/$maxAttempts)',
        );
        final result = useGrounding
            ? await gemini
                  .groundedQuery(
                    '$prompt\n\nUse web search where helpful, then return only the requested JSON object.',
                    maxTokens: maxTokens,
                  )
                  .timeout(const Duration(seconds: 45))
            : await gemini
                  .jsonFreeTextQuery(
                    prompt,
                    language: lang,
                    maxTokens: maxTokens,
                    tier: AiTier.heavy,
                  )
                  .timeout(const Duration(seconds: 45));
        debugPrint(
          '[Qor AI] 🔍 $label RAW attempt $attempt (${result.length} chars):\n${result.length > 600 ? result.substring(0, 600) : result}',
        );
        final parsed = _tryParseJson(result);
        if (parsed != null) return (data: parsed, error: null);
        lastError = 'JSON parse failed';
        debugPrint(
          '[Qor AI] $label parse FAILED attempt $attempt${attempt < maxAttempts ? " — retrying" : " — giving up"}',
        );
        if (attempt < maxAttempts) {
          await Future.delayed(Duration(seconds: attempt));
        }
      } catch (e) {
        lastError = e.toString();
        debugPrint('[Qor AI] $label attempt $attempt error: $e');
        if (attempt < maxAttempts) {
          await Future.delayed(Duration(seconds: attempt));
        }
      }
    }
    if (allowGeminiFallback) {
      try {
        onProgress?.call(
          _isTr ? 'Alternatif model deneniyor…' : 'Trying alternative model…',
        );
        final deepseek = ref.read(deepSeekServiceProvider);
        final result = await deepseek.jsonFreeTextQuery(
          prompt,
          language: lang,
          maxTokens: maxTokens,
        );
        final parsed = _tryParseJson(result);
        if (parsed != null) return (data: parsed, error: null);
        lastError = 'Fallback parse failed';
      } catch (e) {
        lastError = e.toString();
      }
    }
    return (data: null, error: lastError);
  }

  bool _isAiPanelExpanded(_AiPanelType panel) {
    switch (panel) {
      case _AiPanelType.deepAnalysis:
        return _deepAnalysisExpanded;
      case _AiPanelType.alternatives:
        return _alternativesExpanded;
      case _AiPanelType.advisor:
        return _advisorExpanded;
      case _AiPanelType.prediction:
        return _predictionExpanded;
    }
  }

  bool _hasAiPanelData(_AiPanelType panel) {
    switch (panel) {
      case _AiPanelType.deepAnalysis:
        return _deepAnalysisResult != null || _deepAnalysisStructured != null;
      case _AiPanelType.alternatives:
        return _alternativesResult != null || _alternativesStructured != null;
      case _AiPanelType.advisor:
        return _advisorResult != null || _advisorStructured != null;
      case _AiPanelType.prediction:
        return _predictionResult != null || _predictionStructured != null;
    }
  }

  void _setAiPanelExpanded(_AiPanelType panel, bool value) {
    switch (panel) {
      case _AiPanelType.deepAnalysis:
        _deepAnalysisExpanded = value;
        break;
      case _AiPanelType.alternatives:
        _alternativesExpanded = value;
        break;
      case _AiPanelType.advisor:
        _advisorExpanded = value;
        break;
      case _AiPanelType.prediction:
        _predictionExpanded = value;
        break;
    }
  }

  void _setAiPanelLoading(_AiPanelType panel, bool value) {
    switch (panel) {
      case _AiPanelType.deepAnalysis:
        _deepAnalysisLoading = value;
        break;
      case _AiPanelType.alternatives:
        _alternativesLoading = value;
        break;
      case _AiPanelType.advisor:
        _advisorLoading = value;
        break;
      case _AiPanelType.prediction:
        _predictionLoading = value;
        break;
    }
    if (!value) {
      _aiProgressText.remove(panel);
    }
  }

  void _setAiPanelProgress(_AiPanelType panel, String message) {
    _aiProgressText[panel] = message;
  }

  void _setAiPanelData(
    _AiPanelType panel, {
    required String? result,
    required Map<String, dynamic>? structured,
  }) {
    switch (panel) {
      case _AiPanelType.deepAnalysis:
        _deepAnalysisResult = result;
        _deepAnalysisStructured = structured;
        break;
      case _AiPanelType.alternatives:
        _alternativesResult = result;
        _alternativesStructured = structured;
        break;
      case _AiPanelType.advisor:
        _advisorResult = result;
        _advisorStructured = structured;
        break;
      case _AiPanelType.prediction:
        _predictionResult = result;
        _predictionStructured = structured;
        break;
    }
  }

  void _setAiPanelError(
    _AiPanelType panel, {
    required bool hasError,
    required String? message,
  }) {
    switch (panel) {
      case _AiPanelType.deepAnalysis:
        _deepAnalysisError = hasError;
        _deepAnalysisErrorMsg = message;
        break;
      case _AiPanelType.alternatives:
        _alternativesError = hasError;
        _alternativesErrorMsg = message;
        break;
      case _AiPanelType.advisor:
        _advisorError = hasError;
        _advisorErrorMsg = message;
        break;
      case _AiPanelType.prediction:
        _predictionError = hasError;
        _predictionErrorMsg = message;
        break;
    }
  }

  void _showQSpendFailure(
    BuildContext context, {
    required String feature,
    required Result<void> result,
  }) {
    showQSpendFailure(context, ref, feature: feature, result: result);
  }

  /// Splits [rawValue] on its natural separators BEFORE translation
  /// (translation services may collapse \n to spaces).  Then translates each
  /// part individually, as the detail spec screen does.
  String _buildSpecSheetValue(BuildContext context, String rawValue) {
    final parts = _extractSpecValueParts(rawValue);
    return parts.map((p) => _localizedSpecValue(context, p)).join('\n');
  }

  /// Mirrors _SpecRow._extractValueParts from the detail screen.
  List<String> _extractSpecValueParts(String value) {
    if (value.isEmpty) return [value];

    final withNewlines = value
        .replaceAll('•', '\n')
        .replaceAll('·', '\n')
        .replaceAll('|', '\n');

    if (withNewlines.contains('\n')) {
      final rawParts = withNewlines
          .split('\n')
          .map((s) => s.trim())
          .where((s) => s.isNotEmpty)
          .map((p) => p.replaceFirst(RegExp(r'^[-•·\s]+'), '').trim())
          .where((p) => p.isNotEmpty)
          .toList();
      if (rawParts.length >= 2) return rawParts;
    }

    final normalized = withNewlines
        .replaceAllMapped(
          RegExp(r'(?<=[+)])\s+(?=[A-ZÇĞİÖŞÜ0-9])'),
          (_) => '\n',
        )
        .replaceAll(RegExp(r'[^\S\n]{2,}'), ' ')
        .trim();

    List<String>? parts;
    if (normalized.contains('\n')) {
      parts = normalized
          .split('\n')
          .map((s) => s.trim())
          .where((s) => s.isNotEmpty)
          .toList();
    } else if (normalized.contains(',') && normalized.length > 8) {
      parts = normalized
          .split(',')
          .map((s) => s.trim())
          .where((s) => s.isNotEmpty)
          .toList();
    } else if (normalized.contains(';') && normalized.length > 8) {
      parts = normalized
          .split(';')
          .map((s) => s.trim())
          .where((s) => s.isNotEmpty)
          .toList();
    } else if (normalized.contains(' / ') && normalized.length > 8) {
      parts = normalized
          .split(' / ')
          .map((s) => s.trim())
          .where((s) => s.isNotEmpty)
          .toList();
    } else if (normalized.length > 42 && _looksLikePackedSpecList(normalized)) {
      parts = _chunkSpecValue(normalized);
    }

    return (parts ?? [normalized])
        .map((p) => p.replaceFirst(RegExp(r'^[•\-\s]+'), '').trim())
        .where((p) => p.isNotEmpty)
        .toList();
  }

  static bool _looksLikePackedSpecList(String value) {
    final words = value
        .split(RegExp(r'\s+'))
        .map((w) => w.trim())
        .where((w) => w.isNotEmpty)
        .toList();
    if (words.length < 6) return false;
    final capCount = words
        .where(
          (w) => RegExp(r'^[A-Z0-9ÇĞİÖŞÜ]').hasMatch(w) && !_isSpecConnector(w),
        )
        .length;
    return capCount >= 4;
  }

  static bool _isSpecConnector(String word) {
    const connectors = {
      'and',
      'or',
      'with',
      'for',
      'to',
      've',
      'ile',
      'veya',
      'the',
      'a',
      'an',
      'of',
      '&',
    };
    return connectors.contains(word.toLowerCase());
  }

  static List<String> _chunkSpecValue(String value) {
    final words = value
        .split(RegExp(r'\s+'))
        .map((w) => w.trim())
        .where((w) => w.isNotEmpty)
        .toList();
    if (words.length < 5) return [value];

    final chunks = <String>[];
    final current = <String>[];
    var currentLength = 0;

    for (final word in words) {
      final startsFeature =
          current.isNotEmpty &&
          current.length >= 2 &&
          RegExp(r'^[A-Z0-9ÇĞİÖŞÜ]').hasMatch(word) &&
          !_isSpecConnector(word) &&
          currentLength >= 18;

      if (startsFeature || currentLength >= 28) {
        chunks.add(current.join(' '));
        current
          ..clear()
          ..add(word);
        currentLength = word.length;
        continue;
      }
      current.add(word);
      currentLength += word.length + 1;
    }
    if (current.isNotEmpty) chunks.add(current.join(' '));
    return chunks.where((c) => c.trim().isNotEmpty).toList();
  }

  // ignore: unused_element
  void _showSpecValueDetailSheet(BuildContext context, String rawValue) {
    _showSpecValueBottomSheet(
      specName: _isTr ? 'Özellik değeri' : 'Specification value',
      fullValue: _buildSpecSheetValue(context, rawValue),
    );
  }

  Future<void> _toggleAiPanel(
    _AiPanelType panel,
    Future<void> Function() fetcher,
  ) async {
    // Collapsing — no limit check needed
    if (_isAiPanelExpanded(panel) && _hasAiPanelData(panel)) {
      setState(() => _setAiPanelExpanded(panel, false));
      return;
    }

    if (!requireAuth(context)) return;

    final shouldFetch = !_hasAiPanelData(panel);

    // Only check limit when actually fetching new AI data
    if (shouldFetch) {
      // Kilit harcamadan ÖNCE: panel "loading" bayrağı aşağıda set edildiği
      // için `await` sırasında ikinci dokunuş Q'yu iki kez düşürebiliyordu.
      if (_panelChargeInFlight) return;
      _panelChargeInFlight = true;
      try {
        if (!await _chargeUnifiedCompareAi()) return;
      } finally {
        _panelChargeInFlight = false;
      }
      if (!mounted) return;
    }

    setState(() {
      _setAiPanelExpanded(panel, true);
      if (shouldFetch) {
        _setAiPanelLoading(panel, true);
      }
    });

    if (shouldFetch) {
      await fetcher();
    }
  }

  // ignore: unused_element
  bool get _hasAnyUnifiedCompareAiData =>
      _advisorStructured != null ||
      _deepAnalysisStructured != null ||
      _alternativesStructured != null ||
      _predictionStructured != null;

  bool get _hasAllUnifiedCompareAiData =>
      _advisorStructured != null &&
      _deepAnalysisStructured != null &&
      _alternativesStructured != null &&
      _predictionStructured != null;

  bool get _isAnyUnifiedCompareAiLoading =>
      _unifiedAiRunning ||
      _advisorLoading ||
      _deepAnalysisLoading ||
      _alternativesLoading ||
      _predictionLoading;

  // Retained for reference; the compare AI is now user-triggered (explicit
  // "Start analysis" button) instead of auto-starting on tab open.
  // ignore: unused_element
  void _scheduleUnifiedCompareAiAutoStart() {
    if (_unifiedAiAutoStarted ||
        _unifiedAiRunning ||
        _hasAllUnifiedCompareAiData) {
      return;
    }
    _unifiedAiAutoStarted = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _toggleUnifiedCompareAi(autoStart: true);
    });
  }

  bool _panelChargeInFlight = false;

  /// E-posta kapısı + Q harcaması. `true` → devam edilebilir.
  Future<bool> _chargeUnifiedCompareAi() async {
    if (!await ensureEmailVerified(context, ref)) return false;
    if (!mounted) return false;
    final sub = ref.read(subscriptionServiceProvider);
    final spend = await sub.recordCompareAi();
    if (!mounted) return false;
    if (spend.isFailure) {
      _showQSpendFailure(context, feature: 'compare_ai', result: spend);
      return false;
    }
    return true;
  }

  Future<void> _toggleUnifiedCompareAi({bool autoStart = false}) async {
    if (_unifiedAiRunning) return;
    if (_unifiedAiExpanded) {
      if (autoStart) return;
      setState(() {
        _unifiedAiExpanded = false;
      });
      return;
    }

    final shouldFetch = !_hasAllUnifiedCompareAiData;
    if (shouldFetch) {
      if (!requireAuth(context)) return;
      // Kilit harcamadan ÖNCE: `await` sırasında ikinci dokunuş buraya tekrar
      // girip Q'yu ikinci kez düşürebilirdi (`_unifiedAiRunning` aşağıda,
      // harcamadan SONRA set ediliyordu).
      setState(() => _unifiedAiRunning = true);
      final proceed = await _chargeUnifiedCompareAi();
      if (!mounted) return;
      if (!proceed) {
        setState(() => _unifiedAiRunning = false);
        return;
      }
    }

    setState(() {
      _unifiedAiExpanded = true;
      _unifiedAiRunning = shouldFetch;
      _unifiedAiProgress = '';
      _advisorExpanded = true;
      _deepAnalysisExpanded = true;
      _alternativesExpanded = true;
      _predictionExpanded = true;
    });
    if (!shouldFetch) return;

    try {
      if (mounted) {
        setState(
          () => _unifiedAiProgress = _isTr
              ? 'AI analizleri aynı anda başlatılıyor...'
              : 'Starting AI analyses in parallel...',
        );
      }
      await Future.wait([
        if (_advisorStructured == null) _fetchAdvisor(),
        if (_deepAnalysisStructured == null) _fetchDeepAnalysis(),
        if (_alternativesStructured == null) _fetchAlternatives(),
        if (_predictionStructured == null) _fetchPrediction(),
      ]);
    } finally {
      if (mounted) {
        setState(() {
          _unifiedAiRunning = false;
          _unifiedAiProgress = '';
        });
      }
    }
  }

  // ignore: unused_element
  void _retryAiPanel(_AiPanelType panel, Future<void> Function() fetcher) {
    setState(() {
      _setAiPanelError(panel, hasError: false, message: null);
      _setAiPanelLoading(panel, true);
      _setAiPanelData(panel, result: null, structured: null);
    });
    fetcher();
  }

  void _applyAiPanelCache(
    _AiPanelType panel,
    String cacheResult,
    Map<String, dynamic> parsed,
  ) {
    setState(() {
      _setAiPanelData(panel, result: cacheResult, structured: parsed);
      _setAiPanelLoading(panel, false);
      _setAiPanelError(panel, hasError: false, message: null);
      _setAiPanelProgress(
        panel,
        _isTr ? 'Önbellekten hızlıca yüklendi' : 'Loaded quickly from cache',
      );
    });
  }

  void _applyAiPanelSuccess(
    _AiPanelType panel,
    String result,
    Map<String, dynamic> structured,
  ) {
    setState(() {
      _setAiPanelData(panel, result: result, structured: structured);
      _setAiPanelLoading(panel, false);
      _setAiPanelError(panel, hasError: false, message: null);
      _setAiPanelProgress(
        panel,
        _isTr ? 'Analiz tamamlandı' : 'Analysis completed',
      );
    });
  }

  void _applyAiPanelFailure(_AiPanelType panel, String? message) {
    setState(() {
      _setAiPanelError(panel, hasError: true, message: message);
      _setAiPanelLoading(panel, false);
      _setAiPanelProgress(
        panel,
        _isTr ? 'Analiz tamamlanamadı' : 'Analysis failed',
      );
    });
  }

  Future<void> _runAiPanelRequest({
    required _AiPanelType panel,
    required String cacheFeature,
    required String debugLabel,
    required String staleCacheMessage,
    required String prompt,
    required String lang,
    required int maxTokens,
    String? startMessage,
    bool useGrounding = false,
  }) async {
    if (_hasAiPanelData(panel)) return;

    final sw = Stopwatch()..start();
    try {
      final cached = await _loadAiCache(cacheFeature);
      if (cached != null && cached['result'] != null) {
        if (mounted) {
          setState(() {
            _setAiPanelProgress(
              panel,
              _isTr ? 'Önbellek kontrol ediliyor…' : 'Checking cache…',
            );
          });
        }
        final cacheResult = cached['result'] as String;
        final parsed = cached['structured'] != null
            ? Map<String, dynamic>.from(cached['structured'] as Map)
            : _tryParseJson(cacheResult);
        if (parsed == null) {
          debugPrint(staleCacheMessage);
        } else {
          if (!mounted) return;
          _applyAiPanelCache(panel, cacheResult, parsed);
          _saveToSession();
          debugPrint(
            '[Qor AI] ⏱ $debugLabel from cache: ${sw.elapsedMilliseconds}ms',
          );
          return;
        }
      }

      if (startMessage != null) {
        debugPrint(startMessage);
      }
      if (mounted) {
        setState(() {
          _setAiPanelProgress(
            panel,
            _isTr ? 'İstek hazırlanıyor…' : 'Preparing request…',
          );
        });
      }
      final effectivePrompt = await _resolveAdminPanelPrompt(
        debugLabel,
        prompt,
      );
      final result = await _fetchWithRetry(
        effectivePrompt,
        debugLabel,
        lang,
        maxTokens: maxTokens,
        allowGeminiFallback: true,
        useGrounding: useGrounding,
        onProgress: (message) {
          if (!mounted) return;
          setState(() {
            _setAiPanelProgress(panel, message);
          });
        },
      );
      if (!mounted) return;

      if (result.data == null) {
        debugPrint(
          '[Qor AI] $debugLabel parse FAILED — showing error: ${result.error}',
        );
        _applyAiPanelFailure(panel, result.error);
      } else {
        final resultStr = jsonEncode(result.data);
        _applyAiPanelSuccess(panel, resultStr, result.data!);
        _saveToSession();
        _saveAiCache(cacheFeature, {
          'result': resultStr,
          'structured': result.data,
        });
      }

      debugPrint(
        '[Qor AI] ⏱ $debugLabel from Gemini: ${sw.elapsedMilliseconds}ms',
      );
    } catch (e, st) {
      debugPrint('[Qor AI] $debugLabel FAILED: $e\n$st');
      if (mounted) {
        _applyAiPanelFailure(panel, e.toString());
      }
    }
  }

  Future<String> _resolveAdminPanelPrompt(String label, String fallback) async {
    final normalized = label.toLowerCase();
    final key = normalized.contains('deep')
        ? 'compare_deep_analysis'
        : normalized.contains('alternative')
        ? 'compare_smart_alternatives'
        : normalized.contains('advisor')
        ? 'compare_buying_advisor'
        : normalized.contains('prediction')
        ? 'compare_price_prediction'
        : null;
    if (key == null) return fallback;
    final base = await ref
        .read(geminiServiceProvider)
        .adminPrompt(key, fallback);
    if (base == fallback) return fallback;
    return '$base\n\nRuntime comparison context follows; preserve the requested JSON schema and use the listed products/specs:\n$fallback';
  }

  // ignore: unused_element
  Future<void> _toggleDeepAnalysis() async {
    await _toggleAiPanel(_AiPanelType.deepAnalysis, _fetchDeepAnalysis);
  }

  Future<void> _fetchDeepAnalysis() async {
    final lang = _appLang;
    final langName = _languageName(lang);
    final productNames = widget.products.map((p) => p.name).join(' vs ');
    final specSummary = widget.products
        .map((p) {
          final keySpecs = p.keySpecs.entries
              .take(10)
              .map((e) => '${e.key}: ${e.value}')
              .join(', ');
          return '${p.name} (${p.brand ?? ""}): Score ${p.techScore.toInt()}/100. $keySpecs';
        })
        .join('\n');

    final catScoreTemplate = widget.products
        .map((p) => '"${p.name.split(' ').take(3).join(' ')}": 75')
        .join(', ');
    final productTemplate = widget.products
        .map(
          (p) =>
              '"${p.name.split(' ').take(3).join(' ')}": {"score": 80, "strengths": ["s1", "s2"], "weaknesses": ["w1"], "best_for": "use case"}',
        )
        .join(',\n    ');

    final prompt =
        '''You are a senior tech analyst. Compare these products. Address the user as "you/your". ALL text in $langName.
Products: $productNames

Specs:
$specSummary

CRITICAL: Include ALL ${widget.products.length} products in every section. Return ONLY valid JSON, no markdown:
{
  "winner": "exact product name",
  "products": {
    $productTemplate
  },
  "categories": {
    "Performance": {"scores": {$catScoreTemplate}, "explanation": "brief"},
    "Display": {"scores": {$catScoreTemplate}, "explanation": "brief"},
    "Storage": {"scores": {$catScoreTemplate}, "explanation": "brief"},
    "Value": {"scores": {$catScoreTemplate}, "explanation": "brief"},
    "Design": {"scores": {$catScoreTemplate}, "explanation": "brief"}
  },
  "verdict": "2-3 sentence verdict addressing you directly",
  "recommendation": "2-3 sentence recommendation addressing you directly"
}''';

    await _runAiPanelRequest(
      panel: _AiPanelType.deepAnalysis,
      cacheFeature: _localizedFeature('deep_analysis_v3'),
      debugLabel: 'Deep Analysis',
      staleCacheMessage:
          '[Qor AI] Deep Analysis cache unparseable — re-fetching',
      prompt:
          '$prompt\n'
          'Quality constraints:\n'
          '- Write evidence-based analysis, not generic claims.\n'
          '- Every product must include at least one concrete technical reason tied to specs/positioning.\n'
          '- If products are near-identical variants, say so clearly; do not invent large performance gaps.\n'
          '- Category scores must stay within 3 points when the listed specs are effectively the same.\n'
          '- Prefer practical buyer guidance over hype; mention uncertainty when price/spec data is missing.\n'
          '- Use public review/community sentiment when available; mention recurring owner praise or complaints inside verdict/recommendation.\n'
          '- verdict and recommendation should each be 4-6 sentences and should differ in focus.',
      lang: lang,
      maxTokens: 8192,
      startMessage: '[Qor AI] Deep Analysis starting for: $productNames',
      useGrounding: true,
    );
  }

  // ignore: unused_element
  Future<void> _toggleAlternatives() async {
    await _toggleAiPanel(_AiPanelType.alternatives, _fetchAlternatives);
  }

  Future<void> _fetchAlternatives() async {
    final lang = _appLang;
    final langName = _languageName(lang);
    final productNames = widget.products
        .map((p) => '${p.name} (${p.brand ?? "Unknown"})')
        .join(' vs ');
    final category = widget.products.first.category;

    final comparedSummary = widget.products
        .map(
          (p) =>
              '- ${p.name}: score ${p.techScore.round()}/100, brand ${p.brand ?? "unknown"}',
        )
        .join('\n');

    final prompt =
        '''You are Qor AI's market-aware comparison advisor. The user is comparing: $productNames in category "$category".
    Suggest 3-5 realistic alternatives that are technically compatible with the same buying intent, segment, and category. Address the user directly using "you/your". ALL text in $langName.

  Compared products:
  $comparedSummary

Return ONLY valid JSON:
{
  "alternatives": [
    {
      "name": "Product Name",
      "brand": "Brand",
      "why_better": "2-3 sentence reason with concrete trade-offs and where it beats the compared set",
      "price_range": "approx price range",
      "score": 0-100
    }
  ]
}''';

    await _runAiPanelRequest(
      panel: _AiPanelType.alternatives,
      cacheFeature: _localizedFeature('alternatives_v2'),
      debugLabel: 'Alternatives',
      staleCacheMessage:
          '[Qor AI] Alternatives cache unparseable — re-fetching',
      prompt:
          '$prompt\n'
          'Quality constraints:\n'
          '- why_better must be 2-3 sentences with category-specific detail.\n'
          '- Alternatives must be in the same category and practical buying tier unless you explicitly call out a step-up/step-down trade-off.\n'
          '- Prefer alternatives that are likely to exist in current market discussions, not imaginary products.\n'
          '- Explain compatibility with the user intent and compared products using concrete specs, price tier, thermals/build/size/feature deltas where relevant.\n'
          '- Do not claim a specific model is available in the app unless it is already in the compared product names.\n'
          '- If you name a market alternative, phrase it as "look for" or "consider the class" rather than pretending it is in stock.\n'
          '- Do not recommend absurd tier jumps; alternatives should stay close to the compared product segment unless you explain the trade-off.\n'
          '- Avoid repeating the same sentence structure across alternatives.\n'
          '- Include realistic and differentiated price band commentary.',
      lang: lang,
      maxTokens: 2048,
      startMessage: '[Qor AI] Alternatives starting for: $productNames',
      useGrounding: true,
    );
  }

  // ignore: unused_element
  Future<void> _toggleAdvisor() async {
    await _toggleAiPanel(_AiPanelType.advisor, _fetchAdvisor);
  }

  Future<void> _fetchAdvisor() async {
    final lang = _appLang;
    final langName = _languageName(lang);
    final productDetails = widget.products
        .map((p) {
          final specs = p.specs.entries
              .take(10)
              .map((e) => '${e.key}: ${e.value}')
              .join(', ');
          final price = p.prices.isNotEmpty ? p.prices.values.first : 'N/A';
          return '${p.name} (Score: ${p.techScore}, Price: $price, Specs: $specs)';
        })
        .join('\n');

    final prompt =
        '''You are a personal tech shopping advisor. Address the user directly using "you/your". ALL text in $langName.

Products:
$productDetails

Return ONLY valid JSON, no markdown, no explanation:
{
  "recommended": "exact product name you recommend",
  "best_for": "1 sentence summary - which product is best for most users and why",
  "match_points": ["reason this fits the user 1", "reason 2", "reason 3"],
  "caution_points": ["scenario where this is NOT the right choice", "another scenario"],
  "per_product": [
    {
      "name": "product name",
      "ideal_user": "who should buy this",
      "rating": 4
    }
  ],
  "final_verdict": "2-3 sentence clear recommendation addressing you directly"
}''';

    await _runAiPanelRequest(
      panel: _AiPanelType.advisor,
      cacheFeature: _localizedFeature('advisor_v2'),
      debugLabel: 'Advisor',
      staleCacheMessage: '[Qor AI] Advisor cache unparseable — re-fetching',
      prompt:
          '$prompt\n'
          'Quality constraints:\n'
          '- final_verdict should be 4-6 sentences with explicit trade-offs.\n'
          '- If products are very similar, recommend based on price, cooling/noise, warranty, size, or availability instead of fake performance differences.\n'
          '- Do not overstate certainty when price/spec fields are missing.\n'
          '- Use public review/community sentiment when available; reflect satisfaction and recurring complaints in final_verdict.\n'
          '- Avoid generic advice; tie recommendation to concrete product context.\n'
          '- Use varied wording across products and points.',
      lang: lang,
      maxTokens: 2048,
      startMessage: '[Qor AI] Advisor starting',
      useGrounding: true,
    );
  }

  // ignore: unused_element
  Future<void> _togglePrediction() async {
    await _toggleAiPanel(_AiPanelType.prediction, _fetchPrediction);
  }

  Future<void> _fetchPrediction() async {
    final lang = _appLang;
    final langName = _languageName(lang);

    final productLines = widget.products
        .asMap()
        .entries
        .map((e) {
          final idx = e.key + 1;
          final p = e.value;
          final price = p.prices.isNotEmpty ? p.prices.values.first : 'N/A';
          return '$idx. ${p.name} — current price: $price — ${_predictionProductContext(p)}';
        })
        .join('\n');

    final productTemplate = widget.products
        .asMap()
        .entries
        .map((e) {
          final p = e.value;
          return '{"name": "${p.name}", "trend": "stable", "change_percent": 0, "best_time_to_buy": "now", "confidence": 70, "reason": "explanation"}';
        })
        .join(',\n    ');

    final prompt =
        '''You are Qor AI's market and price-cycle analyst. Predict price trends for ALL of the following products using current web-search knowledge, release cadence, segment competition, historical category depreciation, and visible product specs. Address the user as "you/your". ALL text in $langName. Current year: ${DateTime.now().year}.

Products (you MUST analyze ALL ${widget.products.length}):
$productLines

Return ONLY valid JSON with exactly ${widget.products.length} items in the array, no markdown:
{
  "products": [
    $productTemplate
  ]
}
Rules:
- trend: "dropping", "stable", or "rising"
- best_time_to_buy: "now", "wait_1_month", or "wait_3_months"
- confidence: integer 0-100
- reason: 1-2 sentences for the user
- You MUST include all ${widget.products.length} products, one entry per product in the same order as listed above
- Use the brand, release timing, category replacement cycle, price tier, and key specs to differentiate similar models
- Explain the concrete product-specific trigger behind the prediction
- If exact live price history is unavailable, say so inside reason and base the forecast on release timing, comparable model behavior, stock/availability pressure, and category refresh cycles
- Confidence must be lower when price/history evidence is weak
- Do NOT give identical trend, change_percent, or best_time_to_buy values to multiple products unless their inputs are effectively the same''';

    await _runAiPanelRequest(
      panel: _AiPanelType.prediction,
      cacheFeature: _localizedFeature('prediction_v5'),
      debugLabel: 'Prediction',
      staleCacheMessage: '[Qor AI] Prediction cache unparseable — re-fetching',
      prompt:
          '$prompt\n'
          'Quality constraints:\n'
          '- reason must be 4-6 sentences (minimum 90 words) with product-specific evidence.\n'
          '- Mention at least one concrete trigger (release cadence, model refresh window, segment competition, or premium/budget cycle).\n'
          '- Do not repeat near-identical reasoning across products.',
      lang: lang,
      maxTokens: 4096,
      startMessage: '[Qor AI] Prediction starting',
      useGrounding: true,
    );
  }

  /// Merge spec groups from all products into a unified structure.
  /// Returns: { groupName: { specKey: [val1, val2, ...] } }
  // ignore: unused_element
  Map<String, Map<String, List<String>>> _buildGroupedSpecs() {
    final result = <String, Map<String, List<String>>>{};
    final productCount = widget.products.length;

    // Use specSections when available, fallback to specs
    Map<String, dynamic> displaySpecs(product) =>
        product.specSections.isNotEmpty ? product.specSections : product.specs;

    // Collect all group names from all products
    final allGroupNames = <String>{};
    for (final product in widget.products) {
      for (final entry in displaySpecs(product).entries) {
        if (entry.value is Map && (entry.value as Map).isNotEmpty) {
          allGroupNames.add(entry.key);
        }
      }
    }

    // Sort groups by priority (matching epey.com spec ordering)
    const specGroupPriority = [
      'basic information',
      'design',
      'display',
      'basic hardware',
      'processor',
      'hardware',
      'memory',
      'storage',
      'camera',
      'battery',
      'network connections',
      'wireless connections',
      'operating system',
      'multimedia',
      'features',
      'sensors',
      'other connections',
      'other',
    ];
    final sortedGroupNames = allGroupNames.toList();
    sortedGroupNames.sort((a, b) {
      final aLower = a.toLowerCase();
      final bLower = b.toLowerCase();
      int aIdx = specGroupPriority.indexWhere((p) => aLower.contains(p));
      int bIdx = specGroupPriority.indexWhere((p) => bLower.contains(p));
      if (aIdx == -1) aIdx = 900;
      if (bIdx == -1) bIdx = 900;
      return aIdx.compareTo(bIdx);
    });

    // For each group (in priority order), collect all spec keys and values per product
    for (final groupName in sortedGroupNames) {
      final allKeys = <String>{};
      // Gather all spec keys in this group across all products
      for (final product in widget.products) {
        final group = displaySpecs(product)[groupName];
        if (group is Map) {
          for (final entry in group.entries) {
            if (entry.value is Map) {
              // Nested sub-group: flatten
              for (final subKey in (entry.value as Map).keys) {
                allKeys.add(subKey.toString());
              }
            } else {
              allKeys.add(entry.key.toString());
            }
          }
        }
      }

      if (allKeys.isEmpty) continue;
      final groupSpecs = <String, List<String>>{};

      for (final specKey in allKeys) {
        final values = <String>[];
        for (final product in widget.products) {
          final group = displaySpecs(product)[groupName];
          String val = '—';
          if (group is Map) {
            if (group.containsKey(specKey)) {
              final v = group[specKey];
              val =
                  (v != null &&
                      v.toString().isNotEmpty &&
                      v.toString() != 'null' &&
                      v.toString() != '?')
                  ? v.toString()
                  : '—';
            } else {
              // Check in nested sub-groups
              for (final entry in group.entries) {
                if (entry.value is Map &&
                    (entry.value as Map).containsKey(specKey)) {
                  final v = (entry.value as Map)[specKey];
                  val =
                      (v != null &&
                          v.toString().isNotEmpty &&
                          v.toString() != 'null' &&
                          v.toString() != '?')
                      ? v.toString()
                      : '—';
                  break;
                }
              }
            }
          }
          values.add(val);
        }
        // Only add if at least one product has a value
        if (values.any((v) => v != '—')) {
          groupSpecs[specKey] = values;
        }
      }

      if (groupSpecs.isNotEmpty) {
        result[groupName] = groupSpecs;
      }
    }

    // Handle flat (ungrouped) specs
    final flatSpecs = <String, List<String>>{};
    for (final product in widget.products) {
      for (final entry in displaySpecs(product).entries) {
        if (entry.value is! Map) {
          flatSpecs.putIfAbsent(
            entry.key,
            () => List.filled(productCount, '—'),
          );
        }
      }
    }
    for (int i = 0; i < productCount; i++) {
      for (final entry in displaySpecs(widget.products[i]).entries) {
        if (entry.value is! Map && flatSpecs.containsKey(entry.key)) {
          final v = entry.value;
          flatSpecs[entry.key]![i] =
              (v != null && v.toString().isNotEmpty && v.toString() != 'null')
              ? v.toString()
              : '—';
        }
      }
    }
    if (flatSpecs.isNotEmpty) {
      result['Other'] = flatSpecs;
    }

    return result;
  }

  String _formatKey(String key) {
    return key
        .replaceAll('_', ' ')
        .split(' ')
        .map((w) => w.isNotEmpty ? w[0].toUpperCase() + w.substring(1) : '')
        .join(' ');
  }

  // ignore: unused_element
  String _localizedGroupName(BuildContext context, String key) {
    final l = context.l10n;
    if (l == null) return _formatKey(key);
    final k = key.toLowerCase().replaceAll('_', ' ').trim();
    final map = <String, String>{
      'general features': l.specGroupGeneral,
      'general': l.specGroupGeneral,
      'general information': l.specGroupGeneral,
      'basic features': l.specGroupGeneral,
      'basic information': l.specGroupGeneral,
      'design & dimensions': l.specGroupDesign,
      'design': l.specGroupDesign,
      'dimensions': l.specGroupDesign,
      'dimensions & weight': l.specGroupDimensionsWeight,
      'basic hardware': l.specGroupHardware,
      'hardware': l.specGroupHardware,
      'camera': l.specGroupCamera,
      'battery': l.specGroupBattery,
      'network connections': l.specGroupNetwork,
      'network': l.specGroupNetwork,
      'display': l.specGroupDisplay,
      'display/audio': l.specGroupDisplayAudio,
      'storage': l.specGroupStorage,
      'storage features': l.specGroupStorage,
      'storage & optical drive': l.specGroupStorageOptical,
      'connectivity': l.specGroupConnectivity,
      'software': l.specGroupSoftware,
      'operating system': l.specGroupSoftware,
      'audio': l.specGroupAudio,
      'audio features': l.specGroupAudio,
      'sound': l.specGroupAudio,
      'security': l.specGroupSecurity,
      'performance': l.specGroupPerformance,
      'sensors': l.specGroupSensors,
      'sensor': l.specGroupSensors,
      'features': l.specGroupFeatures,
      'main features': l.specGroupMainFeatures,
      'processor': l.specGroupProcessor,
      'memory': l.specGroupMemory,
      'memory features': l.specGroupMemory,
      'memory (ram) features': l.specGroupMemory,
      'ports & interfaces': l.specGroupPorts,
      'ports': l.specGroupPorts,
      'graphics card': l.specGroupGpu,
      'gpu': l.specGroupGpu,
      'keyboard': l.specGroupKeyboard,
      'other': l.specGroupOther,
      'other information': l.specGroupOtherInfo,
      'weight & dimensions': l.specGroupWeight,
      'weight': l.specGroupWeight,
      'screen': l.specGroupScreen,
      'video': l.specGroupVideo,
      'image': l.specGroupImage,
      'charging': l.specGroupCharging,
      'wireless': l.specGroupWireless,
      'wireless connections': l.specGroupWireless,
      'connections': l.specGroupConnections,
      'connection & interface': l.specGroupConnectionInterface,
      'connections & interfaces': l.specGroupConnectionInterface,
      'body': l.specGroupBody,
      'multimedia': l.specGroupMultimedia,
      'multimedia features': l.specGroupMultimedia,
      'power': l.specGroupPower,
      'power and connections': l.specGroupPowerConnections,
      'input/output': l.specGroupInputOutput,
      'input / output': l.specGroupInputOutput,
      'communications': l.specGroupCommunications,
      'expansion': l.specGroupExpansion,
      'expansion slots': l.specGroupExpansion,
      'optics': l.specGroupOptics,
      'lens': l.specGroupOptics,
      'durability': l.specGroupDurability,
      'physical durability': l.specGroupDurability,
      'recording': l.specGroupRecording,
      'focus': l.specGroupFocus,
      'autofocus': l.specGroupFocus,
      'flash': l.specGroupFlash,
      'exposure': l.specGroupExposureShooting,
      'exposure & shooting': l.specGroupExposureShooting,
      'energy and design': l.specGroupEnergyDesign,
      'hardware/software': l.specGroupHardwareSoftware,
      'receivers': l.specGroupReceivers,
      'cooling features': l.specGroupCooling,
      'technological infrastructure': l.specGroupTechInfra,
      'technical information': l.specGroupTechnical,
      'rear connections': l.specGroupRearConnections,
      'other connections': l.specGroupOtherConnections,
      // Additional Firestore groups
      'connections and slots': l.specGroupConnectionsSlots,
      'design and dimensions': l.specGroupDesign,
      'design & function': l.specGroupDesignFunction,
      'document & other': l.specGroupDocOther,
      'fan features': l.specGroupFan,
      'hardware/software features': l.specGroupHardwareSoftware,
      'image/sound features': l.specGroupImageSound,
      'memory & storage': l.specGroupMemoryStorage,
      'pump features': l.specGroupPump,
      'power and storage features': l.specGroupPowerStorage,
      'video and lens': l.specGroupVideoLens,
      'documentation': l.specGroupDocumentation,
    };
    final locale = Localizations.localeOf(context).languageCode;
    final svc = SpecTranslationService.instance;
    final canonicalKey = svc.isLoaded ? svc.canonicalizeToEnglish(k) : k;
    final groupExact = map[k] ?? map[canonicalKey];
    if (groupExact != null) return groupExact;
    if (svc.isLoaded) {
      final translated = svc.translateLabelForLocale(key, locale);
      if (translated.toLowerCase() != canonicalKey.toLowerCase()) {
        return translated;
      }
    }
    if (locale != 'en') {
      final translated = spec_dict.translateSpec(canonicalKey, locale);
      if (translated.toLowerCase() != canonicalKey.toLowerCase()) {
        return translated;
      }
    }
    return _formatKey(canonicalKey);
  }

  // ignore: unused_element
  String _localizedSpecName(BuildContext context, String key) {
    final l = context.l10n;
    if (l == null) return _formatKey(key);
    final k = key.toLowerCase().replaceAll('_', ' ').trim();
    final map = <String, String>{
      'screen resolution': l.specResolution,
      'screen aspect ratio': l.specResolution,
      'display size': l.specDisplaySize,
      'screen size': l.specScreenSize,
      'display type': l.specDisplayType,
      'screen technology': l.specScreenTechnology,
      'weight': l.specWeight,
      'height': l.specHeight,
      'width': l.specWidth,
      'depth': l.specThickness,
      'thickness': l.specThickness,
      'dimensions': l.specDimensions,
      'processor': l.specProcessor,
      'processor speed': l.specClockSpeed,
      'processor type': l.specProcessor,
      'cpu': l.specCpu,
      'ram': l.specRam,
      'ram capacity': l.specRam,
      'ram type': l.specMemoryType,
      'memory type': l.specMemoryType,
      'memory speed': l.specMemorySpeed,
      'memory bus': l.specMemoryBus,
      'internal storage': l.specInternalStorage,
      'storage': l.specStorage,
      'storage capacity': l.specStorage,
      'storage type': l.specStorageType,
      'expandable storage': l.specExpandableStorage,
      'battery capacity': l.specBatteryCapacity,
      'battery life': l.specBatteryLife,
      'charging speed': l.specChargingSpeed,
      'operating system': l.specOperatingSystem,
      'os': l.specOs,
      'bluetooth': l.specBluetooth,
      'wifi': l.specWifi,
      'wi-fi': l.specWifi,
      'nfc': l.specNfc,
      'usb': l.specUsb,
      'usb type': l.specUsb,
      'hdmi': l.specPorts,
      'color': l.specColor,
      'colors': l.specColors,
      'material': l.specFormFactor,
      'refresh rate': l.specRefreshRate,
      'panel type': l.specPanelType,
      'brightness': l.specBrightness,
      'contrast ratio': l.specContrastRatio,
      'resolution': l.specResolution,
      'max resolution': l.specMaxResolution,
      'camera': l.specMainCamera,
      'front camera': l.specFrontCamera,
      'rear camera': l.specRearCamera,
      'main camera': l.specMainCamera,
      'video resolution': l.specVideoRecording,
      'video recording': l.specVideoRecording,
      'sim card': l.specSim,
      'sim': l.specSim,
      'sim type': l.specSim,
      'dual sim': l.specDualSim,
      'fingerprint': l.specFingerprintSensor,
      'fingerprint sensor': l.specFingerprintSensor,
      'face recognition': l.specFaceRecognition,
      'water resistance': l.specWaterResistance,
      'ip rating': l.specIpRating,
      'wireless charging': l.specWirelessCharging,
      'fast charging': l.specChargingSpeed,
      'displayport': l.specPorts,
      'number of cores': l.specCores,
      'cores': l.specCores,
      'core count': l.specCores,
      'threads': l.specThreads,
      'thread count': l.specThreads,
      'base clock': l.specBaseClock,
      'boost clock': l.specBoostClock,
      'tdp': l.specTdp,
      'cache': l.specCache,
      'architecture': l.specArchitecture,
      'process': l.specProcess,
      'vram': l.specVram,
      'clock speed': l.specClockSpeed,
      'cuda cores': l.specCudaCores,
      'stream processors': l.specStreamProcessors,
      'power supply': l.specPowerSupply,
      'wattage': l.specPowerSupply,
      'noise level': l.specNoiseLevel,
      'response time': l.specResponseTime,
      'hdr': l.specHdr,
      'color gamut': l.specColorGamut,
      'speaker': l.specSpeaker,
      'microphone': l.specMicrophone,
      'microphone type': l.specMicrophoneType,
      'headphone jack': l.specHeadphoneJack,
      'driver size': l.specDriverSize,
      'impedance': l.specImpedance,
      'frequency response': l.specFrequencyResponse,
      'active noise cancellation': l.specActiveNoiseCancellation,
      'wireless range': l.specWirelessRange,
      'connectivity': l.specConnectivity,
      'connection type': l.specConnectionType,
      'warranty': l.specWarranty,
      'model': l.specModel,
      'brand': l.specBrand,
      'series': l.specSeries,
      'release date': l.specReleaseDate,
      'year': l.specYear,
      'release year': l.specYear,
      'gpu': l.specGpu,
      'graphics': l.specGraphics,
      'touchscreen': l.specTouchscreen,
      'keyboard': l.specKeyboard,
      'trackpad': l.specTrackpad,
      'webcam': l.specWebcam,
      'sensor': l.specSensor,
      'smart assistant': l.specSmartAssistant,
      'gps': l.specGps,
      'accelerometer': l.specAccelerometer,
      'gyroscope': l.specGyroscope,
      'barometer': l.specBarometer,
      'compass': l.specCompass,
      'proximity': l.specProximity,
      'network': l.specNetwork,
      'band': l.specBand,
      'form factor': l.specFormFactor,
      'ports': l.specPorts,
      'wireless': l.specWireless,
    };
    final locale = Localizations.localeOf(context).languageCode;
    final svc = SpecTranslationService.instance;
    final canonicalKey = svc.isLoaded ? svc.canonicalizeToEnglish(k) : k;
    final specExact = map[k] ?? map[canonicalKey];
    if (specExact != null) return _sentenceCaseLocalized(specExact);
    if (svc.isLoaded) {
      final translated = svc.translateLabelForLocale(key, locale);
      if (translated.toLowerCase() != canonicalKey.toLowerCase()) {
        return _sentenceCaseLocalized(translated);
      }
    }
    if (locale != 'en') {
      final translated = spec_dict.translateSpec(canonicalKey, locale);
      if (translated.toLowerCase() != canonicalKey.toLowerCase()) {
        return _sentenceCaseLocalized(translated);
      }
    }
    return _sentenceCaseLocalized(_formatKey(canonicalKey));
  }

  /// Translate spec values (colors, materials, booleans, etc.)
  String _localizedSpecValue(BuildContext context, String val) {
    if (val.isEmpty || val == '—') return val;
    final locale = Localizations.localeOf(context).languageCode;
    final svc = SpecTranslationService.instance;
    final canonicalValue = svc.isLoaded ? svc.canonicalizeToEnglish(val) : val;
    final canonicalLower = canonicalValue.trim().toLowerCase();
    if (locale == 'en') {
      // Canlı TR→EN sözlüğü (78k terim) asset canonical'ın kaçırdığı
      // "Dahili Hoparlör", "İvme Ölçer", "Jiroskop" gibi değerleri yakalar;
      // boş dönerse asset canonical'a düşer. Türkçe sızıntısını giderir.
      if (svc.isLoaded) {
        final live = svc.translateValueForLocale(val, 'en').trim();
        if (live.isNotEmpty) return _sentenceCaseLocalized(live);
      }
      return _sentenceCaseLocalized(canonicalValue);
    }
    // Boolean/status shortcuts
    final l = context.l10n;
    if (l != null) {
      if (canonicalLower == 'yes' || canonicalLower == 'true') {
        return _sentenceCaseLocalized(l.specValYes);
      }
      if (canonicalLower == 'no' ||
          canonicalLower == 'no.' ||
          canonicalLower == 'false') {
        return _sentenceCaseLocalized(l.specValNo);
      }
      if (canonicalLower == 'available') {
        return _sentenceCaseLocalized(l.specValAvailable);
      }
      if (canonicalLower == 'not available' || canonicalLower == 'n/a') {
        return _sentenceCaseLocalized(l.specValNotAvailable);
      }
    }
    if (svc.isLoaded) {
      final translated = svc.translateValueForLocale(val, locale);
      if (translated.toLowerCase() != canonicalLower) {
        return _sentenceCaseLocalized(translated);
      }
    }
    final translated = spec_dict.translateSpecValue(canonicalValue, locale);
    if (translated != canonicalValue) return _sentenceCaseLocalized(translated);
    return _sentenceCaseLocalized(canonicalValue);
  }

  void _showSpecValueBottomSheet({
    required String specName,
    required String fullValue,
  }) {
    HapticFeedback.lightImpact();
    showGeneralDialog<void>(
      context: context,
      barrierDismissible: true,
      barrierLabel: MaterialLocalizations.of(context).modalBarrierDismissLabel,
      barrierColor: Colors.black.withValues(alpha: 0.56),
      useRootNavigator: true,
      transitionDuration: const Duration(milliseconds: 180),
      pageBuilder: (ctx, animation, secondaryAnimation) {
        final isDark = Theme.of(ctx).brightness == Brightness.dark;
        final bgColor = isDark
            ? const Color(0xFF121826)
            : const Color(0xFFFDFEFF);
        final textColor = isDark ? Colors.white : const Color(0xFF0F172A);
        final valueLines = _formatSpecValueLinesForSheet(fullValue);
        final formattedValue = valueLines.join('\n');
        void closeSheet() => Navigator.of(ctx, rootNavigator: true).pop();
        return SafeArea(
          top: false,
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: closeSheet,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 18),
              child: Align(
                alignment: Alignment.bottomCenter,
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 480),
                  child: GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: () {},
                    child: Material(
                      color: bgColor,
                      borderRadius: BorderRadius.circular(24),
                      child: Container(
                        decoration: BoxDecoration(
                          color: bgColor,
                          borderRadius: BorderRadius.circular(24),
                          border: Border.all(
                            color: AppTheme.brandBlue.withValues(
                              alpha: isDark ? 0.22 : 0.10,
                            ),
                          ),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withValues(
                                alpha: isDark ? 0.32 : 0.10,
                              ),
                              blurRadius: 22,
                              offset: const Offset(0, 10),
                            ),
                          ],
                        ),
                        child: Padding(
                          padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Center(
                                child: Container(
                                  width: 34,
                                  height: 4,
                                  margin: const EdgeInsets.only(bottom: 12),
                                  decoration: BoxDecoration(
                                    color: textColor.withValues(alpha: 0.14),
                                    borderRadius: BorderRadius.circular(99),
                                  ),
                                ),
                              ),
                              Row(
                                children: [
                                  Container(
                                    width: 36,
                                    height: 36,
                                    decoration: BoxDecoration(
                                      color: AppTheme.brandBlue.withValues(
                                        alpha: isDark ? 0.18 : 0.08,
                                      ),
                                      borderRadius: BorderRadius.circular(12),
                                    ),
                                    child: Icon(
                                      Icons.tune_rounded,
                                      size: 18,
                                      color: AppTheme.brandBlue,
                                    ),
                                  ),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          _isTr
                                              ? 'Ozellik degeri'
                                              : 'Specification value',
                                          style: GoogleFonts.plusJakartaSans(
                                            fontSize: 10,
                                            fontWeight: FontWeight.w700,
                                            color: textColor.withValues(
                                              alpha: 0.55,
                                            ),
                                            letterSpacing: 0.2,
                                          ),
                                        ),
                                        const SizedBox(height: 2),
                                        Text(
                                          specName,
                                          maxLines: 2,
                                          overflow: TextOverflow.ellipsis,
                                          style: GoogleFonts.plusJakartaSans(
                                            fontSize: 13.2,
                                            fontWeight: FontWeight.w800,
                                            color: textColor,
                                            height: 1.18,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  IconButton(
                                    icon: Icon(
                                      Icons.close_rounded,
                                      color: textColor.withValues(alpha: 0.48),
                                      size: 19,
                                    ),
                                    onPressed: closeSheet,
                                    padding: EdgeInsets.zero,
                                    constraints: const BoxConstraints(
                                      minWidth: 28,
                                      minHeight: 28,
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 14),
                              Container(
                                width: double.infinity,
                                constraints: BoxConstraints(
                                  maxHeight:
                                      MediaQuery.sizeOf(ctx).height * 0.48,
                                ),
                                padding: const EdgeInsets.fromLTRB(
                                  12,
                                  10,
                                  12,
                                  10,
                                ),
                                decoration: BoxDecoration(
                                  color: isDark
                                      ? Colors.white.withValues(alpha: 0.04)
                                      : const Color(0xFFF5F9FD),
                                  borderRadius: BorderRadius.circular(18),
                                  border: Border.all(
                                    color: AppTheme.brandBlue.withValues(
                                      alpha: isDark ? 0.16 : 0.08,
                                    ),
                                  ),
                                ),
                                child: SingleChildScrollView(
                                  physics: const BouncingScrollPhysics(),
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      for (final line in valueLines)
                                        Padding(
                                          padding: const EdgeInsets.symmetric(
                                            vertical: 2,
                                          ),
                                          child: Row(
                                            crossAxisAlignment:
                                                CrossAxisAlignment.start,
                                            children: [
                                              Padding(
                                                padding: const EdgeInsets.only(
                                                  top: 6,
                                                ),
                                                child: Container(
                                                  width: 3.5,
                                                  height: 3.5,
                                                  decoration: BoxDecoration(
                                                    color: AppTheme.brandCyan,
                                                    borderRadius:
                                                        BorderRadius.circular(
                                                          99,
                                                        ),
                                                  ),
                                                ),
                                              ),
                                              const SizedBox(width: 8),
                                              Expanded(
                                                child: SelectableText(
                                                  line,
                                                  style:
                                                      GoogleFonts.plusJakartaSans(
                                                        fontSize: 12,
                                                        fontWeight:
                                                            FontWeight.w600,
                                                        color: textColor,
                                                        height: 1.28,
                                                      ),
                                                ),
                                              ),
                                            ],
                                          ),
                                        ),
                                    ],
                                  ),
                                ),
                              ),
                              const SizedBox(height: 12),
                              Align(
                                alignment: Alignment.centerRight,
                                child: TextButton.icon(
                                  onPressed: () {
                                    Clipboard.setData(
                                      ClipboardData(text: formattedValue),
                                    );
                                    closeSheet();
                                    ScaffoldMessenger.of(context).showSnackBar(
                                      SnackBar(
                                        content: Text(
                                          _isTr ? 'Kopyalandi' : 'Copied',
                                          style: GoogleFonts.plusJakartaSans(
                                            fontSize: 13,
                                          ),
                                        ),
                                        duration: const Duration(seconds: 1),
                                        behavior: SnackBarBehavior.floating,
                                        backgroundColor: const Color(
                                          0xFF0F172A,
                                        ),
                                        shape: RoundedRectangleBorder(
                                          borderRadius: BorderRadius.circular(
                                            14,
                                          ),
                                        ),
                                      ),
                                    );
                                  },
                                  icon: const Icon(
                                    Icons.copy_rounded,
                                    size: 16,
                                  ),
                                  label: Text(
                                    _isTr ? 'Kopyala' : 'Copy',
                                    style: GoogleFonts.plusJakartaSans(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                  style: TextButton.styleFrom(
                                    foregroundColor: AppTheme.brandBlue,
                                    backgroundColor: AppTheme.brandBlue
                                        .withValues(
                                          alpha: isDark ? 0.18 : 0.08,
                                        ),
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 12,
                                      vertical: 10,
                                    ),
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(12),
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        );
      },
    );
  }

  /// The value received here is already pre-formatted by [_buildSpecSheetValue]
  /// (each feature on its own line separated by \n).  We just normalize bullet
  /// chars and strip leading dashes so the display is clean.
  List<String> _formatSpecValueLinesForSheet(String value) {
    if (value.isEmpty) return const [];
    final withNatural = value
        .replaceAll('\r', '\n')
        .replaceAll('•', '\n')
        .replaceAll('·', '\n')
        .replaceAll('|', '\n');
    return withNatural
        .split('\n')
        .map((s) => s.replaceFirst(RegExp(r'^[-•·\s]+'), '').trim())
        .where((s) => s.isNotEmpty)
        .toList();
  }

  /// Splits [value] at commas/semicolons, but:
  /// - skips commas inside parentheses depth > 0
  /// - skips commas between two digit characters (e.g. 2,000)
  // ignore: unused_element
  List<String> _smartSplitSpecValue(String value) {
    final result = <String>[];
    final current = StringBuffer();
    int parenDepth = 0;

    for (int i = 0; i < value.length; i++) {
      final ch = value[i];
      if (ch == '(') {
        parenDepth++;
        current.write(ch);
      } else if (ch == ')') {
        if (parenDepth > 0) parenDepth--;
        current.write(ch);
      } else if ((ch == ',' || ch == ';') && parenDepth == 0) {
        final before = i > 0 ? value[i - 1] : '';
        final after = i + 1 < value.length ? value[i + 1] : '';
        final isNumericComma =
            ch == ',' &&
            before.isNotEmpty &&
            after.isNotEmpty &&
            before.codeUnitAt(0) >= 48 &&
            before.codeUnitAt(0) <= 57 &&
            after.codeUnitAt(0) >= 48 &&
            after.codeUnitAt(0) <= 57;
        if (isNumericComma) {
          current.write(ch);
        } else {
          final part = current.toString().trim();
          if (part.isNotEmpty) result.add(part);
          current.clear();
          if (i + 1 < value.length && value[i + 1] == ' ') i++;
        }
      } else {
        current.write(ch);
      }
    }

    final last = current.toString().trim();
    if (last.isNotEmpty) result.add(last);
    return result;
  }

  /// Returns the index of the "better" value for a given spec.
  /// Uses SpecDirectionService (with component rankings + Firestore overrides).
  /// -1 if values are equal or undecidable.
  // ignore: unused_element
  int _findBetterIndex(String key, List<String> values) {
    final serviceAsync = ref.read(specDirectionServiceProvider);
    final service = serviceAsync.valueOrNull;
    if (service != null) {
      return service.findBetterIndex(key, values);
    }
    // Fallback while service loads: basic boolean check only
    if (values.length < 2 || values.any((v) => v == '—')) return -1;
    final lowers = values.map((v) => v.toLowerCase()).toList();
    final allBool = lowers.every(
      (v) =>
          v.contains('yes') ||
          v.contains('no') ||
          v.startsWith('✓') ||
          v.startsWith('✗'),
    );
    if (allBool) {
      final idx = lowers.indexWhere(
        (v) => v.contains('yes') || v.startsWith('✓'),
      );
      final hasNo = lowers.any((v) => v.contains('no') || v.startsWith('✗'));
      if (idx >= 0 && hasNo) return idx;
    }
    return -1;
  }

  Color _aiScoreColor(double score) {
    if (score >= 80) return AppTheme.scoreExcellent;
    if (score >= 60) return AppTheme.scoreAverage;
    if (score >= 40) return AppTheme.orange500;
    return AppTheme.error;
  }

  Widget _buildAiError(VoidCallback onRetry, {String? errorMsg}) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.error_outline_rounded,
              size: 48,
              color: AppTheme.error.withValues(alpha: 0.6),
            ),
            const SizedBox(height: 12),
            Text(
              _isTr ? 'Analiz başarısız' : 'Analysis failed',
              style: GoogleFonts.plusJakartaSans(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: context.textSecondary,
              ),
            ),
            if (errorMsg != null && errorMsg.isNotEmpty) ...[
              const SizedBox(height: 6),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Text(
                  errorMsg.length > 120 ? errorMsg.substring(0, 120) : errorMsg,
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 10,
                    color: context.textTertiaryColor,
                  ),
                  textAlign: TextAlign.center,
                ),
              ),
            ],
            const SizedBox(height: 12),
            GestureDetector(
              onTap: onRetry,
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 20,
                  vertical: 10,
                ),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [AppTheme.amber500, Color(0xFFF59E0B)],
                  ),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  _isTr ? 'Tekrar Dene' : 'Try Again',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: Colors.white,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ─── Structured Visual Builders for Premium AI Sections ───

  Widget _buildDeepAnalysisVisual() {
    final data = _deepAnalysisStructured!;
    final winner = data['winner'] as String?;
    final products = data['products'] as Map<String, dynamic>? ?? {};
    final categories = data['categories'] as Map<String, dynamic>? ?? {};
    final recommendation =
        data['recommendation'] as String? ?? data['verdict'] as String?;
    final productNames = widget.products.map((p) => p.name).toList();
    final productCount = productNames.length;
    final barColors = [
      const Color(0xFF6366F1),
      const Color(0xFFEC4899),
      const Color(0xFF06B6D4),
      const Color(0xFFF59E0B),
      const Color(0xFF10B981),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Winner badge — compact
        if (winner != null)
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 14),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [
                  const Color(0xFFFFD700).withValues(alpha: 0.15),
                  const Color(0xFFFFA500).withValues(alpha: 0.08),
                ],
              ),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: const Color(0xFFFFD700).withValues(alpha: 0.4),
                width: 1.5,
              ),
            ),
            child: Row(
              children: [
                const Text('🏆', style: TextStyle(fontSize: 20)),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    winner,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 13,
                      fontWeight: FontWeight.w800,
                      color: context.textPrimary,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
          ),

        // Per-product columns — side by side like Specs tab
        if (products.isNotEmpty) ...[
          const SizedBox(height: 12),
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: List.generate(productCount, (i) {
                final pName = productNames[i];
                // Find matching product data
                Map<String, dynamic> pData = {};
                for (final e in products.entries) {
                  if (e.key.toLowerCase().contains(
                        pName.toLowerCase().split(' ').take(3).join(' '),
                      ) ||
                      pName.toLowerCase().contains(
                        e.key.toLowerCase().split(' ').take(3).join(' '),
                      )) {
                    pData = e.value as Map<String, dynamic>? ?? {};
                    break;
                  }
                }
                if (pData.isEmpty && i < products.length) {
                  pData =
                      products.values.elementAt(i) as Map<String, dynamic>? ??
                      {};
                }
                final score = (pData['score'] as num?)?.toDouble() ?? 0;
                final strengths = List<String>.from(pData['strengths'] ?? []);
                final weaknesses = List<String>.from(pData['weaknesses'] ?? []);
                final bestFor = pData['best_for'] as String? ?? '';
                final color = barColors[i % barColors.length];

                return Expanded(
                  child: GestureDetector(
                    onTap: () => _showProductDetailOverlay(
                      productName: pName,
                      score: score,
                      strengths: strengths,
                      weaknesses: weaknesses,
                      bestFor: bestFor,
                      color: color,
                    ),
                    child: Container(
                      margin: EdgeInsets.only(
                        left: i == 0 ? 0 : 3,
                        right: i == productCount - 1 ? 0 : 3,
                      ),
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: context.surfaceElevatedColor,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: color.withValues(alpha: 0.2)),
                      ),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              // Score circle
                              Container(
                                width: 38,
                                height: 38,
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  gradient: LinearGradient(
                                    colors: [
                                      _aiScoreColor(
                                        score,
                                      ).withValues(alpha: 0.7),
                                      _aiScoreColor(score),
                                    ],
                                  ),
                                ),
                                child: Center(
                                  child: Text(
                                    '${score.toInt()}',
                                    style: GoogleFonts.plusJakartaSans(
                                      fontSize: 13,
                                      fontWeight: FontWeight.w900,
                                      color: Colors.white,
                                    ),
                                  ),
                                ),
                              ),
                              const SizedBox(height: 6),
                              // Product name — short
                              Text(
                                pName.length > (productCount > 2 ? 20 : 30)
                                    ? '${pName.substring(0, productCount > 2 ? 18 : 28)}…'
                                    : pName,
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: productCount > 3
                                      ? 8
                                      : (productCount > 2 ? 9 : 10),
                                  fontWeight: FontWeight.w700,
                                  color: context.textPrimary,
                                ),
                                textAlign: TextAlign.center,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ],
                          ),
                          Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const SizedBox(height: 6),
                              // Quick info
                              if (strengths.isNotEmpty)
                                Text(
                                  '✅ ${strengths.first}',
                                  style: GoogleFonts.plusJakartaSans(
                                    fontSize: 8,
                                    color: context.textSecondary,
                                  ),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  textAlign: TextAlign.center,
                                ),
                              const SizedBox(height: 6),
                              // Detail button
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 8,
                                  vertical: 4,
                                ),
                                decoration: BoxDecoration(
                                  color: color.withValues(alpha: 0.12),
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: Text(
                                  _isTr ? 'Detay' : 'Detail',
                                  style: GoogleFonts.plusJakartaSans(
                                    fontSize: 9,
                                    fontWeight: FontWeight.w700,
                                    color: color,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                );
              }),
            ),
          ),
        ],

        // Category comparison — compact preview + full screen button
        if (categories.isNotEmpty) ...[
          const SizedBox(height: 14),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: context.surfaceElevatedColor,
              borderRadius: BorderRadius.circular(14),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _isTr
                      ? '📊 Kategori Karşılaştırması'
                      : '📊 Category Comparison',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: context.textPrimary,
                  ),
                ),
                const SizedBox(height: 10),
                // Per-product scores per category
                ...categories.entries.take(5).map((cat) {
                  final catData = cat.value;
                  Map<String, dynamic> scores = {};
                  if (catData is Map<String, dynamic>) {
                    if (catData.containsKey('scores')) {
                      scores = Map<String, dynamic>.from(
                        catData['scores'] as Map,
                      );
                    } else {
                      scores = Map.fromEntries(
                        catData.entries.where((e) => e.value is num),
                      );
                    }
                  }
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Text(
                              '${_categoryIcon(cat.key)} ',
                              style: const TextStyle(fontSize: 13),
                            ),
                            Text(
                              cat.key,
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
                                color: context.textPrimary,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 5),
                        Row(
                          children: List.generate(productNames.length, (i) {
                            final pName = productNames[i];
                            double? score;
                            // Primary: name-based matching (first 3 words)
                            for (final se in scores.entries) {
                              final seKey = se.key
                                  .toLowerCase()
                                  .split(' ')
                                  .take(3)
                                  .join(' ');
                              final pKey = pName
                                  .toLowerCase()
                                  .split(' ')
                                  .take(3)
                                  .join(' ');
                              if (pKey.contains(seKey) ||
                                  seKey.contains(pKey) ||
                                  pName.toLowerCase().contains(seKey) ||
                                  se.key.toLowerCase().contains(pKey)) {
                                score = (se.value as num).toDouble();
                                break;
                              }
                            }
                            // Fallback: positional — only when score count matches product count
                            if (score == null &&
                                scores.values.length == productNames.length) {
                              score = (scores.values.elementAt(i) as num)
                                  .toDouble();
                            }
                            // Last resort: positional if available
                            if (score == null && i < scores.values.length) {
                              score = (scores.values.elementAt(i) as num)
                                  .toDouble();
                            }
                            final scoreVal = score ?? 0;
                            final col = barColors[i % barColors.length];
                            final shortName = pName
                                .split(' ')
                                .take(2)
                                .join(' ');
                            return Expanded(
                              child: Container(
                                margin: EdgeInsets.only(left: i == 0 ? 0 : 4),
                                padding: const EdgeInsets.symmetric(
                                  vertical: 6,
                                  horizontal: 4,
                                ),
                                decoration: BoxDecoration(
                                  color: col.withValues(alpha: 0.1),
                                  borderRadius: BorderRadius.circular(8),
                                  border: Border.all(
                                    color: col.withValues(alpha: 0.2),
                                  ),
                                ),
                                child: Column(
                                  children: [
                                    Text(
                                      '${scoreVal.toInt()}',
                                      style: GoogleFonts.plusJakartaSans(
                                        fontSize: 13,
                                        fontWeight: FontWeight.w900,
                                        color: col,
                                      ),
                                    ),
                                    const SizedBox(height: 2),
                                    Text(
                                      shortName,
                                      style: GoogleFonts.plusJakartaSans(
                                        fontSize: 8,
                                        color: context.textTertiaryColor,
                                      ),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      textAlign: TextAlign.center,
                                    ),
                                  ],
                                ),
                              ),
                            );
                          }),
                        ),
                      ],
                    ),
                  );
                }),
                const SizedBox(height: 10),
                // Full screen chart button
                GestureDetector(
                  onTap: () =>
                      _showFullScreenChart(categories, productNames, barColors),
                  child: Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: [
                          AppTheme.brandBlue.withValues(alpha: 0.15),
                          AppTheme.brandSkyBlue.withValues(alpha: 0.10),
                        ],
                      ),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: AppTheme.brandBlue.withValues(alpha: 0.3),
                      ),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          Icons.bar_chart_rounded,
                          size: 20,
                          color: AppTheme.brandBlue,
                        ),
                        const SizedBox(width: 8),
                        Text(
                          _isTr ? 'Tam Grafiği Gör' : 'Full Chart',
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: AppTheme.brandBlue,
                          ),
                        ),
                        const SizedBox(width: 4),
                        Icon(
                          Icons.open_in_full_rounded,
                          size: 14,
                          color: AppTheme.brandBlue,
                        ),
                      ],
                    ),
                  ),
                ),
                // Expandable explanations per category
                const SizedBox(height: 12),
                ...categories.entries.map((cat) {
                  final catData = cat.value;
                  String? explanation;
                  if (catData is Map<String, dynamic>) {
                    explanation = catData['explanation'] as String?;
                  }
                  if (explanation == null) return const SizedBox.shrink();
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 4),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${_categoryIcon(cat.key)} ',
                          style: const TextStyle(fontSize: 12),
                        ),
                        Expanded(
                          child: RichText(
                            text: TextSpan(
                              children: [
                                TextSpan(
                                  text: '${cat.key}: ',
                                  style: GoogleFonts.plusJakartaSans(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w700,
                                    color: context.textPrimary,
                                  ),
                                ),
                                TextSpan(
                                  text: explanation,
                                  style: GoogleFonts.plusJakartaSans(
                                    fontSize: 11,
                                    color: context.textSecondary,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                  );
                }),
              ],
            ),
          ),
        ],
        // Recommendation
        if (recommendation != null) ...[
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [
                  AppTheme.brandBlue.withValues(alpha: 0.08),
                  AppTheme.brandSkyBlue.withValues(alpha: 0.06),
                ],
              ),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('💡', style: TextStyle(fontSize: 14)),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    recommendation,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 12,
                      height: 1.5,
                      color: context.textPrimary,
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

  void _showMatchDetailOverlay({
    required String productName,
    required double matchScore,
    required String reason,
    required Color color,
    List<String> topMatchFactors = const [],
    List<String> missingFactors = const [],
  }) {
    final matchColor = matchScore >= 80
        ? AppTheme.scoreExcellent
        : matchScore >= 60
        ? AppTheme.scoreAverage
        : AppTheme.error;
    final matchLabel = matchScore >= 80
        ? (_isTr ? 'Mükemmel Uyum' : 'Excellent Match')
        : matchScore >= 60
        ? (_isTr ? 'İyi Uyum' : 'Good Match')
        : (_isTr ? 'Düşük Uyum' : 'Low Match');

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => DraggableScrollableSheet(
        initialChildSize: 0.65,
        minChildSize: 0.4,
        maxChildSize: 0.9,
        builder: (_, scrollController) => Container(
          decoration: BoxDecoration(
            color: Theme.of(ctx).scaffoldBackgroundColor,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.25),
                blurRadius: 24,
                spreadRadius: 2,
              ),
            ],
          ),
          child: Column(
            children: [
              // Handle bar + close
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 8, 0),
                child: Row(
                  children: [
                    Expanded(
                      child: Center(
                        child: Container(
                          width: 44,
                          height: 5,
                          decoration: BoxDecoration(
                            color: Theme.of(
                              ctx,
                            ).dividerColor.withValues(alpha: 0.4),
                            borderRadius: BorderRadius.circular(3),
                          ),
                        ),
                      ),
                    ),
                    Material(
                      color: Colors.transparent,
                      child: InkWell(
                        borderRadius: BorderRadius.circular(20),
                        onTap: () => Navigator.of(ctx).pop(),
                        child: Padding(
                          padding: const EdgeInsets.all(8),
                          child: Icon(
                            Icons.close_rounded,
                            size: 22,
                            color: Theme.of(
                              ctx,
                            ).colorScheme.onSurface.withValues(alpha: 0.5),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: ListView(
                  controller: scrollController,
                  padding: const EdgeInsets.fromLTRB(24, 16, 24, 36),
                  children: [
                    // Score hero + product name
                    Container(
                      padding: const EdgeInsets.all(20),
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          colors: [
                            matchColor.withValues(alpha: 0.12),
                            matchColor.withValues(alpha: 0.04),
                          ],
                        ),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(
                          color: matchColor.withValues(alpha: 0.2),
                        ),
                      ),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.center,
                        children: [
                          TweenAnimationBuilder<double>(
                            tween: Tween(begin: 0, end: matchScore / 100),
                            duration: const Duration(milliseconds: 1000),
                            curve: Curves.easeOutCubic,
                            builder: (_, value, _) => _buildMatchScoreRing(
                              progress: value,
                              color: matchColor,
                              size: 80,
                              strokeWidth: 7,
                              fontSize: 20,
                            ),
                          ),
                          const SizedBox(width: 16),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 8,
                                    vertical: 3,
                                  ),
                                  decoration: BoxDecoration(
                                    color: matchColor.withValues(alpha: 0.15),
                                    borderRadius: BorderRadius.circular(8),
                                  ),
                                  child: Text(
                                    matchLabel,
                                    style: GoogleFonts.plusJakartaSans(
                                      fontSize: 10,
                                      fontWeight: FontWeight.w700,
                                      color: matchColor,
                                      letterSpacing: 0.3,
                                    ),
                                  ),
                                ),
                                const SizedBox(height: 8),
                                Text(
                                  productName,
                                  style: GoogleFonts.plusJakartaSans(
                                    fontSize: 15,
                                    fontWeight: FontWeight.w800,
                                    color: Theme.of(ctx).colorScheme.onSurface,
                                  ),
                                  maxLines: 3,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),

                    // Reason / why this score
                    if (reason.isNotEmpty) ...[
                      const SizedBox(height: 20),
                      Text(
                        _isTr ? 'Neden Bu Puan?' : 'Why This Score?',
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 15,
                          fontWeight: FontWeight.w800,
                          color: Theme.of(ctx).colorScheme.onSurface,
                        ),
                      ),
                      const SizedBox(height: 10),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: matchColor.withValues(alpha: 0.06),
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(
                            color: matchColor.withValues(alpha: 0.12),
                          ),
                        ),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Icon(
                              Icons.auto_awesome_rounded,
                              size: 16,
                              color: matchColor.withValues(alpha: 0.8),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text(
                                reason,
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 13,
                                  color: Theme.of(ctx).colorScheme.onSurface,
                                  height: 1.6,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],

                    // Güçlü Yönler (topMatchFactors)
                    if (topMatchFactors.isNotEmpty) ...[
                      const SizedBox(height: 20),
                      Text(
                        _isTr ? 'Uyumluluk Noktaları' : 'Compatibility Points',
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 15,
                          fontWeight: FontWeight.w800,
                          color: Theme.of(ctx).colorScheme.onSurface,
                        ),
                      ),
                      const SizedBox(height: 10),
                      ...topMatchFactors.map(
                        (factor) => Container(
                          margin: const EdgeInsets.only(bottom: 8),
                          padding: const EdgeInsets.symmetric(
                            horizontal: 14,
                            vertical: 12,
                          ),
                          decoration: BoxDecoration(
                            color: AppTheme.scoreExcellent.withValues(
                              alpha: 0.07,
                            ),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(
                              color: AppTheme.scoreExcellent.withValues(
                                alpha: 0.15,
                              ),
                            ),
                          ),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Icon(
                                Icons.check_circle_rounded,
                                size: 16,
                                color: AppTheme.scoreExcellent,
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Text(
                                  factor,
                                  style: GoogleFonts.plusJakartaSans(
                                    fontSize: 13,
                                    color: Theme.of(ctx).colorScheme.onSurface,
                                    height: 1.5,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],

                    // Eksik Noktalar (missingFactors)
                    if (missingFactors.isNotEmpty) ...[
                      const SizedBox(height: 16),
                      Text(
                        _isTr
                            ? 'Dikkat Edilmesi Gerekenler'
                            : 'Points to Consider',
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 15,
                          fontWeight: FontWeight.w800,
                          color: Theme.of(ctx).colorScheme.onSurface,
                        ),
                      ),
                      const SizedBox(height: 10),
                      ...missingFactors.map(
                        (factor) => Container(
                          margin: const EdgeInsets.only(bottom: 8),
                          padding: const EdgeInsets.symmetric(
                            horizontal: 14,
                            vertical: 12,
                          ),
                          decoration: BoxDecoration(
                            color: AppTheme.warning.withValues(alpha: 0.07),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(
                              color: AppTheme.warning.withValues(alpha: 0.2),
                            ),
                          ),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Icon(
                                Icons.warning_amber_rounded,
                                size: 16,
                                color: AppTheme.warning,
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Text(
                                  factor,
                                  style: GoogleFonts.plusJakartaSans(
                                    fontSize: 13,
                                    color: Theme.of(ctx).colorScheme.onSurface,
                                    height: 1.5,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],

                    // Hiç içerik yoksa
                    if (reason.isEmpty && topMatchFactors.isEmpty) ...[
                      const SizedBox(height: 20),
                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: matchColor.withValues(alpha: 0.06),
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: Row(
                          children: [
                            Icon(
                              Icons.info_outline_rounded,
                              size: 18,
                              color: matchColor,
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text(
                                _isTr
                                    ? 'Bu puan, kullanıcı profiliniz ve ürün özellikleri karşılaştırılarak hesaplandı.'
                                    : 'This score was calculated by comparing your profile with the product specifications.',
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 13,
                                  color: Theme.of(ctx).colorScheme.onSurface,
                                  height: 1.5,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showPredictionDetailOverlay({
    required String productName,
    required String trend,
    required double changePercent,
    required String bestTime,
    required bool buyNow,
    required String reason,
    required double confidence,
    required Color color,
  }) {
    final isDropping = trend == 'dropping' || trend == 'down';
    final isRising = trend == 'rising' || trend == 'up';
    final trendIcon = isDropping
        ? Icons.trending_down_rounded
        : isRising
        ? Icons.trending_up_rounded
        : Icons.trending_flat_rounded;
    final trendColor = isDropping
        ? AppTheme.scoreExcellent
        : isRising
        ? AppTheme.error
        : AppTheme.warning;
    final trendLabel = isDropping
        ? (_isTr ? 'Düşüyor' : 'Dropping')
        : isRising
        ? (_isTr ? 'Yükseliyor' : 'Rising')
        : (_isTr ? 'Stabil' : 'Stable');

    String bestTimeLabel;
    Color bestTimeColor;
    if (bestTime == 'now' || buyNow) {
      bestTimeLabel = _isTr ? '✅ Şimdi Uygun Zaman' : '✅ Best Time to Buy';
      bestTimeColor = AppTheme.scoreExcellent;
    } else if (bestTime == 'wait_1_month') {
      bestTimeLabel = _isTr ? '⏳ 1 Ay Bekle' : '⏳ Wait 1 Month';
      bestTimeColor = AppTheme.warning;
    } else if (bestTime == 'wait_3_months') {
      bestTimeLabel = _isTr ? '⏳ 3 Ay Bekle' : '⏳ Wait 3 Months';
      bestTimeColor = AppTheme.orange500;
    } else {
      bestTimeLabel = bestTime.isNotEmpty
          ? '📅 $bestTime'
          : (_isTr ? '📅 Belirsiz' : '📅 Unknown');
      bestTimeColor = AppTheme.warning;
    }

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => DraggableScrollableSheet(
        initialChildSize: 0.55,
        minChildSize: 0.3,
        maxChildSize: 0.8,
        builder: (_, scrollController) => Container(
          decoration: BoxDecoration(
            color: Theme.of(ctx).scaffoldBackgroundColor,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.25),
                blurRadius: 24,
                spreadRadius: 2,
              ),
            ],
          ),
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 8, 0),
                child: Row(
                  children: [
                    Expanded(
                      child: Center(
                        child: Container(
                          width: 44,
                          height: 5,
                          decoration: BoxDecoration(
                            color: Theme.of(
                              ctx,
                            ).dividerColor.withValues(alpha: 0.4),
                            borderRadius: BorderRadius.circular(3),
                          ),
                        ),
                      ),
                    ),
                    Material(
                      color: Colors.transparent,
                      child: InkWell(
                        borderRadius: BorderRadius.circular(20),
                        onTap: () => Navigator.of(ctx).pop(),
                        child: Padding(
                          padding: const EdgeInsets.all(8),
                          child: Icon(
                            Icons.close_rounded,
                            size: 22,
                            color: Theme.of(
                              ctx,
                            ).colorScheme.onSurface.withValues(alpha: 0.5),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: ListView(
                  controller: scrollController,
                  padding: const EdgeInsets.fromLTRB(24, 12, 24, 36),
                  children: [
                    // Product name
                    Text(
                      productName,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                        color: Theme.of(ctx).colorScheme.onSurface,
                      ),
                    ),
                    const SizedBox(height: 14),
                    // Trend + change percent
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: trendColor.withValues(alpha: 0.12),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Icon(trendIcon, color: trendColor, size: 28),
                        ),
                        const SizedBox(width: 14),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              '${changePercent > 0 ? '+' : ''}${changePercent.toStringAsFixed(1)}%',
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 22,
                                fontWeight: FontWeight.w900,
                                color: trendColor,
                              ),
                            ),
                            Text(
                              trendLabel,
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                                color: trendColor,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                    const SizedBox(height: 14),
                    // Best time badge
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(
                        vertical: 10,
                        horizontal: 14,
                      ),
                      decoration: BoxDecoration(
                        color: bestTimeColor.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        bestTimeLabel,
                        textAlign: TextAlign.center,
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: bestTimeColor,
                        ),
                      ),
                    ),
                    // Confidence bar
                    if (confidence > 0) ...[
                      const SizedBox(height: 14),
                      Row(
                        children: [
                          Text(
                            _isTr ? 'Güven' : 'Confidence',
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: Theme.of(
                                ctx,
                              ).colorScheme.onSurface.withValues(alpha: 0.5),
                            ),
                          ),
                          const Spacer(),
                          Text(
                            '${confidence.toInt()}%',
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 12,
                              fontWeight: FontWeight.w800,
                              color: _aiScoreColor(confidence),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(4),
                        child: LinearProgressIndicator(
                          value: confidence / 100,
                          minHeight: 6,
                          backgroundColor: Theme.of(ctx).dividerColor,
                          color: _aiScoreColor(confidence),
                        ),
                      ),
                    ],
                    // Reasoning
                    if (reason.isNotEmpty) ...[
                      const SizedBox(height: 16),
                      Text(
                        _isTr ? 'Açıklama' : 'Explanation',
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 14,
                          fontWeight: FontWeight.w800,
                          color: Theme.of(ctx).colorScheme.onSurface,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        reason,
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 13,
                          color: Theme.of(
                            ctx,
                          ).colorScheme.onSurface.withValues(alpha: 0.8),
                          height: 1.5,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showAdvisorDetailOverlay({
    required String productName,
    required int rating,
    required String idealUser,
    required List<String> matchPoints,
    required List<String> cautionPoints,
    required Color color,
  }) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => DraggableScrollableSheet(
        initialChildSize: 0.6,
        minChildSize: 0.35,
        maxChildSize: 0.85,
        builder: (_, scrollController) => Container(
          decoration: BoxDecoration(
            color: Theme.of(ctx).scaffoldBackgroundColor,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.25),
                blurRadius: 24,
                spreadRadius: 2,
              ),
            ],
          ),
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 8, 0),
                child: Row(
                  children: [
                    Expanded(
                      child: Center(
                        child: Container(
                          width: 44,
                          height: 5,
                          decoration: BoxDecoration(
                            color: Theme.of(
                              ctx,
                            ).dividerColor.withValues(alpha: 0.4),
                            borderRadius: BorderRadius.circular(3),
                          ),
                        ),
                      ),
                    ),
                    Material(
                      color: Colors.transparent,
                      child: InkWell(
                        borderRadius: BorderRadius.circular(20),
                        onTap: () => Navigator.of(ctx).pop(),
                        child: Padding(
                          padding: const EdgeInsets.all(8),
                          child: Icon(
                            Icons.close_rounded,
                            size: 22,
                            color: Theme.of(
                              ctx,
                            ).colorScheme.onSurface.withValues(alpha: 0.5),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: ListView(
                  controller: scrollController,
                  padding: const EdgeInsets.fromLTRB(24, 12, 24, 36),
                  children: [
                    // Name + star rating
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            productName,
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 16,
                              fontWeight: FontWeight.w800,
                              color: Theme.of(ctx).colorScheme.onSurface,
                            ),
                          ),
                        ),
                        ...List.generate(
                          5,
                          (i) => Icon(
                            i < rating
                                ? Icons.star_rounded
                                : Icons.star_outline_rounded,
                            size: 18,
                            color: i < rating
                                ? const Color(0xFFFFD700)
                                : Theme.of(ctx).dividerColor,
                          ),
                        ),
                      ],
                    ),
                    if (idealUser.isNotEmpty) ...[
                      const SizedBox(height: 8),
                      Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: color.withValues(alpha: 0.08),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Row(
                          children: [
                            const Text('🎯', style: TextStyle(fontSize: 14)),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                idealUser,
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 12,
                                  color: Theme.of(ctx).colorScheme.onSurface,
                                  fontStyle: FontStyle.italic,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                    if (matchPoints.isNotEmpty) ...[
                      const SizedBox(height: 16),
                      Text(
                        _isTr ? 'Uyum Noktaları' : 'Compatibility Points',
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 14,
                          fontWeight: FontWeight.w800,
                          color: Theme.of(ctx).colorScheme.onSurface,
                        ),
                      ),
                      const SizedBox(height: 8),
                      ...matchPoints.map(
                        (item) => Container(
                          margin: const EdgeInsets.only(bottom: 6),
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 10,
                          ),
                          decoration: BoxDecoration(
                            color: AppTheme.scoreExcellent.withValues(
                              alpha: 0.08,
                            ),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Row(
                            children: [
                              Icon(
                                Icons.check_circle_rounded,
                                size: 16,
                                color: AppTheme.scoreExcellent,
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  item,
                                  style: GoogleFonts.plusJakartaSans(
                                    fontSize: 12,
                                    color: Theme.of(ctx).colorScheme.onSurface,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                    if (cautionPoints.isNotEmpty) ...[
                      const SizedBox(height: 16),
                      Text(
                        _isTr ? 'Dikkat Noktaları' : 'Caution Points',
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 14,
                          fontWeight: FontWeight.w800,
                          color: Theme.of(ctx).colorScheme.onSurface,
                        ),
                      ),
                      const SizedBox(height: 8),
                      ...cautionPoints.map(
                        (item) => Container(
                          margin: const EdgeInsets.only(bottom: 6),
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 10,
                          ),
                          decoration: BoxDecoration(
                            color: AppTheme.warning.withValues(alpha: 0.08),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Row(
                            children: [
                              Icon(
                                Icons.warning_amber_rounded,
                                size: 16,
                                color: AppTheme.warning,
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  item,
                                  style: GoogleFonts.plusJakartaSans(
                                    fontSize: 12,
                                    color: Theme.of(ctx).colorScheme.onSurface,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showProductDetailOverlay({
    required String productName,
    required double score,
    required List<String> strengths,
    required List<String> weaknesses,
    required String bestFor,
    required Color color,
  }) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => DraggableScrollableSheet(
        initialChildSize: 0.65,
        minChildSize: 0.4,
        maxChildSize: 0.9,
        builder: (_, scrollController) => Container(
          decoration: BoxDecoration(
            color: Theme.of(ctx).scaffoldBackgroundColor,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.25),
                blurRadius: 24,
                spreadRadius: 2,
              ),
            ],
          ),
          child: Column(
            children: [
              // Modern handle bar + close
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 8, 0),
                child: Row(
                  children: [
                    Expanded(
                      child: Center(
                        child: Container(
                          width: 44,
                          height: 5,
                          decoration: BoxDecoration(
                            color: Theme.of(
                              ctx,
                            ).dividerColor.withValues(alpha: 0.4),
                            borderRadius: BorderRadius.circular(3),
                          ),
                        ),
                      ),
                    ),
                    Material(
                      color: Colors.transparent,
                      child: InkWell(
                        borderRadius: BorderRadius.circular(20),
                        onTap: () => Navigator.of(ctx).pop(),
                        child: Padding(
                          padding: const EdgeInsets.all(8),
                          child: Icon(
                            Icons.close_rounded,
                            size: 22,
                            color: Theme.of(
                              ctx,
                            ).colorScheme.onSurface.withValues(alpha: 0.5),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: ListView(
                  controller: scrollController,
                  padding: const EdgeInsets.fromLTRB(24, 12, 24, 36),
                  children: [
                    // Score circle + product name
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        Container(
                          width: 56,
                          height: 56,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            gradient: LinearGradient(
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                              colors: [
                                _aiScoreColor(score).withValues(alpha: 0.7),
                                _aiScoreColor(score),
                              ],
                            ),
                          ),
                          child: Center(
                            child: Text(
                              '${score.toInt()}',
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 20,
                                fontWeight: FontWeight.w900,
                                color: Colors.white,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 16),
                        Expanded(
                          child: Text(
                            productName,
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 16,
                              fontWeight: FontWeight.w800,
                              color: Theme.of(ctx).colorScheme.onSurface,
                            ),
                          ),
                        ),
                      ],
                    ),
                    if (bestFor.isNotEmpty) ...[
                      const SizedBox(height: 16),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: color.withValues(alpha: 0.06),
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(
                            color: color.withValues(alpha: 0.1),
                          ),
                        ),
                        child: Row(
                          children: [
                            const Text('🎯', style: TextStyle(fontSize: 16)),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text(
                                bestFor,
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 13,
                                  color: Theme.of(ctx).colorScheme.onSurface,
                                  fontStyle: FontStyle.italic,
                                  height: 1.5,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                    if (strengths.isNotEmpty) ...[
                      const SizedBox(height: 18),
                      Text(
                        _isTr ? 'Güçlü Yönler' : 'Strengths',
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 15,
                          fontWeight: FontWeight.w800,
                          color: Theme.of(ctx).colorScheme.onSurface,
                        ),
                      ),
                      const SizedBox(height: 10),
                      ...strengths.map(
                        (s) => Container(
                          margin: const EdgeInsets.only(bottom: 8),
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: AppTheme.scoreExcellent.withValues(
                              alpha: 0.06,
                            ),
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(
                              color: AppTheme.scoreExcellent.withValues(
                                alpha: 0.1,
                              ),
                            ),
                          ),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Icon(
                                Icons.check_circle_rounded,
                                size: 18,
                                color: AppTheme.scoreExcellent,
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Text(
                                  s,
                                  style: GoogleFonts.plusJakartaSans(
                                    fontSize: 13,
                                    color: Theme.of(ctx).colorScheme.onSurface,
                                    height: 1.5,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                    if (weaknesses.isNotEmpty) ...[
                      const SizedBox(height: 18),
                      Text(
                        _isTr ? 'Zayıf Yönler' : 'Weaknesses',
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 15,
                          fontWeight: FontWeight.w800,
                          color: Theme.of(ctx).colorScheme.onSurface,
                        ),
                      ),
                      const SizedBox(height: 10),
                      ...weaknesses.map(
                        (w) => Container(
                          margin: const EdgeInsets.only(bottom: 8),
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: AppTheme.error.withValues(alpha: 0.06),
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(
                              color: AppTheme.error.withValues(alpha: 0.1),
                            ),
                          ),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Icon(
                                Icons.warning_rounded,
                                size: 18,
                                color: AppTheme.warning,
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Text(
                                  w,
                                  style: GoogleFonts.plusJakartaSans(
                                    fontSize: 13,
                                    color: Theme.of(ctx).colorScheme.onSurface,
                                    height: 1.5,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _categoryIcon(String category) {
    const icons = {
      'Performance': '⚡',
      'Display': '🖥️',
      'Build Quality': '🔨',
      'Value': '💰',
      'Features': '✨',
      'Camera': '📷',
      'Battery': '🔋',
      'Software': '📱',
      'Audio': '🔊',
      'Design': '🎨',
    };
    return icons[category] ?? '📊';
  }

  void _showFullScreenChart(
    Map<String, dynamic> categories,
    List<String> productNames,
    List<Color> barColors,
  ) {
    // Create short labels for products (first meaningful word + model)
    final shortNames = productNames.map((n) {
      final parts = n.split(' ');
      if (parts.length > 3) return '${parts.take(3).join(' ')}…';
      return n;
    }).toList();

    showDialog(
      context: context,
      useSafeArea: false,
      builder: (ctx) => Scaffold(
        backgroundColor: Theme.of(ctx).scaffoldBackgroundColor,
        appBar: AppBar(
          title: Text(
            _isTr ? '📊 Kategori Karşılaştırması' : '📊 Category Comparison',
            style: GoogleFonts.plusJakartaSans(
              fontSize: 16,
              fontWeight: FontWeight.w700,
            ),
          ),
          leading: IconButton(
            icon: const Icon(Icons.close_rounded),
            onPressed: () => Navigator.of(ctx).pop(),
          ),
          backgroundColor: Colors.transparent,
          elevation: 0,
        ),
        body: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Legend with full names
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Theme.of(
                    ctx,
                  ).colorScheme.surfaceContainerHighest.withValues(alpha: 0.3),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _isTr ? 'Ürünler' : 'Products',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: Theme.of(
                          ctx,
                        ).colorScheme.onSurface.withValues(alpha: 0.6),
                      ),
                    ),
                    const SizedBox(height: 8),
                    ...List.generate(
                      productNames.length.clamp(0, barColors.length),
                      (i) => Padding(
                        padding: const EdgeInsets.only(bottom: 6),
                        child: Row(
                          children: [
                            Container(
                              width: 14,
                              height: 14,
                              decoration: BoxDecoration(
                                color: barColors[i],
                                borderRadius: BorderRadius.circular(3),
                              ),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                productNames[i],
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 12,
                                  color: Theme.of(ctx).colorScheme.onSurface,
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
              const SizedBox(height: 20),
              // Full bar chart
              ConstrainedBox(
                constraints: const BoxConstraints(maxHeight: 480),
                child: SizedBox(
                  height: categories.length * 64.0 + 60,
                  child: BarChart(
                    BarChartData(
                      alignment: BarChartAlignment.spaceAround,
                      maxY: 100,
                      barTouchData: BarTouchData(
                        touchTooltipData: BarTouchTooltipData(
                          getTooltipItem: (group, groupIndex, rod, rodIndex) {
                            final pName = shortNames.length > rodIndex
                                ? shortNames[rodIndex]
                                : '';
                            return BarTooltipItem(
                              '$pName\n${rod.toY.toInt()}',
                              GoogleFonts.plusJakartaSans(
                                fontSize: 11,
                                fontWeight: FontWeight.w600,
                                color: Colors.white,
                              ),
                            );
                          },
                        ),
                      ),
                      titlesData: FlTitlesData(
                        show: true,
                        bottomTitles: AxisTitles(
                          sideTitles: SideTitles(
                            showTitles: true,
                            reservedSize: 48,
                            getTitlesWidget: (value, meta) {
                              final idx = value.toInt();
                              if (idx < 0 || idx >= categories.length) {
                                return const SizedBox.shrink();
                              }
                              final catName = categories.keys.elementAt(idx);
                              return Padding(
                                padding: const EdgeInsets.only(top: 8),
                                child: Text(
                                  catName,
                                  style: GoogleFonts.plusJakartaSans(
                                    fontSize: 10,
                                    fontWeight: FontWeight.w600,
                                    color: Theme.of(ctx).colorScheme.onSurface
                                        .withValues(alpha: 0.7),
                                  ),
                                  textAlign: TextAlign.center,
                                ),
                              );
                            },
                          ),
                        ),
                        leftTitles: AxisTitles(
                          sideTitles: SideTitles(
                            showTitles: true,
                            reservedSize: 32,
                            getTitlesWidget: (value, meta) => Text(
                              '${value.toInt()}',
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 10,
                                color: Theme.of(
                                  ctx,
                                ).colorScheme.onSurface.withValues(alpha: 0.5),
                              ),
                            ),
                          ),
                        ),
                        topTitles: const AxisTitles(
                          sideTitles: SideTitles(showTitles: false),
                        ),
                        rightTitles: const AxisTitles(
                          sideTitles: SideTitles(showTitles: false),
                        ),
                      ),
                      gridData: FlGridData(
                        show: true,
                        drawVerticalLine: false,
                        horizontalInterval: 25,
                        getDrawingHorizontalLine: (value) => FlLine(
                          color: Theme.of(
                            ctx,
                          ).dividerColor.withValues(alpha: 0.3),
                          strokeWidth: 0.5,
                        ),
                      ),
                      borderData: FlBorderData(show: false),
                      barGroups: _buildCategoryBarGroups(
                        categories,
                        productNames,
                        barColors,
                      ),
                    ),
                  ),
                ),
              ),
              // Detailed category explanations
              const SizedBox(height: 20),
              ...categories.entries.map((cat) {
                final catData = cat.value;
                String? explanation;
                Map<String, dynamic> scores = {};
                if (catData is Map<String, dynamic>) {
                  explanation = catData['explanation'] as String?;
                  if (catData.containsKey('scores')) {
                    scores = Map<String, dynamic>.from(
                      catData['scores'] as Map,
                    );
                  } else {
                    scores = Map.fromEntries(
                      catData.entries.where((e) => e.value is num),
                    );
                  }
                }
                return Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Theme.of(ctx).colorScheme.surfaceContainerHighest
                        .withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text(
                            '${_categoryIcon(cat.key)} ',
                            style: const TextStyle(fontSize: 16),
                          ),
                          Expanded(
                            child: Text(
                              cat.key,
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 13,
                                fontWeight: FontWeight.w700,
                                color: Theme.of(ctx).colorScheme.onSurface,
                              ),
                            ),
                          ),
                        ],
                      ),
                      if (scores.isNotEmpty) ...[
                        const SizedBox(height: 6),
                        ...scores.entries.map((se) {
                          final sVal = (se.value as num).toDouble();
                          // Find matching product name
                          String displayName = se.key;
                          for (final pn in productNames) {
                            if (pn.toLowerCase().contains(
                                  se.key.toLowerCase(),
                                ) ||
                                se.key.toLowerCase().contains(
                                  pn.toLowerCase(),
                                )) {
                              displayName = pn;
                              break;
                            }
                          }
                          final pIdx = productNames.indexOf(displayName);
                          final color = pIdx >= 0 && pIdx < barColors.length
                              ? barColors[pIdx]
                              : _aiScoreColor(sVal);
                          return Padding(
                            padding: const EdgeInsets.only(bottom: 4),
                            child: Row(
                              children: [
                                Container(
                                  width: 8,
                                  height: 8,
                                  decoration: BoxDecoration(
                                    color: color,
                                    shape: BoxShape.circle,
                                  ),
                                ),
                                const SizedBox(width: 6),
                                Expanded(
                                  child: Text(
                                    displayName.length > 30
                                        ? '${displayName.substring(0, 30)}…'
                                        : displayName,
                                    style: GoogleFonts.plusJakartaSans(
                                      fontSize: 11,
                                      color: Theme.of(ctx).colorScheme.onSurface
                                          .withValues(alpha: 0.7),
                                    ),
                                  ),
                                ),
                                Text(
                                  '${sVal.toInt()}',
                                  style: GoogleFonts.plusJakartaSans(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w800,
                                    color: _aiScoreColor(sVal),
                                  ),
                                ),
                              ],
                            ),
                          );
                        }),
                      ],
                      if (explanation != null) ...[
                        const SizedBox(height: 6),
                        Text(
                          explanation,
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 11,
                            color: Theme.of(
                              ctx,
                            ).colorScheme.onSurface.withValues(alpha: 0.6),
                            height: 1.4,
                          ),
                        ),
                      ],
                    ],
                  ),
                );
              }),
            ],
          ),
        ),
      ),
    );
  }

  List<BarChartGroupData> _buildCategoryBarGroups(
    Map<String, dynamic> categories,
    List<String> productNames,
    List<Color> barColors,
  ) {
    final groups = <BarChartGroupData>[];
    int catIdx = 0;
    for (final cat in categories.entries) {
      final catData = cat.value;
      Map<String, dynamic> scores = {};
      if (catData is Map<String, dynamic>) {
        // New format: {"scores": {...}, "explanation": "..."}
        if (catData.containsKey('scores')) {
          scores = Map<String, dynamic>.from(catData['scores'] as Map);
        } else {
          // Old format: {"<name1>": 85, "<name2>": 70} — filter out non-numeric entries
          scores = Map.fromEntries(
            catData.entries.where((e) => e.value is num),
          );
        }
      }
      final rods = <BarChartRodData>[];
      for (int pIdx = 0; pIdx < productNames.length; pIdx++) {
        final pName = productNames[pIdx];
        double val = 0;
        // Exact match first
        if (scores.containsKey(pName)) {
          val = (scores[pName] as num).toDouble();
        } else {
          // Name-based partial match (first 3 words)
          for (final se in scores.entries) {
            final seKey = se.key.toLowerCase().split(' ').take(3).join(' ');
            final pKey = pName.toLowerCase().split(' ').take(3).join(' ');
            if (pKey.contains(seKey) ||
                seKey.contains(pKey) ||
                pName.toLowerCase().contains(seKey) ||
                se.key.toLowerCase().contains(pKey)) {
              val = (se.value as num).toDouble();
              break;
            }
          }
          // Positional fallback when count matches
          if (val == 0 && scores.values.length == productNames.length) {
            val = (scores.values.elementAt(pIdx) as num).toDouble();
          }
        }
        rods.add(
          BarChartRodData(
            toY: val,
            width: 12,
            color: barColors[pIdx % barColors.length],
            borderRadius: const BorderRadius.only(
              topLeft: Radius.circular(3),
              topRight: Radius.circular(3),
            ),
          ),
        );
      }
      groups.add(BarChartGroupData(x: catIdx, barRods: rods, barsSpace: 3));
      catIdx++;
    }
    return groups;
  }

  Widget _buildAlternativesVisual() {
    final data = _alternativesStructured!;
    final alternatives = (data['alternatives'] as List<dynamic>? ?? const [])
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList(growable: false);
    if (alternatives.isEmpty) {
      return _buildAiError(() {
        setState(() {
          _alternativesError = false;
          _alternativesLoading = true;
          _alternativesResult = null;
          _alternativesStructured = null;
        });
        _fetchAlternatives();
      });
    }
    return Column(
      children: alternatives.map((alt) {
        final score = (alt['score'] as num?)?.toDouble() ?? 0;
        final name = (alt['name'] as String? ?? '').trim();
        final brand = (alt['brand'] as String? ?? '').trim();
        final priceRange = (alt['price_range'] as String? ?? '').trim();
        final whyBetter = (alt['why_better'] as String? ?? '').trim();
        return Container(
          margin: const EdgeInsets.only(bottom: 10),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: context.surfaceElevatedColor,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: _aiScoreColor(score).withValues(alpha: 0.2),
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: _aiScoreColor(score).withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      '${score.toInt()}',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 13,
                        fontWeight: FontWeight.w800,
                        color: _aiScoreColor(score),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        ExpandableText(
                          name,
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                            color: context.textPrimary,
                          ),
                          maxLines: 2,
                        ),
                        if (brand.isNotEmpty || priceRange.isNotEmpty) ...[
                          const SizedBox(height: 6),
                          Wrap(
                            spacing: 8,
                            runSpacing: 6,
                            crossAxisAlignment: WrapCrossAlignment.center,
                            children: [
                              if (brand.isNotEmpty)
                                Text(
                                  brand.toUpperCase(),
                                  style: GoogleFonts.plusJakartaSans(
                                    fontSize: 10,
                                    fontWeight: FontWeight.w700,
                                    color: context.textTertiaryColor,
                                    letterSpacing: 0.5,
                                  ),
                                ),
                              if (priceRange.isNotEmpty)
                                Container(
                                  constraints: const BoxConstraints(
                                    maxWidth: 220,
                                  ),
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 8,
                                    vertical: 4,
                                  ),
                                  decoration: BoxDecoration(
                                    color: context.surfaceColor,
                                    borderRadius: BorderRadius.circular(8),
                                  ),
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Icon(
                                        Icons.payments_outlined,
                                        size: 13,
                                        color: context.textTertiaryColor,
                                      ),
                                      const SizedBox(width: 4),
                                      Flexible(
                                        child: Text(
                                          priceRange,
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: GoogleFonts.plusJakartaSans(
                                            fontSize: 11,
                                            fontWeight: FontWeight.w600,
                                            color: context.textSecondary,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                            ],
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
              if (whyBetter.isNotEmpty) ...[
                const SizedBox(height: 10),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 8,
                  ),
                  decoration: BoxDecoration(
                    color: AppTheme.scoreExcellent.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: ExpandableText(
                    whyBetter,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 12,
                      color: context.textPrimary,
                      height: 1.45,
                    ),
                    maxLines: 4,
                  ),
                ),
              ],
            ],
          ),
        );
      }).toList(),
    );
  }

  Widget _buildAdvisorVisual() {
    final data = _advisorStructured!;
    final recommended =
        data['recommended'] as String? ?? data['best_for'] as String?;
    final matchPoints = List<String>.from(
      data['match_points'] ?? data['buy_if'] ?? [],
    );
    final cautionPoints = List<String>.from(
      data['caution_points'] ?? data['avoid_if'] ?? [],
    );
    final perProduct = List<Map<String, dynamic>>.from(
      (data['per_product'] as List<dynamic>?)?.map(
            (e) => e as Map<String, dynamic>,
          ) ??
          [],
    );
    final finalVerdict = data['final_verdict'] as String?;
    final productCount = widget.products.length;
    final barColors = [
      const Color(0xFF3B82F6),
      const Color(0xFF06B6D4),
      const Color(0xFF6366F1),
      const Color(0xFFF59E0B),
      const Color(0xFF10B981),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Recommended badge — compact
        if (recommended != null)
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 14),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [
                  const Color(0xFF3B82F6).withValues(alpha: 0.12),
                  const Color(0xFF06B6D4).withValues(alpha: 0.08),
                ],
              ),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: const Color(0xFF3B82F6).withValues(alpha: 0.2),
              ),
            ),
            child: Row(
              children: [
                const Icon(
                  Icons.recommend_rounded,
                  color: Color(0xFF3B82F6),
                  size: 20,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _isTr ? 'ÖNERİLEN' : 'RECOMMENDED',
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 10,
                          fontWeight: FontWeight.w600,
                          color: const Color(0xFF3B82F6),
                          letterSpacing: 0.5,
                        ),
                      ),
                      Text(
                        recommended,
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 13,
                          fontWeight: FontWeight.w800,
                          color: context.textPrimary,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),

        // Per-product columns with star ratings
        if (perProduct.isNotEmpty) ...[
          const SizedBox(height: 12),
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: List.generate(perProduct.length.clamp(0, productCount), (
                i,
              ) {
                final p = perProduct[i];
                final rating = (p['rating'] as num?)?.toInt() ?? 3;
                final name = p['name'] as String? ?? '';
                final idealUser = p['ideal_user'] as String? ?? '';
                final color = barColors[i % barColors.length];

                return Expanded(
                  child: GestureDetector(
                    onTap: () => _showAdvisorDetailOverlay(
                      productName: name,
                      rating: rating,
                      idealUser: idealUser,
                      matchPoints: matchPoints,
                      cautionPoints: cautionPoints,
                      color: color,
                    ),
                    child: Container(
                      margin: EdgeInsets.only(
                        left: i == 0 ? 0 : 3,
                        right: i == perProduct.length - 1 ? 0 : 3,
                      ),
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: context.surfaceElevatedColor,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: color.withValues(alpha: 0.2)),
                      ),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              // Star rating
                              Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: List.generate(
                                  5,
                                  (s) => Icon(
                                    s < rating
                                        ? Icons.star_rounded
                                        : Icons.star_outline_rounded,
                                    size: productCount > 3 ? 10 : 13,
                                    color: s < rating
                                        ? const Color(0xFFFFD700)
                                        : context.textTertiaryColor,
                                  ),
                                ),
                              ),
                              const SizedBox(height: 6),
                              // Product name
                              Text(
                                name.length > (productCount > 2 ? 20 : 30)
                                    ? '${name.substring(0, productCount > 2 ? 18 : 28)}…'
                                    : name,
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: productCount > 3
                                      ? 8
                                      : (productCount > 2 ? 9 : 10),
                                  fontWeight: FontWeight.w700,
                                  color: context.textPrimary,
                                ),
                                textAlign: TextAlign.center,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ],
                          ),
                          Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              if (idealUser.isNotEmpty) ...[
                                const SizedBox(height: 4),
                                Text(
                                  idealUser,
                                  style: GoogleFonts.plusJakartaSans(
                                    fontSize: 8,
                                    color: context.textSecondary,
                                  ),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  textAlign: TextAlign.center,
                                ),
                              ],
                              const SizedBox(height: 6),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 8,
                                  vertical: 4,
                                ),
                                decoration: BoxDecoration(
                                  color: color.withValues(alpha: 0.12),
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: Text(
                                  _isTr ? 'Detay' : 'Detail',
                                  style: GoogleFonts.plusJakartaSans(
                                    fontSize: 9,
                                    fontWeight: FontWeight.w700,
                                    color: color,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                );
              }),
            ),
          ),
        ],

        // Final verdict
        if (finalVerdict != null) ...[
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [
                  const Color(0xFF3B82F6).withValues(alpha: 0.08),
                  const Color(0xFF06B6D4).withValues(alpha: 0.06),
                ],
              ),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('💡', style: TextStyle(fontSize: 14)),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    finalVerdict,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 12,
                      height: 1.5,
                      color: context.textPrimary,
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

  Widget _buildPredictionVisual() {
    final data = _predictionStructured!;
    final products = List<Map<String, dynamic>>.from(
      (data['products'] as List<dynamic>?)?.map(
            (e) => e as Map<String, dynamic>,
          ) ??
          [],
    );
    if (products.isEmpty) {
      return _buildAiError(() {
        setState(() {
          _predictionError = false;
          _predictionLoading = true;
          _predictionResult = null;
          _predictionStructured = null;
        });
        _fetchPrediction();
      });
    }

    final productCount = widget.products.length;
    final barColors = [
      const Color(0xFF6366F1),
      const Color(0xFFEC4899),
      const Color(0xFF06B6D4),
      const Color(0xFFF59E0B),
      const Color(0xFF10B981),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Products in side-by-side columns — show ALL products, match by name
        IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: List.generate(productCount, (i) {
              final wProduct = widget.products[i];
              // Find matching AI product by name (first 3 words, then any word overlap)
              Map<String, dynamic>? p;
              final wWords = wProduct.name.toLowerCase().split(' ');
              final wKey3 = wWords.take(3).join(' ');
              for (final ap in products) {
                final aName = (ap['name'] as String? ?? '').toLowerCase();
                if (aName.contains(wKey3) ||
                    wKey3.contains(aName.split(' ').take(3).join(' '))) {
                  p = ap;
                  break;
                }
              }
              // Secondary: any 2-word overlap
              if (p == null) {
                for (final ap in products) {
                  final aWords = (ap['name'] as String? ?? '')
                      .toLowerCase()
                      .split(' ');
                  final overlap = wWords
                      .where((w) => w.length > 3 && aWords.contains(w))
                      .length;
                  if (overlap >= 2) {
                    p = ap;
                    break;
                  }
                }
              }
              // Always positional fallback — ensures no placeholder if AI returned all products
              if (p == null && i < products.length) p = products[i];

              if (p == null) {
                // No prediction data — show placeholder
                final color = barColors[i % barColors.length];
                return Expanded(
                  child: Container(
                    margin: EdgeInsets.only(
                      left: i == 0 ? 0 : 3,
                      right: i == productCount - 1 ? 0 : 3,
                    ),
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: context.surfaceElevatedColor,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: color.withValues(alpha: 0.15)),
                    ),
                    child: Column(
                      children: [
                        Icon(
                          Icons.trending_flat_rounded,
                          color: color.withValues(alpha: 0.4),
                          size: productCount > 3 ? 20 : 24,
                        ),
                        const SizedBox(height: 4),
                        Text(
                          '—',
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 13,
                            fontWeight: FontWeight.w900,
                            color: color.withValues(alpha: 0.4),
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          wProduct.name.length > (productCount > 2 ? 20 : 30)
                              ? '${wProduct.name.substring(0, productCount > 2 ? 18 : 28)}…'
                              : wProduct.name,
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: productCount > 3
                                ? 8
                                : (productCount > 2 ? 9 : 10),
                            fontWeight: FontWeight.w700,
                            color: context.textPrimary,
                          ),
                          textAlign: TextAlign.center,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                );
              }

              final trend = (p['trend'] as String? ?? 'stable').toLowerCase();
              final changePercent =
                  (p['change_percent'] as num?)?.toDouble() ?? 0;
              final name = p['name'] as String? ?? wProduct.name;
              final bestTime =
                  p['best_time_to_buy'] as String? ??
                  p['best_time'] as String? ??
                  '';
              final buyNow =
                  p['buy_now'] as bool? ??
                  (bestTime == 'now' || trend == 'dropping');
              final reason = p['reason'] as String? ?? '';
              final confidence = (p['confidence'] as num?)?.toDouble() ?? 0;

              final isDropping = trend == 'dropping' || trend == 'down';
              final isRising = trend == 'rising' || trend == 'up';
              final trendIcon = isDropping
                  ? Icons.trending_down_rounded
                  : isRising
                  ? Icons.trending_up_rounded
                  : Icons.trending_flat_rounded;
              final trendColor = isDropping
                  ? AppTheme.scoreExcellent
                  : isRising
                  ? AppTheme.error
                  : AppTheme.warning;
              final color = barColors[i % barColors.length];

              return Expanded(
                child: GestureDetector(
                  onTap: () => _showPredictionDetailOverlay(
                    productName: name,
                    trend: trend,
                    changePercent: changePercent,
                    bestTime: bestTime,
                    buyNow: buyNow,
                    reason: reason,
                    confidence: confidence,
                    color: color,
                  ),
                  child: Container(
                    margin: EdgeInsets.only(
                      left: i == 0 ? 0 : 3,
                      right: i == productCount - 1 ? 0 : 3,
                    ),
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: context.surfaceElevatedColor,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: trendColor.withValues(alpha: 0.2),
                      ),
                    ),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            // Trend icon
                            Icon(
                              trendIcon,
                              color: trendColor,
                              size: productCount > 3 ? 20 : 24,
                            ),
                            const SizedBox(height: 4),
                            // Change percent
                            Text(
                              '${changePercent > 0 ? '+' : ''}${changePercent.toStringAsFixed(0)}%',
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: productCount > 3 ? 13 : 15,
                                fontWeight: FontWeight.w900,
                                color: trendColor,
                              ),
                            ),
                            const SizedBox(height: 6),
                            // Product name
                            Text(
                              name.length > (productCount > 2 ? 20 : 30)
                                  ? '${name.substring(0, productCount > 2 ? 18 : 28)}…'
                                  : name,
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: productCount > 3
                                    ? 8
                                    : (productCount > 2 ? 9 : 10),
                                fontWeight: FontWeight.w700,
                                color: context.textPrimary,
                              ),
                              textAlign: TextAlign.center,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ],
                        ),
                        Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const SizedBox(height: 6),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 8,
                                vertical: 4,
                              ),
                              decoration: BoxDecoration(
                                color: color.withValues(alpha: 0.12),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Text(
                                _isTr ? 'Detay' : 'Detail',
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 9,
                                  fontWeight: FontWeight.w700,
                                  color: color,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              );
            }),
          ),
        ),
      ],
    );
  }

  // ─── Key Specs Side-by-Side Comparison ───

  /// Build a merged spec pool for a product from the localized, baked sections
  /// (the same data the admin + detail render). Flattened to {label: value} with
  /// first-wins on label collisions. Never reads the raw `specs`/`keySpecs`
  /// fields, which can carry stale machine-translation artefacts.
  Map<String, String> _buildSpecPool(ProductEntity product, String locale) {
    final pool = <String, String>{};
    for (final section in product.localizedSpecSections(locale).values) {
      for (final e in section.entries) {
        if (pool.containsKey(e.key)) continue;
        final v = e.value.trim();
        if (v.isNotEmpty && v != '-' && v != 'N/A') pool[e.key] = v;
      }
    }
    return pool;
  }

  /// Find a spec value from the pool given a list of aliases.
  MapEntry<String, String>? _findSpecInPool(
    Map<String, String> pool,
    List<String> aliases,
    Set<String> used,
  ) {
    for (final alias in aliases) {
      final aLower = alias.toLowerCase();
      for (final e in pool.entries) {
        if (used.contains(e.key)) continue;
        final eLower = e.key.toLowerCase();
        if (eLower == aLower ||
            eLower.contains(aLower) ||
            aLower.contains(eLower)) {
          return e;
        }
      }
    }
    return null;
  }

  /// Collect 6 category-aware key specs across all products for comparison.
  /// Returns list of (specLabel, [val_product0, val_product1, ...]).
  List<_CompareSpecRow> _collectCompareKeySpecs(String locale) {
    final products = widget.products;
    final pools = products.map((p) => _buildSpecPool(p, locale)).toList();

    // Resolve category
    final cat = key_specs.resolveCategory(
      products.first.category.isNotEmpty
          ? products.first.category
          : products.first.subcategory,
    );
    final prioritySlots = key_specs.categoryKeySpecAliases[cat];

    final result = <_CompareSpecRow>[];
    final usedPerProduct = List.generate(products.length, (_) => <String>{});

    // Phase 1: category-priority specs
    if (prioritySlots != null) {
      for (final slotAliases in prioritySlots) {
        final values = <String>[];
        String? label;
        for (int i = 0; i < products.length; i++) {
          final found = _findSpecInPool(
            pools[i],
            slotAliases,
            usedPerProduct[i],
          );
          if (found != null) {
            values.add(found.value);
            usedPerProduct[i].add(found.key);
            label ??= found.key;
          } else {
            values.add('—');
          }
        }
        label ??= slotAliases.first;
        // Only include if at least one product has a value
        if (values.any((v) => v != '—')) {
          result.add(_CompareSpecRow(label: label, values: values));
        }
        if (result.length >= 6) break;
      }
    }

    // Phase 2: fill remaining slots from pools
    if (result.length < 6) {
      // Gather all remaining keys (priority: from first product's pool)
      final remainingKeys = <String>[];
      for (int i = 0; i < products.length; i++) {
        for (final key in pools[i].keys) {
          if (usedPerProduct[i].contains(key)) continue;
          if (!remainingKeys.contains(key)) remainingKeys.add(key);
        }
      }
      for (final key in remainingKeys) {
        final values = <String>[];
        for (int i = 0; i < products.length; i++) {
          values.add(pools[i][key] ?? '—');
          usedPerProduct[i].add(key);
        }
        if (values.any((v) => v != '—')) {
          result.add(_CompareSpecRow(label: key, values: values));
        }
        if (result.length >= 6) break;
      }
    }

    return result;
  }

  /// Determine winner index for a compare spec row.
  // ignore: unused_element
  int _findCompareWinner(String label, List<String> values) {
    final winners = _findCompareWinnerIndexes(label, values);
    return winners.isEmpty ? -1 : winners.first;
  }

  Set<int> _findCompareWinnerIndexes(String label, List<String> values) {
    if (values.length < 2) return {};
    final nonMissing = values.where((v) => !_isMissingCompareValue(v)).toList();
    if (nonMissing.length < 2) return {};
    final normalizedSet = nonMissing.map((v) => v.trim().toLowerCase()).toSet();
    if (normalizedSet.length == 1) return {}; // all same -> no winner

    // Delegate to the existing specDirection service
    final serviceAsync = ref.read(specDirectionServiceProvider);
    final service = serviceAsync.valueOrNull;
    if (service != null) {
      final serviceWinners = service.findBetterIndexes(label, values);
      if (serviceWinners.isNotEmpty) return serviceWinners;
    }
    return _findCompareWinnerFallbackIndexes(label, values);
  }

  // ignore: unused_element
  int _findCompareWinnerFallback(String label, List<String> values) {
    final winners = _findCompareWinnerFallbackIndexes(label, values);
    return winners.isEmpty ? -1 : winners.first;
  }

  Set<int> _findCompareWinnerFallbackIndexes(
    String label,
    List<String> values,
  ) {
    if (values.length < 2) return {};
    final indexed = values
        .asMap()
        .entries
        .where((entry) {
          return !_isMissingCompareValue(entry.value);
        })
        .toList(growable: false);
    if (indexed.length < 2) return {};

    final bools = indexed.map((entry) {
      if (_isYesCompareValue(entry.value)) return true;
      if (_isNoCompareValue(entry.value)) return false;
      return null;
    }).toList();
    if (bools.every((v) => v != null) && bools.toSet().length > 1) {
      return {
        for (var i = 0; i < bools.length; i++)
          if (bools[i] == true) indexed[i].key,
      };
    }

    final nums = indexed
        .map((entry) => _extractCompareNumber(entry.value))
        .toList();
    if (!nums.every((n) => n != null)) return {};
    final doubles = nums.cast<double>();
    final maxVal = doubles.reduce(max);
    final minVal = doubles.reduce(min);
    if (maxVal == minVal) return {};

    final direction = _compareDirectionForLabel(label);
    if (direction == 'lower') {
      return {
        for (var i = 0; i < doubles.length; i++)
          if (doubles[i] == minVal) indexed[i].key,
      };
    }
    if (direction == 'higher') {
      return {
        for (var i = 0; i < doubles.length; i++)
          if (doubles[i] == maxVal) indexed[i].key,
      };
    }
    return {};
  }

  String _normalizeCompareKey(String input) {
    return input
        .toLowerCase()
        .replaceAll('ı', 'i')
        .replaceAll('İ', 'i')
        .replaceAll('ç', 'c')
        .replaceAll('ğ', 'g')
        .replaceAll('ö', 'o')
        .replaceAll('ş', 's')
        .replaceAll('ü', 'u')
        .replaceAll(RegExp(r'[^a-z0-9]+'), ' ')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();
  }

  String _compareDirectionForLabel(String label) {
    final key = _normalizeCompareKey(label);
    const lowerSignals = [
      'tepki',
      'response',
      'gecikme',
      'latency',
      'agirlik',
      'weight',
      'kalinlik',
      'thickness',
      'tdp',
      'isi yayma',
      'guc tuketimi',
      'power consumption',
      'sicaklik',
      'temperature',
      'fiyat',
      'price',
      'nanometre',
      'nm',
    ];
    if (lowerSignals.any(key.contains)) return 'lower';
    // 'sar' (SAR radyasyonu) TAM KELİME olmalı; "şarj" (normalize: "sarj")
    // içindeki "sar"a takılıp şarj döngüsü/hızını yanlışlıkla düşük-iyi
    // saymasın (1200 döngü 1400'den iyi görünüyordu).
    if (key.split(' ').contains('sar')) return 'lower';

    const higherSignals = [
      'cekirdek',
      'core',
      'is parcacigi',
      'thread',
      'frekans',
      'frequency',
      'hiz',
      'speed',
      'hz',
      'kapasite',
      'capacity',
      'bellek',
      'memory',
      'ram',
      'depolama',
      'storage',
      'onbellek',
      'cache',
      'boyut',
      'size',
      'inc',
      'cm',
      'kapsam',
      'coverage',
      'renk',
      'color',
      'parlaklik',
      'brightness',
      'cozunurluk',
      'resolution',
      'puan',
      'score',
      'version',
      'versiyon',
      'standard',
      'standardi',
      'bluetooth',
      'wifi',
      'wi fi',
      'usb',
      'nesil',
      'generation',
      'benchmark',
      'fps',
      'kamera',
      'camera',
      'watt',
      'sarj',
      'charge',
      'ozellik',
      'feature',
    ];
    if (higherSignals.any(key.contains)) return 'higher';
    return 'neutral';
  }

  double? _extractCompareNumber(String value) {
    final text = value
        .toLowerCase()
        .replaceAll(',', '.')
        .replaceAll('×', 'x')
        .trim();
    final resolution = RegExp(r'(\d{3,5})\s*x\s*(\d{3,5})').firstMatch(text);
    if (resolution != null) {
      final w = double.tryParse(resolution.group(1)!);
      final h = double.tryParse(resolution.group(2)!);
      if (w != null && h != null) return w * h;
    }
    final rangeMatches = RegExp(r'\d+(?:\.\d+)?').allMatches(text).toList();
    if (rangeMatches.isEmpty) return null;
    final nums = rangeMatches
        .map((m) => double.tryParse(m.group(0)!))
        .whereType<double>()
        .toList();
    if (nums.isEmpty) return null;
    var picked = nums.last;
    if (text.contains('tb')) picked *= 1024;
    if (text.contains('mb')) picked /= 1024;
    return picked;
  }

  /// Color + weight for a cell based on comparison result.
  // ignore: unused_element
  ({Color color, FontWeight weight}) _cellStyle({
    required String value,
    required int index,
    required int winnerIndex,
    required ThemeData theme,
  }) {
    final isMissing = value == '—';
    if (isMissing) {
      return (color: context.textTertiaryColor, weight: FontWeight.w400);
    }

    // Boolean values: green for yes, red for no (independent of winner)
    final vLower = value.toLowerCase().trim();
    if (vLower == 'yes' ||
        vLower == 'true' ||
        vLower == 'var' ||
        vLower == 'evet' ||
        vLower == '✓') {
      return (color: AppTheme.scoreExcellent, weight: FontWeight.w700);
    }
    if (vLower == 'no' ||
        vLower == 'false' ||
        vLower == 'yok' ||
        vLower == 'hayır' ||
        vLower == '✗') {
      return (
        color: AppTheme.error.withValues(alpha: 0.7),
        weight: FontWeight.w600,
      );
    }

    if (winnerIndex < 0) {
      // No winner → neutral
      return (color: theme.colorScheme.onSurface, weight: FontWeight.w700);
    }
    if (index == winnerIndex) {
      return (color: AppTheme.scoreExcellent, weight: FontWeight.w800);
    }
    // Loser
    return (
      color: AppTheme.error.withValues(alpha: 0.65),
      weight: FontWeight.w600,
    );
  }

  Widget _buildKeySpecsSummary() {
    final specs =
        _cachedKeySpecs; // pre-computed in didChangeDependencies, not per build
    if (specs.isEmpty) return const SizedBox.shrink();

    final title = _isTr ? 'Öne Çıkanlar' : 'Highlights';
    return _buildCompareSpecBrick(
      title: title,
      rows: {for (final spec in specs) spec.label: spec.values},
      margin: const EdgeInsets.fromLTRB(16, 16, 16, 8),
    );
  }

  IconData _iconForCompareSection(String section) {
    final k = section.toLowerCase();
    if (k.contains('öne çıkan') ||
        k.contains('one cikan') ||
        k.contains('highlight')) {
      return Icons.stars_rounded;
    }
    if (k.contains('ekran') || k.contains('display')) {
      return Icons.smartphone_rounded;
    }
    if (k.contains('batarya') || k.contains('battery') || k.contains('pil')) {
      return Icons.battery_charging_full_rounded;
    }
    if (k.contains('kamera') || k.contains('camera')) {
      return Icons.photo_camera_rounded;
    }
    if (k.contains('donan') || k.contains('hardware')) {
      return Icons.developer_board_rounded;
    }
    if (k.contains('perform')) return Icons.speed_rounded;
    if (k.contains('bellek') || k.contains('memory')) {
      return Icons.memory_rounded;
    }
    if (k.contains('depolama') || k.contains('storage')) {
      return Icons.storage_rounded;
    }
    if (k.contains('tasarım') ||
        k.contains('tasarim') ||
        k.contains('design')) {
      return Icons.straighten_rounded;
    }
    if (k.contains('ağ') ||
        k.contains('ag ') ||
        k.contains('network') ||
        k.contains('bağlantı') ||
        k.contains('baglanti') ||
        k.contains('connect')) {
      return Icons.settings_input_antenna_rounded;
    }
    if (k.contains('işletim') ||
        k.contains('isletim') ||
        k.contains('software') ||
        k.contains('os')) {
      return Icons.terminal_rounded;
    }
    if (k.contains('ses') || k.contains('audio') || k.contains('ortam')) {
      return Icons.speaker_rounded;
    }
    if (k.contains('özellik') ||
        k.contains('ozellik') ||
        k.contains('feature')) {
      return Icons.tune_rounded;
    }
    if (k.contains('işlemci') ||
        k.contains('islemci') ||
        k.contains('chip') ||
        k.contains('processor')) {
      return Icons.memory_rounded;
    }
    if (k.contains('grafik') || k.contains('graphics') || k.contains('gpu')) {
      return Icons.videogame_asset_rounded;
    }
    if (k.contains('güç') || k.contains('guc') || k.contains('power')) {
      return Icons.bolt_rounded;
    }
    return Icons.subject_rounded;
  }

  bool _isMissingCompareValue(String value) {
    final trimmed = value.trim();
    return trimmed.isEmpty ||
        trimmed == '—' ||
        trimmed == '-' ||
        trimmed == '?' ||
        trimmed == 'null' ||
        trimmed == '{}' ||
        trimmed == '[]';
  }

  bool _isYesCompareValue(String text) {
    final trimmed = text.trim();
    if (trimmed.startsWith('✓')) return true;
    return RegExp(
      r'^(yes|var|evet|true|available|ja|oui|sí|si|sim|tak)$',
      caseSensitive: false,
    ).hasMatch(trimmed);
  }

  bool _isNoCompareValue(String text) {
    final trimmed = text.trim();
    if (trimmed.startsWith('✗') || trimmed.startsWith('×')) return true;
    return RegExp(
      r'^(no|yok|hayır|hayir|not available|nein|non|não|nao|nie|false)$',
      caseSensitive: false,
    ).hasMatch(trimmed);
  }

  List<String> _compareValueParts(String value) {
    List<String> splitTopLevel(String source) {
      final out = <String>[];
      var depth = 0;
      final buffer = StringBuffer();
      for (var i = 0; i < source.length; i++) {
        final ch = source[i];
        if (ch == '(' || ch == '[' || ch == '{') {
          depth++;
        } else if (ch == ')' || ch == ']' || ch == '}') {
          depth = max(0, depth - 1);
        }
        if (depth == 0 && (ch == ',' || ch == ';')) {
          final prev = i > 0 ? source[i - 1] : '';
          final next = i + 1 < source.length ? source[i + 1] : '';
          if (RegExp(r'\d').hasMatch(prev) && RegExp(r'\d').hasMatch(next)) {
            buffer.write(ch);
            continue;
          }
          out.add(buffer.toString());
          buffer.clear();
        } else {
          buffer.write(ch);
        }
      }
      if (buffer.isNotEmpty) out.add(buffer.toString());
      return out;
    }

    final rawLines = <String>[];
    final normalized = value
        .replaceAll('\r', '\n')
        .replaceAll('•', '\n')
        .replaceAll('|', '\n');
    for (final line in normalized.split('\n')) {
      for (final part in splitTopLevel(line)) {
        final trimmed = part
            .trim()
            .replaceFirst(RegExp(r'^[-•\s]+'), '')
            .trim();
        if (trimmed.isNotEmpty) rawLines.add(trimmed);
      }
    }

    final lines = <String>[];
    for (var i = 0; i < rawLines.length; i++) {
      final line = rawLines[i];
      if (RegExp(r'^\d+x$', caseSensitive: false).hasMatch(line) &&
          i + 1 < rawLines.length) {
        lines.add('$line ${rawLines[++i]}');
      } else {
        lines.add(line);
      }
    }
    return lines.isEmpty ? [value.trim()] : lines;
  }

  Widget _buildCompareSpecBrick({
    required String title,
    required Map<String, List<String>> rows,
    required EdgeInsetsGeometry margin,
  }) {
    final theme = Theme.of(context);
    return Container(
      margin: margin,
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 2),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.4),
        border: Border.all(color: context.dividerColor.withValues(alpha: 0.6)),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(2, 0, 2, 10),
            child: Row(
              children: [
                Icon(
                  _iconForCompareSection(title),
                  size: 16,
                  color: theme.colorScheme.primary,
                ),
                const SizedBox(width: 8),
                Expanded(
                  // Section header already comes localized from
                  // `localizedSpecSections` (curated glossary) — render it
                  // verbatim, exactly like the admin/detail spec card. No
                  // in-app re-translation.
                  child: Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.plusJakartaSans(
                      color: context.textPrimary,
                      fontSize: 14,
                      height: 1.15,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ],
            ),
          ),
          for (final indexed in rows.entries.toList().asMap().entries)
            _buildAdminCompareSpecRow(
              label: indexed.value.key,
              values: indexed.value.value,
            ),
        ],
      ),
    );
  }

  Widget _buildAdminCompareSpecRow({
    required String label,
    required List<String> values,
  }) {
    final productCount = widget.products.length;
    final theme = Theme.of(context);
    final paddedValues = [
      for (var i = 0; i < productCount; i++)
        i < values.length ? values[i] : '—',
    ];
    final winnerIndexes = _findCompareWinnerIndexes(label, paddedValues);

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: context.dividerColor.withValues(alpha: 0.55)),
      ),
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Row label already comes localized from `localizedSpecSections`
          // (the baked per-language payload). Render it verbatim so the compare
          // table matches the admin/detail spec card exactly — no re-translation.
          Text(
            label,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 11.5,
              height: 1.25,
              fontWeight: FontWeight.w700,
              color: context.textSecondary,
            ),
          ),
          const SizedBox(height: 8),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              for (var i = 0; i < productCount; i++) ...[
                Expanded(
                  child: GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: _isMissingCompareValue(paddedValues[i])
                        ? null
                        : () => _showSpecValueBottomSheet(
                            specName: '$label · ${widget.products[i].name}',
                            fullValue: paddedValues[i],
                          ),
                    child: _CompareSpecValue(
                      value: paddedValues[i],
                      parts: _compareValueParts(paddedValues[i]),
                      isMissing: _isMissingCompareValue(paddedValues[i]),
                      isYes: _isYesCompareValue(paddedValues[i]),
                      isNo: _isNoCompareValue(paddedValues[i]),
                      rank: winnerIndexes.isEmpty
                          ? _CompareValueRank.neutral
                          : (winnerIndexes.contains(i)
                                ? _CompareValueRank.better
                                : _CompareValueRank.weaker),
                    ),
                  ),
                ),
                if (i != productCount - 1) const SizedBox(width: 4),
              ],
            ],
          ),
        ],
      ),
    );
  }

  void _showRemoveProductDialog(ProductEntity product) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(
          'Remove Product',
          style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700),
        ),
        content: Text(
          'Remove "${product.name}" from comparison?',
          style: GoogleFonts.plusJakartaSans(fontSize: 14),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: Text(
              'Cancel',
              style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w600),
            ),
          ),
          TextButton(
            onPressed: () {
              Navigator.of(ctx).pop();
              widget.onRemoveProduct?.call(product.id);
            },
            child: Text(
              'Remove',
              style: GoogleFonts.plusJakartaSans(
                fontWeight: FontWeight.w600,
                color: AppTheme.error,
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ─── Expert Scores Comparison ───

  // ignore: unused_element
  Widget _buildExpertScoresComparison() {
    final scores = widget.products.map((p) => p.techScore).toList();
    final maxScore = scores.reduce((a, b) => a > b ? a : b);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: context.dividerColor),
        boxShadow: [
          BoxShadow(
            color: AppTheme.brandBlue.withValues(alpha: 0.06),
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
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  gradient: _accentGradient,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(
                  Icons.analytics_rounded,
                  size: 20,
                  color: Colors.white,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  'TechScore',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: context.textPrimary,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          ...widget.products.asMap().entries.map((entry) {
            final idx = entry.key;
            final product = entry.value;
            final score = product.techScore;
            final isBest =
                score == maxScore &&
                scores.where((s) => s == maxScore).length == 1;
            final scoreColor = score >= 80
                ? AppTheme.scoreExcellent
                : score >= 60
                ? AppTheme.scoreAverage
                : score >= 40
                ? AppTheme.orange500
                : AppTheme.error;
            final chipColors = [
              AppTheme.brandBlue,
              AppTheme.scoreAverage,
              AppTheme.premiumPurpleLight,
              AppTheme.scoreExcellent,
            ];
            final chipColor = chipColors[idx % 4];

            return Container(
              margin: const EdgeInsets.only(bottom: 10),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: isBest
                    ? AppTheme.scoreExcellent.withValues(alpha: 0.06)
                    : context.surfaceColor,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(
                  color: isBest
                      ? AppTheme.scoreExcellent.withValues(alpha: 0.2)
                      : context.dividerColor,
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 8,
                        height: 8,
                        decoration: BoxDecoration(
                          color: chipColor,
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          product.name,
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: context.textPrimary,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (isBest)
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 6,
                            vertical: 2,
                          ),
                          decoration: BoxDecoration(
                            color: AppTheme.scoreExcellent.withValues(
                              alpha: 0.15,
                            ),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            '🏆',
                            style: GoogleFonts.plusJakartaSans(fontSize: 11),
                          ),
                        ),
                      const SizedBox(width: 8),
                      Container(
                        width: 42,
                        height: 42,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          gradient: LinearGradient(
                            colors: [
                              scoreColor.withValues(alpha: 0.8),
                              scoreColor,
                            ],
                          ),
                        ),
                        child: Center(
                          child: Text(
                            score.toInt().toString(),
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 14,
                              fontWeight: FontWeight.w900,
                              color: Colors.white,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(4),
                    child: LinearProgressIndicator(
                      value: score / 100,
                      minHeight: 6,
                      backgroundColor: context.dividerColor,
                      color: scoreColor,
                    ),
                  ),
                ],
              ),
            );
          }),
        ],
      ),
    );
  }

  // ─── Visual Builders ───

  @override
  Widget build(BuildContext context) {
    ref.watch(specDirectionServiceProvider);
    // Global analiz durumundan BU karşılaştırmaya ait olanı al. Başka bir
    // karşılaştırmanın işi buraya YANSIMAZ (kullanıcı iki farklı karşılaştırma
    // yapabilir; ekran hep kendi işini gösterir).
    final globalAi = ref.watch(compareAiProvider);
    _ai = globalAi.matches(_compareKey) ? globalAi : const CompareAiState();

    return DefaultTabController(
      length: 3,
      child: Column(
        children: [
          // Sticky product header (always visible)
          _buildProductHeader(context),

          // Pill-style tab bar (always visible)
          Container(
            color: context.surfaceColor,
            child: Builder(
              builder: (context) {
                final controller = DefaultTabController.of(context);
                return AnimatedBuilder(
                  animation: controller.animation!,
                  builder: (context, _) {
                    final selectedIndex =
                        controller.animation?.value.round() ?? controller.index;
                    final isAiSelected = selectedIndex == 2;
                    // No auto-start: like the website, the compare AI report runs
                    // only when the user taps the explicit "Start analysis"
                    // button — this also stops opening the tab from silently
                    // spending a compare-AI credit.
                    final activeTabColor = isAiSelected
                        ? AppTheme.premiumGold
                        : Theme.of(context).colorScheme.primary;
                    return TabBar(
                      isScrollable: false,
                      tabAlignment: TabAlignment.fill,
                      labelColor: activeTabColor,
                      unselectedLabelColor: context.textTertiaryColor,
                      indicatorSize: TabBarIndicatorSize.tab,
                      dividerColor: Colors.transparent,
                      indicator: BoxDecoration(
                        border: Border(
                          bottom: BorderSide(color: activeTabColor, width: 2.5),
                        ),
                      ),
                      labelStyle: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                      ),
                      unselectedLabelStyle: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                      ),
                      tabs: [
                        Tab(text: _comparePricesTabLabel(context)),
                        Tab(text: context.l10n?.specsTab ?? 'Specs'),
                        Tab(text: _compareAiAnalysesTabLabel(context)),
                      ],
                    );
                  },
                );
              },
            ),
          ),

          // Tab content (scrollable) — KeepAlive prevents disposal on tab switch
          Expanded(
            child: TabBarView(
              children: [
                _KeepAliveTab(child: _buildSimilarTab()),
                _KeepAliveTab(child: _buildSpecsTab()),
                _KeepAliveTab(child: _buildProTab()),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _comparePricesTabLabel(BuildContext context) {
    switch (Localizations.localeOf(context).languageCode.toLowerCase()) {
      case 'tr':
        return 'Fiyatlar';
      case 'fr':
        return 'Prix';
      case 'es':
        return 'Precios';
      case 'it':
        return 'Prezzi';
      case 'pt':
        return 'Preços';
      case 'ar':
        return 'الأسعار';
      case 'ja':
        return '価格';
      case 'nl':
        return 'Prijzen';
      case 'pl':
        return 'Ceny';
      case 'sv':
        return 'Priser';
      default:
        return 'Prices';
    }
  }

  String _compareAiAnalysesTabLabel(BuildContext context) {
    switch (Localizations.localeOf(context).languageCode.toLowerCase()) {
      case 'tr':
        return 'AI Analizleri';
      case 'fr':
        return 'Analyses IA';
      case 'es':
        return 'Análisis IA';
      case 'it':
        return 'Analisi IA';
      case 'pt':
        return 'Análises IA';
      case 'ar':
        return 'تحليلات الذكاء الاصطناعي';
      case 'ja':
        return 'AI 分析';
      case 'nl':
        return 'AI-analyses';
      case 'pl':
        return 'Analizy AI';
      case 'sv':
        return 'AI-analyser';
      default:
        return 'AI Analyses';
    }
  }

  /// Product header: images + names (non-pinned, scrolls away)
  Widget _buildProductHeader(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 8, 16, 8),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.surfaceElevatedColor,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: AppTheme.brandBlue.withValues(alpha: 0.12)),
        boxShadow: [
          BoxShadow(
            color: AppTheme.brandBlue.withValues(alpha: 0.08),
            blurRadius: 16,
            offset: const Offset(0, 4),
          ),
          const BoxShadow(
            color: Color(0x08000000),
            blurRadius: 8,
            offset: Offset(0, 2),
          ),
        ],
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: _buildHeaderProductWidgets(context),
      ),
    );
  }

  List<Widget> _buildHeaderProductWidgets(BuildContext context) {
    final widgets = <Widget>[];
    for (int idx = 0; idx < widget.products.length; idx++) {
      final product = widget.products[idx];
      final scoreColor = product.techScore >= 80
          ? AppTheme.scoreExcellent
          : product.techScore >= 60
          ? AppTheme.scoreAverage
          : product.techScore >= 40
          ? AppTheme.orange500
          : AppTheme.error;

      if (idx > 0) {
        widgets.add(const SizedBox(width: 4));
      }

      widgets.add(
        Expanded(
          child: GestureDetector(
            onTap: () => context.push('/product/${product.id}'),
            onLongPress:
                widget.onRemoveProduct != null && widget.products.length > 2
                ? () => _showRemoveProductDialog(product)
                : null,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // Image + tech score (top-right) + match score (top-left)
                Stack(
                  clipBehavior: Clip.none,
                  children: [
                    ProductImageBox(
                      imageUrl: product.imageUrl,
                      fallbackUrls: product.images,
                      width: 90,
                      height: 90,
                      borderRadius: BorderRadius.circular(16),
                      padding: const EdgeInsets.all(6),
                    ),
                    if (product.techScore > 0)
                      Positioned(
                        top: 4,
                        right: 4,
                        child: _CompareScoreBadge(
                          score: product.techScore.toInt(),
                          color: scoreColor,
                        ),
                      ),
                    // Local match score badge (algorithm-only, no AI).
                    Positioned(
                      top: 4,
                      left: 4,
                      child: _CompareMatchBadge(product: product),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: Text(
                    product.name,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: context.textPrimary,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.center,
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    }
    return widgets;
  }

  /// Tekli üründeki "Ana Özellikler" bölümünü (SharedKeySpecsGrid kaynağı + aynı
  /// UI: ikon, değer, etiket) compare specs sayfasının EN BAŞINDA, ama
  /// KARŞILAŞTIRMALI gösterir: her spec TEK satır, ürünlerin değerleri yan yana
  /// (ekran boyutu karşısında yine ekran boyutu).
  Widget _buildCompareAnaOzellikler() {
    final rows = SharedKeySpecsGrid.comparisonRows(widget.products, _appLang);
    if (rows.isEmpty) return const SizedBox.shrink();
    final theme = Theme.of(context);
    final title = _isTr ? 'Ana Özellikler' : 'Key Specs';
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 16, 16, 6),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.4),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: theme.dividerColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                Icons.auto_awesome_rounded,
                size: 16,
                color: theme.colorScheme.primary,
              ),
              const SizedBox(width: 6),
              Text(
                title,
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: theme.colorScheme.onSurface,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          for (final r in rows)
            Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
              decoration: BoxDecoration(
                color: theme.colorScheme.surface,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: theme.dividerColor.withValues(alpha: 0.5),
                ),
              ),
              child: Column(
                children: [
                  // ORTADA tek başlık (ikon + spec adı) — solda label kolonu YOK.
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        SharedKeySpecsGrid.iconForSpec(r.key),
                        size: 14,
                        color: theme.colorScheme.primary.withValues(alpha: 0.7),
                      ),
                      const SizedBox(width: 5),
                      Flexible(
                        child: Text(
                          r.key,
                          textAlign: TextAlign.center,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 10.5,
                            fontWeight: FontWeight.w600,
                            color: theme.colorScheme.onSurface.withValues(
                              alpha: 0.55,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  // Değerler — her ürün sütununda (üstteki ürün görselinin
                  // DİKEY hizasında: sol değer sol ürün, sağ değer sağ ürün).
                  Row(
                    children: [
                      for (var i = 0; i < r.values.length; i++)
                        Expanded(
                          child: Center(
                            child: SharedKeySpecsGrid.buildValue(
                              context,
                              r.values[i],
                            ),
                          ),
                        ),
                    ],
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildSpecsTab() {
    final groupEntries = _groupedSpecs.entries
        .where((entry) {
          final k = entry.key.toLowerCase();
          return !k.contains('öne çıkan') &&
              !k.contains('one cikan') &&
              !k.contains('highlight') &&
              !k.contains('key spec');
        })
        .toList(growable: false);
    return CustomScrollView(
      slivers: [
        // EN BAŞTA: tekli ürün incelemesindeki "Ana Özellikler" bölümü (bire bir
        // aynı SharedKeySpecsGrid + UI), her ürün için ürün adıyla. Kullanıcı
        // isteği — detay ve compare ortak bileşeni kullanır.
        SliverToBoxAdapter(child: _buildCompareAnaOzellikler()),
        // Key Specs Summary at top
        SliverToBoxAdapter(child: _buildKeySpecsSummary()),
        // Grouped spec comparison
        if (groupEntries.isEmpty)
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 24, 16, 12),
              child: Center(
                child: SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Theme.of(context).colorScheme.primary,
                  ),
                ),
              ),
            ),
          )
        else
          SliverList.builder(
            itemCount: groupEntries.length,
            itemBuilder: (context, index) {
              final groupEntry = groupEntries[index];
              return _buildCompareSpecBrick(
                title: groupEntry.key,
                rows: groupEntry.value,
                margin: EdgeInsets.fromLTRB(16, index == 0 ? 16 : 10, 16, 4),
              );
            },
          ),

        // Bottom spacer
        SliverToBoxAdapter(
          child: SizedBox(
            height:
                MediaQuery.of(context).padding.bottom +
                AppTheme.navBarTotalClearance,
          ),
        ),
      ],
    );
  }

  // ignore: unused_element
  Widget _buildReviewsTab() {
    // Build "product1 vs product2" search query for comparison videos
    final vsQuery = widget.products.map((p) => p.name).join(' vs ');

    return ListView(
      padding: EdgeInsets.fromLTRB(
        16,
        12,
        16,
        MediaQuery.of(context).padding.bottom +
            AppTheme.navBarTotalClearance +
            40,
      ),
      children: [
        // Single YouTube section with comparison query (collapsible)
        Padding(
          padding: const EdgeInsets.only(bottom: 14),
          child: SharedYouTubeReviewsCard(
            product: widget.products.first,
            isDark: Theme.of(context).brightness == Brightness.dark,
            cardBg: context.surfaceVariantColor,
            searchQuery: vsQuery,
            titleOverride:
                context.l10n?.comparisonVideos ?? 'Comparison Videos',
            collapsible: true,
            onVideoTap: _onVideoTap,
          ),
        ),

        // User reviews section
        _buildUserReviewsSection(),
      ],
    );
  }

  Widget _buildSimilarTab() {
    final country = ref.watch(selectedCountryProvider);
    final priceInfos = widget.products
        .map((product) => _comparePriceInfo(product, country))
        .toList(growable: false);
    final priced = priceInfos
        .where((info) => info.amount != null && info.amount! > 0)
        .map((info) => info.amount!)
        .toList(growable: false);
    final bestPrice = priced.isEmpty ? null : priced.reduce(min);
    // "3 veya daha az fiyat varsa benzer ürünler göster": karşılaştırmada
    // gerçek fiyatı olan ürün sayısı 3 veya altındaysa, her ürünün altında
    // detay sayfasındaki gibi benzer ürün önerileri gösteririz.
    final showSimilar = priced.length <= 3;

    final n = widget.products.length;
    return ListView(
      padding: EdgeInsets.fromLTRB(
        16,
        14,
        16,
        MediaQuery.of(context).padding.bottom + AppTheme.navBarTotalClearance,
      ),
      children: [
        // Her ürün KENDİ sütununda (Specs sekmesiyle aynı hizada), fiyatı kendi
        // başlığının altında — alt alta yığılmıyor. IntrinsicHeight sütun
        // yüksekliklerini eşitler.
        IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (var i = 0; i < n; i++) ...[
                if (i > 0) const SizedBox(width: 10),
                Expanded(
                  child: _buildComparePriceCard(
                    product: widget.products[i],
                    info: priceInfos[i],
                    country: country,
                    isBest:
                        bestPrice != null &&
                        priceInfos[i].amount != null &&
                        priceInfos[i].amount == bestPrice,
                    showSimilar: false,
                  ),
                ),
              ],
            ],
          ),
        ),
        // Benzer ürünler: TEK birleşik bölüm (her ürün için ayrı ayrı değil).
        if (showSimilar) _buildCombinedSimilarRow(widget.products),
      ],
    );
  }

  /// One merged "Similar Products" rail across all compared products
  /// (deduplicated, excludes the compared items themselves). Replaces the old
  /// per-product duplication that rendered the section once per product.
  Widget _buildCombinedSimilarRow(List<ProductEntity> products) {
    final isTr = Localizations.localeOf(context).languageCode == 'tr';
    final comparedIds = products.map((p) => p.id).toSet();
    final merged = <ProductEntity>[];
    final seen = <String>{};
    for (final p in products) {
      final list = ref.watch(similarProductsProvider(p)).valueOrNull ?? const [];
      for (final s in list) {
        if (comparedIds.contains(s.id)) continue;
        if (seen.add(s.id)) merged.add(s);
      }
    }
    if (merged.isEmpty) return const SizedBox.shrink();
    final list = merged.take(12).toList(growable: false);
    return Padding(
      padding: const EdgeInsets.only(top: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 26,
                height: 26,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [AppTheme.brandBlue, Color(0xFF7C3AED)],
                  ),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Icon(
                  Icons.hub_rounded,
                  size: 14,
                  color: Colors.white,
                ),
              ),
              const SizedBox(width: 8),
              Text(
                context.l10n?.similarProducts ??
                    (isTr ? 'Benzer Ürünler' : 'Similar Products'),
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: context.textPrimary,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          SizedBox(
            // Ana sayfa rail standardı (kullanıcı isteği): 246 yükseklik / 144 en.
            height: 212,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: list.length,
              separatorBuilder: (_, _) => const SizedBox(width: 12),
              itemBuilder: (context, i) => SizedBox(
                width: 132,
                child: SharedSimilarGridCard(product: list[i]),
              ),
            ),
          ),
        ],
      ),
    );
  }

  ({double? amount, String currency}) _comparePriceInfo(
    ProductEntity product,
    String country,
  ) {
    final countryInfo = SupportedCountries.countries[country];
    // Sıkı ülke kuralı: yalnız SEÇİLİ ülkenin fiyatı. US/başka ülke fiyatına
    // ASLA düşülmez (kullanıcı bunu net reddetti).
    final localPrice = product.getPriceForCountry(country);
    if (localPrice != null && localPrice > 0) {
      return (amount: localPrice, currency: countryInfo?.currency ?? 'USD');
    }
    return (amount: null, currency: countryInfo?.currency ?? 'USD');
  }

  Widget _buildComparePriceCard({
    required ProductEntity product,
    required ({double? amount, String currency}) info,
    required String country,
    required bool isBest,
    bool showSimilar = false,
  }) {
    // ── AYNI LISTE, TEK KAYNAK ────────────────────────────────────────────
    // Burasi eskiden kendi "en iyi teklif" kutusunu ciziyordu: TEK kutuda tek
    // magaza. Kullanici urun sayfasindaki listenin AYNISINI istiyor —
    // magazalar alt alta, ucuzdan pahaliya, yeni fiyat eklendiginde kendi
    // sirasina girsin. Iki ekran da artik `StoreOfferList` kullaniyor
    // (widgets/shared/store_offer_list.dart); davranis tek yerde degisir.
    final offersAsync = ref.watch(productOffersProvider(product.id));
    final offers = offersAsync.valueOrNull ?? const <ProductOfferModel>[];
    final rows = bestPerStore(sortOffersForCountry(offers, country), limit: 6);
    final isTr = Localizations.localeOf(context).languageCode == 'tr';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (rows.isNotEmpty)
          StoreOfferList(
            offers: offers,
            country: country,
            productId: product.id,
            compact: true,
            limit: 6,
          )
        else if (offersAsync is AsyncLoading)
          _buildComparePricePlaceholder(isTr ? 'Yükleniyor' : 'Loading')
        else
          // Hic teklif yok: ulkeye uygun Amazon arama satiri (liste ile ayni
          // gorunum) — SIKI ULKE KURALI geregi baska pazarin fiyati gosterilmez.
          _buildCompareAmazonRow(product: product, country: country, isTr: isTr),
        if (showSimilar) _buildCompareSimilarRow(product),
      ],
    );
  }

  Widget _buildComparePricePlaceholder(String label) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 14),
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: context.surfaceColor,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: context.dividerColor),
      ),
      child: Text(
        label,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: GoogleFonts.plusJakartaSans(
          fontSize: 12,
          fontWeight: FontWeight.w700,
          color: context.textSecondary,
        ),
      ),
    );
  }

  /// Teklif yokken gosterilen Amazon satiri — `StoreOfferRow` ile ayni olculer.
  Widget _buildCompareAmazonRow({
    required ProductEntity product,
    required String country,
    required bool isTr,
  }) {
    final visitor = ref.watch(detectedCountryProvider).valueOrNull;
    final url = amazonUrlForProduct(product, country, visitorCountry: visitor);
    if (url.isEmpty) {
      return _buildComparePricePlaceholder(
        isTr ? 'Bölgende fiyat yok' : 'No price in your region',
      );
    }
    final brand = resolveStoreBrand('amazon');
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () async {
          final uri = Uri.tryParse(amazonTagUrlForVisitor(url, visitor));
          if (uri == null) return;
          try {
            await launchUrl(uri, mode: LaunchMode.externalApplication);
          } catch (_) {}
        },
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
          decoration: BoxDecoration(
            color: context.surfaceColor,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: context.dividerColor),
          ),
          child: Row(
            children: [
              StoreLogo(brand: brand, size: 26),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Amazon',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 10.5,
                    fontWeight: FontWeight.w600,
                    color: context.textSecondary,
                  ),
                ),
              ),
              const SizedBox(width: 6),
              Text(
                isTr ? 'Fiyata bak' : 'See price',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                  color: context.textSecondary,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }



  /// Detay sayfasındaki "Benzer Ürünler" satırının compare karşılığı. Fiyat
  /// bilgisi az olduğunda (≤3) her ürünün altında alternatif öneriler gösterir.
  Widget _buildCompareSimilarRow(ProductEntity product) {
    final isTr = Localizations.localeOf(context).languageCode == 'tr';
    final similarAsync = ref.watch(similarProductsProvider(product));
    return similarAsync.maybeWhen(
      data: (products) {
        if (products.isEmpty) return const SizedBox.shrink();
        final list = products.take(10).toList(growable: false);
        return Padding(
          padding: const EdgeInsets.only(top: 14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 26,
                    height: 26,
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [AppTheme.brandBlue, Color(0xFF7C3AED)],
                      ),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Icon(
                      Icons.hub_rounded,
                      size: 14,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    context.l10n?.similarProducts ??
                        (isTr ? 'Benzer Ürünler' : 'Similar Products'),
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: context.textPrimary,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              SizedBox(
                // Ana sayfa rail standardı (kullanıcı isteği): 246 / 144.
                height: 212,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: list.length,
                  separatorBuilder: (_, _) => const SizedBox(width: 12),
                  itemBuilder: (context, i) => SizedBox(
                    width: 132,
                    child: SharedSimilarGridCard(product: list[i]),
                  ),
                ),
              ),
            ],
          ),
        );
      },
      orElse: () => const SizedBox.shrink(),
    );
  }

  // ignore: unused_element
  Widget _buildSimilarEmpty() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.only(top: 48),
        child: Column(
          children: [
            Icon(
              Icons.widgets_outlined,
              size: 48,
              color: context.textTertiaryColor.withValues(alpha: 0.5),
            ),
            const SizedBox(height: 12),
            Text(
              context.l10n?.noSimilarProductsFound ??
                  (_isTr
                      ? 'Benzer ürün bulunamadı'
                      : 'No similar products found'),
              style: GoogleFonts.plusJakartaSans(
                fontSize: 14,
                color: context.textTertiaryColor,
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ignore: unused_element
  Widget _buildSimilarShimmer() {
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        crossAxisSpacing: 12,
        mainAxisSpacing: 12,
        childAspectRatio: 0.72,
      ),
      itemCount: 4,
      itemBuilder: (_, _) => Container(
        decoration: BoxDecoration(
          color: context.surfaceVariantColor,
          borderRadius: BorderRadius.circular(16),
        ),
        child: const Center(child: CircularProgressIndicator(strokeWidth: 2)),
      ),
    );
  }

  // ignore: unused_element
  List<ProductEntity> _takeEvenCompareSimilarProducts(
    Iterable<ProductEntity> products,
  ) {
    final refs = widget.products.where((p) => p.techScore > 0).toList();
    final categorySet = widget.products
        .map((p) => p.category.toLowerCase().trim())
        .where((category) => category.isNotEmpty)
        .toSet();
    final comparedPrice = widget.products
        .map((p) => p.prices.values.isNotEmpty ? p.prices.values.first : 0.0)
        .where((price) => price > 0)
        .fold<double>(0, (sum, price) => sum + price);
    final comparedPriceCount = widget.products
        .where((p) => p.prices.values.isNotEmpty && p.prices.values.first > 0)
        .length;
    final avgPrice = comparedPriceCount == 0
        ? 0.0
        : comparedPrice / comparedPriceCount;
    final items = products.toList();

    if (refs.isNotEmpty) {
      final avgTech =
          refs.fold<double>(0, (sum, p) => sum + p.techScore) / refs.length;
      final minTech = refs
          .map((p) => p.techScore)
          .reduce((a, b) => a < b ? a : b);
      final maxTech = refs
          .map((p) => p.techScore)
          .reduce((a, b) => a > b ? a : b);

      double distanceFromComparedRange(ProductEntity product) {
        if (product.techScore <= 0) return 999;
        if (product.techScore >= minTech && product.techScore <= maxTech) {
          return (product.techScore - avgTech).abs() * 0.5;
        }
        return (product.techScore - avgTech).abs();
      }

      double priceDistance(ProductEntity product) {
        if (avgPrice <= 0 || product.prices.values.isEmpty) return 1;
        final price = product.prices.values.first;
        if (price <= 0) return 1;
        return ((price - avgPrice) / avgPrice).abs();
      }

      items.sort((a, b) {
        final techCompare = distanceFromComparedRange(
          a,
        ).compareTo(distanceFromComparedRange(b));
        if (techCompare != 0) return techCompare;

        final aCat = categorySet.contains(a.category.toLowerCase().trim())
            ? 0
            : 1;
        final bCat = categorySet.contains(b.category.toLowerCase().trim())
            ? 0
            : 1;
        if (aCat != bCat) return aCat.compareTo(bCat);

        return priceDistance(a).compareTo(priceDistance(b));
      });

      final close = items
          .where((p) => distanceFromComparedRange(p) <= 25)
          .take(26)
          .toList();
      final raw = close.length >= 8 ? close : items.take(26).toList();
      if (raw.length.isOdd && raw.length > 1) {
        return raw.sublist(0, raw.length - 1);
      }
      return raw;
    }

    final raw = items.take(26).toList();
    if (raw.length.isOdd && raw.length > 1) {
      return raw.sublist(0, raw.length - 1);
    }
    return raw;
  }

  Widget _buildProTab() {
    // Single unified AI report (compare_full_report) — Personalized Match is
    // NOT a separate section; the report already includes per-product match
    // scores. One centered "Start analysis" button runs everything.
    // KRİTİK: quiz yüklenirken/quiz gösterilirken de ListView'e geç. Aksi halde
    // "Analizi Başlat" basınca _compareQuizLoading=true oluyor ama bu erken
    // return (_fullCompareRunning hâlâ false) start butonunu tekrar gösterip
    // quiz/loader'ı hiç açmıyordu → buton "çalışmıyor" görünüyordu.
    // NOT: "Geçmiş analizler" girişi buradan KALDIRILDI — tüm analiz geçmişi
    // yalnız Profil > "Analiz Geçmişi" altında toplanıyor (kullanıcı isteği).
    if (!_compareQuizLoading &&
        _compareQuiz == null &&
        !_fullCompareRunning &&
        _fullCompareReport == null &&
        _savedCompareEntry() == null) {
      return Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 24),
          child: _buildAiStartButton(_runCompareFullReport, _fullCompareError),
        ),
      );
    }
    return ListView(
      padding: EdgeInsets.fromLTRB(
        16,
        12,
        16,
        MediaQuery.of(context).padding.bottom + AppTheme.navBarTotalClearance,
      ),
      children: [_buildCompareFullReportSection()],
    );
  }


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

  Widget _buildCompareFullReportSection() {
    if (_compareQuizLoading) {
      // TEK STANDART loader: küçük kart yerine analiz aşamasıyla aynı workboard.
      return AiReportWorkboard(
        lang: _appLang,
        mode: 'compare',
        stage: AiReportStageLite.prep,
        startedAt: _compareWorkStartedAt,
      );
    }
    if (_compareQuiz != null &&
        _fullCompareReport == null &&
        !_fullCompareRunning) {
      return _buildCompareQuizCard();
    }
    if (_fullCompareRunning) {
      return AiReportWorkboard(
        lang: _appLang,
        mode: 'compare',
        stage: _fullCompareStage,
        startedAt: _compareWorkStartedAt,
      );
    }
    if (_fullCompareReport != null) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AiReportView(
            kind: 'compareFull',
            data: _fullCompareReport!,
            lang: _appLang,
            products: widget.products,
          ),
          const SizedBox(height: 6),
          _buildAiRerunButton(_runCompareFullReport),
        ],
      );
    }
    // Canlı rapor yok → bu karşılaştırmanın KAYITLI analizi varsa BİRE BİR göster.
    final saved = _savedCompareEntry();
    if (saved != null) return _buildSavedCompareReportView(saved);
    return Center(child: _buildAiStartButton(_runCompareFullReport, _fullCompareError));
  }

  /// Karşılaştırmanın imzası: seçili ürünlerin sıralı id'leri.
  String get _compareSignature =>
      (widget.products.map((p) => p.id).toList()..sort()).join('|');

  /// Bu karşılaştırmanın kayıtlı (geçmiş) analizini pending + Firebase'den bulur.
  Map<String, dynamic>? _savedCompareEntry() {
    if (widget.products.length < 2) return null;
    final sig = _compareSignature;
    final pending = ref.watch(pendingCompareAnalysisHistoryProvider);
    final saved =
        ref.watch(compareAnalysisHistoryProvider).valueOrNull ?? const [];
    for (final e in [...pending, ...saved]) {
      if (e['signature']?.toString() == sig && e['report'] is Map) return e;
    }
    return null;
  }

  Widget _buildSavedCompareReportView(Map<String, dynamic> entry) {
    final report = Map<String, dynamic>.from(entry['report'] as Map);
    final answers = (entry['quizAnswers'] as List?) ?? const [];
    final ts = entry['timestamp']?.toString();
    final dt = ts != null ? DateTime.tryParse(ts) : null;
    final dateStr = dt != null
        ? '${dt.day.toString().padLeft(2, '0')}.${dt.month.toString().padLeft(2, '0')}.${dt.year}'
        : '';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
          decoration: BoxDecoration(
            color: AppTheme.brandBlue.withValues(alpha: 0.06),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: AppTheme.brandBlue.withValues(alpha: 0.16),
            ),
          ),
          child: Row(
            children: [
              const Icon(
                Icons.history_rounded,
                size: 16,
                color: AppTheme.brandBlue,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  dateStr.isEmpty
                      ? (_isTr ? 'Kayıtlı analiz' : 'Saved analysis')
                      : (_isTr
                            ? 'Kayıtlı analiz · $dateStr'
                            : 'Saved analysis · $dateStr'),
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: context.textSecondary,
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 10),
        AiReportView(
          kind: 'compareFull',
          data: report,
          lang: _appLang,
          products: widget.products,
        ),
        if (answers.isNotEmpty) ...[
          const SizedBox(height: 10),
          _buildCompareSavedAnswers(answers),
        ],
        const SizedBox(height: 6),
        _buildAiRerunButton(_runCompareFullReport),
      ],
    );
  }

  Widget _buildCompareSavedAnswers(List<dynamic> answers) {
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: context.dividerColor.withValues(alpha: 0.55)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: () => setState(
              () => _compareSavedAnswersExpanded = !_compareSavedAnswersExpanded,
            ),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              child: Row(
                children: [
                  const Icon(
                    Icons.quiz_rounded,
                    size: 16,
                    color: AppTheme.premiumPurple,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      _isTr
                          ? 'Verdiğin cevaplar (${answers.length})'
                          : 'Your answers (${answers.length})',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w700,
                        color: context.textPrimary,
                      ),
                    ),
                  ),
                  Icon(
                    _compareSavedAnswersExpanded
                        ? Icons.expand_less_rounded
                        : Icons.expand_more_rounded,
                    size: 20,
                    color: context.textTertiaryColor,
                  ),
                ],
              ),
            ),
          ),
          if (_compareSavedAnswersExpanded)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (final a in answers)
                    if (a is Map)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              a['question']?.toString() ?? '',
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                                color: context.textSecondary,
                                height: 1.3,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Icon(
                                  Icons.check_circle_rounded,
                                  size: 13,
                                  color: AppTheme.green500,
                                ),
                                const SizedBox(width: 5),
                                Expanded(
                                  child: Text(
                                    a['answer']?.toString() ?? '',
                                    style: GoogleFonts.plusJakartaSans(
                                      fontSize: 12.5,
                                      fontWeight: FontWeight.w700,
                                      color: context.textPrimary,
                                      height: 1.3,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  /// Karşılaştırma analizi bitince tam raporu + quiz cevaplarını geçmişe yazar.

  Widget _buildCompareQuizSurround({required Widget child}) {
    return Container(
      width: double.infinity,
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
                width: 38,
                height: 38,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [AppTheme.premiumPurple, AppTheme.primaryBlue],
                  ),
                  borderRadius: BorderRadius.circular(11),
                ),
                child: const Icon(Icons.tune_rounded,
                    color: Colors.white, size: 19),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  _isTr
                      ? 'Sana göre kişiselleştir — birkaç soru'
                      : 'Personalize — a few quick questions',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                    color: context.textPrimary,
                  ),
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

  Widget _buildCompareQuizCard() {
    return _buildCompareQuizSurround(
      child: SharedQuizView(
        products: widget.products
            .map((p) => SharedQuizProduct(
                  title: p.nameForLanguage(_appLang),
                  imageUrl: p.imageUrl,
                  fallbackImages: p.allImages,
                  subtitle: p.brand,
                ))
            .toList(),
        questions: _compareQuizAnswers,
        currentIndex: _compareQuizIndex,
        onAnswer: _onCompareQuizAnswer,
        onSubmit: _submitCompareQuiz,
        onSkip: _skipCompareQuiz,
        submitLabel: _isTr ? 'Analizi Başlat' : 'See analysis',
        skipLabel: _isTr ? 'Quizi atla & analiz et' : 'Skip & analyze',
      ),
    );
  }

  Widget _buildAiStartButton(VoidCallback onStart, bool error) {
    // Tekli ürün analiziyle BİRE BİR aynı: ortalanmış, yaratıcı animasyonlu
    // ortak başlangıç kartı. Butona basınca normal akış (quiz → rapor) devam eder.
    return AiAnalysisStartCard(
      onStart: onStart,
      isTr: _isTr,
      isError: error,
      subtitleOverride: _isTr
          ? 'Ürünleri yan yana puanlar, sana en uygunu önerir.'
          : 'Scores products head-to-head and recommends the best for you.',
    );
  }

  Future<void> _runCompareFullReport() async {
    if (_fullCompareRunning) return;
    if (widget.products.length < 2) return;
    if (!requireAuth(context)) return;
    // Kilit harcamadan ÖNCE: `_fullCompareRunning` ancak rapor koşarken true
    // olduğu için quiz/e-posta await'leri sırasında ikinci dokunuş Q'yu iki
    // kez düşürebiliyordu.
    if (_panelChargeInFlight) return;
    _panelChargeInFlight = true;
    try {
      await _runCompareFullReportGuarded();
    } finally {
      _panelChargeInFlight = false;
    }
  }

  Future<void> _runCompareFullReportGuarded() async {
    // AI özelliği için önce kayıt-sonrası profil quiz'i tamamlanmalı (atlanmışsa
    // uyarı + quize yönlendir). Sonra Q Coin bakiyesi izin verdiğince kullanılır.
    if (!mounted) return;
    // ignore: use_build_context_synchronously
    final wantQuizGate = await ensureOnboardingQuizGate(context, ref, isTr: _isTr);
    if (!wantQuizGate) return;
    if (!mounted) return;
    // ignore: use_build_context_synchronously
    if (!await ensureEmailVerified(context, ref)) return;
    if (!mounted) return;
    final sub = ref.read(subscriptionServiceProvider);
    final spend = await sub.recordCompareAi();
    if (!mounted) return;
    if (spend.isFailure) {
      // ignore: use_build_context_synchronously
      _showQSpendFailure(context, feature: 'compare_ai', result: spend);
      return;
    }
    // Web paritesi: önce karşılaştırmaya özel quiz üret + göster (link/abonelik
    // analizindeki AYNI quiz UI'ı), sonra cevaplarla raporu çalıştır.
    //
    // İŞ ARTIK BURADA KOŞMUYOR: durum `compareAiProvider`'a yazılır, motoru her
    // zaman canlı olan MainShell yürütür. Böylece kullanıcı sekmeden çıksa,
    // hatta karşılaştırmayı kapatsa bile quiz/rapor üretimi sürer ve hazır
    // olunca bildirim düşer.
    ref.read(compareAiProvider.notifier).requestStart(
          products: widget.products,
          label: widget.products.map((p) => p.nameForLanguage(_appLang)).join(' vs '),
          lang: _appLang,
          profile: _buildAiProfile(),
        );
  }

  void _onCompareQuizAnswer(int index, String answer) {
    ref.read(compareAiProvider.notifier).answer(index, answer);
  }

  Future<void> _submitCompareQuiz() async {
    _persistCompareQuizAnswers(_compareQuizAnswers); // profil + tanıma
    ref.read(compareAiProvider.notifier).requestReport();
  }

  /// Karşılaştırma quiz cevaplarını kullanıcı profiline (quizHistory) yazar —
  /// link/abonelik/detay akışlarıyla aynı desen; tanıma algoritması okur.
  void _persistCompareQuizAnswers(List<QuizQuestion> answers) {
    final uid = ref.read(userProfileProvider).valueOrNull?.uid;
    if (uid == null || uid.isEmpty) return;
    final answered = answers
        .where((q) => q.selectedOption != null)
        .map((q) => {'question': q.text, 'answer': q.selectedOption})
        .toList();
    if (answered.isEmpty) return;
    final titles = widget.products
        .map((p) => p.nameForLanguage(_appLang))
        .toList();
    unawaited(
      ref
          .read(pbDataSourceProvider)
          .saveQuizHistory(uid, {
            'timestamp': DateTime.now().toIso8601String(),
            'status': 'completed',
            'productTitle': titles.join(' vs '),
            'category': widget.products.isNotEmpty
                ? widget.products.first.category
                : '',
            'mode': 'compare',
            'questionCount': answers.length,
            'questions': answers
                .map((q) => {'question': q.text, 'options': q.options})
                .toList(),
            'answers': answered,
          })
          .catchError((_) {}),
    );
  }

  Future<void> _skipCompareQuiz() async {
    ref.read(compareAiProvider.notifier).requestReport(skipQuiz: true);
  }

  /// Runs the compare_full_report with collected quiz answers. The AI feature
  /// limit is recorded by [_runCompareFullReport] before the quiz, so this does
  /// NOT re-gate.

  // NOT: `_setCompareBusy`, `_signalCompareReady`, `_runCompareReport` ve
  // widget içindeki geçmiş kaydı KALDIRILDI. Hepsi artık MainShell'de
  // (`_runCompareQuizPhase` / `_runCompareReportPhase` / `_feedHubCatalogCompare`)
  // — widget dispose olsa bile iş sürsün ve bildirim düşsün diye.

  // ignore: unused_element
  Widget _buildAiStartCard({
    required String subtitle,
    required bool error,
    required VoidCallback onStart,
  }) {
    return Container(
      width: double.infinity,
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
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [AppTheme.premiumPurple, AppTheme.primaryBlue],
                  ),
                  borderRadius: BorderRadius.circular(11),
                ),
                child: const Icon(
                  Icons.auto_awesome_rounded,
                  color: Colors.white,
                  size: 20,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _compareAiAnalysesTabLabel(context),
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                        color: context.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
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
          if (error)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Text(
                _isTr
                    ? 'AI analizi tamamlanamadı. Lütfen tekrar dene.'
                    : 'AI analysis could not be completed. Please try again.',
                style: GoogleFonts.inter(fontSize: 12, color: AppTheme.error),
              ),
            ),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: onStart,
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
                error
                    ? (_isTr ? 'Tekrar Dene' : 'Try Again')
                    : (_isTr ? 'Analizi Başlat' : 'Start Analysis'),
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

  Widget _buildAiRerunButton(VoidCallback onTap) {
    return Center(
      child: TextButton.icon(
        onPressed: onTap,
        icon: const Icon(Icons.refresh_rounded, size: 16),
        label: Text(
          _isTr ? 'Yeniden Analiz Et' : 'Re-run analysis',
          style: GoogleFonts.plusJakartaSans(
            fontSize: 12.5,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
    );
  }

  // ignore: unused_element
  Widget _buildUnifiedCompareAiVisual() {
    final sections = <Widget>[];
    if (_advisorStructured != null) {
      sections.add(
        _buildUnifiedCompareSection(
          icon: Icons.support_agent_rounded,
          title: _isTr ? 'Satın Alma Kararı' : 'Buying Decision',
          color: AppTheme.primaryBlue,
          child: _buildAdvisorVisual(),
        ),
      );
    }
    if (_deepAnalysisStructured != null) {
      sections.add(
        _buildUnifiedCompareSection(
          icon: Icons.psychology_rounded,
          title: _isTr ? 'Teknik Farklar' : 'Technical Differences',
          color: AppTheme.premiumPurple,
          child: _buildDeepAnalysisVisual(),
        ),
      );
    }
    if (_alternativesStructured != null) {
      sections.add(
        _buildUnifiedCompareSection(
          icon: Icons.swap_horizontal_circle_rounded,
          title: _isTr ? 'Alternatifler' : 'Alternatives',
          color: AppTheme.warning,
          child: _buildAlternativesVisual(),
        ),
      );
    }
    if (_predictionStructured != null) {
      sections.add(
        _buildUnifiedCompareSection(
          icon: Icons.trending_down_rounded,
          title: _isTr ? 'Fiyat Zamanlaması' : 'Price Timing',
          color: AppTheme.green500,
          child: _buildPredictionVisual(),
        ),
      );
    }
    if (sections.isEmpty) return _buildUnifiedCompareAiPlaceholder();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (var i = 0; i < sections.length; i++) ...[
          if (i > 0) const SizedBox(height: 16),
          sections[i],
        ],
      ],
    );
  }

  Widget _buildUnifiedCompareSection({
    required IconData icon,
    required String title,
    required Color color,
    required Widget child,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(icon, size: 16, color: color),
            const SizedBox(width: 6),
            Expanded(
              child: Text(
                title,
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 13,
                  fontWeight: FontWeight.w800,
                  color: color,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        child,
      ],
    );
  }

  Widget _buildUnifiedCompareAiPlaceholder() {
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
          if (_isAnyUnifiedCompareAiLoading)
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
              _isAnyUnifiedCompareAiLoading
                  ? (_isTr ? 'Analiz hazırlanıyor...' : 'Preparing analysis...')
                  : (_isTr ? 'AI analizini başlat' : 'Start AI analysis'),
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

  // ignore: unused_element
  Widget _buildMatchScoreSection() {
    final userProfile = ref.watch(userProfileProvider);
    final user = userProfile.valueOrNull;
    final quizCompleted = user != null && user.quizCompleted;
    final isUserProfileLoading = userProfile.isLoading && !userProfile.hasValue;
    final productCount = widget.products.length;
    final barColors = [
      const Color(0xFF3B82F6),
      const Color(0xFF06B6D4),
      const Color(0xFF6366F1),
      const Color(0xFFF59E0B),
      const Color(0xFF10B981),
    ];
    final matchKeys = widget.products
        .map(
          (product) => LocalizedProductKey(
            productId: product.id,
            languageCode: _appLang,
          ),
        )
        .toList(growable: false);
    final matchStates = matchKeys
        .map((key) => ref.watch(geminiMatchScoreProvider(key)))
        .toList(growable: false);
    final hasMissingAiScore = matchStates.any(
      (state) => state.valueOrNull == null,
    );
    final anyMatchLoading = matchStates.any((state) => state is AsyncLoading);
    final matchStepText = widget.products
        .map((product) => ref.watch(aiMatchStepProvider(product.id)).trim())
        .firstWhere((step) => step.isNotEmpty, orElse: () => '');

    if (_matchScoreExpanded &&
        quizCompleted &&
        !_matchScoreFetched &&
        hasMissingAiScore) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted || _matchScoreFetched) return;
        setState(() => _matchScoreFetched = true);
        for (var i = 0; i < widget.products.length; i++) {
          final currentState = ref.read(geminiMatchScoreProvider(matchKeys[i]));
          if (currentState is AsyncLoading ||
              currentState.valueOrNull != null) {
            continue;
          }
          ref
              .read(geminiMatchScoreProvider(matchKeys[i]).notifier)
              .fetchMatchScore(
                product: widget.products[i],
                forCompareBatch: true,
              );
        }
      });
    }

    final isMatchLoading =
        _matchScoreExpanded &&
        (isUserProfileLoading ||
            anyMatchLoading ||
            (quizCompleted && !_matchScoreFetched && hasMissingAiScore));

    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
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
          // Header row toggles expand/collapse
          GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: () async {
              if (!requireAuth(context)) return;
              final willExpand = !_matchScoreExpanded;
              if (willExpand && quizCompleted && hasMissingAiScore) {
                // Kilit harcamadan ÖNCE (çift dokunuş = çift Q).
                if (_panelChargeInFlight) return;
                _panelChargeInFlight = true;
                Result<void> spend;
                try {
                  if (!await ensureEmailVerified(context, ref)) return;
                  if (!mounted) return;
                  final sub = ref.read(subscriptionServiceProvider);
                  spend = await sub.recordCompareAi();
                } finally {
                  _panelChargeInFlight = false;
                }
                if (!mounted) return;
                if (spend.isFailure) {
                  // ignore: use_build_context_synchronously
                  _showQSpendFailure(
                    context,
                    feature: 'compare_ai',
                    result: spend,
                  );
                  return;
                }
              }
              setState(() => _matchScoreExpanded = !_matchScoreExpanded);
            },
            child: Row(
              children: [
                Container(
                  width: 38,
                  height: 38,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: AppTheme.brandSkyBlue.withValues(alpha: 0.09),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                      color: AppTheme.brandSkyBlue.withValues(alpha: 0.16),
                    ),
                  ),
                  child: const Icon(
                    Icons.person_search_rounded,
                    size: 19,
                    color: AppTheme.brandSkyBlue,
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
                              context.l10n?.personalizedMatch ??
                                  'Personalized Match',
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 14.5,
                                fontWeight: FontWeight.w800,
                                color: context.textPrimary,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          if (!ref.watch(premiumProvider)) ...[
                            const SizedBox(width: 8),
                            QorAmountBadge(
                              amount: ref
                                  .read(subscriptionServiceProvider)
                                  .creditCostForFeature('compare_ai'),
                              unlimited: false,
                              color: AppTheme.brandBlue,
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
                        child: matchStepText.isNotEmpty
                            ? Text(
                                matchStepText,
                                key: ValueKey(matchStepText),
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 11.5,
                                  color: AppTheme.brandBlue,
                                  fontStyle: FontStyle.italic,
                                  fontWeight: FontWeight.w500,
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              )
                            : Text(
                                context.l10n?.aiCompatibilityAnalysis ??
                                    'AI-powered compatibility analysis',
                                key: const ValueKey('subtitle'),
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 11.5,
                                  color: context.textSecondary,
                                ),
                              ),
                      ),
                    ],
                  ),
                ),
                if (isMatchLoading)
                  SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: AppTheme.brandSkyBlue,
                    ),
                  )
                else
                  Container(
                    width: 28,
                    height: 28,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: AppTheme.brandBlue.withValues(alpha: 0.08),
                      shape: BoxShape.circle,
                    ),
                    child: Icon(
                      _matchScoreExpanded
                          ? Icons.expand_less_rounded
                          : Icons.expand_more_rounded,
                      size: 19,
                      color: AppTheme.brandBlue,
                    ),
                  ),
              ],
            ),
          ),
          // Content area: only shown when expanded AND not loading
          // (prevents vertical expansion during analysis)
          if (_matchScoreExpanded && !isMatchLoading) ...[
            const SizedBox(height: 14),
            GestureDetector(
              onTap: () {},
              child: Column(
                children: [
                  if (!quizCompleted)
                    GestureDetector(
                      onTap: () => context.push('/quiz'),
                      child: Container(
                        width: double.infinity,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        decoration: BoxDecoration(
                          gradient: const LinearGradient(
                            colors: [
                              AppTheme.brandSkyBlue,
                              AppTheme.brandDeepBlue,
                            ],
                          ),
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Icon(
                              Icons.quiz_rounded,
                              size: 18,
                              color: Colors.white,
                            ),
                            const SizedBox(width: 8),
                            Text(
                              context.l10n?.completeQuiz ?? "Complete Quiz",
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 14,
                                fontWeight: FontWeight.w600,
                                color: Colors.white,
                              ),
                            ),
                          ],
                        ),
                      ),
                    )
                  else if (_matchScoreFetched) ...[
                    // Side-by-side product columns – shown only when all scores ready
                    IntrinsicHeight(
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: List.generate(productCount, (i) {
                          final product = widget.products[i];
                          final matchResult = matchStates[i].valueOrNull;
                          final matchScore = matchResult?.matchScore;
                          final reason = matchResult?.reason ?? '';
                          final topFactors =
                              matchResult?.topMatchFactors ?? const <String>[];
                          final missingFactors =
                              matchResult?.missingFactors ?? const <String>[];
                          final color = barColors[i % barColors.length];

                          final matchColor = matchScore == null
                              ? AppTheme.brandDeepBlue
                              : matchScore >= 80
                              ? AppTheme.scoreExcellent
                              : matchScore >= 60
                              ? AppTheme.scoreAverage
                              : AppTheme.error;

                          return Expanded(
                            child: GestureDetector(
                              onTap: matchScore != null
                                  ? () => _showMatchDetailOverlay(
                                      productName: product.name,
                                      matchScore: matchScore.toDouble(),
                                      reason: reason,
                                      color: color,
                                      topMatchFactors: topFactors,
                                      missingFactors: missingFactors,
                                    )
                                  : null,
                              child: Container(
                                margin: EdgeInsets.only(
                                  left: i == 0 ? 0 : 4,
                                  right: i == productCount - 1 ? 0 : 4,
                                ),
                                padding: const EdgeInsets.all(10),
                                decoration: BoxDecoration(
                                  color: matchColor.withValues(alpha: 0.06),
                                  borderRadius: BorderRadius.circular(16),
                                  border: Border.all(
                                    color: matchColor.withValues(alpha: 0.15),
                                  ),
                                ),
                                child: Column(
                                  mainAxisAlignment:
                                      MainAxisAlignment.spaceBetween,
                                  children: [
                                    Column(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        // AI match score circle.
                                        TweenAnimationBuilder<double>(
                                          tween: Tween(
                                            begin: 0,
                                            end: (matchScore ?? 0) / 100,
                                          ),
                                          duration: const Duration(
                                            milliseconds: 1200,
                                          ),
                                          curve: Curves.easeOutCubic,
                                          builder: (context, value, _) =>
                                              _buildMatchScoreRing(
                                                progress: value,
                                                color: matchColor,
                                                size: 46,
                                                strokeWidth: 4,
                                                fontSize: 11,
                                              ),
                                        ),
                                        const SizedBox(height: 8),
                                        // Product name
                                        Text(
                                          product.name.length >
                                                  (productCount > 2 ? 20 : 30)
                                              ? '${product.name.substring(0, productCount > 2 ? 18 : 28)}…'
                                              : product.name,
                                          style: GoogleFonts.plusJakartaSans(
                                            fontSize: productCount > 3
                                                ? 8
                                                : (productCount > 2 ? 9 : 10),
                                            fontWeight: FontWeight.w700,
                                            color: context.textPrimary,
                                          ),
                                          textAlign: TextAlign.center,
                                          maxLines: 2,
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                      ],
                                    ),
                                    Column(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        // Detail button
                                        if (matchScore != null) ...[
                                          const SizedBox(height: 8),
                                          Container(
                                            padding: const EdgeInsets.symmetric(
                                              horizontal: 10,
                                              vertical: 5,
                                            ),
                                            decoration: BoxDecoration(
                                              color: color.withValues(
                                                alpha: 0.12,
                                              ),
                                              borderRadius:
                                                  BorderRadius.circular(10),
                                            ),
                                            child: Text(
                                              _detailCtaLabel(),
                                              style:
                                                  GoogleFonts.plusJakartaSans(
                                                    fontSize: 9,
                                                    fontWeight: FontWeight.w700,
                                                    color: color,
                                                  ),
                                            ),
                                          ),
                                        ],
                                      ],
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          );
                        }),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  // ignore: unused_element
  Widget _buildExpandableCard({
    required IconData icon,
    required String title,
    required String subtitle,
    required List<Color> gradient,
    required bool isExpanded,
    required bool isLoading,
    required String? content,
    required VoidCallback onTap,
    Widget? contentWidget,
    bool isError = false,
    VoidCallback? onRetry,
    String? errorMsg,
    String? loadingStatusText,
    num? cost,
  }) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
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
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 14.5,
                                fontWeight: FontWeight.w800,
                                color: context.textPrimary,
                              ),
                            ),
                          ),
                          if (cost != null) ...[
                            const SizedBox(width: 8),
                            QorAmountBadge(
                              amount: cost,
                              unlimited: false,
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
                      // During loading: subtitle becomes step text with accent color
                      // After load: show normal subtitle
                      AnimatedSwitcher(
                        duration: const Duration(milliseconds: 250),
                        child:
                            isLoading &&
                                loadingStatusText != null &&
                                loadingStatusText.trim().isNotEmpty
                            ? Text(
                                loadingStatusText,
                                key: ValueKey(loadingStatusText),
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 11.5,
                                  color: gradient[0],
                                  fontStyle: FontStyle.italic,
                                  fontWeight: FontWeight.w500,
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              )
                            : Text(
                                subtitle,
                                key: const ValueKey('subtitle'),
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 11.5,
                                  color: context.textSecondary,
                                ),
                              ),
                      ),
                    ],
                  ),
                ),
                if (isLoading)
                  SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: gradient[0],
                    ),
                  )
                else
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
            ),
          ),
          // Error state with retry
          // Error state with retry
          if (isExpanded && isError && onRetry != null) ...[
            const SizedBox(height: 14),
            _buildAiError(onRetry, errorMsg: errorMsg),
          ]
          // Loading: no expansion, step text shown in subtitle above
          // Structured content widget (the ONLY content display path)
          else if (isExpanded && contentWidget != null) ...[
            const SizedBox(height: 14),
            GestureDetector(onTap: () {}, child: contentWidget),
          ],
        ],
      ),
    );
  }

  /// Generate composite document key for comparison reviews
  String _comparisonReviewDocKey() {
    final ids = widget.products.map((p) => p.id).toList()..sort();
    return ids.join('_');
  }

  Widget _buildUserReviewsSection() {
    final docKey = _comparisonReviewDocKey();

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: context.dividerColor),
        boxShadow: [
          BoxShadow(
            color: AppTheme.amber500.withValues(alpha: 0.04),
            blurRadius: 16,
            offset: const Offset(0, 4),
          ),
          const BoxShadow(
            color: Color(0x06000000),
            blurRadius: 8,
            offset: Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: AppTheme.amber500.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: const Icon(
                  Icons.forum_rounded,
                  size: 22,
                  color: AppTheme.amber500,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Text(
                  context.l10n?.userReviews ?? 'User Reviews',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: context.textPrimary,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),

          // Write review button
          GestureDetector(
            onTap: () => _showWriteReviewSheet(context),
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 12),
              decoration: BoxDecoration(
                gradient: _accentGradient,
                borderRadius: BorderRadius.circular(16),
              ),
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
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: Colors.white,
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 14),

          // Reviews from comparison_reviews collection (PocketBase)
          FutureBuilder<List<RecordModel>>(
            future: _reviewsFuture ??= () async {
              try {
                final result = await pb
                    .collection('comparison_reviews')
                    .getList(
                      filter: 'docKey = "$docKey"',
                      sort: '-timestamp',
                      perPage: 20,
                    )
                    .timeout(const Duration(seconds: 10));
                return result.items;
              } catch (_) {
                return <RecordModel>[];
              }
            }(),
            builder: (context, snapshot) {
              if (snapshot.connectionState == ConnectionState.waiting) {
                return const Center(
                  child: Padding(
                    padding: EdgeInsets.all(20),
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: AppTheme.brandBlue,
                    ),
                  ),
                );
              }
              if (snapshot.hasError) {
                return _buildEmptyReviews();
              }
              final records = snapshot.data ?? [];
              if (records.isEmpty) {
                return _buildEmptyReviews();
              }
              // Sort: YouTube-style algorithm (Wilson score + recency bonus + reply count)
              final sorted = List<RecordModel>.from(records);
              sorted.sort((a, b) {
                double ytScore(RecordModel r) {
                  final likes = ((r.data['likedBy'] as List?)?.length ?? 0);
                  final dislikes =
                      ((r.data['dislikedBy'] as List?)?.length ?? 0);
                  final replies =
                      ((r.data['replyCount'] as num?)?.toInt() ?? 0);
                  final ts =
                      DateTime.tryParse(
                        r.data['timestamp']?.toString() ?? '',
                      ) ??
                      DateTime(2000);
                  final total = likes + dislikes;
                  // Wilson score lower bound (95% confidence)
                  double wilson = 0;
                  if (total > 0) {
                    final p = likes / total;
                    const z = 1.96;
                    wilson =
                        (p +
                            z * z / (2 * total) -
                            z *
                                sqrt(
                                  p * (1 - p) / total +
                                      z * z / (4 * total * total),
                                )) /
                        (1 + z * z / total);
                  }
                  final hoursSince = DateTime.now()
                      .difference(ts)
                      .inHours
                      .toDouble();
                  // Recency bonus decays over 72 hours
                  final recency = exp(-hoursSince / 72.0);
                  return wilson * 100 + replies * 0.8 + recency * 5;
                }

                return ytScore(b).compareTo(ytScore(a));
              });
              return Column(
                children: sorted.map((record) {
                  final data = record.data;
                  return _CompareReviewCard(
                    data: data,
                    docId: record.id,
                    onConfirmDelete: _confirmDeleteReview,
                  );
                }).toList(),
              );
            },
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyReviews() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
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
            context.l10n?.beFirstToReview ??
                'Be the first to share your thoughts!',
            style: GoogleFonts.plusJakartaSans(
              fontSize: 12,
              color: context.textTertiaryColor,
            ),
          ),
        ],
      ),
    );
  }

  // ignore: unused_element
  Widget _buildComparisonReviewItem(Map<String, dynamic> data, String docId) {
    // Preserved for backwards compat — now delegated to _CompareReviewCard
    return _CompareReviewCard(
      data: data,
      docId: docId,
      onConfirmDelete: _confirmDeleteReview,
    );
  }

  void _confirmDeleteReview(String docId) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: Theme.of(ctx).colorScheme.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Text(
          'Yorumu Sil',
          style: GoogleFonts.plusJakartaSans(
            fontSize: 16,
            fontWeight: FontWeight.w700,
            color: Theme.of(ctx).colorScheme.onSurface,
          ),
        ),
        content: Text(
          'Bu yorumu silmek istiyor musun?',
          style: GoogleFonts.plusJakartaSans(
            fontSize: 14,
            color: Theme.of(ctx).colorScheme.onSurface.withValues(alpha: 0.7),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: Text(
              'İptal',
              style: GoogleFonts.plusJakartaSans(
                fontWeight: FontWeight.w600,
                color: Theme.of(
                  ctx,
                ).colorScheme.onSurface.withValues(alpha: 0.5),
              ),
            ),
          ),
          TextButton(
            onPressed: () async {
              Navigator.of(ctx).pop();
              try {
                await pb.collection('comparison_reviews').delete(docId);
                if (mounted) setState(() => _reviewsFuture = null);
              } catch (e) {
                if (mounted) {
                  // 404 = already deleted → just refresh silently
                  setState(() => _reviewsFuture = null);
                  final is404 = e.toString().contains('404');
                  if (!is404) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: Text('Silinemedi: $e'),
                        behavior: SnackBarBehavior.floating,
                      ),
                    );
                  }
                }
              }
            },
            child: Text(
              'Sil',
              style: GoogleFonts.plusJakartaSans(
                fontWeight: FontWeight.w700,
                color: AppTheme.error,
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ignore: unused_element
  String _timeAgo(DateTime date) {
    final diff = DateTime.now().difference(date);
    if (diff.inDays > 30) return '${(diff.inDays / 30).floor()}mo ago';
    if (diff.inDays > 0) return '${diff.inDays}d ago';
    if (diff.inHours > 0) return '${diff.inHours}h ago';
    return '${diff.inMinutes}m ago';
  }

  void _showWriteReviewSheet(BuildContext ctx) {
    final user = ref.read(userProfileProvider).valueOrNull;
    final userId = user?.uid ?? 'anonymous';
    // Resolve display name: displayName → email prefix → Anonymous
    String resolvedDisplayName;
    if (user != null && user.displayName.isNotEmpty) {
      resolvedDisplayName = user.displayName;
    } else if (user != null && user.email.isNotEmpty) {
      resolvedDisplayName = user.email.split('@').first;
    } else {
      resolvedDisplayName = 'Anonymous';
    }
    bool isGeneratedAvatarUrl(String photoUrl) {
      final value = photoUrl.trim().toLowerCase();
      return value.contains('ui-avatars.com') ||
          value.contains('/assets/images/robot') ||
          value.contains('/assets/images/bot') ||
          value.contains('default_avatar');
    }

    final rawAuthorPhotoUrl = (user?.photoURL ?? '').trim();
    final authAuthorPhotoUrl =
        pb.authStore.record?.getStringValue('photoURL').trim() ?? '';
    final authorPhotoUrl =
        rawAuthorPhotoUrl.isNotEmpty && !isGeneratedAvatarUrl(rawAuthorPhotoUrl)
        ? rawAuthorPhotoUrl
        : (authAuthorPhotoUrl.isNotEmpty &&
                  !isGeneratedAvatarUrl(authAuthorPhotoUrl)
              ? authAuthorPhotoUrl
              : '');
    final textController = TextEditingController();

    showDialog(
      context: ctx,
      barrierDismissible: true,
      builder: (dialogCtx) => StatefulBuilder(
        builder: (dialogCtx, setDialogState) {
          final theme = Theme.of(dialogCtx);
          return Dialog(
            backgroundColor: theme.colorScheme.surface,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(20),
            ),
            insetPadding: const EdgeInsets.symmetric(
              horizontal: 16,
              vertical: 40,
            ),
            child: _WriteReviewDialogContent(
              textController: textController,
              products: widget.products,
              accentGradient: _accentGradient,
              onSubmit: (int rating) async {
                HapticFeedback.mediumImpact();
                try {
                  final docKey = _comparisonReviewDocKey();
                  final productIds = widget.products.map((p) => p.id).toList()
                    ..sort();
                  await pb
                      .collection('comparison_reviews')
                      .create(
                        body: {
                          'docKey': docKey,
                          'userId': userId,
                          'displayName': resolvedDisplayName,
                          if (authorPhotoUrl.isNotEmpty)
                            'authorPhotoURL': authorPhotoUrl,
                          'reviewText': textController.text.trim(),
                          'timestamp': DateTime.now().toUtc().toIso8601String(),
                          'productIds': productIds,
                          'rating': rating,
                          'likedBy': <String>[],
                          'dislikedBy': <String>[],
                        },
                      );
                  if (dialogCtx.mounted) Navigator.of(dialogCtx).pop();
                  // Refresh reviews list
                  setState(() => _reviewsFuture = null);
                  if (ctx.mounted) {
                    ScaffoldMessenger.of(ctx).showSnackBar(
                      SnackBar(
                        content: Text(
                          ctx.l10n?.reviewSubmitted ?? 'Yorum gönderildi! ✨',
                          style: GoogleFonts.plusJakartaSans(fontSize: 13),
                        ),
                        behavior: SnackBarBehavior.floating,
                      ),
                    );
                  }
                } catch (e) {
                  if (ctx.mounted) {
                    ScaffoldMessenger.of(ctx).showSnackBar(
                      SnackBar(
                        content: Text('Yorum gönderilemedi: $e'),
                        behavior: SnackBarBehavior.floating,
                      ),
                    );
                  }
                }
              },
              onCancel: () => Navigator.of(dialogCtx).pop(),
            ),
          );
        },
      ),
    );
  }

  // ignore: unused_element
  Widget _buildActionButton(IconData icon, String label, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 12),
        decoration: BoxDecoration(
          color: context.surfaceVariantColor,
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: AppTheme.brandBlue.withValues(alpha: 0.23)),
          boxShadow: [
            BoxShadow(
              color: AppTheme.brandBlue.withValues(alpha: 0.11),
              blurRadius: 12,
              offset: const Offset(0, 3),
            ),
            const BoxShadow(
              color: Color(0x06000000),
              blurRadius: 6,
              offset: Offset(0, 2),
            ),
          ],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            ShaderMask(
              shaderCallback: (bounds) => _accentGradient.createShader(bounds),
              child: Icon(icon, color: Colors.white, size: 18),
            ),
            const SizedBox(width: 8),
            Text(
              label,
              style: GoogleFonts.plusJakartaSans(
                color: context.textSecondary,
                fontSize: 13,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CompareSpecValue extends StatelessWidget {
  final String value;
  final List<String> parts;
  final bool isMissing;
  final bool isYes;
  final bool isNo;
  final _CompareValueRank rank;

  const _CompareSpecValue({
    required this.value,
    required this.parts,
    required this.isMissing,
    required this.isYes,
    required this.isNo,
    this.rank = _CompareValueRank.neutral,
  });

  @override
  Widget build(BuildContext context) {
    final isBetter = rank == _CompareValueRank.better;
    final isWeaker = rank == _CompareValueRank.weaker;

    Widget decorate(Widget child) {
      if (!isBetter && !isWeaker) return child;
      final color = isBetter ? AppTheme.scoreExcellent : AppTheme.error;
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 4),
        decoration: BoxDecoration(
          color: color.withValues(alpha: isBetter ? 0.12 : 0.055),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: color.withValues(alpha: isBetter ? 0.38 : 0.12),
          ),
        ),
        child: child,
      );
    }

    if (isMissing) {
      return Text(
        '—',
        style: GoogleFonts.inter(
          fontSize: 11,
          height: 1.4,
          fontWeight: FontWeight.w600,
          color: context.textTertiaryColor,
        ),
        textAlign: TextAlign.center,
      );
    }

    final trimmed = value.trim();
    if (isYes || isNo || parts.length <= 1) {
      final rendered = isYes ? '✓ $trimmed' : (isNo ? '✗ $trimmed' : trimmed);
      return decorate(
        Text(
          rendered,
          style: GoogleFonts.inter(
            fontSize: 11,
            height: 1.4,
            fontWeight: isBetter ? FontWeight.w800 : FontWeight.w600,
            color: isBetter
                ? AppTheme.scoreExcellent
                : (isYes
                      ? AppTheme.scoreExcellent
                      : (isNo ? AppTheme.error : context.textPrimary)),
          ),
          textAlign: TextAlign.center,
          softWrap: true,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
        ),
      );
    }

    final primary = Theme.of(context).colorScheme.primary;
    final isTr = Localizations.localeOf(context).languageCode == 'tr';
    final countLabel = isTr
        ? '${parts.length} özellik'
        : '${parts.length} specs';
    return decorate(
      Row(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Flexible(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
              decoration: BoxDecoration(
                color: primary.withValues(alpha: 0.10),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: primary.withValues(alpha: 0.18)),
              ),
              child: Text(
                countLabel,
                textAlign: TextAlign.center,
                style: GoogleFonts.inter(
                  fontSize: 10,
                  height: 1.25,
                  fontWeight: isBetter ? FontWeight.w800 : FontWeight.w700,
                  color: isBetter ? AppTheme.scoreExcellent : primary,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Isolate-safe helpers ────────────────────────────────────────────────────

/// Top-level function for compute() — builds grouped specs from serialised
/// product data (no platform channels, no UI objects).
/// Input: List of {'specSections': {...}, 'specs': {...}} per product.
String _compareNormalizeText(String input) {
  return input
      .toLowerCase()
      .replaceAll('ı', 'i')
      .replaceAll('İ', 'i')
      .replaceAll('ç', 'c')
      .replaceAll('Ç', 'c')
      .replaceAll('ğ', 'g')
      .replaceAll('Ğ', 'g')
      .replaceAll('ö', 'o')
      .replaceAll('Ö', 'o')
      .replaceAll('ş', 's')
      .replaceAll('Ş', 's')
      .replaceAll('ü', 'u')
      .replaceAll('Ü', 'u')
      .replaceAll('ä', 'a')
      .replaceAll('ß', 'ss')
      .replaceAll('é', 'e')
      .replaceAll(RegExp(r'[^a-z0-9]+'), ' ')
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim();
}

String _compareCategory(String raw) {
  final cat = _compareNormalizeText(raw);
  if (cat.contains('notebook') || cat.contains('laptop')) return 'laptops';
  if (cat == 'ssd' || cat == 'ssds') return 'ssds';
  if (cat == 'psu' || cat == 'psus' || cat.contains('power supply')) {
    return 'psu';
  }
  return cat;
}

int _compareGroupPriority(String raw) {
  final k = _compareNormalizeText(raw);
  if (k.contains('one cikan') ||
      k.contains('highlight') ||
      k.contains('key spec')) {
    return 0;
  }
  if (k.contains('ekran') || k.contains('display') || k.contains('screen')) {
    return 1;
  }
  if (k.contains('batarya') ||
      k.contains('battery') ||
      k == 'pil' ||
      k.contains('charging') ||
      k.contains('sarj')) {
    return 2;
  }
  if (k.contains('kamera') || k.contains('camera') || k.contains('photo')) {
    return 3;
  }
  if (k.contains('temel bilgi') ||
      k.contains('genel bilgi') ||
      k.contains('basic information') ||
      k.contains('general information') ||
      k == 'general') {
    return 4;
  }
  if (k.contains('tasarim') ||
      k.contains('design') ||
      k.contains('dimension')) {
    return 5;
  }
  if (k.contains('donan') ||
      k.contains('hardware') ||
      k.contains('processor') ||
      k.contains('islemci') ||
      k.contains('yonga') ||
      k.contains('performance')) {
    return 6;
  }
  if (k.contains('bellek') || k.contains('memory') || k.contains('ram')) {
    return 7;
  }
  if (k.contains('depolama') || k.contains('storage')) return 8;
  if (k.contains('ag') ||
      k.contains('network') ||
      k.contains('baglanti') ||
      k.contains('connect') ||
      k.contains('wireless') ||
      k.contains('wifi') ||
      k.contains('bluetooth')) {
    return 9;
  }
  if (k.contains('isletim') ||
      k.contains('software') ||
      k.contains('operating') ||
      k.contains(' os')) {
    return 10;
  }
  if (k.contains('ses') || k.contains('audio') || k.contains('multimedia')) {
    return 11;
  }
  if (k.contains('ozellik') ||
      k.contains('feature') ||
      k.contains('sensor') ||
      k.contains('security')) {
    return 12;
  }
  return 900;
}

const Map<String, String> _compareExactSpecAliases = {
  'battery capacity': 'Battery capacity',
  'battery capacity typical': 'Battery capacity',
  'battery capacity mah': 'Battery capacity',
  'batarya kapasitesi': 'Battery capacity',
  'pil kapasitesi': 'Battery capacity',
  'battery endurance in cycles': 'Battery cycle life',
  'battery cycle count': 'Battery cycle life',
  'charging port': 'Charging port',
  'usb connection type': 'Charging port',
  'usb connector type': 'Charging port',
  'usb type': 'Charging port',
  'usb baglanti tipi': 'Charging port',
  'fast charging': 'Fast charging',
  'fast charge': 'Fast charging',
  'hizli sarj': 'Fast charging',
  'fast charging features': 'Fast charging features',
  'fast charging power max': 'Fast charging power',
  'fast charging power': 'Fast charging power',
  'charging power': 'Fast charging power',
  'wireless charging': 'Wireless charging',
  'kablosuz sarj': 'Wireless charging',
  'removable battery': 'Removable battery',
  'video playback': 'Video playback',
  'screen size': 'Screen size',
  'display size': 'Screen size',
  'display diagonal': 'Screen size',
  'ekran boyutu': 'Screen size',
  'resolution': 'Resolution',
  'display resolution': 'Resolution',
  'screen resolution': 'Resolution',
  'ekran cozunurlugu': 'Resolution',
  'panel type': 'Panel type',
  'display type': 'Panel type',
  'screen technology': 'Panel type',
  'display technology': 'Panel type',
  'refresh rate': 'Refresh rate',
  'screen refresh rate': 'Refresh rate',
  'processor': 'Processor',
  'processor model': 'Processor',
  'cpu': 'Processor',
  'cpu model': 'Processor',
  'islemci modeli': 'Processor',
  'processor family': 'Processor family',
  'processor cores': 'CPU cores',
  'cpu cores': 'CPU cores',
  'core count': 'CPU cores',
  'chipset': 'Chipset',
  'soc': 'Chipset',
  'yonga seti': 'Chipset',
  'gpu': 'GPU',
  'graphics processor': 'GPU',
  'graphics card': 'GPU',
  'gpu model': 'GPU',
  'ram': 'RAM',
  'memory ram': 'RAM',
  'internal memory': 'RAM',
  'bellek ram': 'RAM',
  'ram type': 'RAM type',
  'memory type': 'RAM type',
  'internal memory type': 'RAM type',
  'storage': 'Storage',
  'internal storage': 'Storage',
  'total storage capacity': 'Storage',
  'ssd': 'Storage',
  'sabit disk ssd boyutu': 'Storage',
  'dahili hafiza': 'Storage',
  'storage media': 'Storage type',
  'main camera': 'Main camera',
  'main camera resolution': 'Main camera',
  'rear camera': 'Main camera',
  'camera resolution': 'Main camera',
  'front camera': 'Front camera',
  'front camera resolution': 'Front camera',
  'wi fi': 'Wi-Fi',
  'wi fi standards': 'Wi-Fi',
  'wifi': 'Wi-Fi',
  'wireless': 'Wi-Fi',
  'bluetooth': 'Bluetooth',
  'bluetooth version': 'Bluetooth',
  'nfc': 'NFC',
  '5g': '5G',
  '5g support': '5G',
  '4g': '4G',
  'lte': '4G',
  'operating system': 'Operating system',
  'os': 'Operating system',
  'weight': 'Weight',
  'agirlik': 'Weight',
  'dimensions': 'Dimensions',
  'thickness': 'Thickness',
  'water resistance': 'Water resistance',
  'waterproof': 'Water resistance',
  'color': 'Color',
  'sensors': 'Sensors',
};

String _compareCanonicalSpecKey(String key, [String value = '']) {
  final k = _compareNormalizeText(key);
  if (k.isEmpty) return 'Specification';
  if (k.contains('required charging power') || k.contains('charging power')) {
    return 'Fast charging power';
  }
  if (k.contains('usb type c charging port') &&
      RegExp(
        r'^(yes|no|var|yok|true|false)$',
        caseSensitive: false,
      ).hasMatch(value.trim())) {
    return 'USB-C charging';
  }
  final exact = _compareExactSpecAliases[k];
  if (exact != null) return exact;
  if (k == 'charging' || k == 'charge') {
    final v = _compareNormalizeText(value);
    if (RegExp(r'\b(usb|type c|typec|lightning|micro usb)\b').hasMatch(v)) {
      return 'Charging port';
    }
    return 'Charging';
  }
  for (final entry in _compareExactSpecAliases.entries) {
    final alias = entry.key;
    if (alias.length > 3 &&
        (k == alias || k.contains(alias) || alias.contains(k))) {
      return entry.value;
    }
  }
  return key
      .replaceAll(RegExp(r':$'), '')
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim();
}

String _compareCanonicalSection(String section, [String key = '']) {
  final hay = '${_compareNormalizeText(section)} ${_compareNormalizeText(key)}';
  bool has(List<String> needles) => needles.any(hay.contains);
  if (has(['display', 'screen', 'ekran'])) return 'Display';
  if (has(['battery', 'batarya', 'pil', 'charging', 'sarj'])) return 'Battery';
  if (has(['camera', 'kamera', 'photo', 'video'])) return 'Camera';
  if (has([
    'processor',
    'cpu',
    'islemci',
    'chipset',
    'yonga',
    'gpu',
    'graphics',
    'grafik',
  ])) {
    return 'Performance';
  }
  if (has(['memory', 'ram', 'bellek', 'storage', 'depolama', 'ssd', 'hdd'])) {
    return 'Memory and storage';
  }
  if (has([
    'wi fi',
    'wifi',
    'wlan',
    'bluetooth',
    'network',
    'baglanti',
    'usb',
    'nfc',
    'sim',
    '5g',
    '4g',
  ])) {
    return 'Connectivity';
  }
  if (has([
    'design',
    'tasarim',
    'body',
    'dimension',
    'weight',
    'agirlik',
    'thickness',
    'kalinlik',
  ])) {
    return 'Design';
  }
  if (has(['audio', 'sound', 'speaker', 'ses', 'hoparlor'])) return 'Audio';
  if (has([
    'software',
    'operating system',
    'isletim',
    'os',
    'windows',
    'android',
    'ios',
  ])) {
    return 'Software';
  }
  if (has(['sensor', 'fingerprint', 'gps', 'gyro'])) return 'Sensors';
  return section
          .replaceAll(RegExp(r':$'), '')
          .replaceAll(RegExp(r'\s+'), ' ')
          .trim()
          .isEmpty
      ? 'General'
      : section
            .replaceAll(RegExp(r':$'), '')
            .replaceAll(RegExp(r'\s+'), ' ')
            .trim();
}

String _mergeCompareValue(String existing, String incoming) {
  final a = existing.trim();
  final b = incoming.trim();
  if (a.isEmpty) return b;
  if (b.isEmpty || _compareNormalizeText(a) == _compareNormalizeText(b)) {
    return a;
  }
  if (_compareNormalizeText(a).contains(_compareNormalizeText(b))) return a;
  if (_compareNormalizeText(b).contains(_compareNormalizeText(a))) return b;
  final lines = a
      .split('\n')
      .map((x) => x.trim())
      .where((x) => x.isNotEmpty)
      .toList();
  for (final line
      in b.split('\n').map((x) => x.trim()).where((x) => x.isNotEmpty)) {
    if (!lines.any(
      (x) => _compareNormalizeText(x) == _compareNormalizeText(line),
    )) {
      lines.add(line);
    }
  }
  return lines.join('\n');
}

Map<String, dynamic> _canonicalCompareDisplaySpecs(Map<String, dynamic> p) {
  final out = <String, Map<String, String>>{};
  void add(String section, String key, dynamic value) {
    final v = value?.toString().trim() ?? '';
    if (v.isEmpty || v == 'null' || v == '?') return;
    final canonicalKey = _compareCanonicalSpecKey(key, v);
    final canonicalSection = _compareCanonicalSection(section, canonicalKey);
    final group = out.putIfAbsent(canonicalSection, () => <String, String>{});
    group[canonicalKey] = _mergeCompareValue(group[canonicalKey] ?? '', v);
  }

  final sections = (p['specSections'] as Map?)?.cast<String, dynamic>() ?? {};
  for (final sectionEntry in sections.entries) {
    final body = sectionEntry.value;
    if (body is Map) {
      for (final spec in body.entries) {
        if (spec.value is Map) {
          for (final sub in (spec.value as Map).entries) {
            add(sectionEntry.key, sub.key.toString(), sub.value);
          }
        } else {
          add(sectionEntry.key, spec.key.toString(), spec.value);
        }
      }
    }
  }
  final specs = (p['specs'] as Map?)?.cast<String, dynamic>() ?? {};
  specs.forEach((key, value) {
    final v = value?.toString().trim() ?? '';
    if (v.isEmpty || v == 'null' || v == '?') return;
    final canonicalKey = _compareCanonicalSpecKey(key, v);
    var merged = false;
    for (final group in out.values) {
      if (group.containsKey(canonicalKey)) {
        group[canonicalKey] = _mergeCompareValue(group[canonicalKey] ?? '', v);
        merged = true;
        break;
      }
    }
    if (!merged) add('General', key, value);
  });
  return out;
}

Map<String, String> _compareFlatSpecPool(Map<String, dynamic> p) {
  final pool = <String, String>{};
  void add(String key, dynamic value) {
    final v = value?.toString().trim() ?? '';
    final k = _compareCanonicalSpecKey(key.trim(), v);
    if (k.isEmpty || v.isEmpty || v == 'null' || v == '?') return;
    pool[k] = _mergeCompareValue(pool[k] ?? '', v);
  }

  final specs = (p['specs'] as Map?)?.cast<String, dynamic>() ?? {};
  specs.forEach(add);
  final sections = (p['specSections'] as Map?)?.cast<String, dynamic>() ?? {};
  for (final section in sections.values) {
    if (section is Map) {
      section.cast<dynamic, dynamic>().forEach((key, value) {
        add(key.toString(), value);
      });
    }
  }
  return pool;
}

String _findCompareValue(Map<String, String> pool, List<String> aliases) {
  for (final alias in aliases.map(_compareNormalizeText)) {
    for (final entry in pool.entries) {
      final key = _compareNormalizeText(entry.key);
      if (key == alias || key.contains(alias) || alias.contains(key)) {
        return entry.value;
      }
    }
  }
  return '';
}

String _firstUsefulLine(String value) {
  for (final line in value.split('\n')) {
    final t = line.trim();
    if (t.isNotEmpty) return t;
  }
  return value.trim();
}

String _lineMatching(String value, RegExp pattern) {
  for (final line in value.split('\n')) {
    final t = line.trim();
    if (pattern.hasMatch(t)) return t;
  }
  final match = pattern.firstMatch(value);
  return match?.group(0)?.trim() ?? '';
}

String _combineNonEmpty(List<String> parts) {
  final clean = parts.map((p) => p.trim()).where((p) => p.isNotEmpty).toList();
  return clean.join(' ');
}

String _laptopComparableValue(Map<String, String> pool, String id) {
  switch (id) {
    case 'display_size':
      final v = _findCompareValue(pool, [
        'Display diagonal',
        'Display Size',
        'Bildschirmdiagonale',
      ]);
      if (v.isNotEmpty) return _firstUsefulLine(v);
      final display = _findCompareValue(pool, ['Display']);
      return _lineMatching(
        display,
        RegExp(r'\d+(?:[.,]\d+)?\s*(?:"|zoll|inch|cm)', caseSensitive: false),
      );
    case 'display_resolution':
      final v = _findCompareValue(pool, [
        'Display resolution',
        'Resolution',
        'Auflösung',
      ]);
      if (v.isNotEmpty) return _firstUsefulLine(v);
      return _lineMatching(
        _findCompareValue(pool, ['Display']),
        RegExp(r'\d{3,5}\s*x\s*\d{3,5}', caseSensitive: false),
      );
    case 'processor':
      final family = _findCompareValue(pool, ['Processor family']);
      final model = _findCompareValue(pool, [
        'Processor model',
        'Processor Model',
      ]);
      final combined = _combineNonEmpty([family, model]);
      if (combined.isNotEmpty) return combined;
      return _firstUsefulLine(
        _findCompareValue(pool, ['CPU', 'Processor', 'Prozessor']),
      );
    case 'cpu_cores':
      final cores = _findCompareValue(pool, ['Processor cores', 'Cores']);
      if (cores.isNotEmpty) return cores;
      final cpu = _findCompareValue(pool, ['CPU', 'Processor']);
      return _lineMatching(
        cpu,
        RegExp(r'\d+\s*(?:core|cores|kern)', caseSensitive: false),
      );
    case 'graphics':
      final gpu = _findCompareValue(pool, [
        'On-board graphics card model',
        'Discrete graphics card model',
        'Graphics Card',
        'GPU',
        'Grafik',
      ]);
      return _firstUsefulLine(gpu);
    case 'ram':
      final memory = _findCompareValue(pool, [
        'Internal memory',
        'Memory (RAM)',
        'RAM',
      ]);
      final type = _findCompareValue(pool, [
        'Internal memory type',
        'Memory type',
      ]);
      final first = _firstUsefulLine(memory);
      if (first.isEmpty) return '';
      return type.isNotEmpty &&
              !first.toLowerCase().contains(type.toLowerCase())
          ? '$first $type'
          : first;
    case 'storage':
      final total = _findCompareValue(pool, [
        'Total storage capacity',
        'Storage',
        'SSD',
      ]);
      final media = _findCompareValue(pool, ['Storage media']);
      final first = _firstUsefulLine(total);
      if (first.isEmpty) return '';
      return media.isNotEmpty &&
              !first.toLowerCase().contains(media.toLowerCase())
          ? '$first $media'
          : first;
    case 'battery':
      final cap = _findCompareValue(pool, [
        'Battery capacity',
        'Battery',
        'Akku',
      ]);
      final wh = _lineMatching(
        cap,
        RegExp(r'\d+(?:[.,]\d+)?\s*wh', caseSensitive: false),
      );
      return wh.isNotEmpty ? wh : _firstUsefulLine(cap);
    case 'weight':
      return _firstUsefulLine(_findCompareValue(pool, ['Weight', 'Gewicht']));
    case 'os':
      return _firstUsefulLine(
        _findCompareValue(pool, ['Operating System', 'Betriebssystem', 'OS']),
      );
    case 'wireless':
      final wifi = _findCompareValue(pool, [
        'Wi-Fi standards',
        'Wireless',
        'WLAN',
      ]);
      return _firstUsefulLine(wifi);
  }
  return '';
}

Map<String, Map<String, List<String>>> _buildComparableSpecs(
  List<Map<String, dynamic>> productsData,
) {
  if (productsData.isEmpty) return {};
  final cat = _compareCategory(
    productsData.first['category']?.toString() ?? '',
  );
  if (cat != 'laptops') return {};

  const rows = <String, String>{
    'Display size': 'display_size',
    'Resolution': 'display_resolution',
    'Processor': 'processor',
    'CPU cores': 'cpu_cores',
    'Graphics': 'graphics',
    'RAM': 'ram',
    'Storage': 'storage',
    'Battery': 'battery',
    'Weight': 'weight',
    'Operating system': 'os',
    'Wireless': 'wireless',
  };

  final pools = productsData.map(_compareFlatSpecPool).toList();
  final group = <String, List<String>>{};
  for (final entry in rows.entries) {
    final values = pools.map((pool) {
      final value = _laptopComparableValue(pool, entry.value).trim();
      return value.isEmpty ? '—' : value;
    }).toList();
    if (values.any((v) => v != '—')) group[entry.key] = values;
  }
  return group.isEmpty ? {} : {'Comparable Specs': group};
}

/// Aligns the already-localized, correction-cleaned spec sections of every
/// compared product into a single side-by-side table, WITHOUT any further
/// translation or canonicalisation. Section order and labels are kept exactly
/// as `ProductEntity.localizedSpecSections` produced them (i.e. identical to the
/// admin modal / product-detail Specs tab), so the compare table can never show
/// a stale machine-translation artefact such as "6.9 İnç" → "6.9 I'm not".
///
/// Input: one `{section: {label: value}}` map per product (column order).
/// Output: `{section: {label: [valueCol0, valueCol1, ...]}}`; a column with no
/// value for a given label gets '—'. Rows where every column is missing are
/// dropped. Section + label order follow first-seen order across the columns.
Map<String, Map<String, List<String>>> _alignLocalizedCompareSpecs(
  List<Map<String, Map<String, String>>> sectionsPerProduct,
) {
  final productCount = sectionsPerProduct.length;
  if (productCount == 0) return {};

  // Section order: first product that has it wins; later products only add
  // sections the earlier ones lacked.
  final sectionOrder = <String>[];
  for (final sections in sectionsPerProduct) {
    for (final section in sections.keys) {
      if (!sectionOrder.contains(section)) sectionOrder.add(section);
    }
  }

  final result = <String, Map<String, List<String>>>{};
  for (final section in sectionOrder) {
    // Label order within the section: same first-seen rule across columns.
    final labelOrder = <String>[];
    for (final sections in sectionsPerProduct) {
      final rows = sections[section];
      if (rows == null) continue;
      for (final label in rows.keys) {
        if (!labelOrder.contains(label)) labelOrder.add(label);
      }
    }

    final group = <String, List<String>>{};
    for (final label in labelOrder) {
      final values = <String>[
        for (final sections in sectionsPerProduct)
          () {
            final v = sections[section]?[label]?.trim() ?? '';
            return v.isEmpty ? '—' : v;
          }(),
      ];
      if (values.any((v) => v != '—')) group[label] = values;
    }
    if (group.isNotEmpty) result[section] = group;
  }
  return result;
}

// ignore: unused_element
Map<String, Map<String, List<String>>> _buildGroupedSpecsIsolate(
  List<Map<String, dynamic>> productsData,
) {
  final result = <String, Map<String, List<String>>>{};
  final comparableSpecs = _buildComparableSpecs(productsData);
  final productCount = productsData.length;

  Map<String, dynamic> displaySpecs(Map<String, dynamic> p) {
    final canonical = _canonicalCompareDisplaySpecs(p);
    if (canonical.isNotEmpty) return canonical;
    return (p['specs'] as Map?)?.cast<String, dynamic>() ?? {};
  }

  // Collect all group names from all products
  final allGroupNames = <String>{};
  for (final p in productsData) {
    for (final entry in displaySpecs(p).entries) {
      if (entry.value is Map && (entry.value as Map).isNotEmpty) {
        allGroupNames.add(entry.key);
      }
    }
  }

  final sortedGroupNames = allGroupNames.toList()
    ..sort((a, b) {
      final priority = _compareGroupPriority(
        a,
      ).compareTo(_compareGroupPriority(b));
      if (priority != 0) return priority;
      return a.compareTo(b);
    });

  for (final groupName in sortedGroupNames) {
    final allKeys = <String>{};
    for (final p in productsData) {
      final group = displaySpecs(p)[groupName];
      if (group is Map) {
        for (final entry in group.entries) {
          if (entry.value is Map) {
            for (final subKey in (entry.value as Map).keys) {
              allKeys.add(subKey.toString());
            }
          } else {
            allKeys.add(entry.key.toString());
          }
        }
      }
    }
    if (allKeys.isEmpty) continue;

    final groupSpecs = <String, List<String>>{};
    for (final specKey in allKeys) {
      final values = <String>[];
      for (final p in productsData) {
        final group = displaySpecs(p)[groupName];
        String val = '—';
        if (group is Map) {
          if (group.containsKey(specKey)) {
            final v = group[specKey];
            val =
                (v != null &&
                    v.toString().isNotEmpty &&
                    v.toString() != 'null' &&
                    v.toString() != '?')
                ? v.toString()
                : '—';
          } else {
            for (final entry in group.entries) {
              if (entry.value is Map &&
                  (entry.value as Map).containsKey(specKey)) {
                final v = (entry.value as Map)[specKey];
                val =
                    (v != null &&
                        v.toString().isNotEmpty &&
                        v.toString() != 'null' &&
                        v.toString() != '?')
                    ? v.toString()
                    : '—';
                break;
              }
            }
          }
        }
        values.add(val);
      }
      if (values.any((v) => v != '—')) {
        groupSpecs[specKey] = values;
      }
    }
    if (groupSpecs.isNotEmpty) {
      result[groupName] = groupSpecs;
    }
  }

  // Handle flat (ungrouped) specs
  final flatSpecs = <String, List<String>>{};
  for (final p in productsData) {
    for (final entry in displaySpecs(p).entries) {
      if (entry.value is! Map) {
        flatSpecs.putIfAbsent(entry.key, () => List.filled(productCount, '—'));
      }
    }
  }
  for (int i = 0; i < productCount; i++) {
    for (final entry in displaySpecs(productsData[i]).entries) {
      if (entry.value is! Map && flatSpecs.containsKey(entry.key)) {
        final v = entry.value;
        flatSpecs[entry.key]![i] =
            (v != null && v.toString().isNotEmpty && v.toString() != 'null')
            ? v.toString()
            : '—';
      }
    }
  }
  if (flatSpecs.isNotEmpty) {
    result['Other'] = flatSpecs;
  }
  for (final entry in comparableSpecs.entries) {
    result.putIfAbsent(entry.key, () => entry.value);
  }

  return result;
}
