part of '../compare_screen.dart';

enum _AiPanelType { deepAnalysis, alternatives, advisor, prediction }

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
  late Map<String, bool> _expandedGroups;
  late Map<String, Map<String, List<String>>> _groupedSpecs;

  // Deep Analysis state (merged with AI Analysis structured)
  bool _deepAnalysisExpanded = false;
  bool _deepAnalysisLoading = false;
  String? _deepAnalysisResult;
  Map<String, dynamic>? _deepAnalysisStructured;
  bool _deepAnalysisError = false;
  String? _deepAnalysisErrorMsg;

  // Smart Alternatives state
  bool _alternativesExpanded = false;
  bool _alternativesLoading = false;
  String? _alternativesResult;
  Map<String, dynamic>? _alternativesStructured;
  bool _alternativesError = false;
  String? _alternativesErrorMsg;

  // AI Advisor state
  bool _advisorExpanded = false;
  bool _advisorLoading = false;
  String? _advisorResult;
  Map<String, dynamic>? _advisorStructured;
  bool _advisorError = false;
  String? _advisorErrorMsg;

  // Price Prediction state
  bool _predictionExpanded = false;
  bool _predictionLoading = false;
  String? _predictionResult;
  Map<String, dynamic>? _predictionStructured;
  bool _predictionError = false;
  String? _predictionErrorMsg;

  // Personalized Match state
  bool _matchScoreExpanded = false;
  bool _matchScoreFetched = false;
  final Map<_AiPanelType, String> _aiProgressText = {};

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
              : 'https://img.youtube.com/vi/$videoId/mqdefault.jpg',
          onClose: _closePiP,
        ),
      );
      Overlay.of(context).insert(_pipOverlay!);
    }
  }

  @override
  void dispose() {
    _closePiP();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    _groupedSpecs = _buildGroupedSpecs();
    final keys = _groupedSpecs.keys.toList();
    _expandedGroups = {for (int i = 0; i < keys.length; i++) keys[i]: false};
    // Restore AI analysis from session if available
    _restoreFromSession();
  }

  /// Locale helper — true when app language is Turkish
  bool get _isTr => Localizations.localeOf(context).languageCode == 'tr';
  String get _appLang =>
      Localizations.localeOf(context).languageCode.toLowerCase();

  String _languageName(String code) {
    const map = {
      'en': 'English',
      'tr': 'Turkish',
      'de': 'German',
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

  String _localizedFeature(String feature) => '${feature}_${_appLang}';

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
      debugPrint('[Qor AI] Cache read error ($feature): $e');
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
      debugPrint('[Qor AI] Cache write error ($feature): $e');
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
      if (session.deepAnalysisResult != null)
        _deepAnalysisResult = session.deepAnalysisResult;
      if (session.aiStructured != null)
        _deepAnalysisStructured = session.aiStructured;
      if (session.alternativesResult != null)
        _alternativesResult = session.alternativesResult;
      if (session.alternativesStructured != null)
        _alternativesStructured = session.alternativesStructured;
      if (session.advisorResult != null) _advisorResult = session.advisorResult;
      if (session.advisorStructured != null)
        _advisorStructured = session.advisorStructured;
      if (session.predictionResult != null)
        _predictionResult = session.predictionResult;
      if (session.predictionStructured != null)
        _predictionStructured = session.predictionStructured;
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
        if (c == '{')
          stack.add('{');
        else if (c == '[')
          stack.add('[');
        else if (c == '}' && stack.isNotEmpty && stack.last == '{')
          stack.removeLast();
        else if (c == ']' && stack.isNotEmpty && stack.last == '[')
          stack.removeLast();
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
  List<dynamic>? _tryParseJsonArray(String raw) {
    try {
      var clean = raw.trim();
      final codeBlockMatch = RegExp(
        r'```(?:json)?\s*\n?([\s\S]*?)\n?\s*```',
      ).firstMatch(clean);
      if (codeBlockMatch != null) clean = codeBlockMatch.group(1)!.trim();
      final arrStart = clean.indexOf('[');
      final arrEnd = clean.lastIndexOf(']');
      if (arrStart >= 0 && arrEnd > arrStart)
        clean = clean.substring(arrStart, arrEnd + 1);
      final decoded = jsonDecode(clean);
      if (decoded is List) return decoded;
      return null;
    } catch (e) {
      debugPrint('[Qor AI] _tryParseJsonArray failed: $e');
      return null;
    }
  }

  /// Fetch from DeepSeek (low cost) with Gemini fallback on persistent parse failures.
  Future<({Map<String, dynamic>? data, String? error})> _fetchWithRetry(
    String prompt,
    String label,
    String lang, {
    int maxTokens = 4096,
    void Function(String message)? onProgress,
    bool allowGeminiFallback = false,
  }) async {
    final deepseek = ref.read(deepSeekServiceProvider);
    String? lastError;
    for (var attempt = 1; attempt <= 3; attempt++) {
      try {
        onProgress?.call(
          _isTr
              ? 'AI modeli çalıştırılıyor (DeepSeek deneme $attempt/3)…'
              : 'Running AI model (DeepSeek attempt $attempt/3)…',
        );
        final result = await deepseek.jsonFreeTextQuery(
          prompt,
          language: lang,
          maxTokens: maxTokens,
        );
        debugPrint(
          '[Qor AI] 🔍 $label RAW attempt $attempt (${result.length} chars):\n${result.length > 600 ? result.substring(0, 600) : result}',
        );
        final parsed = _tryParseJson(result);
        if (parsed != null) return (data: parsed, error: null);
        lastError = 'JSON parse failed';
        debugPrint(
          '[Qor AI] $label parse FAILED attempt $attempt${attempt < 3 ? " — retrying" : " — giving up"}',
        );
        if (attempt < 3) await Future.delayed(Duration(seconds: attempt));
      } catch (e) {
        lastError = e.toString();
        debugPrint('[Qor AI] $label attempt $attempt error: $e');
        if (attempt < 3) await Future.delayed(Duration(seconds: attempt));
      }
    }
    if (allowGeminiFallback) {
      try {
        onProgress?.call(
          _isTr
              ? 'Sonuç doğrulaması için Gemini ile yeniden değerlendiriliyor…'
              : 'Re-checking with Gemini for result quality…',
        );
        final gemini = ref.read(geminiServiceProvider);
        final result = await gemini.jsonFreeTextQuery(
          prompt,
          language: lang,
          maxTokens: maxTokens,
          tier: AiTier.lite,
        );
        final parsed = _tryParseJson(result);
        if (parsed != null) return (data: parsed, error: null);
        lastError = 'Gemini fallback parse failed';
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

  void _showLimitExhaustedDialog(BuildContext context, {String? featureName}) {
    showLimitReachedDialog(context, featureName: featureName);
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
        .where((w) =>
            RegExp(r'^[A-Z0-9ÇĞİÖŞÜ]').hasMatch(w) && !_isSpecConnector(w))
        .length;
    return capCount >= 4;
  }

  static bool _isSpecConnector(String word) {
    const connectors = {
      'and', 'or', 'with', 'for', 'to', 've', 'ile', 'veya',
      'the', 'a', 'an', 'of', '&',
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
      final startsFeature = current.isNotEmpty &&
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
      final sub = ref.read(subscriptionServiceProvider);
      if (!sub.canUseCompareAi) {
        _showLimitExhaustedDialog(context, featureName: 'Compare AI');
        return;
      }
      sub.recordCompareAi();
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
      final result = await _fetchWithRetry(
        prompt,
        debugLabel,
        lang,
        maxTokens: maxTokens,
        allowGeminiFallback: true,
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
          '- verdict and recommendation should each be 4-6 sentences and should differ in focus.',
      lang: lang,
      maxTokens: 8192,
      startMessage: '[Qor AI] Deep Analysis starting for: $productNames',
    );
  }

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

    final prompt =
        '''You are a tech expert. The user is comparing: $productNames in category "$category".
Suggest 3-5 alternative products they should also consider. Address the user directly using "you/your". ALL text in $langName.

Return ONLY valid JSON:
{
  "alternatives": [
    {
      "name": "Product Name",
      "brand": "Brand",
      "why_better": "1 sentence why this is worth considering for you",
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
          '- Avoid repeating the same sentence structure across alternatives.\n'
          '- Include realistic and differentiated price band commentary.',
      lang: lang,
      maxTokens: 2048,
      startMessage: '[Qor AI] Alternatives starting for: $productNames',
    );
  }

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
          '- Avoid generic advice; tie recommendation to concrete product context.\n'
          '- Use varied wording across products and points.',
      lang: lang,
      maxTokens: 2048,
      startMessage: '[Qor AI] Advisor starting',
    );
  }

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
        '''You are a tech price analyst. Predict price trends for ALL of the following products. Address the user as "you/your". ALL text in $langName. Current year: ${DateTime.now().year}.

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
    );
  }

  /// Merge spec groups from all products into a unified structure.
  /// Returns: { groupName: { specKey: [val1, val2, ...] } }
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
    if (locale == 'en') return _sentenceCaseLocalized(canonicalValue);
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
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) {
        final isDark = Theme.of(ctx).brightness == Brightness.dark;
        final bgColor = isDark ? const Color(0xFF121826) : const Color(0xFFFDFEFF);
        final textColor = isDark ? Colors.white : const Color(0xFF0F172A);
        final formattedValue = _formatSpecValueForSheet(fullValue);
        return SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 18),
            child: Align(
              alignment: Alignment.bottomCenter,
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 480),
                child: Material(
                  color: bgColor,
                  borderRadius: BorderRadius.circular(24),
                  child: Container(
                    decoration: BoxDecoration(
                      color: bgColor,
                      borderRadius: BorderRadius.circular(24),
                      border: Border.all(
                        color: AppTheme.brandBlue.withValues(alpha: isDark ? 0.22 : 0.10),
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: isDark ? 0.32 : 0.10),
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
                                  color: AppTheme.brandBlue.withValues(alpha: isDark ? 0.18 : 0.08),
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
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      _isTr ? 'Ozellik degeri' : 'Specification value',
                                      style: GoogleFonts.plusJakartaSans(
                                        fontSize: 11,
                                        fontWeight: FontWeight.w700,
                                        color: textColor.withValues(alpha: 0.55),
                                        letterSpacing: 0.2,
                                      ),
                                    ),
                                    const SizedBox(height: 2),
                                    Text(
                                      specName,
                                      maxLines: 2,
                                      overflow: TextOverflow.ellipsis,
                                      style: GoogleFonts.plusJakartaSans(
                                        fontSize: 15,
                                        fontWeight: FontWeight.w800,
                                        color: textColor,
                                        height: 1.25,
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
                                onPressed: () => Navigator.of(ctx).pop(),
                                padding: EdgeInsets.zero,
                                constraints: const BoxConstraints(minWidth: 28, minHeight: 28),
                              ),
                            ],
                          ),
                          const SizedBox(height: 14),
                          Container(
                            width: double.infinity,
                            padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
                            decoration: BoxDecoration(
                              color: isDark
                                  ? Colors.white.withValues(alpha: 0.04)
                                  : const Color(0xFFF5F9FD),
                              borderRadius: BorderRadius.circular(18),
                              border: Border.all(
                                color: AppTheme.brandBlue.withValues(alpha: isDark ? 0.16 : 0.08),
                              ),
                            ),
                            child: SelectableText(
                              formattedValue,
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 14,
                                fontWeight: FontWeight.w600,
                                color: textColor,
                                height: 1.5,
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
                                Navigator.of(ctx).pop();
                                ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(
                                    content: Text(
                                      _isTr ? 'Kopyalandi' : 'Copied',
                                      style: GoogleFonts.plusJakartaSans(fontSize: 13),
                                    ),
                                    duration: const Duration(seconds: 1),
                                    behavior: SnackBarBehavior.floating,
                                    backgroundColor: const Color(0xFF0F172A),
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(14),
                                    ),
                                  ),
                                );
                              },
                              icon: const Icon(Icons.copy_rounded, size: 16),
                              label: Text(
                                _isTr ? 'Kopyala' : 'Copy',
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              style: TextButton.styleFrom(
                                foregroundColor: AppTheme.brandBlue,
                                backgroundColor: AppTheme.brandBlue.withValues(alpha: isDark ? 0.18 : 0.08),
                                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
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
        );
      },
    );
  }

  /// The value received here is already pre-formatted by [_buildSpecSheetValue]
  /// (each feature on its own line separated by \n).  We just normalize bullet
  /// chars and strip leading dashes so the display is clean.
  String _formatSpecValueForSheet(String value) {
    if (value.isEmpty) return value;
    final withNatural = value
        .replaceAll('•', '\n')
        .replaceAll('·', '\n')
        .replaceAll('|', '\n');
    return withNatural
        .split('\n')
        .map((s) => s.replaceFirst(RegExp(r'^[-•·\s]+'), '').trim())
        .where((s) => s.isNotEmpty)
        .join('\n');
  }

  /// Splits [value] at commas/semicolons, but:
  /// - skips commas inside parentheses depth > 0
  /// - skips commas between two digit characters (e.g. 2,000)
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
        final isNumericComma = ch == ',' &&
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

  Widget _buildAiShimmer() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _ShimmerBlock(width: 200, height: 20),
        const SizedBox(height: 10),
        _ShimmerBlock(width: double.infinity, height: 14),
        const SizedBox(height: 8),
        _ShimmerBlock(width: double.infinity, height: 14),
        const SizedBox(height: 8),
        _ShimmerBlock(width: 160, height: 14),
      ],
    );
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
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
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
                    products.values.elementAt(i) as Map<String, dynamic>? ?? {};
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
                      children: [
                        // Score circle
                        Container(
                          width: 38,
                          height: 38,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            gradient: LinearGradient(
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
                  ),
                ),
              );
            }),
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
                            builder: (_, value, __) => _buildMatchScoreRing(
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
                              if (idx < 0 || idx >= categories.length)
                                return const SizedBox.shrink();
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
    final alternatives = List<Map<String, dynamic>>.from(
      (data['alternatives'] as List<dynamic>?)?.map(
            (e) => e as Map<String, dynamic>,
          ) ??
          [],
    );
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
                          alt['name'] as String? ?? '',
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                            color: context.textPrimary,
                          ),
                          maxLines: 1,
                        ),
                        if (alt['brand'] != null) ...[
                          const SizedBox(height: 2),
                          Text(
                            (alt['brand'] as String).toUpperCase(),
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 10,
                              fontWeight: FontWeight.w600,
                              color: context.textTertiaryColor,
                              letterSpacing: 0.5,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                  if (alt['price_range'] != null)
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: context.surfaceColor,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        '💰 ${alt['price_range']}',
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: context.textSecondary,
                        ),
                      ),
                    ),
                ],
              ),
              if (alt['why_better'] != null) ...[
                const SizedBox(height: 8),
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
                    alt['why_better'] as String,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 12,
                      color: context.textPrimary,
                      height: 1.4,
                    ),
                    maxLines: 2,
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
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
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
                  ),
                ),
              );
            }),
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
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
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
                ),
              ),
            );
          }),
        ),
      ],
    );
  }

  // ─── Key Specs Side-by-Side Comparison ───

  /// Build a merged spec pool for a product (keySpecs + specs + specSections).
  Map<String, String> _buildSpecPool(ProductEntity product) {
    final pool = <String, String>{};
    for (final e in product.keySpecs.entries) {
      final v = e.value.trim();
      if (v.isNotEmpty && v != '-' && v != 'N/A') pool[e.key] = v;
    }
    for (final e in product.specs.entries) {
      if (pool.containsKey(e.key)) continue;
      if (e.value != null && e.value is! Map) {
        final v = e.value.toString().trim();
        if (v.isNotEmpty && v != '-' && v != 'N/A') pool[e.key] = v;
      }
    }
    for (final section in product.specSections.entries) {
      if (section.value is Map) {
        for (final spec in (section.value as Map).entries) {
          final k = spec.key.toString();
          if (pool.containsKey(k)) continue;
          if (spec.value != null) {
            final v = spec.value.toString().trim();
            if (v.isNotEmpty && v != '-' && v != 'N/A') pool[k] = v;
          }
        }
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
  List<_CompareSpecRow> _collectCompareKeySpecs() {
    final products = widget.products;
    final pools = products.map(_buildSpecPool).toList();

    // Resolve category
    final cat = keySpecs.resolveCategory(
      products.first.category.isNotEmpty
          ? products.first.category
          : products.first.subcategory,
    );
    final prioritySlots = keySpecs.categoryKeySpecAliases[cat];

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
  int _findCompareWinner(String label, List<String> values) {
    if (values.length < 2) return -1;
    final nonMissing = values.where((v) => v != '—').toList();
    if (nonMissing.length < 2) return -1;
    if (nonMissing.toSet().length == 1) return -1; // all same → no winner

    // Delegate to the existing specDirection service
    return _findBetterIndex(label, values);
  }

  /// Color + weight for a cell based on comparison result.
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
    final specs = _collectCompareKeySpecs();
    if (specs.isEmpty) return const SizedBox.shrink();

    final theme = Theme.of(context);
    final productCount = widget.products.length;

    return Container(
      margin: const EdgeInsets.fromLTRB(16, 16, 16, 8),
      padding: const EdgeInsets.fromLTRB(10, 14, 10, 10),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.4),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: theme.dividerColor),
      ),
      child: Column(
        children: [
          // Centered header
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                Icons.auto_awesome_rounded,
                size: 16,
                color: theme.colorScheme.primary,
              ),
              const SizedBox(width: 6),
              Text(
                'Key Specs',
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: context.textPrimary,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),

          // Spec rows
          for (int i = 0; i < specs.length; i++) ...[
            if (i > 0) const SizedBox(height: 5),
            _buildSpecComparisonRow(specs[i], theme, productCount),
          ],
        ],
      ),
    );
  }

  /// Build a single spec comparison row — unified layout for all product counts.
  /// Spec label centered on top, values below in a row.
  Widget _buildSpecComparisonRow(
    _CompareSpecRow spec,
    ThemeData theme,
    int productCount,
  ) {
    final winnerIdx = _findCompareWinner(spec.label, spec.values);
    final isCompact = productCount > 2;

    return Container(
      padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 4),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface.withValues(alpha: 0.6),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: theme.dividerColor.withValues(alpha: 0.3)),
      ),
      child: Column(
        children: [
          // Spec label centered
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                keySpecs.iconForSpecKey(spec.label),
                size: 12,
                color: theme.colorScheme.primary.withValues(alpha: 0.7),
              ),
              const SizedBox(width: 4),
              Flexible(
                child: Text(
                  _localizedSpecName(context, spec.label),
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 9,
                    fontWeight: FontWeight.w600,
                    color: context.textTertiaryColor,
                    letterSpacing: 0.2,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          // Product value cells
          Row(
            children: List.generate(productCount, (i) {
              final val = i < spec.values.length ? spec.values[i] : '—';
              final isMissing = val == '—';
              final style = _cellStyle(
                value: val,
                index: i,
                winnerIndex: winnerIdx,
                theme: theme,
              );
              final localizedName = _localizedSpecName(context, spec.label);
              final localizedValue = _localizedSpecValue(context, val);
              return Expanded(
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: isMissing
                      ? null
                      : () => _showSpecValueBottomSheet(
                          specName: localizedName,
                          // Split raw val BEFORE translation to preserve \n
                          fullValue: _buildSpecSheetValue(context, val),
                        ),
                  child: Container(
                    margin: EdgeInsets.symmetric(
                      horizontal: isCompact ? 1.5 : 2,
                    ),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 3,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: (winnerIdx >= 0 && i == winnerIdx && !isMissing)
                          ? AppTheme.scoreExcellent.withValues(alpha: 0.10)
                          : (winnerIdx >= 0 && i != winnerIdx && !isMissing)
                          ? AppTheme.error.withValues(alpha: 0.05)
                          : Colors.transparent,
                      borderRadius: BorderRadius.circular(8),
                      border: (winnerIdx >= 0 && i == winnerIdx && !isMissing)
                          ? Border.all(
                              color: AppTheme.scoreExcellent.withValues(
                                alpha: 0.3,
                              ),
                            )
                          : null,
                    ),
                    child: Text(
                      localizedValue,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: isCompact ? 9 : 10,
                        fontWeight: style.weight,
                        color: style.color,
                      ),
                      textAlign: TextAlign.center,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ),
              );
            }),
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

    return DefaultTabController(
      length: 4,
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
                    final isPremiumSelected =
                        (controller.animation?.value.round() ??
                            controller.index) ==
                        3;
                    final activeTabColor = isPremiumSelected
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
                        Tab(text: context.l10n?.specsTab ?? 'Specs'),
                        Tab(text: context.l10n?.reviews ?? 'Reviews'),
                        Tab(text: context.l10n?.similarTab ?? 'Similar'),
                        Tab(text: context.l10n?.proTab ?? 'Premium'),
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
                _KeepAliveTab(child: _buildSpecsTab()),
                _KeepAliveTab(child: _buildReviewsTab()),
                _KeepAliveTab(child: _buildSimilarTab()),
                _KeepAliveTab(child: _buildProTab()),
              ],
            ),
          ),
        ],
      ),
    );
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
                ProductImageBox(
                  imageUrl: product.imageUrl,
                  fallbackUrls: product.images,
                  width: 80,
                  height: 80,
                  borderRadius: BorderRadius.circular(16),
                  padding: const EdgeInsets.all(6),
                ),
                const SizedBox(height: 6),
                if (product.techScore > 0)
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 6,
                      vertical: 2,
                    ),
                    decoration: BoxDecoration(
                      color: scoreColor.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(
                        color: scoreColor.withValues(alpha: 0.3),
                        width: 0.5,
                      ),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          Icons.memory_outlined,
                          size: 10,
                          color: scoreColor,
                        ),
                        const SizedBox(width: 3),
                        Text(
                          product.techScore.toInt().toString(),
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                            color: scoreColor,
                          ),
                        ),
                      ],
                    ),
                  ),
                const SizedBox(height: 4),
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

  Widget _buildSpecsTab() {
    int specGroupIndex = 0;
    return CustomScrollView(
      slivers: [
        // Key Specs Summary at top
        SliverToBoxAdapter(child: _buildKeySpecsSummary()),
        // Grouped spec comparison
        ..._groupedSpecs.entries.map((groupEntry) {
          final groupName = groupEntry.key;
          final specs = groupEntry.value;
          final isExpanded = _expandedGroups[groupName] ?? false;
          final currentGroupIndex = specGroupIndex++;

          return SliverToBoxAdapter(
            child: Container(
              margin: EdgeInsets.fromLTRB(
                16,
                currentGroupIndex == 0 ? 16 : 10,
                16,
                4,
              ),
              decoration: BoxDecoration(
                color: context.surfaceVariantColor,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(
                  color: isExpanded
                      ? AppTheme.brandBlue.withValues(alpha: 0.18)
                      : context.dividerColor,
                ),
                boxShadow: [
                  BoxShadow(
                    color: AppTheme.brandBlue.withValues(
                      alpha: isExpanded ? 0.06 : 0.02,
                    ),
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
                  // Group header
                  InkWell(
                    onTap: () => setState(
                      () => _expandedGroups[groupName] = !isExpanded,
                    ),
                    borderRadius: BorderRadius.circular(20),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 18,
                        vertical: 10,
                      ),
                      decoration: BoxDecoration(
                        gradient: isExpanded
                            ? LinearGradient(
                                colors: [
                                  AppTheme.brandBlue.withValues(alpha: 0.1),
                                  AppTheme.brandDeepBlue.withValues(
                                    alpha: 0.06,
                                  ),
                                ],
                              )
                            : null,
                        borderRadius: isExpanded
                            ? const BorderRadius.vertical(
                                top: Radius.circular(20),
                              )
                            : BorderRadius.circular(20),
                      ),
                      child: Row(
                        children: [
                          Container(
                            width: 4,
                            height: 24,
                            decoration: BoxDecoration(
                              gradient: _accentGradient,
                              borderRadius: BorderRadius.circular(2),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.center,
                              children: [
                                Text(
                                  _localizedGroupName(context, groupName),
                                  style: GoogleFonts.plusJakartaSans(
                                    fontWeight: FontWeight.w700,
                                    fontSize: 13,
                                    color: context.textPrimary,
                                  ),
                                  textAlign: TextAlign.center,
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  context.l10n?.nSpecs('${specs.length}') ??
                                      '${specs.length} specs',
                                  style: GoogleFonts.plusJakartaSans(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w500,
                                    color: context.textTertiaryColor,
                                  ),
                                  textAlign: TextAlign.center,
                                ),
                              ],
                            ),
                          ),
                          AnimatedRotation(
                            turns: isExpanded ? 0.5 : 0,
                            duration: const Duration(milliseconds: 200),
                            child: Container(
                              width: 28,
                              height: 28,
                              decoration: BoxDecoration(
                                color: isExpanded
                                    ? AppTheme.brandBlue.withValues(alpha: 0.16)
                                    : context.dividerColor,
                                shape: BoxShape.circle,
                              ),
                              child: Icon(
                                Icons.expand_more,
                                size: 18,
                                color: isExpanded
                                    ? AppTheme.brandBlue
                                    : context.textTertiaryColor,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),

                  // Spec rows
                  if (isExpanded)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(8, 2, 8, 8),
                      child: Column(
                        children: specs.entries.toList().asMap().entries.map((
                          indexedEntry,
                        ) {
                          final specIndex = indexedEntry.key;
                          final specEntry = indexedEntry.value;
                          final specKey = specEntry.key;
                          final values = specEntry.value;
                          final allSame = values.toSet().length == 1;
                          final betterIndex = allSame
                              ? -1
                              : _findBetterIndex(specKey, values);
                          final isAlternate = specIndex.isOdd;

                          return Container(
                            margin: const EdgeInsets.symmetric(vertical: 2),
                            padding: const EdgeInsets.fromLTRB(8, 6, 8, 8),
                            decoration: BoxDecoration(
                              color: isAlternate
                                  ? context.surfaceColor
                                  : context.surfaceVariantColor,
                              borderRadius: BorderRadius.circular(16),
                              border: Border.all(color: context.dividerColor),
                            ),
                            child: Column(
                              children: [
                                // Spec name
                                Text(
                                  _localizedSpecName(
                                    context,
                                    specKey,
                                  ).toUpperCase(),
                                  style: GoogleFonts.plusJakartaSans(
                                    fontSize: 10,
                                    letterSpacing: 0.5,
                                    color: context.textTertiaryColor,
                                    fontWeight: FontWeight.w600,
                                  ),
                                  textAlign: TextAlign.center,
                                ),
                                const SizedBox(height: 6),
                                // Values row
                                Row(
                                  children: values.asMap().entries.map((
                                    valEntry,
                                  ) {
                                    final idx = valEntry.key;
                                    final val = valEntry.value;
                                    final isMissing = val == '—';
                                    final isBetter = betterIndex == idx;
                                    final isWorse =
                                        betterIndex >= 0 &&
                                        betterIndex != idx &&
                                        !isMissing;

                                    return Expanded(
                                      child: Material(
                                        color: Colors.transparent,
                                        child: InkWell(
                                          onTap: () => _showSpecValueDetailSheet(
                                            context,
                                            val,
                                          ),
                                          borderRadius:
                                              BorderRadius.circular(12),
                                          child: Container(
                                            margin: const EdgeInsets.symmetric(
                                              horizontal: 3,
                                            ),
                                            padding: const EdgeInsets.symmetric(
                                              horizontal: 6,
                                              vertical: 8,
                                            ),
                                            decoration: BoxDecoration(
                                              color: isBetter
                                                  ? AppTheme.scoreExcellent
                                                        .withValues(
                                                          alpha: 0.12,
                                                        )
                                                  : isWorse
                                                  ? AppTheme.error.withValues(
                                                      alpha: 0.06,
                                                    )
                                                  : Colors.transparent,
                                              borderRadius:
                                                  BorderRadius.circular(12),
                                              border: isBetter
                                                  ? Border.all(
                                                      color: AppTheme
                                                          .scoreExcellent
                                                          .withValues(
                                                            alpha: 0.3,
                                                          ),
                                                    )
                                                  : null,
                                            ),
                                            child: Text(
                                              _localizedSpecValue(
                                                context,
                                                val,
                                              ),
                                              style: GoogleFonts
                                                  .plusJakartaSans(
                                                fontSize: 10,
                                                fontWeight: isBetter
                                                    ? FontWeight.w700
                                                    : (isMissing
                                                          ? FontWeight.w400
                                                          : FontWeight.w500),
                                                color: isBetter
                                                    ? AppTheme.scoreExcellent
                                                    : isWorse
                                                    ? AppTheme.error
                                                        .withValues(
                                                          alpha: 0.7,
                                                        )
                                                    : isMissing
                                                    ? context
                                                        .textTertiaryColor
                                                    : context.textSecondary,
                                              ),
                                              textAlign: TextAlign.center,
                                              maxLines: 1,
                                              overflow: TextOverflow.ellipsis,
                                            ),
                                          ),
                                        ),
                                      ),
                                    );
                                  }).toList(),
                                ),
                              ],
                            ),
                          );
                        }).toList(),
                      ),
                    ),
                ],
              ),
            ),
          );
        }),

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
    final excludeIds = widget.products.map((p) => p.id).toSet();
    // Use similarProductsProvider with first product as reference
    final similarAsync = ref.watch(
      similarProductsProvider(widget.products.first),
    );

    return ListView(
      padding: EdgeInsets.fromLTRB(
        16,
        16,
        16,
        MediaQuery.of(context).padding.bottom + 16,
      ),
      children: [
        similarAsync.when(
          loading: () => _buildSimilarShimmer(),
          error: (_, __) => _buildSimilarEmpty(),
          data: (products) {
            final filtered = _takeEvenCompareSimilarProducts(
              products.where((p) => !excludeIds.contains(p.id)),
            );
            if (filtered.isEmpty) return _buildSimilarEmpty();

            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Padding(
                  padding: const EdgeInsets.only(left: 4, bottom: 14),
                  child: Row(
                    children: [
                      Container(
                        width: 36,
                        height: 36,
                        decoration: BoxDecoration(
                          gradient: _accentGradient,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: const Icon(
                          Icons.grid_view_rounded,
                          color: Colors.white,
                          size: 18,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Text(
                        context.l10n?.similarProducts ?? 'Similar Products',
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          color: context.textPrimary,
                        ),
                      ),
                    ],
                  ),
                ),
                GridView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 2,
                    crossAxisSpacing: 12,
                    mainAxisSpacing: 12,
                    childAspectRatio: 0.82,
                  ),
                  itemCount: filtered.length,
                  itemBuilder: (context, i) =>
                      SharedSimilarGridCard(product: filtered[i]),
                ),
              ],
            );
          },
        ),
      ],
    );
  }

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
      itemBuilder: (_, __) => Container(
        decoration: BoxDecoration(
          color: context.surfaceVariantColor,
          borderRadius: BorderRadius.circular(16),
        ),
        child: const Center(child: CircularProgressIndicator(strokeWidth: 2)),
      ),
    );
  }

  List<ProductEntity> _takeEvenCompareSimilarProducts(
    Iterable<ProductEntity> products,
  ) {
    final raw = products.take(26).toList();
    if (raw.length.isOdd && raw.length > 1) {
      return raw.sublist(0, raw.length - 1);
    }
    return raw;
  }

  Widget _buildProTab() {
    // RULE 1: No auto-fetch. All AI calls are lazy — triggered only when user taps a card.

    return ListView(
      padding: EdgeInsets.fromLTRB(
        16,
        12,
        16,
        MediaQuery.of(context).padding.bottom + AppTheme.navBarTotalClearance,
      ),
      children: [
        // 1. Personalized Match
        _buildMatchScoreSection(),
        const SizedBox(height: 14),
        // 2. AI Product Advisor
        _buildExpandableCard(
          icon: Icons.support_agent_rounded,
          title: context.l10n?.aiProductAdvisor ?? 'AI Product Advisor',
          subtitle:
              context.l10n?.personalizedPurchaseAdvice ??
              'Personalized comparison purchase advice',
          gradient: const [Color(0xFF3B82F6), Color(0xFF06B6D4)],
          isExpanded: _advisorExpanded,
          isLoading: _advisorLoading,
          content: _advisorResult,
          contentWidget: _advisorStructured != null
              ? _buildAdvisorVisual()
              : null,
          isError: _advisorError,
          errorMsg: _advisorErrorMsg,
          loadingStatusText: _aiProgressText[_AiPanelType.advisor],
          onRetry: () => _retryAiPanel(_AiPanelType.advisor, _fetchAdvisor),
          onTap: _toggleAdvisor,
          cost: ref.watch(subscriptionServiceProvider).isPremium
              ? null
              : ref.watch(subscriptionServiceProvider).creditCostForFeature('compare_ai'),
        ),
        const SizedBox(height: 14),
        // 3. AI Deep Analysis
        _buildExpandableCard(
          icon: Icons.psychology_rounded,
          title: context.l10n?.aiDeepAnalysis ?? 'AI Deep Analysis',
          subtitle:
              context.l10n?.comprehensiveAiComparison ??
              'Comprehensive AI-powered comparison evaluation',
          gradient: const [AppTheme.premiumPurple, Color(0xFF6366F1)],
          isExpanded: _deepAnalysisExpanded,
          isLoading: _deepAnalysisLoading,
          content: _deepAnalysisResult,
          contentWidget: _deepAnalysisStructured != null
              ? _buildDeepAnalysisVisual()
              : null,
          isError: _deepAnalysisError,
          errorMsg: _deepAnalysisErrorMsg,
          loadingStatusText: _aiProgressText[_AiPanelType.deepAnalysis],
          onRetry: () =>
              _retryAiPanel(_AiPanelType.deepAnalysis, _fetchDeepAnalysis),
          onTap: _toggleDeepAnalysis,
            cost: ref.watch(subscriptionServiceProvider).isPremium
              ? null
              : ref.watch(subscriptionServiceProvider).creditCostForFeature('compare_ai'),
        ),
        const SizedBox(height: 14),
        // 4. Smart Alternatives
        _buildExpandableCard(
          icon: Icons.swap_horizontal_circle_rounded,
          title: context.l10n?.smartAlternatives ?? 'Smart Alternatives',
          subtitle:
              context.l10n?.aiAlternativesToConsider ??
              'AI-curated alternatives you should consider',
          gradient: const [AppTheme.warning, Color(0xFFF97316)],
          isExpanded: _alternativesExpanded,
          isLoading: _alternativesLoading,
          content: _alternativesResult,
          contentWidget: _alternativesStructured != null
              ? _buildAlternativesVisual()
              : null,
          isError: _alternativesError,
          errorMsg: _alternativesErrorMsg,
          loadingStatusText: _aiProgressText[_AiPanelType.alternatives],
          onRetry: () =>
              _retryAiPanel(_AiPanelType.alternatives, _fetchAlternatives),
          onTap: _toggleAlternatives,
            cost: ref.watch(subscriptionServiceProvider).isPremium
              ? null
              : ref.watch(subscriptionServiceProvider).creditCostForFeature('compare_ai'),
        ),
        const SizedBox(height: 14),
        // 5. Price Prediction
        _buildExpandableCard(
          icon: Icons.trending_down_rounded,
          title: context.l10n?.pricePrediction ?? 'Price Prediction',
          subtitle:
              context.l10n?.aiPriceTrendAnalysis ??
              'AI-powered price trend analysis & best time to buy',
          gradient: const [Color(0xFF10B981), Color(0xFF059669)],
          isExpanded: _predictionExpanded,
          isLoading: _predictionLoading,
          content: _predictionResult,
          contentWidget: _predictionStructured != null
              ? _buildPredictionVisual()
              : null,
          isError: _predictionError,
          errorMsg: _predictionErrorMsg,
          loadingStatusText: _aiProgressText[_AiPanelType.prediction],
          onRetry: () =>
              _retryAiPanel(_AiPanelType.prediction, _fetchPrediction),
          onTap: _togglePrediction,
            cost: ref.watch(subscriptionServiceProvider).isPremium
              ? null
              : ref.watch(subscriptionServiceProvider).creditCostForFeature('compare_ai'),
        ),
      ],
    );
  }

  Widget _buildMatchScoreSection() {
    final userProfile = ref.watch(userProfileProvider);
    final user = userProfile.valueOrNull;
    final quizCompleted = user != null && user.quizCompleted;
    final isUserProfileLoading = userProfile.isLoading;
    final productCount = widget.products.length;
    final barColors = [
      const Color(0xFF3B82F6),
      const Color(0xFF06B6D4),
      const Color(0xFF6366F1),
      const Color(0xFFF59E0B),
      const Color(0xFF10B981),
    ];

    return AnimatedContainer(
      duration: const Duration(milliseconds: 300),
      clipBehavior: Clip.hardEdge,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppTheme.brandBlue.withValues(alpha: 0.15)),
        boxShadow: [
          BoxShadow(
            color: AppTheme.brandBlue.withValues(alpha: 0.08),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header row toggles expand/collapse
          GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: () {
              if (!requireAuth(context)) return;
              if (!_matchScoreExpanded &&
                  !_matchScoreFetched &&
                  quizCompleted) {
                // Check AI feature limit before fetching
                final sub = ref.read(subscriptionServiceProvider);
                if (!sub.canUseCompareAi) {
                  _showLimitExhaustedDialog(context, featureName: 'Compare AI');
                  return;
                }
                sub.recordCompareAi();
              }
              setState(() => _matchScoreExpanded = !_matchScoreExpanded);
              if (_matchScoreExpanded && !_matchScoreFetched && quizCompleted) {
                _matchScoreFetched = true;
                final languageCode = Localizations.localeOf(
                  context,
                ).languageCode;
                for (final product in widget.products) {
                  final notifier = ref.read(
                    geminiMatchScoreProvider(
                      LocalizedProductKey(
                        productId: product.id,
                        languageCode: languageCode,
                      ),
                    ).notifier,
                  );
                  notifier.fetchMatchScore(
                    product: product,
                    forCompareBatch: true,
                  );
                }
              }
            },
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [AppTheme.brandSkyBlue, AppTheme.brandDeepBlue],
                    ),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(
                    Icons.person_search_rounded,
                    size: 20,
                    color: Colors.white,
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
                              context.l10n?.personalizedMatch ?? 'Personalized Match',
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 15,
                                fontWeight: FontWeight.w700,
                                color: context.textPrimary,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          if (!ref.watch(subscriptionServiceProvider).isPremium) ...[
                            const SizedBox(width: 8),
                            QorAmountBadge(
                              amount: ref.watch(subscriptionServiceProvider).creditCostForFeature('compare_ai'),
                              unlimited: false,
                              color: AppTheme.brandBlue,
                              fontSize: 10,
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            ),
                          ],
                        ],
                      ),
                      const SizedBox(height: 2),
                      Text(
                        context.l10n?.aiCompatibilityAnalysis ??
                            'AI-powered compatibility analysis',
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 12,
                          color: context.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
                Icon(
                  _matchScoreExpanded
                      ? Icons.expand_less_rounded
                      : Icons.expand_more_rounded,
                  color: AppTheme.brandBlue,
                ),
              ],
            ),
          ),
          // Content area
          if (_matchScoreExpanded) ...[
            const SizedBox(height: 14),
            GestureDetector(
              onTap: () {},
              child: Column(
                children: [
                  if (isUserProfileLoading)
                    Container(
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
                          const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2.2,
                              valueColor: AlwaysStoppedAnimation<Color>(
                                Colors.white,
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            context.l10n?.computingMatch ??
                                'Eşleşme hesaplanıyor...',
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 14,
                              fontWeight: FontWeight.w600,
                              color: Colors.white,
                            ),
                          ),
                        ],
                      ),
                    )
                  else if (!quizCompleted)
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
                  else ...[
                    // Side-by-side product columns
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: List.generate(productCount, (i) {
                        final product = widget.products[i];
                        final matchAsync = ref.watch(
                          geminiMatchScoreProvider(
                            LocalizedProductKey(
                              productId: product.id,
                              languageCode: Localizations.localeOf(
                                context,
                              ).languageCode,
                            ),
                          ),
                        );
                        final matchResult = matchAsync.valueOrNull;
                        final matchScore = matchResult?.matchScore;
                        final reason = matchResult?.reason ?? '';
                        final topFactors = matchResult?.topMatchFactors ?? [];
                        final missingFactors =
                            matchResult?.missingFactors ?? [];
                        final isLoading = matchAsync is AsyncLoading;
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
                                children: [
                                  // Score circle or loading
                                  if (isLoading)
                                    SizedBox(
                                      width: 44,
                                      height: 44,
                                      child: Center(
                                        child: SizedBox(
                                          width: 22,
                                          height: 22,
                                          child: CircularProgressIndicator(
                                            strokeWidth: 2.5,
                                            color: matchColor,
                                          ),
                                        ),
                                      ),
                                    )
                                  else
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
                                  // Detail button
                                  if (matchScore != null) ...[
                                    const SizedBox(height: 8),
                                    Container(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 10,
                                        vertical: 5,
                                      ),
                                      decoration: BoxDecoration(
                                        color: color.withValues(alpha: 0.12),
                                        borderRadius: BorderRadius.circular(10),
                                      ),
                                      child: Text(
                                        _detailCtaLabel(),
                                        style: GoogleFonts.plusJakartaSans(
                                          fontSize: 9,
                                          fontWeight: FontWeight.w700,
                                          color: color,
                                        ),
                                      ),
                                    ),
                                  ],
                                ],
                              ),
                            ),
                          ),
                        );
                      }),
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
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return AnimatedContainer(
      duration: const Duration(milliseconds: 300),
      curve: Curves.easeInOut,
      clipBehavior: Clip.hardEdge,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: gradient[0].withValues(alpha: 0.15)),
        boxShadow: [
          BoxShadow(
            color: gradient[0].withValues(alpha: 0.08),
            blurRadius: 12,
            offset: const Offset(0, 4),
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
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(colors: gradient),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(
                    icon,
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
                              title,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 15,
                                fontWeight: FontWeight.w700,
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
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            ),
                          ],
                        ],
                      ),
                      const SizedBox(height: 2),
                      Text(
                        subtitle,
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 12,
                          color: context.textSecondary,
                        ),
                      ),
                      if (isLoading &&
                          loadingStatusText != null &&
                          loadingStatusText.trim().isNotEmpty) ...[
                        const SizedBox(height: 2),
                        AnimatedSwitcher(
                          duration: const Duration(milliseconds: 200),
                          child: Text(
                            loadingStatusText,
                            key: ValueKey(loadingStatusText),
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 11,
                              color: gradient[0].withValues(alpha: 0.9),
                              fontStyle: FontStyle.italic,
                            ),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
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
                  Icon(
                    isExpanded
                        ? Icons.expand_less_rounded
                        : Icons.expand_more_rounded,
                    color: gradient[0],
                  ),
              ],
            ),
          ),
          // Error state with retry
          if (isExpanded && isError && onRetry != null) ...[
            const SizedBox(height: 14),
            _buildAiError(onRetry, errorMsg: errorMsg),
          ]
          // Loading shimmer
          else if (isExpanded && isLoading) ...[
            const SizedBox(height: 14),
            _buildAiShimmer(),
          ]
          // Structured content widget (the ONLY content display path)
          else if (isExpanded && contentWidget != null) ...[
            const SizedBox(height: 14),
            GestureDetector(onTap: () {}, child: contentWidget),
          ]
          // No data yet and not loading — idle state (card just opened, fetch will start)
          else if (isExpanded && content == null && !isLoading && !isError) ...[
            const SizedBox(height: 14),
            _buildAiShimmer(),
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
            future: (() async {
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
            })(),
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
              return Column(
                children: records.map((record) {
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
              } catch (e) {
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text('Silinemedi: $e'),
                      behavior: SnackBarBehavior.floating,
                    ),
                  );
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
    final textController = TextEditingController();

    showDialog(
      context: ctx,
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
                  // Title
                  Text(
                    context.l10n?.writeAReview ?? 'Yorum Yaz',
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                      color: theme.colorScheme.onSurface,
                    ),
                  ),
                  const SizedBox(height: 6),
                  // Subtitle — product names
                  Text(
                    widget.products.map((p) => p.name).join(' vs '),
                    textAlign: TextAlign.center,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 12,
                      color: theme.colorScheme.onSurface.withValues(alpha: 0.5),
                    ),
                  ),
                  const SizedBox(height: 20),
                  // Text input
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
                  // Buttons row
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
                                  try {
                                    final docKey = _comparisonReviewDocKey();
                                    final productIds =
                                        widget.products
                                            .map((p) => p.id)
                                            .toList()
                                          ..sort();
                                    await pb
                                        .collection('comparison_reviews')
                                        .create(
                                          body: {
                                            'docKey': docKey,
                                            'userId': userId,
                                            'displayName': resolvedDisplayName,
                                            'reviewText': textController.text
                                                .trim(),
                                            'timestamp': DateTime.now()
                                                .toUtc()
                                                .toIso8601String(),
                                            'productIds': productIds,
                                          },
                                        );
                                    if (dialogCtx.mounted)
                                      Navigator.of(dialogCtx).pop();
                                    if (ctx.mounted) {
                                      ScaffoldMessenger.of(ctx).showSnackBar(
                                        SnackBar(
                                          content: Text(
                                            context.l10n?.reviewSubmitted ??
                                                'Yorum gönderildi! ✨',
                                            style: GoogleFonts.plusJakartaSans(
                                              fontSize: 13,
                                            ),
                                          ),
                                          behavior: SnackBarBehavior.floating,
                                        ),
                                      );
                                    }
                                  } catch (e) {
                                    if (ctx.mounted) {
                                      ScaffoldMessenger.of(ctx).showSnackBar(
                                        SnackBar(
                                          content: Text(
                                            'Yorum gönderilemedi: $e',
                                          ),
                                          behavior: SnackBarBehavior.floating,
                                        ),
                                      );
                                    }
                                  }
                                }
                              : null,
                          child: Container(
                            padding: const EdgeInsets.symmetric(vertical: 12),
                            decoration: BoxDecoration(
                              gradient: hasText ? _accentGradient : null,
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

